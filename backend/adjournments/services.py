"""
Court Case Management System - Adjournments Service Layer
Handles listing, retrieval, and creation of hearing adjournments as an append-only ledger.
Maintains hearing immutability and case status isolation.
"""

import logging
from typing import Any, Dict, List, Optional, Tuple
import uuid

import psycopg
from psycopg.errors import ForeignKeyViolation
from psycopg.rows import dict_row

from backend.db import (
    DatabaseWriteError,
    StatementTimeoutError,
    UncertainCommitError,
    execute_read_query,
    execute_write_transaction,
)
from backend.hearings.services import (
    get_court_timezone,
    validate_uuid,
)

logger = logging.getLogger(__name__)


def list_adjournments(
    user: Dict[str, Any],
    hearing_id: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    List hearing adjournments with pagination, filtering, and fail-closed judge scoping.
    """
    page = max(1, int(page))
    limit = max(1, min(100, int(limit)))
    offset = (page - 1) * limit

    role = (user.get("role") or "").strip().lower()
    is_judge = (role == "judge")
    authenticated_judge_id = validate_uuid(user.get("judge_id")) if is_judge else None

    # Fail-closed for judge accounts without valid judge_id
    if is_judge and not authenticated_judge_id:
        logger.warning("Judge user %s requested adjournments with missing judge_id.", user.get("user_id"))
        return [], {"page": page, "limit": limit, "total_records": 0, "total_pages": 0}

    where_clauses: List[str] = []
    params: List[Any] = []

    # 1. Judge authorization scoping: strictly bind to parent hearing's judge_id
    if is_judge:
        where_clauses.append("h.judge_id = %s::uuid")
        params.append(authenticated_judge_id)

    # 2. Hearing ID filter
    if hearing_id:
        clean_hearing = validate_uuid(hearing_id)
        if clean_hearing:
            where_clauses.append("a.hearing_id = %s::uuid")
            params.append(clean_hearing)
        else:
            return [], {"page": page, "limit": limit, "total_records": 0, "total_pages": 0}

    where_str = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

    query = f"""
        SELECT 
            a.adj_id,
            a.hearing_id,
            a.reason_code,
            h.case_id,
            c.case_number,
            h.judge_id,
            COUNT(*) OVER() AS total_count
        FROM adjournments a
        JOIN hearings h ON a.hearing_id = h.hearing_id
        JOIN cases c ON h.case_id = c.case_id
        {where_str}
        ORDER BY a.adj_id ASC
        LIMIT %s OFFSET %s;
    """
    query_params = list(params) + [limit, offset]

    rows = execute_read_query(query, params=query_params, fetch_one=False, row_factory=dict_row) or []
    total_records = rows[0]["total_count"] if rows else 0
    total_pages = (total_records + limit - 1) // limit if limit > 0 else 0

    results = []
    for r in rows:
        results.append({
            "adj_id": str(r["adj_id"]),
            "hearing_id": str(r["hearing_id"]),
            "reason_code": r["reason_code"],
            "case_id": str(r["case_id"]),
            "case_number": r["case_number"],
            "judge_id": str(r["judge_id"]),
        })

    pagination = {
        "page": page,
        "limit": limit,
        "total_records": total_records,
        "total_pages": total_pages,
    }
    return results, pagination


def get_adjournment_by_id(
    adj_id: str,
    user: Dict[str, Any],
) -> Tuple[Optional[Dict[str, Any]], Optional[str], int]:
    """
    Retrieve single adjournment detail by ID with strict judge assignment verification.
    """
    valid_id = validate_uuid(adj_id)
    if not valid_id:
        return None, "Invalid adj_id UUID.", 400

    role = (user.get("role") or "").strip().lower()
    is_judge = (role == "judge")
    authenticated_judge_id = validate_uuid(user.get("judge_id")) if is_judge else None

    if is_judge and not authenticated_judge_id:
        return None, "Access forbidden: judge account is not linked to an active judge.", 403

    query = """
        SELECT 
            a.adj_id,
            a.hearing_id,
            a.reason_code,
            h.case_id,
            c.case_number,
            h.judge_id
        FROM adjournments a
        JOIN hearings h ON a.hearing_id = h.hearing_id
        JOIN cases c ON h.case_id = c.case_id
        WHERE a.adj_id = %s::uuid;
    """
    row = execute_read_query(query, params=(valid_id,), fetch_one=True, row_factory=dict_row)
    if not row:
        return None, "Adjournment not found.", 404

    # Enforce judge scoping parity with parent hearing's judge
    if is_judge and str(row["judge_id"]) != str(authenticated_judge_id):
        return None, "Access forbidden: you do not have judicial assignment to this hearing.", 403

    result = {
        "adj_id": str(row["adj_id"]),
        "hearing_id": str(row["hearing_id"]),
        "reason_code": row["reason_code"],
        "case_id": str(row["case_id"]),
        "case_number": row["case_number"],
        "judge_id": str(row["judge_id"]),
    }
    return result, None, 200


def create_adjournment(
    actor_username: str,
    hearing_id: str,
    reason_code: str,
) -> Tuple[Optional[Dict[str, Any]], Optional[str], int]:
    """
    Record an adjournment against an existing hearing within an atomic write transaction.
    Adjournments are append-only; the parent hearing and case status remain unchanged.
    """
    valid_hearing = validate_uuid(hearing_id)
    if not valid_hearing:
        return None, "Invalid or missing hearing_id UUID.", 400

    if not reason_code or not isinstance(reason_code, str) or not reason_code.strip():
        return None, "Missing or empty reason_code.", 400

    clean_reason = reason_code.strip()
    if len(clean_reason) > 255:
        return None, "reason_code exceeds maximum allowable length of 255 characters.", 400

    court_tz = get_court_timezone()

    def operation(cur: psycopg.Cursor) -> Dict[str, Any]:
        # 1. Lock parent hearing with FOR SHARE to verify existence
        cur.execute(
            """
            SELECT hearing_id, case_id, judge_id 
            FROM hearings 
            WHERE hearing_id = %s::uuid 
            FOR SHARE;
            """,
            (valid_hearing,),
        )
        h_row = cur.fetchone()
        if not h_row:
            raise ValueError("Referenced hearing does not exist.")

        # 2. Append adjournment record (no mutation to cases or hearings)
        cur.execute(
            """
            INSERT INTO adjournments (adj_id, hearing_id, reason_code)
            VALUES (gen_random_uuid(), %s::uuid, %s)
            RETURNING adj_id, hearing_id, reason_code;
            """,
            (valid_hearing, clean_reason),
        )
        return cur.fetchone()

    try:
        inserted = execute_write_transaction(
            actor_username=actor_username,
            operation=operation,
            row_factory=dict_row,
            session_timezone=court_tz.key,
        )
        result = {
            "adj_id": str(inserted["adj_id"]),
            "hearing_id": str(inserted["hearing_id"]),
            "reason_code": inserted["reason_code"],
        }
        return result, None, 201

    except ForeignKeyViolation:
        return None, "Referenced hearing does not exist.", 400
    except ValueError as exc:
        return None, str(exc), 400
    except StatementTimeoutError as exc:
        logger.error("StatementTimeoutError during create_adjournment: %s", exc)
        return None, str(exc), 500
    except UncertainCommitError as exc:
        logger.critical("UncertainCommitError during create_adjournment: %s", exc)
        return None, str(exc), 500
    except DatabaseWriteError as exc:
        logger.error("DatabaseWriteError during create_adjournment: %s", exc)
        return None, str(exc), 500
    except psycopg.Error as exc:
        logger.error("psycopg.Error during create_adjournment: %s", type(exc).__name__)
        return None, "An internal database error occurred.", 500

