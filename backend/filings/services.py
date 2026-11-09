"""
Court Case Management System - Filings Service Layer
Handles listing, retrieval, creation, and updating of court filings.
Enforces dual-source party-case validation, explicit court timezone timestamps,
and strict field immutability (only filing_type is mutable).
"""

from datetime import datetime, timezone
import logging
import os
import re
from typing import Any, Dict, List, Optional, Tuple
import uuid
import zoneinfo

import psycopg
from psycopg.errors import ForeignKeyViolation
from psycopg.rows import dict_row

from backend.auth.decorators import is_case_assigned_to_judge
from backend.db import (
    DatabaseWriteError,
    StatementTimeoutError,
    UncertainCommitError,
    execute_read_query,
    execute_write_transaction,
)
from backend.hearings.services import (
    get_court_timezone,
    parse_and_validate_naive_timestamp,
    validate_uuid,
)

logger = logging.getLogger(__name__)


def is_party_associated_with_case(party_id: str, case_id: str) -> bool:
    """
    Check if a party is associated with a case either via party_case_roles
    or via prior records in filings (dual-source validation).
    """
    valid_party = validate_uuid(party_id)
    valid_case = validate_uuid(case_id)
    if not valid_party or not valid_case:
        return False

    query = """
        SELECT EXISTS (
            SELECT 1 FROM party_case_roles WHERE case_id = %s::uuid AND party_id = %s::uuid
            UNION ALL
            SELECT 1 FROM filings WHERE case_id = %s::uuid AND party_id = %s::uuid
        ) AS is_linked;
    """
    row = execute_read_query(
        query,
        params=(valid_case, valid_party, valid_case, valid_party),
        fetch_one=True,
        row_factory=dict_row,
    )
    return bool(row and row.get("is_linked"))


def list_filings(
    user: Dict[str, Any],
    case_id: Optional[str] = None,
    party_id: Optional[str] = None,
    filing_type: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    List court filings with pagination, filtering, and fail-closed judge scoping.
    """
    page = max(1, int(page))
    limit = max(1, min(100, int(limit)))
    offset = (page - 1) * limit

    role = (user.get("role") or "").strip().lower()
    is_judge = (role == "judge")
    authenticated_judge_id = validate_uuid(user.get("judge_id")) if is_judge else None

    # Fail-closed for judge accounts without valid judge_id
    if is_judge and not authenticated_judge_id:
        logger.warning("Judge user %s requested filings with missing judge_id.", user.get("user_id"))
        return [], {"page": page, "limit": limit, "total_records": 0, "total_pages": 0}

    where_clauses: List[str] = []
    params: List[Any] = []

    # 1. Judge authorization scoping: strictly bind to cases assigned to this judge
    if is_judge:
        where_clauses.append(
            """
            EXISTS (
                SELECT 1 FROM hearings h WHERE h.case_id = f.case_id AND h.judge_id = %s::uuid
                UNION ALL
                SELECT 1 FROM orders o WHERE o.case_id = f.case_id AND o.judge_id = %s::uuid
            )
            """
        )
        params.extend([authenticated_judge_id, authenticated_judge_id])

    # 2. Case ID filter
    if case_id:
        clean_case = validate_uuid(case_id)
        if clean_case:
            where_clauses.append("f.case_id = %s::uuid")
            params.append(clean_case)
        else:
            return [], {"page": page, "limit": limit, "total_records": 0, "total_pages": 0}

    # 3. Party ID filter
    if party_id:
        clean_party = validate_uuid(party_id)
        if clean_party:
            where_clauses.append("f.party_id = %s::uuid")
            params.append(clean_party)
        else:
            return [], {"page": page, "limit": limit, "total_records": 0, "total_pages": 0}

    # 4. Filing Type filter
    if filing_type and isinstance(filing_type, str) and filing_type.strip():
        where_clauses.append("LOWER(f.filing_type) = LOWER(%s)")
        params.append(filing_type.strip())

    where_str = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

    query = f"""
        SELECT 
            f.filing_id,
            f.case_id,
            c.case_number,
            f.party_id,
            p.name AS party_name,
            f.filing_type,
            f.filing_date,
            COUNT(*) OVER() AS total_count
        FROM filings f
        JOIN cases c ON f.case_id = c.case_id
        JOIN parties p ON f.party_id = p.party_id
        {where_str}
        ORDER BY f.filing_date DESC, f.filing_id ASC
        LIMIT %s OFFSET %s;
    """
    query_params = list(params) + [limit, offset]

    rows = execute_read_query(query, params=query_params, fetch_one=False, row_factory=dict_row) or []
    total_records = rows[0]["total_count"] if rows else 0
    total_pages = (total_records + limit - 1) // limit if limit > 0 else 0

    results = []
    for r in rows:
        results.append({
            "filing_id": str(r["filing_id"]),
            "case_id": str(r["case_id"]),
            "case_number": r["case_number"],
            "party_id": str(r["party_id"]),
            "party_name": r["party_name"],
            "filing_type": r["filing_type"],
            "filing_date": r["filing_date"].isoformat() if isinstance(r["filing_date"], datetime) else str(r["filing_date"]),
        })

    pagination = {
        "page": page,
        "limit": limit,
        "total_records": total_records,
        "total_pages": total_pages,
    }
    return results, pagination


def get_filing_by_id(
    filing_id: str,
    user: Dict[str, Any],
) -> Tuple[Optional[Dict[str, Any]], Optional[str], int]:
    """
    Retrieve single filing detail by ID with strict judge assignment verification.
    """
    valid_id = validate_uuid(filing_id)
    if not valid_id:
        return None, "Invalid filing_id UUID.", 400

    role = (user.get("role") or "").strip().lower()
    is_judge = (role == "judge")
    authenticated_judge_id = validate_uuid(user.get("judge_id")) if is_judge else None

    if is_judge and not authenticated_judge_id:
        return None, "Access forbidden: judge account is not linked to an active judge.", 403

    query = """
        SELECT 
            f.filing_id,
            f.case_id,
            c.case_number,
            f.party_id,
            p.name AS party_name,
            f.filing_type,
            f.filing_date
        FROM filings f
        JOIN cases c ON f.case_id = c.case_id
        JOIN parties p ON f.party_id = p.party_id
        WHERE f.filing_id = %s::uuid;
    """
    row = execute_read_query(query, params=(valid_id,), fetch_one=True, row_factory=dict_row)
    if not row:
        return None, "Filing not found.", 404

    # Enforce judge assignment check on the filing's case
    if is_judge:
        if not is_case_assigned_to_judge(authenticated_judge_id, row["case_id"]):
            return None, "Access forbidden: you are not assigned to the case associated with this filing.", 403

    result = {
        "filing_id": str(row["filing_id"]),
        "case_id": str(row["case_id"]),
        "case_number": row["case_number"],
        "party_id": str(row["party_id"]),
        "party_name": row["party_name"],
        "filing_type": row["filing_type"],
        "filing_date": row["filing_date"].isoformat() if isinstance(row["filing_date"], datetime) else str(row["filing_date"]),
    }
    return result, None, 200


def create_filing(
    actor_username: str,
    case_id: str,
    party_id: str,
    filing_type: str,
    filing_date: Optional[str] = None,
) -> Tuple[Optional[Dict[str, Any]], Optional[str], int]:
    """
    Create a new court filing within an atomic write transaction.
    Performs dual-source party-case validation.
    Generates local court naive timestamp if filing_date is not provided.
    """
    valid_case = validate_uuid(case_id)
    if not valid_case:
        return None, "Invalid or missing case_id UUID.", 400

    valid_party = validate_uuid(party_id)
    if not valid_party:
        return None, "Invalid or missing party_id UUID.", 400

    if not filing_type or not isinstance(filing_type, str) or not filing_type.strip():
        return None, "Missing or empty filing_type.", 400

    clean_filing_type = filing_type.strip()
    if len(clean_filing_type) > 100:
        return None, "filing_type exceeds maximum allowable length of 100 characters.", 400

    court_tz = get_court_timezone()

    # Determine filing timestamp
    if filing_date:
        parsed_dt, err = parse_and_validate_naive_timestamp("filing_date", filing_date, court_tz)
        if err:
            return None, err, 400
        filing_dt = parsed_dt
    else:
        # Generate naive datetime in explicitly configured court timezone
        filing_dt = datetime.now(court_tz).replace(tzinfo=None)

    def operation(cur: psycopg.Cursor) -> Dict[str, Any]:
        # 1. Lock case row with FOR SHARE to verify existence
        cur.execute(
            "SELECT case_id FROM cases WHERE case_id = %s::uuid FOR SHARE;",
            (valid_case,),
        )
        if not cur.fetchone():
            raise ValueError("Referenced case does not exist.")

        # 2. Lock party row with FOR SHARE to verify existence
        cur.execute(
            "SELECT party_id FROM parties WHERE party_id = %s::uuid FOR SHARE;",
            (valid_party,),
        )
        if not cur.fetchone():
            raise ValueError("Referenced party does not exist.")

        # 3. Dual-source party-case validation (party_case_roles OR existing filings)
        cur.execute(
            """
            SELECT EXISTS (
                SELECT 1 FROM party_case_roles WHERE case_id = %s::uuid AND party_id = %s::uuid
                UNION ALL
                SELECT 1 FROM filings WHERE case_id = %s::uuid AND party_id = %s::uuid
            ) AS is_linked;
            """,
            (valid_case, valid_party, valid_case, valid_party),
        )
        assoc_row = cur.fetchone()
        if not assoc_row or not assoc_row.get("is_linked"):
            raise ValueError(f"Party {valid_party} is not associated with case {valid_case}.")

        # 4. Insert filing
        cur.execute(
            """
            INSERT INTO filings (filing_id, case_id, party_id, filing_type, filing_date)
            VALUES (gen_random_uuid(), %s::uuid, %s::uuid, %s, %s)
            RETURNING filing_id, case_id, party_id, filing_type, filing_date;
            """,
            (valid_case, valid_party, clean_filing_type, filing_dt),
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
            "filing_id": str(inserted["filing_id"]),
            "case_id": str(inserted["case_id"]),
            "party_id": str(inserted["party_id"]),
            "filing_type": inserted["filing_type"],
            "filing_date": inserted["filing_date"].isoformat() if isinstance(inserted["filing_date"], datetime) else str(inserted["filing_date"]),
        }
        return result, None, 201

    except ForeignKeyViolation:
        return None, "Referenced case or party does not exist.", 400
    except ValueError as exc:
        return None, str(exc), 400
    except StatementTimeoutError as exc:
        logger.error("StatementTimeoutError during create_filing: %s", exc)
        return None, str(exc), 500
    except UncertainCommitError as exc:
        logger.critical("UncertainCommitError during create_filing: %s", exc)
        return None, str(exc), 500
    except DatabaseWriteError as exc:
        logger.error("DatabaseWriteError during create_filing: %s", exc)
        return None, str(exc), 500
    except psycopg.Error as exc:
        logger.error("psycopg.Error during create_filing: %s", type(exc).__name__)
        return None, "An internal database error occurred.", 500


def update_filing(
    actor_username: str,
    filing_id: str,
    filing_type: str,
) -> Tuple[Optional[Dict[str, Any]], Optional[str], int]:
    """
    Update the filing_type of an existing court filing.
    All other fields (case_id, party_id, filing_date) are immutable.
    """
    valid_id = validate_uuid(filing_id)
    if not valid_id:
        return None, "Invalid filing_id UUID.", 400

    if not filing_type or not isinstance(filing_type, str) or not filing_type.strip():
        return None, "Missing or empty filing_type.", 400

    clean_filing_type = filing_type.strip()
    if len(clean_filing_type) > 100:
        return None, "filing_type exceeds maximum allowable length of 100 characters.", 400

    court_tz = get_court_timezone()

    def operation(cur: psycopg.Cursor) -> Dict[str, Any]:
        # Lock filing row for update
        cur.execute(
            """
            SELECT filing_id, case_id, party_id, filing_type, filing_date
            FROM filings
            WHERE filing_id = %s::uuid
            FOR UPDATE;
            """,
            (valid_id,),
        )
        existing = cur.fetchone()
        if not existing:
            return None

        cur.execute(
            """
            UPDATE filings
            SET filing_type = %s
            WHERE filing_id = %s::uuid
            RETURNING filing_id, case_id, party_id, filing_type, filing_date;
            """,
            (clean_filing_type, valid_id),
        )
        return cur.fetchone()

    try:
        updated = execute_write_transaction(
            actor_username=actor_username,
            operation=operation,
            row_factory=dict_row,
            session_timezone=court_tz.key,
        )
        if not updated:
            return None, "Filing not found.", 404

        result = {
            "filing_id": str(updated["filing_id"]),
            "case_id": str(updated["case_id"]),
            "party_id": str(updated["party_id"]),
            "filing_type": updated["filing_type"],
            "filing_date": updated["filing_date"].isoformat() if isinstance(updated["filing_date"], datetime) else str(updated["filing_date"]),
        }
        return result, None, 200

    except ValueError as exc:
        return None, str(exc), 400
    except StatementTimeoutError as exc:
        logger.error("StatementTimeoutError during update_filing: %s", exc)
        return None, str(exc), 500
    except UncertainCommitError as exc:
        logger.critical("UncertainCommitError during update_filing: %s", exc)
        return None, str(exc), 500
    except DatabaseWriteError as exc:
        logger.error("DatabaseWriteError during update_filing: %s", exc)
        return None, str(exc), 500
    except psycopg.Error as exc:
        logger.error("psycopg.Error during update_filing: %s", type(exc).__name__)
        return None, "An internal database error occurred.", 500

