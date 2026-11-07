"""
Court Case Management System - Parties Service Layer
Handles party listing, retrieval, creation, modification, concurrency-safe deletion,
phone number management, and judge assignment scoping.

Safety Rules:
  - Database queries use strict parameterization (%s placeholders).
  - All write operations execute through execute_write_transaction with actor attribution.
  - Deletion acquires a row-level lock (FOR UPDATE) and checks dependencies atomically.
  - Judge listings and detail views are strictly scoped to assigned cases via roles or filings.
  - 'Filer' is a derived display label only for filing-only cases; never stored in party_case_roles.
"""

import logging
from typing import Any, Dict, List, Optional, Tuple
import uuid
import psycopg
from psycopg.errors import ForeignKeyViolation, UniqueViolation
from psycopg.rows import dict_row

from backend.db import execute_read_query, execute_write_transaction

logger = logging.getLogger(__name__)

# Verified database check constraint values for parties.party_type
VALID_PARTY_TYPES = frozenset({"Petitioner", "Respondent", "Lawyer"})


def validate_uuid(val: Any) -> Optional[str]:
    """Validate string or UUID object and return canonical lowercase string representation."""
    if not val:
        return None
    try:
        parsed = uuid.UUID(str(val).strip())
        return str(parsed)
    except (ValueError, TypeError, AttributeError):
        return None


def list_parties(
    user: Dict[str, Any],
    page: int = 1,
    limit: int = 20,
    search: Optional[str] = None,
    party_type: Optional[str] = None,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    List parties with role-based scoping and pagination.
    Admin & Clerk: Full system access.
    Judge: Scoped strictly to parties participating in assigned cases (via party_case_roles or filings).

    Args:
        user: Authenticated user dictionary.
        page: Page number (1-indexed).
        limit: Records per page (1..100).
        search: Optional name substring filter.
        party_type: Optional party_type filter ('Petitioner', 'Respondent', 'Lawyer').

    Returns:
        Tuple of (list_of_parties, pagination_dict).
    """
    page = max(1, int(page))
    limit = max(1, min(100, int(limit)))
    offset = (page - 1) * limit

    role = (user.get("role") or "").strip().lower()
    judge_id = user.get("judge_id") if role == "judge" else None

    where_clauses = []
    params: List[Any] = []

    # 1. Role-based judge scoping (unions party_case_roles and filings on assigned cases)
    join_clause = ""
    if role == "judge":
        if not judge_id:
            logger.warning("Judge user %s has no judge_id assigned.", user.get("user_id"))
            return [], {"page": page, "limit": limit, "total_records": 0, "total_pages": 0}

        join_clause = """
            JOIN (
                SELECT pcr.party_id, pcr.case_id
                FROM party_case_roles pcr
                WHERE pcr.case_id IN (
                    SELECT case_id FROM hearings WHERE judge_id = %s::uuid
                    UNION
                    SELECT case_id FROM orders WHERE judge_id = %s::uuid
                )
                UNION
                SELECT f.party_id, f.case_id
                FROM filings f
                WHERE f.party_id IS NOT NULL
                  AND f.case_id IN (
                    SELECT case_id FROM hearings WHERE judge_id = %s::uuid
                    UNION
                    SELECT case_id FROM orders WHERE judge_id = %s::uuid
                )
            ) scoped_cases ON p.party_id = scoped_cases.party_id
        """
        params.extend([judge_id, judge_id, judge_id, judge_id])

    # 2. Search filter (name ILIKE)
    if search and str(search).strip():
        where_clauses.append("p.name ILIKE %s")
        params.append(f"%{str(search).strip()}%")

    # 3. Party type filter
    if party_type and str(party_type).strip() in VALID_PARTY_TYPES:
        where_clauses.append("p.party_type = %s")
        params.append(str(party_type).strip())

    where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

    # Total distinct party count for pagination
    count_query = f"""
        SELECT COUNT(DISTINCT p.party_id) AS total
        FROM parties p
        {join_clause}
        {where_sql};
    """
    count_row = execute_read_query(
        count_query,
        params=tuple(params),
        fetch_one=True,
        row_factory=dict_row,
    )
    total_records = count_row["total"] if count_row else 0
    total_pages = (total_records + limit - 1) // limit if total_records > 0 else 0

    # Fetch paginated party list with phones and case count
    case_count_expr = (
        "COUNT(DISTINCT scoped_cases.case_id)"
        if role == "judge"
        else """(
            SELECT COUNT(DISTINCT c_id) FROM (
                SELECT case_id AS c_id FROM party_case_roles WHERE party_id = p.party_id
                UNION
                SELECT case_id AS c_id FROM filings WHERE party_id = p.party_id
            ) all_cases
        )"""
    )

    data_query = f"""
        SELECT 
            p.party_id,
            p.name,
            p.party_type,
            COALESCE(array_agg(DISTINCT pp.phone_number) FILTER (WHERE pp.phone_number IS NOT NULL), '{{}}') AS phone_numbers,
            {case_count_expr} AS case_count
        FROM parties p
        LEFT JOIN party_phones pp ON p.party_id = pp.party_id
        {join_clause}
        {where_sql}
        GROUP BY p.party_id, p.name, p.party_type
        ORDER BY p.name ASC
        LIMIT %s OFFSET %s;
    """
    data_params = list(params) + [limit, offset]
    rows = execute_read_query(
        data_query,
        params=tuple(data_params),
        fetch_one=False,
        row_factory=dict_row,
    )

    parties = [
        {
            "party_id": str(r["party_id"]),
            "name": r["name"],
            "party_type": r["party_type"],
            "phone_numbers": list(r["phone_numbers"]),
            "case_count": int(r["case_count"]),
        }
        for r in (rows or [])
    ]

    pagination = {
        "page": page,
        "limit": limit,
        "total_records": total_records,
        "total_pages": total_pages,
    }
    return parties, pagination


def get_party_by_id(
    party_id: str,
    user: Dict[str, Any],
) -> Tuple[Optional[Dict[str, Any]], Optional[str], int]:
    """
    Retrieve full details for a single party including associated cases.
    For Judges: Access is denied (403) unless party participates in an assigned case,
    and associated_cases returns ONLY cases assigned to the requesting judge.

    Args:
        party_id: Canonical UUID string of the party.
        user: Authenticated user dictionary.

    Returns:
        Tuple of (party_dict, error_message, status_code).
    """
    valid_id = validate_uuid(party_id)
    if not valid_id:
        return None, "Invalid party_id UUID.", 400

    # 1. Fetch party record
    party_query = "SELECT party_id, name, party_type FROM parties WHERE party_id = %s::uuid;"
    party_row = execute_read_query(
        party_query,
        params=(valid_id,),
        fetch_one=True,
        row_factory=dict_row,
    )
    if not party_row:
        return None, "Party not found.", 404

    role = (user.get("role") or "").strip().lower()
    judge_id = user.get("judge_id") if role == "judge" else None

    # 2. Judge Access Gate Check (covers both party_case_roles and filings)
    if role == "judge":
        if not judge_id:
            logger.warning("Judge user %s has no judge_id assigned.", user.get("user_id"))
            return None, "Access forbidden: judge account is not linked to an active judge.", 403

        gate_query = """
            SELECT EXISTS (
                SELECT 1 
                FROM party_case_roles pcr
                WHERE pcr.party_id = %s::uuid
                  AND pcr.case_id IN (
                      SELECT case_id FROM hearings WHERE judge_id = %s::uuid
                      UNION
                      SELECT case_id FROM orders WHERE judge_id = %s::uuid
                  )
                UNION ALL
                SELECT 1 
                FROM filings f
                WHERE f.party_id = %s::uuid
                  AND f.case_id IN (
                      SELECT case_id FROM hearings WHERE judge_id = %s::uuid
                      UNION
                      SELECT case_id FROM orders WHERE judge_id = %s::uuid
                  )
            ) AS has_access;
        """
        gate_row = execute_read_query(
            gate_query,
            params=(valid_id, judge_id, judge_id, valid_id, judge_id, judge_id),
            fetch_one=True,
            row_factory=dict_row,
        )
        if not gate_row or not gate_row.get("has_access"):
            return (
                None,
                "Access forbidden: you do not have judicial assignment to any cases involving this party.",
                403,
            )

    # 3. Fetch phone numbers
    phones_query = """
        SELECT phone_number 
        FROM party_phones 
        WHERE party_id = %s::uuid 
        ORDER BY phone_number ASC;
    """
    phone_rows = execute_read_query(
        phones_query,
        params=(valid_id,),
        fetch_one=False,
        row_factory=dict_row,
    )
    phone_numbers = [pr["phone_number"] for pr in (phone_rows or [])]

    # 4. Fetch associated cases (unifying party_case_roles and filings)
    # For Judges, strictly scoped in SQL to cases assigned to their judge_id
    cases_query = """
        WITH party_cases AS (
            SELECT 
                c.case_id,
                c.case_number,
                c.status,
                c.filing_date,
                pcr.role_type
            FROM cases c
            JOIN party_case_roles pcr ON c.case_id = pcr.case_id
            WHERE pcr.party_id = %s::uuid
            
            UNION ALL
            
            SELECT 
                c.case_id,
                c.case_number,
                c.status,
                c.filing_date,
                'Filer' AS role_type
            FROM cases c
            JOIN filings f ON c.case_id = f.case_id
            WHERE f.party_id = %s::uuid
        )
        SELECT 
            pc.case_id,
            pc.case_number,
            pc.status,
            pc.filing_date,
            string_agg(DISTINCT pc.role_type, ', ' ORDER BY pc.role_type) AS role_type
        FROM party_cases pc
        WHERE (
            %s::uuid IS NULL OR pc.case_id IN (
                SELECT case_id FROM hearings WHERE judge_id = %s::uuid
                UNION
                SELECT case_id FROM orders WHERE judge_id = %s::uuid
            )
        )
        GROUP BY pc.case_id, pc.case_number, pc.status, pc.filing_date
        ORDER BY pc.filing_date DESC;
    """
    case_rows = execute_read_query(
        cases_query,
        params=(valid_id, valid_id, judge_id, judge_id, judge_id),
        fetch_one=False,
        row_factory=dict_row,
    )
    associated_cases = [
        {
            "case_id": str(cr["case_id"]),
            "case_number": cr["case_number"],
            "status": cr["status"],
            "filing_date": cr["filing_date"].isoformat() if hasattr(cr["filing_date"], "isoformat") else str(cr["filing_date"]),
            "role_type": cr["role_type"],
        }
        for cr in (case_rows or [])
    ]

    return {
        "party_id": str(party_row["party_id"]),
        "name": party_row["name"],
        "party_type": party_row["party_type"],
        "phone_numbers": phone_numbers,
        "associated_cases": associated_cases,
    }, None, 200


def create_party(
    actor_username: str,
    name: str,
    party_type: str,
    phone_numbers: Optional[List[str]] = None,
) -> Tuple[Optional[Dict[str, Any]], Optional[str], int]:
    """
    Create a new legal party and optional initial phone numbers atomically.

    Args:
        actor_username: Authenticated username performing the write.
        name: Party name (max 255 chars).
        party_type: Must be 'Petitioner', 'Respondent', or 'Lawyer'.
        phone_numbers: Optional list of phone number strings (max 15 chars each).

    Returns:
        Tuple of (party_dict, error_message, status_code).
    """
    clean_name = (name or "").strip()
    if not clean_name:
        return None, "name is required.", 400
    if len(clean_name) > 255:
        return None, "name must be 255 characters or fewer.", 400

    clean_type = (party_type or "").strip()
    if clean_type not in VALID_PARTY_TYPES:
        return (
            None,
            f"Invalid party_type '{clean_type}'. Allowed: {sorted(VALID_PARTY_TYPES)}.",
            400,
        )

    clean_phones = []
    if phone_numbers:
        for p in phone_numbers:
            p_str = str(p).strip()
            if not p_str or len(p_str) > 15:
                return None, f"Invalid phone number '{p_str}'. Must be 1 to 15 characters.", 400
            if p_str not in clean_phones:
                clean_phones.append(p_str)

    def _txn_op(cur: psycopg.Cursor) -> Dict[str, Any]:
        cur.execute(
            """
            INSERT INTO parties (name, party_type)
            VALUES (%s, %s)
            RETURNING party_id, name, party_type;
            """,
            (clean_name, clean_type),
        )
        row = cur.fetchone()
        party_id = str(row[0])

        inserted_phones = []
        for phone in clean_phones:
            cur.execute(
                """
                INSERT INTO party_phones (party_id, phone_number)
                VALUES (%s::uuid, %s)
                RETURNING phone_number;
                """,
                (party_id, phone),
            )
            phone_row = cur.fetchone()
            inserted_phones.append(phone_row[0])

        return {
            "party_id": party_id,
            "name": row[1],
            "party_type": row[2],
            "phone_numbers": inserted_phones,
        }

    try:
        created = execute_write_transaction(
            actor_username=actor_username,
            operation=_txn_op,
        )
        return created, None, 201
    except psycopg.Error as exc:
        logger.error("Database error during party creation: %s", type(exc).__name__)
        return None, "Database operation failed. Check server logs.", 500


def update_party(
    actor_username: str,
    party_id: str,
    name: Optional[str] = None,
    party_type: Optional[str] = None,
) -> Tuple[Optional[Dict[str, Any]], Optional[str], int]:
    """
    Update an existing party record atomically with audit logging attribution.

    Args:
        actor_username: Authenticated username performing the write.
        party_id: Party UUID.
        name: Optional new name.
        party_type: Optional new party_type.

    Returns:
        Tuple of (party_dict, error_message, status_code).
    """
    valid_id = validate_uuid(party_id)
    if not valid_id:
        return None, "Invalid party_id UUID.", 400

    set_clauses = []
    params: List[Any] = []

    if name is not None:
        clean_name = str(name).strip()
        if not clean_name:
            return None, "name cannot be empty.", 400
        if len(clean_name) > 255:
            return None, "name must be 255 characters or fewer.", 400
        set_clauses.append("name = %s")
        params.append(clean_name)

    if party_type is not None:
        clean_type = str(party_type).strip()
        if clean_type not in VALID_PARTY_TYPES:
            return (
                None,
                f"Invalid party_type '{clean_type}'. Allowed: {sorted(VALID_PARTY_TYPES)}.",
                400,
            )
        set_clauses.append("party_type = %s")
        params.append(clean_type)

    if not set_clauses:
        return None, "At least one field (name or party_type) must be provided for update.", 400

    params.append(valid_id)
    query = f"""
        UPDATE parties
        SET {', '.join(set_clauses)}
        WHERE party_id = %s::uuid
        RETURNING party_id, name, party_type;
    """

    def _txn_op(cur: psycopg.Cursor) -> Optional[Dict[str, Any]]:
        cur.execute(query, tuple(params))
        row = cur.fetchone()
        if not row:
            return None
        return {
            "party_id": str(row[0]),
            "name": row[1],
            "party_type": row[2],
        }

    try:
        updated = execute_write_transaction(
            actor_username=actor_username,
            operation=_txn_op,
        )
        if not updated:
            return None, "Party not found.", 404
        return updated, None, 200
    except psycopg.Error as exc:
        logger.error("Database error during party update: %s", type(exc).__name__)
        return None, "Database operation failed. Check server logs.", 500


def delete_party(actor_username: str, party_id: str) -> Tuple[bool, Optional[str], int]:
    """
    Concurrency-safe party deletion with exclusive row lock and dependency checks.

    Safety Protocol:
      1. Acquires SELECT party_id FROM parties WHERE party_id = %s FOR UPDATE.
         (Blocks concurrent child INSERTs which require FOR KEY SHARE on parties).
      2. Checks dependent tables (party_case_roles and filings).
      3. Rejects with HTTP 409 if any dependent record exists.
      4. Deletes parent party only if zero dependencies exist (phones cascade safely).
      5. Commits atomically with audit attribution via app.username.

    Args:
        actor_username: Authenticated username performing the deletion.
        party_id: UUID of the party to delete.

    Returns:
        Tuple of (success_bool, message, status_code).
    """
    valid_id = validate_uuid(party_id)
    if not valid_id:
        return False, "Invalid party_id UUID.", 400

    def _txn_op(cur: psycopg.Cursor) -> Tuple[bool, Optional[str], int]:
        # 1. Acquire exclusive row lock on the target party
        cur.execute(
            "SELECT party_id, name FROM parties WHERE party_id = %s::uuid FOR UPDATE;",
            (valid_id,),
        )
        parent_row = cur.fetchone()
        if not parent_row:
            return False, "Party not found.", 404

        # 2. Check foreign key child relationships while holding lock
        cur.execute(
            """
            SELECT
                (SELECT COUNT(*) FROM party_case_roles WHERE party_id = %s::uuid) AS pcr_cnt,
                (SELECT COUNT(*) FROM filings WHERE party_id = %s::uuid) AS filing_cnt;
            """,
            (valid_id, valid_id),
        )
        pcr_cnt, filing_cnt = cur.fetchone()

        if pcr_cnt > 0 or filing_cnt > 0:
            return (
                False,
                "Cannot delete party: party is associated with existing case dockets or official filings.",
                409,
            )

        # 3. Safe deletion (party_phones cascade cleanly)
        cur.execute("DELETE FROM parties WHERE party_id = %s::uuid;", (valid_id,))
        return True, "Party deleted successfully.", 200

    try:
        success, message, code = execute_write_transaction(
            actor_username=actor_username,
            operation=_txn_op,
        )
        return success, message, code
    except psycopg.Error as exc:
        logger.error("Database error during party deletion: %s", type(exc).__name__)
        return False, "Database operation failed. Check server logs.", 500


def add_party_phone(
    actor_username: str,
    party_id: str,
    phone_number: str,
) -> Tuple[Optional[Dict[str, Any]], Optional[str], int]:
    """
    Add a phone number to an existing party.

    Args:
        actor_username: Authenticated username performing the write.
        party_id: Party UUID.
        phone_number: Phone number string (max 15 chars).

    Returns:
        Tuple of (phone_dict, error_message, status_code).
    """
    valid_id = validate_uuid(party_id)
    if not valid_id:
        return None, "Invalid party_id UUID.", 400

    clean_phone = (phone_number or "").strip()
    if not clean_phone:
        return None, "phone_number is required.", 400
    if len(clean_phone) > 15:
        return None, "phone_number must be 15 characters or fewer.", 400

    def _txn_op(cur: psycopg.Cursor) -> Dict[str, Any]:
        cur.execute(
            """
            INSERT INTO party_phones (party_id, phone_number)
            VALUES (%s::uuid, %s)
            RETURNING party_id, phone_number;
            """,
            (valid_id, clean_phone),
        )
        row = cur.fetchone()
        return {
            "party_id": str(row[0]),
            "phone_number": row[1],
        }

    try:
        created = execute_write_transaction(
            actor_username=actor_username,
            operation=_txn_op,
        )
        return created, None, 201
    except UniqueViolation:
        return None, "Phone number already exists for this party.", 409
    except ForeignKeyViolation:
        return None, "Party not found.", 404
    except psycopg.Error as exc:
        logger.error("Database error adding party phone: %s", type(exc).__name__)
        return None, "Database operation failed. Check server logs.", 500


def delete_party_phone(
    actor_username: str,
    party_id: str,
    phone_number: str,
) -> Tuple[bool, Optional[str], int]:
    """
    Remove a phone number from a party.

    Args:
        actor_username: Authenticated username performing the write.
        party_id: Party UUID.
        phone_number: Phone number string to delete.

    Returns:
        Tuple of (success_bool, message, status_code).
    """
    valid_id = validate_uuid(party_id)
    if not valid_id:
        return False, "Invalid party_id UUID.", 400

    clean_phone = (phone_number or "").strip()
    if not clean_phone:
        return False, "phone_number is required.", 400

    def _txn_op(cur: psycopg.Cursor) -> int:
        cur.execute(
            """
            DELETE FROM party_phones
            WHERE party_id = %s::uuid AND phone_number = %s;
            """,
            (valid_id, clean_phone),
        )
        return cur.rowcount

    try:
        deleted_count = execute_write_transaction(
            actor_username=actor_username,
            operation=_txn_op,
        )
        if deleted_count == 0:
            return False, "Phone number not found for this party.", 404
        return True, "Phone number removed successfully.", 200
    except psycopg.Error as exc:
        logger.error("Database error deleting party phone: %s", type(exc).__name__)
        return False, "Database operation failed. Check server logs.", 500

