"""
Court Case Management System - Authentication Services
Provides user retrieval via parameterized SQL, credential verification,
role and judge mapping validation, and bounded progressive brute-force throttling.

Safety Rules:
  - All SQL queries use strict parameterization (%s placeholders).
  - Password hashes are never exposed in return structures or logs.
  - Judge accounts require valid, active linked judges.
  - Administrative accounts must never be linked to judges.
  - Throttling is bounded to (IP, username) pairs to prevent Denial-of-Service
    against legitimate users, using bounded cache storage (SimpleCache in dev, redis-py in prod).
  - Failed-login counter increments are thread-safe and atomic:
    - In development: explicit thread lock, initializes missing counters to 1, sets with 900s TTL.
    - In production: explicitly managed redis-py client executing atomic Lua script via public eval().
  - Production Redis connectivity verified via bounded timeout (2.0s) and ping(); fails closed with safe RuntimeError.
  - No secrets or credentials exposed in error messages.
  - No blocking sleeps that tie up server workers.
"""

import logging
import os
import threading
from typing import Any, Dict, Optional, Tuple
from cachelib import SimpleCache
from psycopg.rows import dict_row

from backend.auth.security import (
    dummy_verify_password,
    verify_password,
)
from backend.config import Config
from backend.db import execute_read_query
from backend.extensions import is_production_environment

logger = logging.getLogger(__name__)

# Permitted roles in court_case_dev schema
VALID_ROLES = frozenset({"admin", "clerk", "judge"})

# Progressive throttling constants
_THROTTLE_WINDOW_SECONDS = 900  # 15 minutes
_MAX_FAILED_ATTEMPTS = 5
_CACHE_THRESHOLD = 1000  # Maximum keys in memory for SimpleCache

# Thread safety lock for in-memory / development cache operations
_local_lock = threading.Lock()

# Atomic Lua script for Redis: sliding window policy
# Atomically increments counter and refreshes the 900-second TTL on every failed attempt,
# maintaining exact behavioral parity with development SimpleCache sliding-window semantics.
LUA_ATOMIC_INCR_EXPIRE = """
local current = redis.call('INCR', KEYS[1])
redis.call('EXPIRE', KEYS[1], ARGV[1])
return current
"""

# Internal singleton backends for authentication throttling
_throttling_redis_client: Optional[Any] = None
_throttling_simple_cache: Optional[SimpleCache] = None
_throttling_redis_trusted_production: bool = False


def get_throttling_backend() -> Tuple[str, Any]:
    """
    Retrieve or initialize the active throttling backend.

    In production:
      Production environment validation executes FIRST before returning any backend.
      Never permits SimpleCache in production (raises RuntimeError).
      Untrusted or development-injected Redis clients are rejected upon production activation.
      Only returns a client created internally by the production initialization path.
      Verifies connectivity on cached clients via bounded ping() (2.0s timeout).
      Requires and returns ("redis", redis_client).
      Uses an explicitly managed redis-py client with bounded socket/connect timeouts (2.0s)
      and verifies connectivity via ping(). Fails closed with safe RuntimeError.

    In development / testing:
      Preserves test injection functionality: returns injected redis or simple backend.
      Otherwise defaults to bounded SimpleCache(threshold=1000, default_timeout=900).

    Returns:
        Tuple[str, Any]: ("redis", redis_client) or ("simple", SimpleCache).

    Raises:
        RuntimeError: In production if shared persistent storage is unavailable or SimpleCache is attempted.
    """
    global _throttling_redis_client, _throttling_simple_cache, _throttling_redis_trusted_production

    # 1. Production environment validation happens FIRST
    if is_production_environment():
        # Never permit SimpleCache in production under any circumstance
        if _throttling_simple_cache is not None:
            raise RuntimeError(
                "Security violation: SimpleCache is strictly forbidden in production environments. "
                "Redis shared persistent cache is mandatory."
            )

        # In production, untrusted or dev-injected Redis clients must NEVER be returned.
        # Only clients created internally by the production initialization path are trusted.
        if _throttling_redis_client is not None and not _throttling_redis_trusted_production:
            logger.warning("Untrusted throttling Redis client discarded upon production environment activation.")
            _throttling_redis_client = None

        # Verify trusted cached production Redis client with bounded timeout (2.0s)
        if _throttling_redis_client is not None and _throttling_redis_trusted_production:
            try:
                _throttling_redis_client.ping()
                return "redis", _throttling_redis_client
            except Exception as exc:
                _throttling_redis_client = None
                _throttling_redis_trusted_production = False
                logger.error(
                    "Cached production Redis client connectivity verification failed (%s).",
                    type(exc).__name__,
                )
                raise RuntimeError(
                    "Authentication service configuration failure: "
                    "unable to establish a verified connection to shared persistent storage."
                ) from None

        # Otherwise, require and initialize verified redis-py client from trusted configured URL
        storage_uri = (
            os.getenv("RATELIMIT_STORAGE_URI")
            or os.getenv("REDIS_URL")
            or getattr(Config, "RATELIMIT_STORAGE_URI", None)
            or getattr(Config, "REDIS_URL", None)
            or getattr(Config, "SESSION_REDIS_URL", None)
            or ""
        )
        if not isinstance(storage_uri, str):
            storage_uri = str(storage_uri or "")
        storage_uri = storage_uri.strip()

        if not (storage_uri.startswith("redis://") or storage_uri.startswith("rediss://")):
            raise RuntimeError(
                "Shared persistent cache (Redis) is required for authentication throttling in production. "
                "Configure a valid redis:// or rediss:// endpoint."
            )

        try:
            import redis

            # Explicitly managed redis-py client with bounded timeouts
            client = redis.Redis.from_url(
                storage_uri,
                socket_connect_timeout=2.0,
                socket_timeout=2.0,
                decode_responses=True,
            )
            # Verify connectivity immediately via bounded ping()
            client.ping()

            _throttling_redis_client = client
            _throttling_redis_trusted_production = True
            logger.info("Authentication throttling initialized with explicitly managed Redis client.")
            return "redis", _throttling_redis_client
        except Exception as exc:
            _throttling_redis_trusted_production = False
            # Mask credentials and URLs; fail closed with safe message
            logger.error(
                "Failed to connect to shared persistent cache in production (%s).",
                type(exc).__name__,
            )
            raise RuntimeError(
                "Authentication service configuration failure: "
                "unable to establish a verified connection to shared persistent storage."
            ) from None

    # 2. Development / testing: preserve test injection functionality
    if _throttling_redis_client is not None:
        return "redis", _throttling_redis_client

    if _throttling_simple_cache is not None:
        return "simple", _throttling_simple_cache

    # 3. Development default: initialize bounded SimpleCache
    _throttling_simple_cache = SimpleCache(
        threshold=_CACHE_THRESHOLD,
        default_timeout=_THROTTLE_WINDOW_SECONDS,
    )
    logger.debug("Authentication throttling initialized with bounded SimpleCache.")
    return "simple", _throttling_simple_cache


def get_throttling_cache() -> Any:
    """Convenience helper returning the raw backend instance."""
    _, backend = get_throttling_backend()
    return backend


def set_throttling_backend(backend_type: Optional[str], instance: Optional[Any]) -> None:
    """Helper to reset or inject custom throttling backend (primarily for tests)."""
    global _throttling_redis_client, _throttling_simple_cache, _throttling_redis_trusted_production
    _throttling_redis_trusted_production = False
    if is_production_environment():
        if backend_type is None and instance is None:
            _throttling_redis_client = None
            _throttling_simple_cache = None
            return
        if backend_type == "simple" or isinstance(instance, SimpleCache):
            raise RuntimeError(
                "Security violation: SimpleCache is strictly forbidden in production environments."
            )
        raise RuntimeError(
            "Security violation: Throttling backend injection is strictly forbidden in production environments."
        )

    if backend_type == "redis":
        _throttling_redis_client = instance
        _throttling_simple_cache = None
    elif backend_type == "simple":
        _throttling_simple_cache = instance
        _throttling_redis_client = None
    else:
        _throttling_redis_client = None
        _throttling_simple_cache = None


def set_throttling_cache(cache_instance: Optional[Any]) -> None:
    """Backwards-compatible helper to reset or inject custom cache instance."""
    global _throttling_redis_client, _throttling_simple_cache, _throttling_redis_trusted_production
    _throttling_redis_trusted_production = False
    if is_production_environment():
        if cache_instance is None:
            _throttling_redis_client = None
            _throttling_simple_cache = None
            return
        if isinstance(cache_instance, SimpleCache) or not hasattr(cache_instance, "eval"):
            raise RuntimeError(
                "Security violation: SimpleCache is strictly forbidden in production environments."
            )
        raise RuntimeError(
            "Security violation: Throttling cache injection is strictly forbidden in production environments."
        )

    if cache_instance is None:
        _throttling_redis_client = None
        _throttling_simple_cache = None
    elif hasattr(cache_instance, "eval"):
        _throttling_redis_client = cache_instance
        _throttling_simple_cache = None
    else:
        _throttling_simple_cache = cache_instance
        _throttling_redis_client = None

    if cache_instance is None:
        _throttling_redis_client = None
        _throttling_simple_cache = None
    elif hasattr(cache_instance, "eval"):
        _throttling_redis_client = cache_instance
        _throttling_simple_cache = None
    else:
        _throttling_simple_cache = cache_instance
        _throttling_redis_client = None


def _build_throttle_key(client_ip: str, username: str) -> str:
    """Construct compound key combining explicit CCMS prefix, IP, and normalized username."""
    normalized_ip = (client_ip or "127.0.0.1").strip()
    normalized_user = (username or "").strip().lower()
    return f"ccms:throttle:{normalized_ip}:{normalized_user}"


def check_and_apply_throttling(client_ip: str, username: str) -> bool:
    """
    Check if the (IP, username) pair has exceeded failed login thresholds.

    Uses bounded storage with automatic TTL expiry. Does NOT block or sleep worker threads.

    Args:
        client_ip: Originating client IP address.
        username: Normalized username.

    Returns:
        bool: True if request should be blocked (throttled), False otherwise.
    """
    key = _build_throttle_key(client_ip, username)
    backend_type, backend = get_throttling_backend()

    if backend_type == "redis":
        raw_val = backend.get(key)
        try:
            failed_count = int(raw_val) if raw_val is not None else 0
        except (ValueError, TypeError):
            failed_count = 0
    else:
        with _local_lock:
            val = backend.get(key)
            failed_count = int(val) if val is not None else 0

    if failed_count >= _MAX_FAILED_ATTEMPTS:
        logger.warning(
            "Progressive throttling active for IP %s and user %s (%d failed attempts).",
            client_ip,
            username,
            failed_count,
        )
        return True

    return False


def record_failed_login(client_ip: str, username: str) -> None:
    """
    Record a failed login attempt for the (IP, username) pair.
    Increments failure counter atomically and thread-safely:
      - In production (Redis): Uses atomic Lua script executing INCR + EXPIRE via redis-py public eval().
      - In development (SimpleCache): Thread-safe read-and-set under _local_lock:
        initializes missing counter to 1, or increments existing value, with 900s TTL.
    """
    key = _build_throttle_key(client_ip, username)
    backend_type, backend = get_throttling_backend()

    if backend_type == "redis":
        backend.eval(LUA_ATOMIC_INCR_EXPIRE, 1, key, _THROTTLE_WINDOW_SECONDS)
    else:
        with _local_lock:
            current_val = backend.get(key)
            new_val = 1 if current_val is None else current_val + 1
            backend.set(key, new_val, timeout=_THROTTLE_WINDOW_SECONDS)


def clear_failed_logins(client_ip: str, username: str) -> None:
    """Clear failed login history upon successful authentication."""
    key = _build_throttle_key(client_ip, username)
    backend_type, backend = get_throttling_backend()

    if backend_type == "redis":
        backend.delete(key)
    else:
        with _local_lock:
            backend.delete(key)


def authenticate_user(
    username: str,
    password: str,
    client_ip: str = "127.0.0.1",
) -> Tuple[Optional[Dict[str, Any]], Optional[str], int]:
    """
    Authenticate user credentials against court_case_dev.

    Validates:
      1. Progressive throttling (IP + username pair, non-blocking).
      2. Username existence and password verification (constant-time).
      3. Role validity ('admin', 'clerk', 'judge').
      4. Role-to-judge mapping integrity.
      5. Active judge status for judge accounts.

    Args:
        username: Provided username.
        password: Plaintext password.
        client_ip: Client IP address for throttling tracking.

    Returns:
        Tuple of (user_data_dict_or_none, error_message_or_none, http_status_code)
    """
    normalized_username = (username or "").strip()
    if not normalized_username or not password:
        return None, "Username and password are required.", 400

    # 1. Check progressive throttling
    if check_and_apply_throttling(client_ip, normalized_username):
        return (
            None,
            "Too many failed login attempts. Please wait before trying again.",
            429,
        )

    # 2. Query user from database via read-only parameterized query
    query = """
        SELECT 
            u.user_id,
            u.username,
            u.password,
            u.role,
            u.judge_id,
            j.active_status AS judge_active,
            j.name AS judge_name
        FROM users u
        LEFT JOIN judges j ON u.judge_id = j.judge_id
        WHERE u.username = %s;
    """
    row = execute_read_query(
        query,
        params=(normalized_username,),
        fetch_one=True,
        row_factory=dict_row,
    )

    # 3. User existence check with constant-time dummy verification
    if not row:
        dummy_verify_password(password)
        record_failed_login(client_ip, normalized_username)
        return None, "Invalid username or password.", 401

    # 4. Verify password hash
    stored_hash = row["password"]
    if not verify_password(stored_hash, password):
        record_failed_login(client_ip, normalized_username)
        return None, "Invalid username or password.", 401

    # 5. Validate Role
    role = (row["role"] or "").strip().lower()
    if role not in VALID_ROLES:
        logger.error(
            "Account configuration error for user_id %s: invalid role '%s'.",
            row["user_id"],
            role,
        )
        return None, "Account configuration error: invalid user role.", 403

    # 6. Validate Role-to-Judge Mapping
    judge_id = row["judge_id"]

    if role in ("admin", "clerk"):
        if judge_id is not None:
            logger.error(
                "Account configuration violation: user %s with role '%s' has judge_id assigned.",
                normalized_username,
                role,
            )
            return (
                None,
                "Account configuration error: non-judge accounts cannot be linked to a judge.",
                403,
            )

    elif role == "judge":
        if judge_id is None:
            logger.error(
                "Account configuration violation: user %s with role 'judge' has judge_id=NULL.",
                normalized_username,
            )
            return (
                None,
                "Account configuration error: judge account must be linked to a valid judge.",
                403,
            )

        # Linked judge must exist in judges table
        if row["judge_active"] is None:
            logger.error(
                "Account configuration violation: judge_id %s for user %s not found in judges table.",
                judge_id,
                normalized_username,
            )
            return (
                None,
                "Account configuration error: linked judge does not exist.",
                403,
            )

        # Linked judge must be currently active
        if not row["judge_active"]:
            logger.warning(
                "Login refused: judge account %s linked to deactivated judge %s.",
                normalized_username,
                judge_id,
            )
            return (
                None,
                "Judge account is deactivated. Access denied.",
                403,
            )

    # 7. Successful Authentication — clear throttling tracker
    clear_failed_logins(client_ip, normalized_username)

    user_info = {
        "user_id": row["user_id"],
        "username": row["username"],
        "role": role,
        "judge_id": str(judge_id) if judge_id else None,
    }
    return user_info, None, 200


def get_user_by_id(user_id: int) -> Optional[Dict[str, Any]]:
    """
    Fetch an active user by user_id for live session revalidation.

    Args:
        user_id: The integer user_id.

    Returns:
        dict: User metadata if active and valid, else None.
    """
    if not isinstance(user_id, int):
        try:
            user_id = int(user_id)
        except (ValueError, TypeError):
            return None

    query = """
        SELECT 
            u.user_id,
            u.username,
            u.role,
            u.judge_id,
            j.active_status AS judge_active
        FROM users u
        LEFT JOIN judges j ON u.judge_id = j.judge_id
        WHERE u.user_id = %s;
    """
    row = execute_read_query(
        query,
        params=(user_id,),
        fetch_one=True,
        row_factory=dict_row,
    )
    if not row:
        return None

    role = (row["role"] or "").strip().lower()
    if role not in VALID_ROLES:
        return None

    if role == "judge":
        if not row["judge_id"] or not row["judge_active"]:
            return None

    if role in ("admin", "clerk") and row["judge_id"] is not None:
        return None

    return {
        "user_id": row["user_id"],
        "username": row["username"],
        "role": role,
        "judge_id": str(row["judge_id"]) if row["judge_id"] else None,
    }
