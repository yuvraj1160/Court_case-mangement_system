"""
Court Case Management System - Safe Database Connection & Execution Helpers
Provides a reusable psycopg v3 connection manager and query execution helpers.

Safety Rules:
  - Enforces connection ONLY to court_case_dev.
  - Rejects court_case_db and any other database.
  - Never prints or logs database credentials or passwords.
  - Connects strictly on-demand (never at import time).
  - Enforces PostgreSQL READ ONLY transaction mode on read queries.
  - Write transactions require explicit actor username, set PostgreSQL transaction-local
    'app.username' setting for audit triggers, and automatically commit or rollback.
  - All query execution uses parameterized queries (%s placeholders).
"""

import logging
import os
from typing import Any, Callable, Optional, Sequence, Union
import psycopg

from backend.config import Config

logger = logging.getLogger(__name__)


class DatabaseWriteError(Exception):
    """Base exception for database write transaction failures."""
    pass


class StatementTimeoutError(DatabaseWriteError):
    """Raised when a query or lock wait times out during statement execution with confirmed rollback."""
    pass


class UncertainCommitError(DatabaseWriteError):
    """Raised when a connection interruption or cancellation occurs during COMMIT, leaving the outcome uncertain."""
    pass


def get_db_connection(row_factory: Optional[Any] = None) -> psycopg.Connection:
    """
    Open and return a new psycopg v3 connection to court_case_dev.

    Validates that DB_NAME matches ALLOWED_DATABASE ('court_case_dev')
    and rejects 'court_case_db' prior to connecting.

    Args:
        row_factory: Optional row factory (e.g., psycopg.rows.dict_row).

    Returns:
        psycopg.Connection: A live connection to court_case_dev.

    Raises:
        RuntimeError: If DB configuration fails safety validation.
        psycopg.Error: If the TCP connection or authentication fails.
    """
    # Safety Check: Validate database configuration before attempting connection
    target_db = Config.validate_database_config()

    connect_kwargs = {
        "host": Config.DB_HOST,
        "dbname": target_db,
        "user": Config.DB_USER,
        "password": Config.DB_PASSWORD,
        "port": int(str(Config.DB_PORT).strip()),
    }
    if row_factory is not None:
        connect_kwargs["row_factory"] = row_factory

    return psycopg.connect(**connect_kwargs)


def execute_read_query(
    query: str,
    params: Optional[Sequence[Any]] = None,
    fetch_one: bool = False,
    row_factory: Optional[Any] = None,
) -> Any:
    """
    Execute a read-only parameterized query against court_case_dev.

    Enforces PostgreSQL READ ONLY transaction mode before executing caller-supplied SQL.
    Any attempt to execute data-modifying or DDL statements (INSERT, UPDATE, DELETE,
    DROP, ALTER, TRUNCATE) through this helper will be rejected by the database engine
    with a ReadOnlySqlTransaction error.

    Uses nested context managers to guarantee reliable cursor and connection
    closure on both success and failure.

    Args:
        query: SQL query containing %s placeholders.
        params: Sequence of parameter values to safely bind.
        fetch_one: If True, returns a single row; otherwise returns all rows.
        row_factory: Optional psycopg row factory.

    Returns:
        A single row (if fetch_one=True), a list of rows (if fetch_one=False),
        or None if no rows match.

    Raises:
        psycopg.errors.ReadOnlySqlTransaction: If a write operation is attempted.
        psycopg.Error: On database or query failure.
    """
    with get_db_connection(row_factory=row_factory) as conn:
        conn.read_only = True
        with conn.transaction():
            with conn.cursor() as cur:
                cur.execute("SET TRANSACTION READ ONLY;")
                cur.execute(query, params)
                if fetch_one:
                    return cur.fetchone()
                return cur.fetchall()


def execute_write_transaction(
    actor_username: str,
    operation: Union[str, Callable[[psycopg.Cursor], Any]],
    params: Optional[Sequence[Any]] = None,
    fetch_one: bool = False,
    row_factory: Optional[Any] = None,
    session_timezone: Optional[str] = None,
) -> Any:
    """
    Execute a write operation within an isolated database transaction on court_case_dev.

    Safety & Audit Rules:
      - Validates that actor_username is a non-empty string of at most 50 characters;
        raises ValueError otherwise.
      - Sets PostgreSQL session setting 'app.username' locally to the transaction
        via 'SELECT set_config('app.username', %s, true);'.
      - Sets transaction-local 'TimeZone' setting when session_timezone or COURT_TIMEZONE is configured.
      - When triggers (e.g. log_table_changes) fire, they read current_setting('app.username', true)
        to attribute the mutation in audit_logs.
      - Explicitly tracks execution phases: 'statement', 'commit', and 'completed'.
      - Automatically COMMITS upon clean exit of the transaction block.
      - Automatically ROLLS BACK if any exception occurs during execution.
      - Uses parameterized SQL only; never concatenates raw inputs.

    Args:
        actor_username: Non-empty username of the authenticated user performing the write (max 50 chars).
        operation: SQL query string (containing %s placeholders) or a callable accepting
                   a psycopg.Cursor (e.g., callback for multi-step transactional logic).
        params: Optional sequence of parameter values when operation is a SQL string.
        fetch_one: If True and query returns rows (e.g., RETURNING), returns one row.
                   Otherwise returns all rows.
        row_factory: Optional psycopg row factory (e.g., dict_row).
        session_timezone: Optional IANA timezone name for transaction-local TimeZone setting.

    Returns:
        If operation is a callable: the result returned by operation(cur).
        If operation is a SQL string:
          - If query produces rows (e.g. RETURNING): a single row (if fetch_one=True)
            or list of rows.
          - If query does not produce rows: cur.rowcount (int).

    Raises:
        ValueError: If actor_username is missing, empty, not a string, or exceeds 50 characters.
        TypeError: If operation is neither a string nor a callable.
        StatementTimeoutError: If statement/lock timeout occurs during the statement phase (confirmed rollback).
        UncertainCommitError: If connection is lost or canceled during COMMIT phase (uncertain outcome).
        DatabaseWriteError: If connection error occurs during statement execution before COMMIT.
        psycopg.Error: On database or SQL execution failure (transaction rolls back).
    """
    if not actor_username or not isinstance(actor_username, str) or not actor_username.strip():
        raise ValueError("actor_username must be a non-empty string.")

    clean_actor = actor_username.strip()
    if len(clean_actor) > 50:
        raise ValueError("actor_username exceeds maximum length of 50 characters.")

    target_tz = session_timezone
    if not target_tz:
        try:
            from flask import current_app, has_app_context
            if has_app_context() and current_app:
                target_tz = current_app.config.get("COURT_TIMEZONE")
        except ImportError:
            pass
    if not target_tz:
        target_tz = os.getenv("COURT_TIMEZONE", "")
    target_tz = str(target_tz).strip()

    execution_phase = "statement"
    result = None
    try:
        with get_db_connection(row_factory=row_factory) as conn:
            with conn.transaction():
                with conn.cursor() as cur:
                    # Set transaction-local actor identity for triggers and audit logging
                    cur.execute("SELECT set_config('app.username', %s, true);", (clean_actor,))
                    if target_tz:
                        cur.execute("SELECT set_config('TimeZone', %s, true);", (target_tz,))

                    if callable(operation):
                        result = operation(cur)
                    elif isinstance(operation, str):
                        cur.execute(operation, params)
                        if cur.description is not None:
                            if fetch_one:
                                result = cur.fetchone()
                            else:
                                result = cur.fetchall()
                        else:
                            result = cur.rowcount
                    else:
                        raise TypeError("operation must be a SQL query string or a callable taking a cursor.")

                # Statement phase completed without error; advancing to commit phase
                execution_phase = "commit"

            # Exiting conn.transaction() issues COMMIT on PostgreSQL
            execution_phase = "completed"
            return result

    except psycopg.errors.QueryCanceled as exc:
        if execution_phase == "statement":
            logger.error("QueryCanceled during statement execution (confirmed rollback): %s", exc)
            raise StatementTimeoutError("Database operation timed out during statement execution. The transaction was rolled back.") from exc
        elif execution_phase == "commit":
            logger.critical("QueryCanceled during COMMIT phase. Outcome is UNCERTAIN: %s", exc)
            raise UncertainCommitError("Database operation canceled during transaction commit. Outcome is uncertain. Please reconcile records before retrying.") from exc
        else:
            logger.warning("QueryCanceled during post-commit connection cleanup. Transaction is COMMITTED: %s", exc)
            return result

    except psycopg.OperationalError as exc:
        if execution_phase == "statement":
            logger.error("OperationalError during statement execution (no COMMIT issued): %s", exc)
            raise DatabaseWriteError("Database connection error during statement execution. No COMMIT was issued; transaction cannot commit through this request.") from exc
        elif execution_phase == "commit":
            logger.critical("Connection lost during COMMIT. Transaction outcome is UNCERTAIN: %s", exc)
            raise UncertainCommitError("Connection lost during transaction commit. Outcome is uncertain. Please reconcile records before retrying.") from exc
        else:
            logger.warning("OperationalError during post-commit connection cleanup. Transaction is COMMITTED: %s", exc)
            return result

