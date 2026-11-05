"""
Court Case Management System - Dashboard Services
Provides role-specific data aggregation and query services.

Safety Rules:
  - All database queries are read-only and use parameterized SQL.
  - Queries execute exclusively against court_case_dev via backend.db helpers.
  - No sensitive information (passwords, hashes, internal errors) is ever returned.
  - Cleanly handles empty tables, missing rows, and NULL column values.
  - Implements strict role boundary enforcement and judge hearing isolation.
"""

import logging
from typing import Any, Dict, List, Optional
from psycopg.rows import dict_row

from backend.db import execute_read_query

logger = logging.getLogger(__name__)

STANDARD_CASE_STATUSES = ("Filed", "Active", "Adjourned", "Disposed", "Closed")


def _format_datetime(val: Any) -> Optional[str]:
    """Format a date or datetime object into ISO 8601 string safely."""
    if val is None:
        return None
    if hasattr(val, "isoformat"):
        return val.isoformat()
    return str(val)


def _format_uuid(val: Any) -> Optional[str]:
    """Format a UUID object into string safely."""
    if val is None:
        return None
    return str(val)


# ---------------------------------------------------------------------------
# Reusable Query Helpers (Read-Only)
# ---------------------------------------------------------------------------

def get_total_cases() -> int:
    """Return total count of cases in the system."""
    query = "SELECT COUNT(*) AS total FROM cases;"
    row = execute_read_query(query, fetch_one=True, row_factory=dict_row)
    if not row or row.get("total") is None:
        return 0
    return int(row["total"])


def get_cases_grouped_by_status() -> Dict[str, int]:
    """
    Return count of cases grouped by status.
    Ensures all standard case statuses are present in the resulting dictionary.
    """
    counts = {status: 0 for status in STANDARD_CASE_STATUSES}
    query = """
        SELECT status, COUNT(*) AS count
        FROM cases
        GROUP BY status
        ORDER BY status;
    """
    rows = execute_read_query(query, fetch_one=False, row_factory=dict_row)
    if rows:
        for row in rows:
            st = row.get("status")
            ct = row.get("count")
            if st is not None:
                counts[st] = int(ct) if ct is not None else 0
    return counts


def get_upcoming_hearings_system(limit: int = 10) -> List[Dict[str, Any]]:
    """
    Retrieve upcoming hearings across all judges with case and judge details.
    Used by Admin and Clerk operational views.
    """
    query = """
        SELECT 
            h.hearing_id,
            h.case_id,
            c.case_number,
            c.status AS case_status,
            j.name AS judge_name,
            h.start_time,
            h.end_time
        FROM hearings h
        JOIN cases c ON h.case_id = c.case_id
        JOIN judges j ON h.judge_id = j.judge_id
        WHERE h.start_time >= NOW()
        ORDER BY h.start_time ASC
        LIMIT %s;
    """
    rows = execute_read_query(query, params=(limit,), fetch_one=False, row_factory=dict_row)
    if not rows:
        return []

    return [
        {
            "hearing_id": _format_uuid(r.get("hearing_id")),
            "case_id": _format_uuid(r.get("case_id")),
            "case_number": r.get("case_number"),
            "case_status": r.get("case_status"),
            "judge_name": r.get("judge_name"),
            "start_time": _format_datetime(r.get("start_time")),
            "end_time": _format_datetime(r.get("end_time")),
        }
        for r in rows
    ]


# ---------------------------------------------------------------------------
# Admin Dashboard Services
# ---------------------------------------------------------------------------

def get_admin_dashboard_data() -> Dict[str, Any]:
    """
    Aggregate full administrative dashboard overview:
      - Total cases
      - Cases grouped by status
      - Total judges and active judges
      - Total parties
      - System-wide upcoming hearings
      - Recent audit activity

    Returns:
        dict: Admin dashboard payload.
    """
    total_cases = get_total_cases()
    cases_by_status = get_cases_grouped_by_status()

    # Judges stats: total and active count
    judges_query = """
        SELECT 
            COUNT(*) AS total_judges,
            COUNT(*) FILTER (WHERE active_status IS TRUE) AS active_judges
        FROM judges;
    """
    judges_row = execute_read_query(judges_query, fetch_one=True, row_factory=dict_row)
    judges_info = {
        "total": int(judges_row["total_judges"]) if judges_row and judges_row.get("total_judges") is not None else 0,
        "active": int(judges_row["active_judges"]) if judges_row and judges_row.get("active_judges") is not None else 0,
    }

    # Parties stats
    parties_query = "SELECT COUNT(*) AS total_parties FROM parties;"
    parties_row = execute_read_query(parties_query, fetch_one=True, row_factory=dict_row)
    total_parties = int(parties_row["total_parties"]) if parties_row and parties_row.get("total_parties") is not None else 0

    # Upcoming hearings (system-wide)
    upcoming_hearings = get_upcoming_hearings_system(limit=10)

    # Recent audit activity (admin-only)
    audit_query = """
        SELECT 
            log_id,
            case_id,
            action_type,
            changed_at,
            username
        FROM audit_logs
        ORDER BY changed_at DESC
        LIMIT 10;
    """
    audit_rows = execute_read_query(audit_query, fetch_one=False, row_factory=dict_row)
    recent_audit_activity = [
        {
            "log_id": _format_uuid(r.get("log_id")),
            "case_id": _format_uuid(r.get("case_id")),
            "action_type": r.get("action_type"),
            "changed_at": _format_datetime(r.get("changed_at")),
            "username": r.get("username"),
        }
        for r in (audit_rows or [])
    ]

    return {
        "total_cases": total_cases,
        "cases_by_status": cases_by_status,
        "judges": judges_info,
        "total_parties": total_parties,
        "upcoming_hearings": upcoming_hearings,
        "recent_audit_activity": recent_audit_activity,
    }


# ---------------------------------------------------------------------------
# Clerk Dashboard Services
# ---------------------------------------------------------------------------

def get_clerk_dashboard_data() -> Dict[str, Any]:
    """
    Aggregate operational dashboard overview for clerks:
      - Total cases
      - Cases grouped by status
      - Recent cases
      - Upcoming hearings
      - Recent filings
      - Operational summary information

    Excludes:
      - Admin user-management information (judges count, user records).
      - Unrestricted audit logs.

    Returns:
        dict: Clerk dashboard payload.
    """
    total_cases = get_total_cases()
    cases_by_status = get_cases_grouped_by_status()

    # Recent cases (latest filed / entered)
    recent_cases_query = """
        SELECT 
            case_id,
            case_number,
            status,
            filing_date
        FROM cases
        ORDER BY filing_date DESC, case_number DESC
        LIMIT 10;
    """
    recent_case_rows = execute_read_query(recent_cases_query, fetch_one=False, row_factory=dict_row)
    recent_cases = [
        {
            "case_id": _format_uuid(r.get("case_id")),
            "case_number": r.get("case_number"),
            "status": r.get("status"),
            "filing_date": _format_datetime(r.get("filing_date")),
        }
        for r in (recent_case_rows or [])
    ]

    # Upcoming hearings (system-wide operational view for scheduling)
    upcoming_hearings = get_upcoming_hearings_system(limit=10)

    # Recent filings
    filings_query = """
        SELECT 
            f.filing_id,
            f.case_id,
            c.case_number,
            f.filing_type,
            f.filing_date,
            p.name AS party_name
        FROM filings f
        JOIN cases c ON f.case_id = c.case_id
        LEFT JOIN parties p ON f.party_id = p.party_id
        ORDER BY f.filing_date DESC
        LIMIT 10;
    """
    filing_rows = execute_read_query(filings_query, fetch_one=False, row_factory=dict_row)
    recent_filings = [
        {
            "filing_id": _format_uuid(r.get("filing_id")),
            "case_id": _format_uuid(r.get("case_id")),
            "case_number": r.get("case_number"),
            "filing_type": r.get("filing_type"),
            "filing_date": _format_datetime(r.get("filing_date")),
            "party_name": r.get("party_name"),
        }
        for r in (filing_rows or [])
    ]

    # Operational summary
    operational_summary = {
        "total_cases": total_cases,
        "active_cases": cases_by_status.get("Active", 0),
        "filed_cases": cases_by_status.get("Filed", 0),
        "upcoming_hearings_count": len(upcoming_hearings),
        "recent_filings_count": len(recent_filings),
    }

    return {
        "total_cases": total_cases,
        "cases_by_status": cases_by_status,
        "recent_cases": recent_cases,
        "upcoming_hearings": upcoming_hearings,
        "recent_filings": recent_filings,
        "operational_summary": operational_summary,
    }


# ---------------------------------------------------------------------------
# Judge Dashboard Services
# ---------------------------------------------------------------------------

def get_judge_dashboard_data(judge_id: Any, limit: int = 20) -> Dict[str, Any]:
    """
    Retrieve dashboard information strictly for the authenticated judge.

    Enforces strict data isolation:
      - Only returns hearings assigned to the given judge_id.
      - Never includes other judges' hearings.
      - Read-only access with case details (case number, status, filing date).

    Args:
        judge_id: The judge's UUID (string or UUID object).
        limit: Maximum number of upcoming hearings to return (default 20).

    Returns:
        dict: Judge dashboard payload.
    """
    if not judge_id:
        return {
            "judge_id": None,
            "upcoming_hearings": [],
            "assigned_hearings_count": 0,
        }

    formatted_judge_id = _format_uuid(judge_id)

    query = """
        SELECT 
            h.hearing_id,
            h.case_id,
            c.case_number,
            c.status AS case_status,
            c.filing_date,
            h.start_time,
            h.end_time
        FROM hearings h
        JOIN cases c ON h.case_id = c.case_id
        WHERE h.judge_id = %s
          AND h.start_time >= NOW()
        ORDER BY h.start_time ASC
        LIMIT %s;
    """
    rows = execute_read_query(query, params=(formatted_judge_id, limit), fetch_one=False, row_factory=dict_row)
    upcoming_hearings = [
        {
            "hearing_id": _format_uuid(r.get("hearing_id")),
            "case_id": _format_uuid(r.get("case_id")),
            "case_number": r.get("case_number"),
            "case_status": r.get("case_status"),
            "filing_date": _format_datetime(r.get("filing_date")),
            "start_time": _format_datetime(r.get("start_time")),
            "end_time": _format_datetime(r.get("end_time")),
        }
        for r in (rows or [])
    ]

    return {
        "judge_id": formatted_judge_id,
        "upcoming_hearings": upcoming_hearings,
        "assigned_hearings_count": len(upcoming_hearings),
    }

