"""
Court Case Management System - Administrator Bootstrap CLI
Creates the initial administrative account in court_case_dev securely.

Safety Rules:
  - Enforces single-admin bootstrap: refuses execution if an admin already exists.
  - Concurrency-safe: acquires PostgreSQL transaction advisory lock 987654321.
  - Collects credentials interactively via getpass (no terminal echo).
  - Never accepts passwords via command-line arguments (avoids process list exposure).
  - Hashes password using Argon2id BEFORE establishing the database transaction
    to minimize lock duration.
  - Connects strictly to court_case_dev via get_db_connection().
  - Never logs, prints, or exposes plaintext passwords or hashes.
"""

import argparse
import getpass
import logging
import sys
from typing import Optional, Tuple

import psycopg

from backend.auth.security import hash_password, validate_password_strength
from backend.db import get_db_connection

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

# Advisory lock key unique to admin creation concurrency control
ADMIN_BOOTSTRAP_LOCK_KEY = 987654321


def prompt_username_interactively() -> str:
    """
    Prompt for and validate the admin username from standard input.

    Returns:
        str: Validated admin username.
    """
    while True:
        try:
            username = input("Enter admin username: ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\nAborted.")
            sys.exit(1)

        if not username:
            print("Error: Username cannot be empty.")
            continue
        if len(username) < 3 or len(username) > 50:
            print("Error: Username must be between 3 and 50 characters.")
            continue
        if not username.replace("_", "").isalnum():
            print("Error: Username may only contain alphanumeric characters and underscores.")
            continue
        return username


def prompt_password_interactively() -> str:
    """
    Prompt for and validate the admin password without terminal echo.
    Always prompts twice for confirmation.

    Returns:
        str: Validated plaintext password.
    """
    while True:
        try:
            password = getpass.getpass("Enter admin password (min 12 characters): ")
            confirm = getpass.getpass("Confirm admin password: ")
        except (KeyboardInterrupt, EOFError):
            print("\nAborted.")
            sys.exit(1)

        if password != confirm:
            print("Error: Passwords do not match. Please try again.")
            continue

        try:
            validate_password_strength(password, min_length=12)
        except ValueError as err:
            print(f"Error: {err}")
            continue

        return password


def bootstrap_admin(
    username: str,
    password: str,
) -> bool:
    """
    Create the initial admin account in court_case_dev inside an advisory-locked transaction.

    Enforces password complexity requirements directly within the function to prevent
    direct function invocations from bypassing password policy.

    Args:
        username: Validated admin username.
        password: Raw password (hashed immediately in-memory).

    Returns:
        bool: True if admin created successfully, False otherwise.
    """
    # 0. Enforce password complexity policy directly within bootstrap_admin
    try:
        validate_password_strength(password, min_length=12)
    except ValueError as err:
        logger.error("Admin bootstrap rejected: password does not meet security requirements (%s).", err)
        print(f"Error: Password does not meet security requirements: {err}")
        return False

    clean_username = (username or "").strip()
    if not clean_username or len(clean_username) < 3 or len(clean_username) > 50:
        print("Error: Username must be between 3 and 50 characters.")
        return False
    if not clean_username.replace("_", "").isalnum():
        print("Error: Username may only contain alphanumeric characters and underscores.")
        return False

    # 1. Phase 1: Compute Argon2id hash in-memory outside the database transaction
    try:
        password_hash = hash_password(password)
    except Exception as exc:
        print(f"Error hashing password: {exc}")
        return False

    # 2. Phase 2: Atomic PostgreSQL Transaction with Advisory Lock
    try:
        with get_db_connection() as conn:
            with conn.transaction():
                with conn.cursor() as cur:
                    # Acquire transaction-scoped advisory lock
                    cur.execute(
                        "SELECT pg_advisory_xact_lock(%s);",
                        (ADMIN_BOOTSTRAP_LOCK_KEY,),
                    )

                    # Check if an administrator already exists
                    cur.execute("SELECT COUNT(*) FROM users WHERE role = 'admin';")
                    existing_admin_count = cur.fetchone()[0]

                    if existing_admin_count > 0:
                        print("Error: An administrator account already exists. Bootstrap aborted.")
                        return False

                    # Check if username is already taken by another role
                    cur.execute(
                        "SELECT COUNT(*) FROM users WHERE username = %s;",
                        (clean_username,),
                    )
                    if cur.fetchone()[0] > 0:
                        print(f"Error: Username '{clean_username}' is already in use.")
                        return False

                    # Insert initial administrator
                    insert_sql = """
                        INSERT INTO users (username, password, role, judge_id)
                        VALUES (%s, %s, 'admin', NULL)
                        RETURNING user_id;
                    """
                    cur.execute(insert_sql, (clean_username, password_hash))
                    user_id = cur.fetchone()[0]

                    print(
                        f"Success: Initial administrator '{clean_username}' created successfully (user_id: {user_id})."
                    )
                    return True

    except psycopg.Error as exc:
        logger.error("Database error during admin bootstrap (%s).", type(exc).__name__)
        print("Error: Database operation failed. Check server logs.")
        return False


def reset_admin_password(
    username: str,
    password: str,
) -> bool:
    """
    Reset the password for an existing administrator in court_case_dev securely.

    Args:
        username: Validated admin username.
        password: Raw password (hashed immediately in-memory).

    Returns:
        bool: True if password reset successfully, False otherwise.
    """
    try:
        validate_password_strength(password, min_length=12)
    except ValueError as err:
        logger.error("Admin password reset rejected: password does not meet security requirements (%s).", err)
        print(f"Error: Password does not meet security requirements: {err}")
        return False

    clean_username = (username or "").strip()
    if not clean_username or len(clean_username) < 3 or len(clean_username) > 50:
        print("Error: Username must be between 3 and 50 characters.")
        return False
    if not clean_username.replace("_", "").isalnum():
        print("Error: Username may only contain alphanumeric characters and underscores.")
        return False

    try:
        password_hash = hash_password(password)
    except Exception as exc:
        print(f"Error hashing password: {exc}")
        return False

    try:
        with get_db_connection() as conn:
            with conn.transaction():
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT pg_advisory_xact_lock(%s);",
                        (ADMIN_BOOTSTRAP_LOCK_KEY,),
                    )

                    cur.execute(
                        "SELECT user_id FROM users WHERE username = %s AND role = 'admin';",
                        (clean_username,),
                    )
                    row = cur.fetchone()
                    if not row:
                        print(f"Error: Administrator '{clean_username}' not found.")
                        return False

                    user_id = row[0]
                    cur.execute(
                        "UPDATE users SET password = %s WHERE user_id = %s;",
                        (password_hash, user_id),
                    )
                    print(
                        f"Success: Password for administrator '{clean_username}' reset successfully (user_id: {user_id})."
                    )
                    return True

    except psycopg.Error as exc:
        logger.error("Database error during admin password reset (%s).", type(exc).__name__)
        print("Error: Database operation failed. Check server logs.")
        return False


def main() -> None:
    """Entry point for the admin bootstrap CLI."""
    parser = argparse.ArgumentParser(
        description="Bootstrap or reset the administrator account for Court Case Management System."
    )
    parser.add_argument(
        "--username",
        help="Admin username (optional; interactively prompted if omitted).",
        default=None,
    )
    parser.add_argument(
        "--reset-password",
        action="store_true",
        help="Reset password for an existing administrator account.",
    )

    args = parser.parse_args()

    mode_label = "Password Reset" if args.reset_password else "Admin Bootstrap"
    print(f"\n--- Court Case Management System: {mode_label} ---")

    if args.username:
        username = args.username.strip()
        if not username:
            print("Error: Username cannot be empty.")
            sys.exit(1)
        if len(username) < 3 or len(username) > 50:
            print("Error: Username must be between 3 and 50 characters.")
            sys.exit(1)
        if not username.replace("_", "").isalnum():
            print("Error: Username may only contain alphanumeric characters and underscores.")
            sys.exit(1)
    else:
        username = prompt_username_interactively()

    # Passwords are NEVER accepted through command-line arguments
    password = prompt_password_interactively()

    if args.reset_password:
        success = reset_admin_password(username, password)
    else:
        success = bootstrap_admin(username, password)

    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
