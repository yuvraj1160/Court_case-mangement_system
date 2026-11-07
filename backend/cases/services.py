"""
Court Case Management System - Cases Service Layer
Handles case listing, retrieval, creation, modification, concurrency-safe deletion,
and party-case role associations.

Safety Rules:
  - Database queries use strict parameterization (%s placeholders).
  - All write operations execute through execute_write_transaction with actor attribution.
  - Deletion acquires a row-level lock (FOR UPDATE) and checks dependencies atomically.
  - Judge listings are strictly scoped to cases assigned via hearings or orders.
  - Enforces verified status and role values without inventing unapproved constraints.
"""

import datetime
import logging
from typing import Any, Dict, List, Optional, Tuple
import uuid
import psycopg
from psycopg.errors import ForeignKeyViolation, UniqueViolation
from psycopg.rows import dict_row

from backend.db import execute_read_query, execute_write_transaction

logger = logging.getLogger(__name__)

# Verified database check constraint values for cases.status
VALID_CASE_STATUSES = frozenset({"Filed", "Active", "Adjourned", "Disposed", "Closed"})

# Verified seed data values for party_case_roles.role_type
VALID_PARTY_ROLES = frozenset({"Applicant", "Defendant", "Lead Counsel"})

# Allowed sorting columns to prevent SQL injection in ORDER BY
ALLOWED_SORT_COLUMNS = {
    "filing_date": "c.filing_date",
    "case_number": "c.case_number",
    "status": "c.status",
}


def validate_uuid(val: Any) -> Optional[str]:
    """Validate string or UUID object and return canonical lowercase string representation."""
    if not val:
        return None
    try:
        parsed = uuid.UUID(str(val).strip())
        return str(parsed)
    except (ValueError, TypeError, AttributeError):
        return None


def list_cases(
    user: Dict[str, Any],
    page: int = 1,
    limit: int = 20,
    search: Optional[str] = None,
    status: Optional[str] = None,
    sort_by: str = "filing_date",
    sort_order: str = "desc",
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    List court cases with role-based scoping and pagination.

    Args:
        user: Authenticated user dictionary from session revalidation.
        page: Page number (1-indexed).
        limit: Records per page (1..100).
        search: Optional case number substring search.
        status: Optional filter by case status.
        sort_by: Column to sort by ('filing_date', 'case_number', 'status').
        sort_order: Direction ('asc', 'desc').

    Returns:
        Tuple of (list_of_cases, pagination_dict).
    """
    page = max(1, int(page))
    limit = max(1, min(100, int(limit)))
    offset = (page - 1) * limit

    sort_col = ALLOWED_SORT_COLUMNS.get(sort_by, "c.filing_date")
    order_dir = "ASC" if str(sort_order).strip().lower() == "asc" else "DESC"

    where_clauses = []
    params: List[Any] = []

    # 1. Role-based judge scoping
    role = (user.get("role") or "").strip().lower()
    is_judge = (role == "judge")
    judge_id = None

    if is_judge:
        judge_id = validate_uuid(user.get("judge_id"))
        if not judge_id:
            logger.warning("Judge user %s has no judge_id assigned.", user.get("user_id"))
            return [], {"page": page, "limit": limit, "total_records": 0, "total_pages": 0}

        where_clauses.append("""
            c.case_id IN (
                SELECT case_id FROM hearings WHERE judge_id = %s::uuid
                UNION
                SELECT case_id FROM orders WHERE judge_id = %s::uuid
            )
        """)
        params.extend([judge_id, judge_id])

    # 2. Status filter
    if status and str(status).strip() in VALID_CASE_STATUSES:
        where_clauses.append("c.status = %s")
        params.append(str(status).strip())

    # 3. Search query (case_number ILIKE)
    if search and str(search).strip():
        where_clauses.append("c.case_number ILIKE %s")
        params.append(f"%{str(search).strip()}%")

    where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

    # Count total records for pagination
    count_query = f"SELECT COUNT(*) AS total FROM cases c {where_sql};"
    count_row = execute_read_query(
        count_query,
        params=tuple(params),
        fetch_one=True,
        row_factory=dict_row,
    )
    total_records = count_row["total"] if count_row else 0
    total_pages = (total_records + limit - 1) // limit if total_records > 0 else 0

    # Hearing count subquery: scoped to judge for judge requests, full count for admin/clerk
    if is_judge and judge_id:
        hearings_count_subquery = "(SELECT COUNT(*) FROM hearings h WHERE h.case_id = c.case_id AND h.judge_id = %s::uuid) AS hearings_count"
        select_params = [judge_id]
    else:
        hearings_count_subquery = "(SELECT COUNT(*) FROM hearings h WHERE h.case_id = c.case_id) AS hearings_count"
        select_params = []

    # Fetch paginated cases with party and hearing counts
    data_query = f"""
        SELECT 
            c.case_id,
            c.case_number,
            c.status,
            c.filing_date,
            (SELECT COUNT(*) FROM party_case_roles pcr WHERE pcr.case_id = c.case_id) AS parties_count,
            {hearings_count_subquery}
        FROM cases c
        {where_sql}
        ORDER BY {sort_col} {order_dir}
        LIMIT %s OFFSET %s;
    """
    data_params = select_params + list(params) + [limit, offset]
    rows = execute_read_query(
        data_query,
        params=tuple(data_params),
        fetch_one=False,
        row_factory=dict_row,
    )

    cases = []
    for r in (rows or []):
        cases.append({
            "case_id": str(r["case_id"]),
            "case_number": r["case_number"],
            "status": r["status"],
            "filing_date": r["filing_date"].isoformat() if hasattr(r["filing_date"], "isoformat") else str(r["filing_date"]),
            "parties_count": int(r["parties_count"]),
            "hearings_count": int(r["hearings_count"]),
        })

    pagination = {
        "page": page,
        "limit": limit,
        "total_records": total_records,
        "total_pages": total_pages,
    }
    return cases, pagination


def get_case_by_id(case_id: str, user: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
    """
    Retrieve full case details including associated parties, hearings, orders, disposition, and filings.
    Assumes authorization has already been verified by @require_case_access.

    Args:
        case_id: Canonical UUID string of the case.
        user: Optional user dictionary (for contextual logging).

    Returns:
        dict: Detailed case representation, or None if not found.
    """
    valid_id = validate_uuid(case_id)
    if not valid_id:
        return None

    # 1. Fetch parent case metadata
    case_query = """
        SELECT case_id, case_number, status, filing_date
        FROM cases
        WHERE case_id = %s::uuid;
    """
    case_row = execute_read_query(
        case_query,
        params=(valid_id,),
        fetch_one=True,
        row_factory=dict_row,
    )
    if not case_row:
        return None

    # 2. Fetch parties associated with this case
    parties_query = """
        SELECT 
            p.party_id,
            p.name,
            p.party_type,
            pcr.role_type,
            COALESCE(array_agg(pp.phone_number) FILTER (WHERE pp.phone_number IS NOT NULL), '{}') AS phone_numbers
        FROM party_case_roles pcr
        JOIN parties p ON pcr.party_id = p.party_id
        LEFT JOIN party_phones pp ON p.party_id = pp.party_id
        WHERE pcr.case_id = %s::uuid
        GROUP BY p.party_id, p.name, p.party_type, pcr.role_type
        ORDER BY p.name ASC;
    """
    party_rows = execute_read_query(
        parties_query,
        params=(valid_id,),
        fetch_one=False,
        row_factory=dict_row,
    )
    parties = [
        {
            "party_id": str(pr["party_id"]),
            "name": pr["name"],
            "party_type": pr["party_type"],
            "role_type": pr["role_type"],
            "phone_numbers": list(pr["phone_numbers"]),
        }
        for pr in (party_rows or [])
    ]

    # 3. Fetch scheduled hearings (scoped to judge if caller has judge role)
    role = (user.get("role") or "").strip().lower() if user else ""
    is_judge = (role == "judge")
    judge_id = validate_uuid(user.get("judge_id")) if (user and is_judge) else None

    if is_judge and not judge_id:
        logger.warning(
            "Judge user %s requested case %s but has missing or invalid judge_id. Returning empty proceedings.",
            user.get("user_id") if user else None,
            valid_id,
        )
        hearings = []
        orders = []
    else:
        if is_judge:
            hearings_where = "WHERE h.case_id = %s::uuid AND h.judge_id = %s::uuid"
            hearings_params = (valid_id, judge_id)
            orders_where = "WHERE o.case_id = %s::uuid AND o.judge_id = %s::uuid"
            orders_params = (valid_id, judge_id)
        else:
            hearings_where = "WHERE h.case_id = %s::uuid"
            hearings_params = (valid_id,)
            orders_where = "WHERE o.case_id = %s::uuid"
            orders_params = (valid_id,)

        hearings_query = f"""
            SELECT 
                h.hearing_id,
                h.judge_id,
                j.name AS judge_name,
                h.start_time,
                h.end_time
            FROM hearings h
            LEFT JOIN judges j ON h.judge_id = j.judge_id
            {hearings_where}
            ORDER BY h.start_time ASC;
        """
        hearing_rows = execute_read_query(
            hearings_query,
            params=hearings_params,
            fetch_one=False,
            row_factory=dict_row,
        )
        hearings = [
            {
                "hearing_id": str(hr["hearing_id"]),
                "judge_id": str(hr["judge_id"]) if hr["judge_id"] else None,
                "judge_name": hr["judge_name"],
                "start_time": hr["start_time"].isoformat() if hasattr(hr["start_time"], "isoformat") else str(hr["start_time"]),
                "end_time": hr["end_time"].isoformat() if hasattr(hr["end_time"], "isoformat") else str(hr["end_time"]),
            }
            for hr in (hearing_rows or [])
        ]

        # 4. Fetch orders
        orders_query = f"""
            SELECT 
                o.order_id,
                o.judge_id,
                j.name AS judge_name,
                o.order_date,
                o.details
            FROM orders o
            LEFT JOIN judges j ON o.judge_id = j.judge_id
            {orders_where}
            ORDER BY o.order_date DESC;
        """
        order_rows = execute_read_query(
            orders_query,
            params=orders_params,
            fetch_one=False,
            row_factory=dict_row,
        )
        orders = [
            {
                "order_id": str(od["order_id"]),
                "judge_id": str(od["judge_id"]) if od["judge_id"] else None,
                "judge_name": od["judge_name"],
                "order_date": od["order_date"].isoformat() if hasattr(od["order_date"], "isoformat") else str(od["order_date"]),
                "details": od["details"],
            }
            for od in (order_rows or [])
        ]

    # 5. Fetch disposition (if any)
    disp_query = """
        SELECT disp_id, final_judgment, disposition_date
        FROM dispositions
        WHERE case_id = %s::uuid
        LIMIT 1;
    """
    disp_row = execute_read_query(
        disp_query,
        params=(valid_id,),
        fetch_one=True,
        row_factory=dict_row,
    )
    disposition = None
    if disp_row:
        disposition = {
            "disp_id": str(disp_row["disp_id"]),
            "final_judgment": disp_row["final_judgment"],
            "disposition_date": disp_row["disposition_date"].isoformat() if hasattr(disp_row["disposition_date"], "isoformat") else str(disp_row["disposition_date"]),
        }

    # 6. Fetch filings
    filings_query = """
        SELECT 
            f.filing_id,
            f.party_id,
            p.name AS party_name,
            f.filing_type,
            f.filing_date
        FROM filings f
        LEFT JOIN parties p ON f.party_id = p.party_id
        WHERE f.case_id = %s::uuid
        ORDER BY f.filing_date DESC;
    """
    filing_rows = execute_read_query(
        filings_query,
        params=(valid_id,),
        fetch_one=False,
        row_factory=dict_row,
    )
    filings = [
        {
            "filing_id": str(fl["filing_id"]),
            "party_id": str(fl["party_id"]) if fl["party_id"] else None,
            "party_name": fl["party_name"],
            "filing_type": fl["filing_type"],
            "filing_date": fl["filing_date"].isoformat() if hasattr(fl["filing_date"], "isoformat") else str(fl["filing_date"]),
        }
        for fl in (filing_rows or [])
    ]

    return {
        "case_id": str(case_row["case_id"]),
        "case_number": case_row["case_number"],
        "status": case_row["status"],
        "filing_date": case_row["filing_date"].isoformat() if hasattr(case_row["filing_date"], "isoformat") else str(case_row["filing_date"]),
        "parties": parties,
        "hearings": hearings,
        "orders": orders,
        "disposition": disposition,
        "filings": filings,
    }


def create_case(
    actor_username: str,
    case_number: str,
    status: str = "Filed",
    filing_date: Optional[str] = None,
) -> Tuple[Optional[Dict[str, Any]], Optional[str], int]:
    """
    Create a new court case record atomically with audit logging attribution.

    Args:
        actor_username: Authenticated username performing the write.
        case_number: Unique case number (max 50 chars).
        status: Initial status (default: 'Filed').
        filing_date: Optional ISO date string (YYYY-MM-DD); defaults to CURRENT_DATE.

    Returns:
        Tuple of (case_dict, error_message, status_code).
    """
    clean_num = (case_number or "").strip()
    if not clean_num:
        return None, "case_number is required.", 400
    if len(clean_num) > 50:
        return None, "case_number must be 50 characters or fewer.", 400

    clean_status = (status or "Filed").strip()
    if clean_status not in VALID_CASE_STATUSES:
        return (
            None,
            f"Invalid case status '{clean_status}'. Allowed: {sorted(VALID_CASE_STATUSES)}.",
            400,
        )

    clean_date = None
    if filing_date:
        try:
            clean_date = datetime.date.fromisoformat(str(filing_date).strip())
        except (ValueError, TypeError):
            return None, "Invalid filing_date format. Must be YYYY-MM-DD.", 400

    def _txn_op(cur: psycopg.Cursor) -> Dict[str, Any]:
        if clean_date:
            cur.execute(
                """
                INSERT INTO cases (case_number, status, filing_date)
                VALUES (%s, %s, %s)
                RETURNING case_id, case_number, status, filing_date;
                """,
                (clean_num, clean_status, clean_date),
            )
        else:
            cur.execute(
                """
                INSERT INTO cases (case_number, status)
                VALUES (%s, %s)
                RETURNING case_id, case_number, status, filing_date;
                """,
                (clean_num, clean_status),
            )
        row = cur.fetchone()
        return {
            "case_id": str(row[0]),
            "case_number": row[1],
            "status": row[2],
            "filing_date": row[3].isoformat() if hasattr(row[3], "isoformat") else str(row[3]),
        }

    try:
        created = execute_write_transaction(
            actor_username=actor_username,
            operation=_txn_op,
        )
        return created, None, 201
    except UniqueViolation:
        logger.warning("Case creation conflict: case_number '%s' already exists.", clean_num)
        return None, f"Case number '{clean_num}' already exists.", 409
    except psycopg.Error as exc:
        logger.error("Database error during case creation: %s", type(exc).__name__)
        return None, "Database operation failed. Check server logs.", 500


def update_case(
    actor_username: str,
    case_id: str,
    case_number: Optional[str] = None,
    status: Optional[str] = None,
) -> Tuple[Optional[Dict[str, Any]], Optional[str], int]:
    """
    Update an existing court case record atomically with audit logging attribution.

    Args:
        actor_username: Authenticated username performing the write.
        case_id: UUID of the case to update.
        case_number: Optional new case number.
        status: Optional new status.

    Returns:
        Tuple of (case_dict, error_message, status_code).
    """
    valid_id = validate_uuid(case_id)
    if not valid_id:
        return None, "Invalid case_id UUID.", 400

    set_clauses = []
    params: List[Any] = []

    if case_number is not None:
        clean_num = str(case_number).strip()
        if not clean_num:
            return None, "case_number cannot be empty.", 400
        if len(clean_num) > 50:
            return None, "case_number must be 50 characters or fewer.", 400
        set_clauses.append("case_number = %s")
        params.append(clean_num)

    if status is not None:
        clean_status = str(status).strip()
        if clean_status not in VALID_CASE_STATUSES:
            return (
                None,
                f"Invalid case status '{clean_status}'. Allowed: {sorted(VALID_CASE_STATUSES)}.",
                400,
            )
        set_clauses.append("status = %s")
        params.append(clean_status)

    if not set_clauses:
        return None, "At least one field (case_number or status) must be provided for update.", 400

    params.append(valid_id)
    query = f"""
        UPDATE cases
        SET {', '.join(set_clauses)}
        WHERE case_id = %s::uuid
        RETURNING case_id, case_number, status, filing_date;
    """

    def _txn_op(cur: psycopg.Cursor) -> Optional[Dict[str, Any]]:
        cur.execute(query, tuple(params))
        row = cur.fetchone()
        if not row:
            return None
        return {
            "case_id": str(row[0]),
            "case_number": row[1],
            "status": row[2],
            "filing_date": row[3].isoformat() if hasattr(row[3], "isoformat") else str(row[3]),
        }

    try:
        updated = execute_write_transaction(
            actor_username=actor_username,
            operation=_txn_op,
        )
        if not updated:
            return None, "Case not found.", 404
        return updated, None, 200
    except UniqueViolation:
        return None, "Case number already exists.", 409
    except psycopg.Error as exc:
        logger.error("Database error during case update: %s", type(exc).__name__)
        return None, "Database operation failed. Check server logs.", 500


def delete_case(actor_username: str, case_id: str) -> Tuple[bool, Optional[str], int]:
    """
    Concurrency-safe case deletion with exclusive row lock and dependency checks.

    Safety Protocol:
      1. Acquires SELECT case_id FROM cases WHERE case_id = %s FOR UPDATE.
         (Blocks concurrent child INSERTs which require FOR KEY SHARE on cases).
      2. Checks all 5 dependent tables (party_case_roles, hearings, orders, filings, dispositions).
      3. Rejects with HTTP 409 if any dependent record exists.
      4. Deletes parent case only if zero dependencies exist.
      5. Commits atomically with audit attribution via app.username.

    Args:
        actor_username: Authenticated username performing the deletion.
        case_id: UUID of the case to delete.

    Returns:
        Tuple of (success_bool, message, status_code).
    """
    valid_id = validate_uuid(case_id)
    if not valid_id:
        return False, "Invalid case_id UUID.", 400

    def _txn_op(cur: psycopg.Cursor) -> Tuple[bool, Optional[str], int]:
        # 1. Acquire exclusive row lock on the target case
        cur.execute(
            "SELECT case_id, status FROM cases WHERE case_id = %s::uuid FOR UPDATE;",
            (valid_id,),
        )
        parent_row = cur.fetchone()
        if not parent_row:
            return False, "Case not found.", 404

        # 2. Check all foreign key child relationships while holding the lock
        cur.execute(
            """
            SELECT
                (SELECT COUNT(*) FROM party_case_roles WHERE case_id = %s::uuid) AS pcr_cnt,
                (SELECT COUNT(*) FROM hearings WHERE case_id = %s::uuid) AS hearing_cnt,
                (SELECT COUNT(*) FROM orders WHERE case_id = %s::uuid) AS order_cnt,
                (SELECT COUNT(*) FROM filings WHERE case_id = %s::uuid) AS filing_cnt,
                (SELECT COUNT(*) FROM dispositions WHERE case_id = %s::uuid) AS disp_cnt;
            """,
            (valid_id, valid_id, valid_id, valid_id, valid_id),
        )
        counts = cur.fetchone()
        pcr_cnt, hearing_cnt, order_cnt, filing_cnt, disp_cnt = counts

        total_deps = pcr_cnt + hearing_cnt + order_cnt + filing_cnt + disp_cnt
        if total_deps > 0:
            return (
                False,
                "Cannot delete case: active dependencies exist (assigned parties, hearings, orders, filings, or dispositions). Cases with proceedings must be closed, not deleted.",
                409,
            )

        # 3. Safe deletion
        cur.execute("DELETE FROM cases WHERE case_id = %s::uuid;", (valid_id,))
        return True, "Case deleted successfully.", 200

    try:
        success, message, code = execute_write_transaction(
            actor_username=actor_username,
            operation=_txn_op,
        )
        return success, message, code
    except psycopg.Error as exc:
        logger.error("Database error during case deletion: %s", type(exc).__name__)
        return False, "Database operation failed. Check server logs.", 500


def add_party_to_case(
    actor_username: str,
    case_id: str,
    party_id: str,
    role_type: str,
) -> Tuple[Optional[Dict[str, Any]], Optional[str], int]:
    """
    Associate a party with a case in party_case_roles.

    Args:
        actor_username: Authenticated username performing the write.
        case_id: Case UUID.
        party_id: Party UUID.
        role_type: Validated role type ('Applicant', 'Defendant', 'Lead Counsel').

    Returns:
        Tuple of (link_dict, error_message, status_code).
    """
    valid_case = validate_uuid(case_id)
    valid_party = validate_uuid(party_id)
    if not valid_case:
        return None, "Invalid case_id UUID.", 400
    if not valid_party:
        return None, "Invalid party_id UUID.", 400

    clean_role = (role_type or "").strip()
    if clean_role not in VALID_PARTY_ROLES:
        return (
            None,
            f"Invalid role_type '{clean_role}'. Allowed: {sorted(VALID_PARTY_ROLES)}.",
            400,
        )

    def _txn_op(cur: psycopg.Cursor) -> Dict[str, Any]:
        cur.execute(
            """
            INSERT INTO party_case_roles (case_id, party_id, role_type)
            VALUES (%s::uuid, %s::uuid, %s)
            RETURNING case_id, party_id, role_type;
            """,
            (valid_case, valid_party, clean_role),
        )
        row = cur.fetchone()
        return {
            "case_id": str(row[0]),
            "party_id": str(row[1]),
            "role_type": row[2],
        }

    try:
        linked = execute_write_transaction(
            actor_username=actor_username,
            operation=_txn_op,
        )
        return linked, None, 201
    except UniqueViolation:
        return None, "Party is already associated with this case.", 409
    except ForeignKeyViolation:
        return None, "Specified case or party does not exist.", 404
    except psycopg.Error as exc:
        logger.error("Database error linking party to case: %s", type(exc).__name__)
        return None, "Database operation failed. Check server logs.", 500


def remove_party_from_case(
    actor_username: str,
    case_id: str,
    party_id: str,
) -> Tuple[bool, Optional[str], int]:
    """
    Remove a party association from party_case_roles.

    Args:
        actor_username: Authenticated username performing the write.
        case_id: Case UUID.
        party_id: Party UUID.

    Returns:
        Tuple of (success_bool, message, status_code).
    """
    valid_case = validate_uuid(case_id)
    valid_party = validate_uuid(party_id)
    if not valid_case:
        return False, "Invalid case_id UUID.", 400
    if not valid_party:
        return False, "Invalid party_id UUID.", 400

    def _txn_op(cur: psycopg.Cursor) -> int:
        cur.execute(
            """
            DELETE FROM party_case_roles
            WHERE case_id = %s::uuid AND party_id = %s::uuid;
            """,
            (valid_case, valid_party),
        )
        return cur.rowcount

    try:
        deleted_count = execute_write_transaction(
            actor_username=actor_username,
            operation=_txn_op,
        )
        if deleted_count == 0:
            return False, "Party association with this case not found.", 404
        return True, "Party successfully unlinked from case.", 200
    except psycopg.Error as exc:
        logger.error("Database error unlinking party from case: %s", type(exc).__name__)
        return False, "Database operation failed. Check server logs.", 500

