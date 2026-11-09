"""
Court Case Management System - Flask Backend Application
Phase 4: Centralized configuration, application factory, and security extension integration.

Safety Rules:
  - Database is restricted strictly to court_case_dev.
  - court_case_db is blocked unconditionally.
  - Credentials and secrets are never printed or logged.
  - Query execution uses parameterized SQL and PostgreSQL READ ONLY mode for health checks.
  - ProxyFix is disabled by default in development.
  - Production environments unconditionally disable DEBUG mode.
  - Extensions and runtime context imported from backend.extensions to prevent circular dependencies.
"""

import logging
import os
from typing import Any, Mapping, Optional
import zoneinfo

from flask import Flask, jsonify
import psycopg

from backend.config import Config
from backend.db import execute_read_query
from backend.extensions import (
    CANONICAL_ENVIRONMENT_MAP,
    csrf,
    get_execution_environment,
    is_production_environment,
    limiter,
    server_session,
)

# ---------------------------------------------------------------------------
# Logging Configuration
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
logger = logging.getLogger(__name__)

# Database and security constants that can NEVER be overridden in config_overrides
DISALLOWED_CONFIG_OVERRIDES = frozenset({
    "ALLOWED_DATABASE",
    "BLOCKED_DATABASES",
    "DB_NAME",
    "DB_HOST",
    "DB_USER",
    "DB_PASSWORD",
    "DB_PORT",
})


def _validate_effective_config(config_mapping: Mapping[str, Any]) -> None:
    """
    Validate the effective application configuration.

    Ensures that database rules and secret key cryptographic requirements
    are strictly enforced, comparing directly against canonical Config constants.
    Never trusts overrides or custom config classes for database safety constraints.

    Args:
        config_mapping: The effective configuration dictionary from app.config.

    Raises:
        RuntimeError: If any configuration value is missing, insecure, or invalid.
    """
    # -----------------------------------------------------------------------
    # 1. Database Configuration Validation
    # Directly compare against canonical immutable constants in Config
    # -----------------------------------------------------------------------
    raw_db = config_mapping.get("DB_NAME")
    if not raw_db:
        raise RuntimeError(
            "DB_NAME is not set. Copy .env.example to .env and configure "
            "your development database credentials."
        )

    configured_db = str(raw_db).strip()
    if configured_db.lower() in Config.BLOCKED_DATABASES:
        raise RuntimeError(
            f"Connection refused: '{configured_db}' is a blocked production database. "
            "Update DB_NAME in .env to point to your development database."
        )

    if configured_db != Config.ALLOWED_DATABASE:
        raise RuntimeError(
            f"Connection refused: '{configured_db}' is not the permitted development "
            f"database. Expected '{Config.ALLOWED_DATABASE}'."
        )

    db_host = config_mapping.get("DB_HOST")
    if not db_host or not str(db_host).strip():
        raise RuntimeError(
            "DB_HOST is not set or is empty. Configure DB_HOST in your .env file."
        )

    db_user = config_mapping.get("DB_USER")
    if not db_user or not str(db_user).strip():
        raise RuntimeError(
            "DB_USER is not set or is empty. Configure DB_USER in your .env file."
        )

    db_password = config_mapping.get("DB_PASSWORD")
    if not db_password or not str(db_password).strip():
        raise RuntimeError(
            "DB_PASSWORD is not set or is empty. Configure DB_PASSWORD in your .env file."
        )

    raw_port = config_mapping.get("DB_PORT")
    try:
        port = int(str(raw_port).strip())
    except (ValueError, TypeError):
        raise RuntimeError(
            f"DB_PORT must be a valid integer port number. Got: '{raw_port}'."
        )
    if not (1 <= port <= 65535):
        raise RuntimeError(
            f"DB_PORT is out of valid TCP port range (1-65535). Got: {port}."
        )

    # -----------------------------------------------------------------------
    # 2. Secret Key Cryptographic Validation
    # -----------------------------------------------------------------------
    raw_secret = config_mapping.get("SECRET_KEY")
    if not raw_secret or not str(raw_secret).strip():
        raise RuntimeError(
            "SECRET_KEY is required but not set in the environment or .env file. "
            "Configure a secure random SECRET_KEY in .env."
        )

    secret_str = str(raw_secret).strip()
    secret_bytes = secret_str.encode("utf-8")
    if len(secret_bytes) < 32:
        raise RuntimeError(
            f"SECRET_KEY is insufficiently strong ({len(secret_bytes)} bytes). "
            "It must be at least 32 bytes long for cryptographic security."
        )

    normalized_secret = secret_str.lower()
    if normalized_secret in Config.INSECURE_SECRET_PLACEHOLDERS or any(
        placeholder in normalized_secret
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


def resolve_and_validate_court_timezone(
    config_mapping: Mapping[str, Any],
    canonical_env: str,
) -> zoneinfo.ZoneInfo:
    """
    Resolve and validate the court jurisdiction's timezone.

    Rules:
      - For production and staging environments (canonical category not in 'development', 'test'):
        COURT_TIMEZONE must be explicitly configured and valid in zoneinfo.ZoneInfo.
        Startup fails immediately with RuntimeError if missing or invalid.
      - For isolated development and test environments:
        Falls back to 'UTC' if COURT_TIMEZONE is missing or empty.
        If COURT_TIMEZONE is provided, it must be valid in zoneinfo.ZoneInfo.
      - Never infers or hardcodes a specific local jurisdiction.

    Returns:
        zoneinfo.ZoneInfo: The validated timezone object.

    Raises:
        RuntimeError: If timezone configuration is missing in non-dev/test or invalid.
    """
    raw_tz = config_mapping.get("COURT_TIMEZONE") or os.getenv("COURT_TIMEZONE")
    canonical_category = CANONICAL_ENVIRONMENT_MAP.get(canonical_env, canonical_env)

    is_dev_or_test = canonical_category in ("development", "test")

    if not raw_tz or not str(raw_tz).strip():
        if is_dev_or_test:
            logger.info("COURT_TIMEZONE not set in %s mode. Defaulting to 'UTC'.", canonical_env)
            return zoneinfo.ZoneInfo("UTC")
        raise RuntimeError(
            f"COURT_TIMEZONE must be explicitly configured for '{canonical_env}' deployments. "
            "Configure COURT_TIMEZONE to the IANA timezone identifier of the court jurisdiction."
        )

    clean_tz = str(raw_tz).strip()
    try:
        return zoneinfo.ZoneInfo(clean_tz)
    except (zoneinfo.ZoneInfoNotFoundError, ValueError):
        raise RuntimeError(
            f"Invalid COURT_TIMEZONE configured: '{clean_tz}'. "
            "Must be a valid IANA time zone identifier (e.g. 'UTC', 'America/New_York', 'Asia/Kolkata')."
        ) from None


def create_app(
    config_class=Config,
    config_overrides: Optional[dict] = None,
) -> Flask:
    """
    Application factory for the Court Case Management System Flask backend.

    1. Loads base configuration from config_class.
    2. Applies config_overrides, preventing tampering with database/security settings.
    3. Resolves environment and forces DEBUG=False if a production environment is detected.
    4. Validates the effective configuration (database settings & SECRET_KEY).
    5. Validates and configures ProxyFix (disabled by default; requires positive integer).
    6. Initializes security extensions exclusively through their public APIs:
       - Flask-Session (server-side filesystem storage for local development)
       - Flask-WTF (CSRFProtect globally on state-changing methods)
       - Flask-Limiter (bound to effective rate limits via public init_app)
    7. Registers core health, index, and authentication endpoints.

    Args:
        config_class: Configuration class to load (defaults to Config).
        config_overrides: Optional dictionary of configuration overrides.

    Returns:
        Flask: The fully configured Flask application instance.
    """
    app = Flask(__name__)
    app.config.from_object(config_class)

    # -----------------------------------------------------------------------
    # Apply Overrides with Database and Security Guardrails
    # -----------------------------------------------------------------------
    if config_overrides:
        for key in config_overrides:
            if key in DISALLOWED_CONFIG_OVERRIDES:
                raise RuntimeError(
                    f"Overriding database configuration setting '{key}' is strictly forbidden."
                )
        app.config.update(config_overrides)

    # -----------------------------------------------------------------------
    # Environment & Production Debug Guardrails
    # Enforced at application creation time across all entry points (CLI, WSGI, direct)
    # -----------------------------------------------------------------------
    env_name = get_execution_environment()
    is_prod = is_production_environment(env_name)

    if is_prod:
        app.config["DEBUG"] = False
        app.config["SESSION_COOKIE_SECURE"] = True
        logger.info(
            "Production environment ('%s') detected during application creation; forcing DEBUG=False and SESSION_COOKIE_SECURE=True.",
            env_name,
        )
    else:
        # In non-production environments, DEBUG defaults to False.
        # Enabled only through an explicit development configuration setting.
        raw_debug = app.config.get("DEBUG", False)
        if isinstance(raw_debug, str):
            app.config["DEBUG"] = raw_debug.strip().lower() in ("true", "1", "yes")
        else:
            app.config["DEBUG"] = bool(raw_debug)

    # -----------------------------------------------------------------------
    # Validate the Effective Application Configuration & Court Timezone
    # -----------------------------------------------------------------------
    _validate_effective_config(app.config)
    court_tz = resolve_and_validate_court_timezone(app.config, env_name)
    app.config["COURT_TIMEZONE"] = court_tz.key

    # -----------------------------------------------------------------------
    # Server-Side Session Storage Configuration & Production Enforcement
    # -----------------------------------------------------------------------
    session_type = str(app.config.get("SESSION_TYPE", "filesystem")).strip().lower()
    app.config["SESSION_TYPE"] = session_type

    if is_prod:
        # 1. Require SESSION_TYPE=redis in production. Reject filesystem sessions.
        if session_type != "redis":
            raise RuntimeError(
                f"Production security violation: SESSION_TYPE must be 'redis', got '{session_type}'. "
                "Filesystem session storage is strictly forbidden in production."
            )

        # 2. Production cookie Secure is always True, regardless of overrides.
        app.config["SESSION_COOKIE_SECURE"] = True

        # 3. Require a valid Redis session connection/configuration.
        session_redis = (
            app.config.get("SESSION_REDIS")
            or app.config.get("SESSION_REDIS_URL")
            or app.config.get("REDIS_URL")
            or app.config.get("RATELIMIT_STORAGE_URI")
            or os.getenv("SESSION_REDIS_URL")
            or os.getenv("REDIS_URL")
            or os.getenv("RATELIMIT_STORAGE_URI")
            or ""
        )

        if isinstance(session_redis, str):
            session_redis_url = session_redis.strip()
            if not (session_redis_url.startswith("redis://") or session_redis_url.startswith("rediss://")):
                raise RuntimeError(
                    "Production session storage configuration failure: "
                    "a valid Redis URI (redis:// or rediss://) is required for production sessions."
                )

            try:
                import redis

                redis_client = redis.Redis.from_url(
                    session_redis_url,
                    socket_connect_timeout=2.0,
                    socket_timeout=2.0,
                )
                redis_client.ping()
                app.config["SESSION_REDIS"] = redis_client
                logger.info("Production session storage initialized with verified redis-py client.")
            except Exception as exc:
                logger.error(
                    "Failed to connect to production Redis session storage (%s).",
                    type(exc).__name__,
                )
                raise RuntimeError(
                    "Production session storage connection failure: "
                    "unable to establish a verified connection to Redis session storage."
                ) from None
        else:
            # An already-instantiated Redis client (e.g. injected in testing)
            try:
                session_redis.ping()
                app.config["SESSION_REDIS"] = session_redis
                logger.info("Production session storage initialized with injected verified redis-py client.")
            except Exception as exc:
                logger.error(
                    "Failed to verify injected Redis session client (%s).",
                    type(exc).__name__,
                )
                raise RuntimeError(
                    "Production session storage connection failure: "
                    "unable to establish a verified connection to Redis session storage."
                ) from None
    else:
        # Development / non-production: keep local development filesystem sessions working
        if session_type == "filesystem":
            session_dir = app.config.get("SESSION_FILE_DIR")
            if session_dir:
                os.makedirs(session_dir, exist_ok=True)

    # -----------------------------------------------------------------------
    # Rate Limiting Storage Configuration & Production Enforcement
    # -----------------------------------------------------------------------
    overrides_has_ratelimit = config_overrides is not None and "RATELIMIT_STORAGE_URI" in config_overrides
    ratelimit_storage = str(app.config.get("RATELIMIT_STORAGE_URI", "")).strip()

    if is_prod:
        # Rate limiting must be enabled unconditionally in production
        app.config["RATELIMIT_ENABLED"] = True
        limiter.enabled = True

        # If RATELIMIT_STORAGE_URI was explicitly overridden to memory://, reject immediately
        if overrides_has_ratelimit and ratelimit_storage == "memory://":
            raise RuntimeError(
                "Production rate limiting storage violation: "
                "In-memory rate limiting is strictly forbidden in production. "
                "RATELIMIT_STORAGE_URI must be configured with a valid Redis URI (redis:// or rediss://)."
            )

        # In production, require an explicitly configured valid RATELIMIT_STORAGE_URI,
        # or an explicitly configured trusted Redis URL deliberately used for rate limiting.
        if not ratelimit_storage or ratelimit_storage == "memory://":
            trusted_redis_fallback = (
                app.config.get("RATELIMIT_REDIS_URL")
                or app.config.get("REDIS_URL")
                or app.config.get("SESSION_REDIS_URL")
                or os.getenv("RATELIMIT_STORAGE_URI")
                or os.getenv("RATELIMIT_REDIS_URL")
                or os.getenv("REDIS_URL")
                or os.getenv("SESSION_REDIS_URL")
                or ""
            )
            if isinstance(trusted_redis_fallback, str):
                cleaned_fallback = trusted_redis_fallback.strip()
                if cleaned_fallback.startswith("redis://") or cleaned_fallback.startswith("rediss://"):
                    ratelimit_storage = cleaned_fallback
                    app.config["RATELIMIT_STORAGE_URI"] = ratelimit_storage

        # Never silently fall back to memory://, filesystem, or an invented localhost Redis URI
        if not ratelimit_storage or ratelimit_storage == "memory://":
            raise RuntimeError(
                "Production rate limiting storage violation: "
                "In-memory rate limiting is strictly forbidden in production. "
                "RATELIMIT_STORAGE_URI must be configured with a valid Redis URI (redis:// or rediss://)."
            )

        if not (ratelimit_storage.startswith("redis://") or ratelimit_storage.startswith("rediss://")):
            raise RuntimeError(
                "Production rate limiting storage configuration failure: "
                "a valid Redis URI (redis:// or rediss://) is required for production rate limiting."
            )

        # Verify the actual configured rate-limit Redis connection with bounded timeouts and ping()
        try:
            import redis

            rl_client = redis.Redis.from_url(
                ratelimit_storage,
                socket_connect_timeout=2.0,
                socket_timeout=2.0,
            )
            rl_client.ping()
            logger.info("Production rate limiting storage verified with Redis backend.")
        except Exception as exc:
            logger.error(
                "Failed to connect to production Redis rate limit storage (%s).",
                type(exc).__name__,
            )
            raise RuntimeError(
                "Production rate limiting storage connection failure: "
                "unable to establish a verified connection to Redis rate limit storage."
            ) from None
    else:
        # In non-production, ensure limiter.enabled matches config (defaults to True)
        limiter.enabled = bool(app.config.get("RATELIMIT_ENABLED", True))

    # -----------------------------------------------------------------------
    # Conditional ProxyFix Configuration
    # Disabled by default; enabled only when explicitly configured for trusted proxy
    # -----------------------------------------------------------------------
    use_proxyfix = app.config.get("USE_PROXYFIX", False)
    if isinstance(use_proxyfix, str):
        use_proxyfix = use_proxyfix.strip().lower() in ("true", "1", "yes")

    if use_proxyfix:
        from werkzeug.middleware.proxy_fix import ProxyFix

        raw_trusted = app.config.get("TRUSTED_PROXIES", 1)
        try:
            trusted = int(str(raw_trusted).strip())
        except (ValueError, TypeError):
            raise RuntimeError(
                f"TRUSTED_PROXIES must be a valid positive integer. Got: '{raw_trusted}'."
            )
        if trusted <= 0:
            raise RuntimeError(
                f"TRUSTED_PROXIES must be a positive integer (> 0). Got: {trusted}."
            )

        app.wsgi_app = ProxyFix(
            app.wsgi_app,
            x_for=trusted,
            x_proto=trusted,
            x_host=trusted,
            x_port=trusted,
            x_prefix=trusted,
        )
        logger.info("ProxyFix enabled with trusted_proxies=%d", trusted)
    else:
        logger.info("ProxyFix disabled (direct socket / local development mode)")

    # -----------------------------------------------------------------------
    # Initialize Security Extensions exclusively via public APIs
    # -----------------------------------------------------------------------
    csrf.init_app(app)
    server_session.init_app(app)
    limiter.init_app(app)

    if is_prod:
        # Verify via supported public API that Flask-Limiter is using Redis-backed storage
        effective_storage = limiter.storage
        schemes = getattr(effective_storage, "STORAGE_SCHEME", [])
        if not any(scheme in ("redis", "rediss", "redis+unix", "valkey", "valkeys") for scheme in schemes):
            raise RuntimeError(
                f"Production rate limiting storage violation: Flask-Limiter initialized with "
                f"unsupported storage backend '{type(effective_storage).__name__}'. Redis-backed storage is required."
            )

    # -----------------------------------------------------------------------
    # Register Blueprints
    # -----------------------------------------------------------------------
    from backend.auth.routes import auth_bp
    app.register_blueprint(auth_bp, url_prefix="/auth")

    from backend.dashboard.routes import dashboard_bp
    app.register_blueprint(dashboard_bp, url_prefix="/api")

    from backend.cases.routes import cases_bp
    app.register_blueprint(cases_bp, url_prefix="/api/cases")

    from backend.parties.routes import parties_bp
    app.register_blueprint(parties_bp, url_prefix="/api/parties")

    from backend.hearings.routes import hearings_bp
    app.register_blueprint(hearings_bp, url_prefix="/api/hearings")

    from backend.filings.routes import filings_bp
    app.register_blueprint(filings_bp, url_prefix="/api/filings")

    from backend.adjournments.routes import adjournments_bp
    app.register_blueprint(adjournments_bp, url_prefix="/api/adjournments")

    # -----------------------------------------------------------------------
    # Core Endpoints
    # -----------------------------------------------------------------------
    @app.route("/", methods=["GET"])
    def index():
        """
        Root endpoint.
        Confirms the Flask application is running.
        """
        return jsonify({
            "status": "success",
            "message": "Court Case Management API is running",
        })

    @app.route("/health/db", methods=["GET"])
    def health_db():
        """
        Database health check.

        Executes read-only query against court_case_dev using execute_read_query.
        Returns the verified database name and total case count.
        Never exposes database credentials or internal secrets.
        """
        try:
            row = execute_read_query(
                "SELECT current_database(), COUNT(*) FROM cases;",
                fetch_one=True,
            )
            if not row:
                raise RuntimeError("Database query returned an empty result.")

            db_name, total_cases = row

            logger.info(
                "Health check OK — database: %s, total cases: %s",
                db_name,
                total_cases,
            )

            return jsonify({
                "status": "connected",
                "database": db_name,
                "total_cases": total_cases,
            })

        except RuntimeError as exc:
            logger.error("DB configuration or query error: %s", exc)
            return jsonify({
                "status": "error",
                "message": "Database configuration error. Check server logs.",
            }), 500

        except psycopg.Error as exc:
            logger.error("Database connection failed (%s).", type(exc).__name__)
            return jsonify({
                "status": "error",
                "message": "Could not connect to the database. Check server logs.",
            }), 500

    return app


# ---------------------------------------------------------------------------
# Module-level Application Instance
# Exported for WSGI servers and Flask CLI: python -m flask --app backend.app run
# Halts immediately with a descriptive RuntimeError if configuration is missing or invalid.
# ---------------------------------------------------------------------------
app = create_app()


# ---------------------------------------------------------------------------
# Local Development Entry Point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    env_name = get_execution_environment()
    debug_mode = False if is_production_environment(env_name) else bool(app.config.get("DEBUG", False))

    logger.info(
        "Starting Flask development server — target database: %s, env: %s, debug: %s",
        Config.ALLOWED_DATABASE,
        env_name,
        debug_mode,
    )
    app.run(
        debug=debug_mode,
        host="127.0.0.1",
        port=5000,
    )
