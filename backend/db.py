"""
Court Case Management System - Safe Database Connection & Execution Helpers
Provides a reusable psycopg v3 connection manager and query execution helpers.

Safety Rules:
  - Enforces connection ONLY to court_case_dev.
  - Rejects court_case_db and any other database.
  - Never prints or logs database credentials or passwords.
  - Connects strictly on-demand (never at import time).
  - Enforces PostgreSQL READ ONLY transaction mode on read queries.
  - All query execution uses parameterized queries (%s placeholders).
"""

import logging
from typing import Any, Optional, Sequence
import psycopg

from backend.config import Config

logger = logging.getLogger(__name__)


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
