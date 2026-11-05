"""
Court Case Management System - Centralized Configuration
Loads configuration from root .env and provides strict safety validation.

Safety Rules:
  - Database is restricted strictly to court_case_dev.
  - court_case_db is blocked unconditionally.
  - Secrets and credentials are never printed or logged.
"""

from datetime import timedelta
import os
from pathlib import Path
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Project Root & Environment Loading
# backend/ is one level below project root: backend/config.py -> project root
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(dotenv_path=PROJECT_ROOT / ".env")


class Config:
    """Centralized application configuration."""

    # -----------------------------------------------------------------------
    # Project Paths
    # -----------------------------------------------------------------------
    ROOT_DIR = PROJECT_ROOT
    SESSION_FILE_DIR = str(PROJECT_ROOT / os.getenv("SESSION_FILE_DIR", ".flask_session"))

    # -----------------------------------------------------------------------
    # Application Debug Mode (Defaults to False)
    # Enabled only through explicit development configuration setting
    # -----------------------------------------------------------------------
    DEBUG = os.getenv("FLASK_DEBUG", "False").strip().lower() in ("true", "1", "yes")

    # -----------------------------------------------------------------------
    # Database Configuration & Safety Guards
    # -----------------------------------------------------------------------
    DB_HOST = os.getenv("DB_HOST", "localhost")
    DB_NAME = os.getenv("DB_NAME", "")
    DB_USER = os.getenv("DB_USER", "")
    DB_PASSWORD = os.getenv("DB_PASSWORD", "")
    DB_PORT = os.getenv("DB_PORT", "5432")

    ALLOWED_DATABASE = "court_case_dev"
    BLOCKED_DATABASES = frozenset({"court_case_db"})

    # -----------------------------------------------------------------------
    # Flask Core Security & Secret Key
    # -----------------------------------------------------------------------
    SECRET_KEY = os.getenv("SECRET_KEY", "")

    INSECURE_SECRET_PLACEHOLDERS = frozenset({
        "generate_a_strong_random_secret_key_here",
        "your_secret_key_here",
        "change_this_secret_key",
        "change_me",
        "changeme",
        "secret",
        "secret_key",
        "secretkey",
        "password",
        "default",
        "12345678901234567890123456789012",
        "abcdefghijklmnopqrstuvwxyz123456",
    })

    # -----------------------------------------------------------------------
    # Server-Side Session Management (Flask-Session)
    # -----------------------------------------------------------------------
    from backend.extensions import is_production_environment
    _is_prod = is_production_environment()

    # In development: defaults to 'filesystem'
    # In production: explicitly defaults to 'redis' (never silently falls back to filesystem)
    SESSION_TYPE = os.getenv("SESSION_TYPE", "redis" if _is_prod else "filesystem")
    SESSION_PERMANENT = True
    PERMANENT_SESSION_LIFETIME = timedelta(
        minutes=int(os.getenv("SESSION_LIFETIME_MINUTES", "30"))
    )
    SESSION_COOKIE_NAME = os.getenv("SESSION_COOKIE_NAME", "ccms_session")
    SESSION_COOKIE_HTTPONLY = (
        os.getenv("SESSION_COOKIE_HTTPONLY", "True").strip().lower() == "true"
    )
    SESSION_COOKIE_SAMESITE = os.getenv("SESSION_COOKIE_SAMESITE", "Lax")

    # In production: cookie Secure is always True
    # In development: defaults to False for localhost HTTP development
    SESSION_COOKIE_SECURE = (
        True if _is_prod
        else (os.getenv("SESSION_COOKIE_SECURE", "False").strip().lower() == "true")
    )
    SESSION_USE_SIGNER = True
    SESSION_REDIS_URL = os.getenv("SESSION_REDIS_URL") or os.getenv("REDIS_URL") or ""

    # -----------------------------------------------------------------------
    # CSRF Protection (Flask-WTF)
    # -----------------------------------------------------------------------
    WTF_CSRF_ENABLED = True
    WTF_CSRF_TIME_LIMIT = int(os.getenv("WTF_CSRF_TIME_LIMIT", "3600"))
    WTF_CSRF_HEADERS = ["X-CSRF-Token", "X-CSRFToken"]

    # -----------------------------------------------------------------------
    # Reverse Proxy Configuration (ProxyFix)
    # Disabled by default in development; enabled only behind trusted reverse proxy
    # -----------------------------------------------------------------------
    USE_PROXYFIX = os.getenv("USE_PROXYFIX", "False").strip().lower() == "true"
    TRUSTED_PROXIES = int(os.getenv("TRUSTED_PROXIES", "1"))

    # -----------------------------------------------------------------------
    # Rate Limiting Configuration (Flask-Limiter)
    # -----------------------------------------------------------------------
    RATELIMIT_DEFAULT = "200 per day; 50 per hour"
    RATELIMIT_STORAGE_URI = os.getenv("RATELIMIT_STORAGE_URI") or (
        os.getenv("REDIS_URL") or os.getenv("SESSION_REDIS_URL") or "" if _is_prod else "memory://"
    ) or ("" if _is_prod else "memory://")
    RATELIMIT_STRATEGY = "moving-window"

    @classmethod
    def validate_database_config(cls) -> str:
        """
        Validate all database configuration settings without opening a connection.

        Returns:
            str: The validated database name (ALLOWED_DATABASE).

        Raises:
            RuntimeError: If any database configuration value is missing, invalid,
                          or not permitted.
        """
        # 1. Validate DB_NAME
        if not cls.DB_NAME:
            raise RuntimeError(
                "DB_NAME is not set. Copy .env.example to .env and configure "
                "your development database credentials."
            )

        configured_db = cls.DB_NAME.strip()

        # Case-insensitive block check for court_case_db
        if configured_db.lower() in cls.BLOCKED_DATABASES:
            raise RuntimeError(
                f"Connection refused: '{configured_db}' is a blocked production database. "
                "Update DB_NAME in .env to point to your development database."
            )

        # Exact case-sensitive match required for court_case_dev
        if configured_db != cls.ALLOWED_DATABASE:
            raise RuntimeError(
                f"Connection refused: '{configured_db}' is not the permitted development "
                f"database. Expected '{cls.ALLOWED_DATABASE}'."
            )

        # 2. Validate DB_HOST
        if not cls.DB_HOST or not cls.DB_HOST.strip():
            raise RuntimeError(
                "DB_HOST is not set or is empty. Configure DB_HOST in your .env file."
            )

        # 3. Validate DB_USER
        if not cls.DB_USER or not cls.DB_USER.strip():
            raise RuntimeError(
                "DB_USER is not set or is empty. Configure DB_USER in your .env file."
            )

        # 4. Validate DB_PASSWORD (never log or print the actual password value)
        if not cls.DB_PASSWORD or not cls.DB_PASSWORD.strip():
            raise RuntimeError(
                "DB_PASSWORD is not set or is empty. Configure DB_PASSWORD in your .env file."
            )

        # 5. Validate DB_PORT (must be an integer within valid TCP port range 1..65535)
        try:
            port = int(str(cls.DB_PORT).strip())
        except (ValueError, TypeError):
            raise RuntimeError(
                f"DB_PORT must be a valid integer port number. Got: '{cls.DB_PORT}'."
            )

        if not (1 <= port <= 65535):
            raise RuntimeError(
                f"DB_PORT is out of valid TCP port range (1-65535). Got: {port}."
            )

        return cls.ALLOWED_DATABASE

    @classmethod
    def validate_secret_key(cls) -> str:
        """
        Validate that SECRET_KEY is set, sufficiently strong (at least 32 bytes),
        and not an obvious placeholder value. Never prints or logs secrets.

        Returns:
            str: The validated SECRET_KEY.

        Raises:
            RuntimeError: If SECRET_KEY is missing, too short (< 32 bytes),
                          or an insecure placeholder value.
        """
        if not cls.SECRET_KEY or not cls.SECRET_KEY.strip():
            raise RuntimeError(
                "SECRET_KEY is required but not set in the environment or .env file. "
                "Configure a secure random SECRET_KEY in .env."
            )

        raw_key = cls.SECRET_KEY.strip()
        key_bytes = raw_key.encode("utf-8")

        # Must be at least 32 bytes (256 bits) for cryptographic security
        if len(key_bytes) < 32:
            raise RuntimeError(
                f"SECRET_KEY is insufficiently strong ({len(key_bytes)} bytes). "
                "It must be at least 32 bytes long for cryptographic security."
            )

        # Check for obvious placeholder patterns
        normalized = raw_key.lower()
        if normalized in cls.INSECURE_SECRET_PLACEHOLDERS or any(
            placeholder in normalized
            for placeholder in (
                "placeholder",
                "your_secret",
                "change_me",
                "change-me",
                "changeme",
                "replace_me",
                "generate_a_strong",
            )
        ):
            raise RuntimeError(
                "SECRET_KEY is using an insecure placeholder or template value. "
                "Generate a cryptographically secure random secret key (e.g., using 'secrets.token_hex(32)')."
            )

        return cls.SECRET_KEY

    @classmethod
    def validate_all(cls) -> None:
        """Run all safety and configuration validations."""
        cls.validate_database_config()
        cls.validate_secret_key()
