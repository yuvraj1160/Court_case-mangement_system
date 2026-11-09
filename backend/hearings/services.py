"""
Court Case Management System - Hearings Service Layer
Handles listing, retrieval, and scheduling of hearings with GiST exclusion conflict handling,
concurrency-safe active judge locking, and daylight saving time interval protection.
"""

from datetime import datetime, timedelta, timezone
import logging
import os
import re
from typing import Any, Dict, List, Optional, Tuple
import uuid
import zoneinfo

import psycopg
from psycopg.errors import CheckViolation, ExclusionViolation, ForeignKeyViolation
from psycopg.rows import dict_row

from backend.db import (
    DatabaseWriteError,
    StatementTimeoutError,
    UncertainCommitError,
    execute_read_query,
    execute_write_transaction,
)

logger = logging.getLogger(__name__)

NAIVE_ISO_TIMESTAMP_REGEX = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?\Z"
)


def validate_uuid(val: Any) -> Optional[str]:
    """Validate string or UUID object and return canonical lowercase string representation."""
    if not val:
        return None
    try:
        parsed = uuid.UUID(str(val).strip())
        return str(parsed)
    except (ValueError, TypeError, AttributeError):
        return None


def get_court_timezone() -> zoneinfo.ZoneInfo:
    """Return configured court ZoneInfo from Flask application config or environment, defaulting to UTC."""
    tz_name = None
    try:
        from flask import current_app, has_app_context
        if has_app_context() and current_app:
            tz_name = current_app.config.get("COURT_TIMEZONE")
    except ImportError:
        pass

    if not tz_name:
        tz_name = os.getenv("COURT_TIMEZONE") or "UTC"

    clean_tz = str(tz_name).strip()
    try:
        return zoneinfo.ZoneInfo(clean_tz)
    except (zoneinfo.ZoneInfoNotFoundError, ValueError):
        return zoneinfo.ZoneInfo("UTC")


def parse_and_validate_naive_timestamp(
    field_name: str,
    value: Any,
    court_tz: zoneinfo.ZoneInfo,
) -> Tuple[Optional[datetime], Optional[str]]:
    """
    Parse and validate a naive ISO 8601 timestamp string against format and court DST rules.

    Rejects:
      - Trailing newlines, whitespace, or invalid character patterns via regex fullmatch with \\Z.
      - Non-ISO strings or invalid calendar date/time values.
      - Timezone-aware values (Z, +HH:MM, -HH:MM, timezone names).
      - Nonexistent local times during spring-forward transitions.
      - Ambiguous local times during fall-back transitions.
    """
    if not value or not isinstance(value, str) or not NAIVE_ISO_TIMESTAMP_REGEX.fullmatch(value):
        return None, (
            f"Invalid timestamp format for '{field_name}'. "
            "Expected exact naive ISO 8601 format (YYYY-MM-DDTHH:MM:SS) without timezone offsets or trailing whitespace."
        )

    try:
        parsed_dt = datetime.fromisoformat(value)
    except ValueError:
        return None, f"Invalid calendar date or time value for '{field_name}'."

    if parsed_dt.tzinfo is not None:
        return None, (
            f"Timezone-aware timestamps are not accepted for '{field_name}'. "
            "Provide local court time in naive ISO 8601 format."
        )

    # 1. Nonexistent local time check (spring-forward gap)
    dt_aware_0 = parsed_dt.replace(tzinfo=court_tz, fold=0)
    dt_utc = dt_aware_0.astimezone(timezone.utc)
    dt_roundtrip = dt_utc.astimezone(court_tz).replace(tzinfo=None)
    if dt_roundtrip != parsed_dt:
        return None, (
            f"Invalid local time for '{field_name}': The specified time does not exist in court "
            f"timezone '{court_tz.key}' due to daylight saving time transition."
        )

    # 2. Ambiguous local time check (fall-back overlap)
    dt_fold_0 = parsed_dt.replace(tzinfo=court_tz, fold=0)
    dt_fold_1 = parsed_dt.replace(tzinfo=court_tz, fold=1)
    if dt_fold_0.utcoffset() != dt_fold_1.utcoffset():
        return None, (
            f"Ambiguous local time for '{field_name}': The specified time occurs twice in court "
            f"timezone '{court_tz.key}' due to daylight saving time transition. Schedule proceedings outside the ambiguous transition window."
        )

    return parsed_dt, None


def validate_hearing_interval(
    start_dt: datetime,
    end_dt: datetime,
    court_tz: zoneinfo.ZoneInfo,
) -> Optional[str]:
    """
    Validate that the hearing interval is positive, does not exceed 24 hours,
    and does not cross any daylight saving time UTC-offset transition.
    """
    if end_dt <= start_dt:
        return "Invalid time range: end_time must be after start_time."

    naive_duration = end_dt - start_dt
    if naive_duration > timedelta(hours=24):
        return "Hearing duration exceeds maximum allowable limit of 24 hours."

    start_utc = start_dt.replace(tzinfo=court_tz, fold=0).astimezone(timezone.utc)
    end_utc = end_dt.replace(tzinfo=court_tz, fold=0).astimezone(timezone.utc)
    physical_duration = end_utc - start_utc

    start_offset = start_dt.replace(tzinfo=court_tz, fold=0).utcoffset()
    end_offset = end_dt.replace(tzinfo=court_tz, fold=0).utcoffset()

    if physical_duration != naive_duration or start_offset != end_offset:
        return (
            f"Invalid hearing interval: The requested start_time and end_time cross a daylight "
            f"saving time transition in court timezone '{court_tz.key}'. Schedule proceedings within a single offset period."
        )

    return None


def list_hearings(
    user: Dict[str, Any],
    case_id: Optional[str] = None,
    judge_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
) -> Tuple[Optional[List[Dict[str, Any]]], Optional[Dict[str, Any]], Optional[str]]:
    """
    List hearings with pagination, filtering, and fail-closed judge scoping.
    """
    page = max(1, int(page))
    limit = max(1, min(100, int(limit)))
    offset = (page - 1) * limit

    role = (user.get("role") or "").strip().lower()
    is_judge = (role == "judge")
    authenticated_judge_id = validate_uuid(user.get("judge_id")) if is_judge else None

    # Fail-closed for judge accounts without valid judge_id
    if is_judge and not authenticated_judge_id:
        logger.warning("Judge user %s requested hearings with missing judge_id.", user.get("user_id"))
        return [], {"page": page, "limit": limit, "total_records": 0, "total_pages": 0}, None

    where_clauses: List[str] = []
    params: List[Any] = []

    # 1. Judge authorization scoping: strictly bind to authenticated judge_id
    if is_judge:
        where_clauses.append("h.judge_id = %s::uuid")
        params.append(authenticated_judge_id)

    # 2. Client-supplied judge_id filter
    if judge_id:
        clean_judge = validate_uuid(judge_id)
        if clean_judge:
            where_clauses.append("h.judge_id = %s::uuid")
            params.append(clean_judge)
        else:
            return [], {"page": page, "limit": limit, "total_records": 0, "total_pages": 0}, None

    # 3. Case ID filter
    if case_id:
        clean_case = validate_uuid(case_id)
        if clean_case:
            where_clauses.append("h.case_id = %s::uuid")
            params.append(clean_case)
        else:
            return [], {"page": page, "limit": limit, "total_records": 0, "total_pages": 0}, None

    # 4. Date range filters
    court_tz = get_court_timezone()
    parsed_start = None
    parsed_end = None
    if start_date:
        parsed_start, err = parse_and_validate_naive_timestamp("start_date", start_date, court_tz)
        if err:
            return None, None, err
        where_clauses.append("h.start_time >= %s")
        params.append(parsed_start)

    if end_date:
        parsed_end, err = parse_and_validate_naive_timestamp("end_date", end_date, court_tz)
        if err:
            return None, None, err
        where_clauses.append("h.end_time <= %s")
        params.append(parsed_end)

    if parsed_start and parsed_end and parsed_end < parsed_start:
        return None, None, "Invalid date range: end_date cannot be earlier than start_date."

    where_str = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

    query = f"""
        SELECT 
            h.hearing_id,
            h.case_id,
            c.case_number,
            h.judge_id,
            j.name AS judge_name,
            h.start_time,
            h.end_time,
            COUNT(*) OVER() AS total_count
        FROM hearings h
        JOIN cases c ON h.case_id = c.case_id
        JOIN judges j ON h.judge_id = j.judge_id
        {where_str}
        ORDER BY h.start_time ASC, h.hearing_id ASC
        LIMIT %s OFFSET %s;
    """
    query_params = list(params) + [limit, offset]

    rows = execute_read_query(query, params=query_params, fetch_one=False, row_factory=dict_row) or []
    total_records = rows[0]["total_count"] if rows else 0
    total_pages = (total_records + limit - 1) // limit if limit > 0 else 0

    results = []
    for r in rows:
        results.append({
            "hearing_id": str(r["hearing_id"]),
            "case_id": str(r["case_id"]),
            "case_number": r["case_number"],
            "judge_id": str(r["judge_id"]),
            "judge_name": r["judge_name"],
            "start_time": r["start_time"].isoformat() if isinstance(r["start_time"], datetime) else str(r["start_time"]),
            "end_time": r["end_time"].isoformat() if isinstance(r["end_time"], datetime) else str(r["end_time"]),
        })

    pagination = {
        "page": page,
        "limit": limit,
        "total_records": total_records,
        "total_pages": total_pages,
    }
    return results, pagination, None


def get_hearing_by_id(
    hearing_id: str,
    user: Dict[str, Any],
) -> Tuple[Optional[Dict[str, Any]], Optional[str], int]:
    """
    Retrieve hearing detail by ID with strict judge assignment verification.
    """
    valid_id = validate_uuid(hearing_id)
    if not valid_id:
        return None, "Invalid hearing_id UUID.", 400

    role = (user.get("role") or "").strip().lower()
    is_judge = (role == "judge")
    authenticated_judge_id = validate_uuid(user.get("judge_id")) if is_judge else None

    if is_judge and not authenticated_judge_id:
        return None, "Access forbidden: judge account is not linked to an active judge.", 403

    query = """
        SELECT 
            h.hearing_id,
            h.case_id,
            c.case_number,
            h.judge_id,
            j.name AS judge_name,
            h.start_time,
            h.end_time
        FROM hearings h
        JOIN cases c ON h.case_id = c.case_id
        JOIN judges j ON h.judge_id = j.judge_id
        WHERE h.hearing_id = %s::uuid;
    """
    row = execute_read_query(query, params=(valid_id,), fetch_one=True, row_factory=dict_row)
    if not row:
        return None, "Hearing not found.", 404

    # Enforce judge scoping parity with list
    if is_judge and str(row["judge_id"]) != str(authenticated_judge_id):
        return None, "Access forbidden: you do not have judicial assignment to this hearing.", 403

    result = {
        "hearing_id": str(row["hearing_id"]),
        "case_id": str(row["case_id"]),
        "case_number": row["case_number"],
        "judge_id": str(row["judge_id"]),
        "judge_name": row["judge_name"],
        "start_time": row["start_time"].isoformat() if isinstance(row["start_time"], datetime) else str(row["start_time"]),
        "end_time": row["end_time"].isoformat() if isinstance(row["end_time"], datetime) else str(row["end_time"]),
    }
    return result, None, 200


def create_hearing(
    actor_username: str,
    case_id: str,
    judge_id: str,
    start_time: str,
    end_time: str,
) -> Tuple[Optional[Dict[str, Any]], Optional[str], int]:
    """
    Schedule a new hearing within an atomic write transaction.
    Acquires FOR SHARE row lock on judges to guarantee active_status during concurrent writes.
    Validates interval safety against DST transitions.
    """
    valid_case = validate_uuid(case_id)
    if not valid_case:
        return None, "Invalid or missing case_id UUID.", 400

    valid_judge = validate_uuid(judge_id)
    if not valid_judge:
        return None, "Invalid or missing judge_id UUID.", 400

    court_tz = get_court_timezone()
    start_dt, err = parse_and_validate_naive_timestamp("start_time", start_time, court_tz)
    if err:
        return None, err, 400

    end_dt, err = parse_and_validate_naive_timestamp("end_time", end_time, court_tz)
    if err:
        return None, err, 400

    interval_err = validate_hearing_interval(start_dt, end_dt, court_tz)
    if interval_err:
        return None, interval_err, 400

    def operation(cur: psycopg.Cursor) -> Dict[str, Any]:
        # 1. Lock judge row with FOR SHARE to prevent concurrent deactivation
        cur.execute(
            """
            SELECT judge_id, active_status 
            FROM judges 
            WHERE judge_id = %s::uuid 
            FOR SHARE;
            """,
            (valid_judge,),
        )
        j_row = cur.fetchone()
        if not j_row:
            raise ValueError("Assigned judge does not exist.")
        if not j_row.get("active_status"):
            raise ValueError("Assigned judge is not active.")

        # 2. Lock case row with FOR SHARE to verify existence
        cur.execute(
            "SELECT case_id FROM cases WHERE case_id = %s::uuid FOR SHARE;",
            (valid_case,),
        )
        if not cur.fetchone():
            raise ValueError("Referenced case does not exist.")

        # 3. Insert hearing (subject to GiST exclusion constraint)
        cur.execute(
            """
            INSERT INTO hearings (hearing_id, case_id, judge_id, start_time, end_time)
            VALUES (gen_random_uuid(), %s::uuid, %s::uuid, %s, %s)
            RETURNING hearing_id, case_id, judge_id, start_time, end_time;
            """,
            (valid_case, valid_judge, start_dt, end_dt),
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
            "hearing_id": str(inserted["hearing_id"]),
            "case_id": str(inserted["case_id"]),
            "judge_id": str(inserted["judge_id"]),
            "start_time": inserted["start_time"].isoformat() if isinstance(inserted["start_time"], datetime) else str(inserted["start_time"]),
            "end_time": inserted["end_time"].isoformat() if isinstance(inserted["end_time"], datetime) else str(inserted["end_time"]),
        }
        return result, None, 201

    except ExclusionViolation:
        return None, "Scheduling conflict: The assigned judge already has a hearing scheduled during this time window.", 409
    except ForeignKeyViolation:
        return None, "Referenced case or judge does not exist.", 400
    except CheckViolation:
        return None, "Invalid time range: end_time must be after start_time.", 400
    except ValueError as exc:
        return None, str(exc), 400
    except StatementTimeoutError as exc:
        logger.error("StatementTimeoutError during create_hearing: %s", exc)
        return None, str(exc), 500
    except UncertainCommitError as exc:
        logger.critical("UncertainCommitError during create_hearing: %s", exc)
        return None, str(exc), 500
    except DatabaseWriteError as exc:
        logger.error("DatabaseWriteError during create_hearing: %s", exc)
        return None, str(exc), 500
    except psycopg.Error as exc:
        logger.error("psycopg.Error during create_hearing: %s", type(exc).__name__)
        return None, "An internal database error occurred.", 500
