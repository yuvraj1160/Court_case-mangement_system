"""
Court Case Management System - Application Extensions & Runtime Context
Centralizes extension singletons and runtime environment helpers to avoid
circular dependencies between the Flask application factory and route blueprints.
"""

import os
from typing import Optional
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_session import Session
from flask_wtf.csrf import CSRFProtect

# Global extension singletons
csrf = CSRFProtect()
server_session = Session()
limiter = Limiter(key_func=get_remote_address)

# ---------------------------------------------------------------------------
# Canonical Environment Configuration & Recognized Identifiers
# ---------------------------------------------------------------------------
# Primary canonical environment variable name
CANONICAL_ENV_VAR = "ENV"

# Fallback environment variables in priority order
FALLBACK_ENV_VARS = ("APP_ENV", "FLASK_ENV")

# All tracked environment variables
TRACKED_ENV_VARS = (CANONICAL_ENV_VAR,) + FALLBACK_ENV_VARS

# Recognized production environment identifiers
PRODUCTION_ENVIRONMENTS = frozenset({
    "production",
    "prod",
    "live",
    "release",
})

# Recognized development environment identifiers
DEVELOPMENT_ENVIRONMENTS = frozenset({
    "development",
    "dev",
    "local",
})

# Recognized test environment identifiers
TEST_ENVIRONMENTS = frozenset({
    "test",
    "testing",
})

# Recognized staging environment identifiers
STAGING_ENVIRONMENTS = frozenset({
    "staging",
    "stage",
    "uat",
})

# All valid environment identifiers
VALID_ENVIRONMENTS = frozenset(
    PRODUCTION_ENVIRONMENTS
    | DEVELOPMENT_ENVIRONMENTS
    | TEST_ENVIRONMENTS
    | STAGING_ENVIRONMENTS
)

# Canonical classification map to detect semantic conflicts between different variable aliases
CANONICAL_ENVIRONMENT_MAP = {
    # Production class
    "production": "production",
    "prod": "production",
    "live": "production",
    "release": "production",
    # Development class
    "development": "development",
    "dev": "development",
    "local": "development",
    # Test class
    "test": "test",
    "testing": "test",
    # Staging class
    "staging": "staging",
    "stage": "staging",
    "uat": "staging",
}


def get_execution_environment() -> str:
    """
    Resolve the execution environment name consistently from environment variables.

    Canonical Resolution Policy:
    1. Primary canonical variable: 'ENV'.
    2. Supported fallback variables: 'APP_ENV', followed by 'FLASK_ENV'.
    3. If NO environment variable is explicitly configured, defaults safely to 'development'.
    4. If multiple variables are explicitly configured with conflicting values
       (e.g., ENV='development' and APP_ENV='production'), raises a descriptive RuntimeError.
       Never silently resolves to development on configuration conflicts.
    5. Unknown environment identifiers or typos (e.g., 'prodution') are strictly rejected
       with a descriptive RuntimeError rather than being treated as development.

    Returns:
        str: The normalized, lowercase environment name.

    Raises:
        RuntimeError: If an unknown environment identifier is provided or if
                      conflicting environment variables are detected.
    """
    configured = []
    for var_name in TRACKED_ENV_VARS:
        raw_val = os.getenv(var_name)
        if raw_val is not None and raw_val.strip():
            configured.append((var_name, raw_val.strip()))

    if not configured:
        return "development"

    # Validate all configured identifiers against VALID_ENVIRONMENTS
    normalized_list = []
    for var_name, raw_val in configured:
        norm_val = raw_val.lower()
        if norm_val not in VALID_ENVIRONMENTS:
            valid_sorted = sorted(VALID_ENVIRONMENTS)
            raise RuntimeError(
                f"Unknown or invalid environment identifier '{raw_val}' configured in {var_name}. "
                f"Allowed environment identifiers are: {valid_sorted}."
            )
        normalized_list.append((var_name, norm_val))

    # Check for conflicts across configured variables
    # If variables map to different canonical classes (e.g. 'development' vs 'production'), raise
    first_var, first_val = normalized_list[0]
    first_class = CANONICAL_ENVIRONMENT_MAP[first_val]

    conflicts = []
    for var_name, norm_val in normalized_list[1:]:
        val_class = CANONICAL_ENVIRONMENT_MAP[norm_val]
        if val_class != first_class:
            conflicts.append((var_name, norm_val, val_class))

    if conflicts:
        details = ", ".join(
            f"{var}='{val}' (category: {CANONICAL_ENVIRONMENT_MAP[val]})"
            for var, val in normalized_list
        )
        raise RuntimeError(
            f"Conflicting environment configurations detected: {details}. "
            f"Cannot resolve execution environment. Ensure canonical '{CANONICAL_ENV_VAR}' "
            "and fallback variables do not conflict."
        )

    # All configured variables are in the same canonical category; return the highest-priority one
    return first_val


def is_production_environment(env_name: Optional[str] = None) -> bool:
    """
    Determine whether an environment name corresponds to a production deployment.

    Args:
        env_name: Optional environment name. Defaults to get_execution_environment().

    Returns:
        bool: True if the environment is a production environment.

    Raises:
        RuntimeError: If env_name is explicitly provided but is unknown or invalid.
    """
    if env_name is not None:
        target = env_name.strip().lower()
        if target not in VALID_ENVIRONMENTS:
            valid_sorted = sorted(VALID_ENVIRONMENTS)
            raise RuntimeError(
                f"Unknown or invalid environment identifier: '{env_name}'. "
                f"Allowed environment identifiers are: {valid_sorted}."
            )
    else:
        target = get_execution_environment()

    return target in PRODUCTION_ENVIRONMENTS

