"""
Court Case Management System - Security & Authorization Infrastructure
Provides reusable authentication, role-based authorization, and judge case-isolation decorators.

Safety Rules:
  - Revalidates user against database on every protected request to prevent stale authorization.
  - Rejects deactivated, deleted, or unlinked judge accounts immediately with HTTP 403.
  - Rejects unauthenticated requests immediately with HTTP 401.
  - Restricts judges strictly to read-only access on their assigned cases and hearings.
  - Judges are prohibited from creating or modifying cases, parties, filings, hearings,
    orders, dispositions, or users.
  - Normalizes and verifies roles in a case-insensitive manner.
  - Validates UUIDs strictly prior to database query execution to prevent formatting exceptions.
  - Never prints, logs, or returns sensitive data or internal database errors.
"""

from functools import wraps
import logging
from typing import Any, Callable, Dict, Optional, Tuple, Union
import uuid
from flask import g, jsonify, request
import psycopg
from psycopg.rows import dict_row

from backend.auth.services import get_user_by_id
from backend.auth.session_manager import (
    get_current_session_user,
    terminate_user_session,
)
from backend.db import execute_read_query

logger = logging.getLogger(__name__)


def _authenticate_and_revalidate() -> Tuple[Optional[Dict[str, Any]], Optional[Tuple[Any, int]]]:
    """
    Authenticate active session and perform live database revalidation.

    Populates `g.current_user` if valid.

    Returns:
        Tuple of (user_dict, None) on success, or (None, (error_response, status_code)).
    """
    if getattr(g, "current_user", None) is not None:
        return g.current_user, None

    session_user = get_current_session_user()
    if not session_user or not session_user.get("user_id"):
        return None, (
            jsonify({
                "status": "error",
                "message": "Authentication required.",
            }),
            401,
        )

    try:
        live_user = get_user_by_id(session_user["user_id"])
    except psycopg.Error as exc:
        logger.error("Database error during session revalidation: %s", type(exc).__name__)
        return None, (
            jsonify({
                "status": "error",
                "message": "Authentication service unavailable. Check server logs.",
            }),
            500,
        )

    if not live_user:
        terminate_user_session()
        logger.warning(
            "Access rejected: user_id %s in session is not found or account is deactivated.",
            session_user.get("user_id"),
        )
        return None, (
            jsonify({
                "status": "error",
                "message": "Access forbidden: user account is inactive or unauthorized.",
            }),
            403,
        )

    # Validate judge-linked profile
    if live_user.get("role") == "judge" and not live_user.get("judge_id"):
        terminate_user_session()
        logger.warning(
            "Access rejected: judge user_id %s has no active linked judge record.",
            live_user.get("user_id"),
        )
        return None, (
            jsonify({
                "status": "error",
                "message": "Access forbidden: judge account is not linked to an active judge.",
            }),
            403,
        )

    g.current_user = live_user
    return g.current_user, None


def require_auth(f: Callable[..., Any]) -> Callable[..., Any]:
    """
    Decorator to enforce authentication and live database revalidation on protected endpoints.

    Revalidates user account status against the live database on every request.
    Rejects inactive or deleted accounts and terminates stale sessions.
    Attaches the authenticated user record to `flask.g.current_user`.
    """
    @wraps(f)
    def decorated_function(*args: Any, **kwargs: Any) -> Any:
        user, err_response = _authenticate_and_revalidate()
        if err_response:
            response, status = err_response
            return response, status
        return f(*args, **kwargs)

    return decorated_function


def roles_required(*allowed_roles: str) -> Callable[..., Any]:
    """
    Decorator enforcing role-based access control.

    Requires valid authentication and live revalidation.
    Ensures that the authenticated user's role is included in allowed_roles.
    Role matching is case-insensitive.
    """
    normalized_allowed = {
        r.strip().lower() for r in allowed_roles if isinstance(r, str) and r.strip()
    }

    def decorator(f: Callable[..., Any]) -> Callable[..., Any]:
        @wraps(f)
        def decorated_function(*args: Any, **kwargs: Any) -> Any:
            user, err_response = _authenticate_and_revalidate()
            if err_response:
                response, status = err_response
                return response, status

            user_role = (user.get("role") or "").strip().lower()
            if user_role not in normalized_allowed:
                logger.warning(
                    "Role authorization rejected for user_id %s (role: '%s', required: %s).",
                    user.get("user_id"),
                    user_role,
                    normalized_allowed,
                )
                return (
                    jsonify({
                        "status": "error",
                        "message": "Access forbidden: insufficient permissions.",
                    }),
                    403,
                )

            return f(*args, **kwargs)

        return decorated_function

    return decorator


def is_case_assigned_to_judge(judge_id: Any, case_id: Any) -> bool:
    """
    Verify whether a case is assigned to a judge via scheduled hearings or judicial orders.

    Validates UUID formatting prior to database query execution to prevent errors.
    Executes a read-only parameterized query against court_case_dev.

    Args:
        judge_id: The judge's UUID (string or UUID object).
        case_id: The case's UUID (string or UUID object).

    Returns:
        bool: True if assigned, False otherwise.
    """
    if not judge_id or not case_id:
        return False

    str_judge = str(judge_id).strip()
    str_case = str(case_id).strip()

    try:
        uuid.UUID(str_judge)
        uuid.UUID(str_case)
    except (ValueError, TypeError, AttributeError):
        return False

    query = """
        SELECT EXISTS (
            SELECT 1 FROM hearings WHERE case_id = %s::uuid AND judge_id = %s::uuid
            UNION ALL
            SELECT 1 FROM orders WHERE case_id = %s::uuid AND judge_id = %s::uuid
        ) AS assigned;
    """
    try:
        row = execute_read_query(
            query,
            params=(str_case, str_judge, str_case, str_judge),
            fetch_one=True,
            row_factory=dict_row,
        )
        return bool(row and row.get("assigned"))
    except psycopg.Error as exc:
        logger.error(
            "Database query failed in is_case_assigned_to_judge (%s).",
            type(exc).__name__,
        )
        return False


def verify_judge_case_access(user: Optional[Dict[str, Any]], case_id: Any) -> bool:
    """
    Determine if a user is authorized to view details of a specific case.

    Rules:
      - Admin and Clerk: Full access to any valid case in the system.
      - Judge: Read-only access strictly limited to cases assigned to their judge_id.
      - Inactive / Unauthenticated / Unknown role: False.

    Args:
        user: Authenticated user dictionary containing 'role' and optional 'judge_id'.
        case_id: The case UUID to verify.

    Returns:
        bool: True if access is permitted, False otherwise.
    """
    if not user or not isinstance(user, dict):
        return False

    role = (user.get("role") or "").strip().lower()
    if role in ("admin", "clerk"):
        return True

    if role == "judge":
        judge_id = user.get("judge_id")
        if not judge_id:
            return False
        return is_case_assigned_to_judge(judge_id, case_id)

    return False


def require_case_access(case_id_param: str = "case_id") -> Callable[..., Any]:
    """
    Decorator ensuring the authenticated caller is authorized to access the requested case.

    Extracts the case_id according to strict precedence:
      1. Route kwargs
      2. request.view_args
      3. JSON payload (if request.is_json)
      4. Query parameters (request.args)

    Safety Rules:
      - If multiple sources provide case_id with conflicting values, the request is rejected
        immediately with HTTP 400 Bad Request.
      - Upon successful authorization, attaches the verified identifier to flask.g as `g.case_id`.
      - Admin and Clerk have system-wide access to all cases.
      - Judges are strictly isolated to cases assigned to them via hearings or orders.
    """
    def decorator(f: Callable[..., Any]) -> Callable[..., Any]:
        @wraps(f)
        def decorated_function(*args: Any, **kwargs: Any) -> Any:
            user, err_response = _authenticate_and_revalidate()
            if err_response:
                response, status = err_response
                return response, status

            raw_candidates = []

            # 1. Route kwargs
            if kwargs.get(case_id_param) is not None:
                raw_candidates.append(("kwargs", str(kwargs.get(case_id_param)).strip()))

            # 2. View args
            if request.view_args and request.view_args.get(case_id_param) is not None:
                raw_candidates.append(("view_args", str(request.view_args.get(case_id_param)).strip()))

            # 3. JSON payload
            if request.is_json:
                json_body = request.get_json(silent=True)
                if isinstance(json_body, dict) and json_body.get(case_id_param) is not None:
                    raw_candidates.append(("json", str(json_body.get(case_id_param)).strip()))

            # 4. Query parameters
            if request.args and case_id_param in request.args:
                query_vals = request.args.getlist(case_id_param)
                if len(query_vals) > 1:
                    logger.warning(
                        "Duplicate query parameters supplied for parameter '%s': %s.",
                        case_id_param,
                        query_vals,
                    )
                    return (
                        jsonify({
                            "status": "error",
                            "message": f"Duplicate query parameters provided for parameter: {case_id_param}.",
                        }),
                        400,
                    )
                for val in query_vals:
                    raw_candidates.append(("query", str(val).strip()))

            non_empty_candidates = [item for item in raw_candidates if item[1]]
            if not non_empty_candidates:
                return (
                    jsonify({
                        "status": "error",
                        "message": f"Missing required parameter: {case_id_param}.",
                    }),
                    400,
                )

            # Detect conflicting values across all provided parameter sources
            unique_values = {val.lower() for _, val in raw_candidates}
            if len(unique_values) > 1:
                logger.warning(
                    "Conflicting values supplied for parameter '%s' across request sources: %s.",
                    case_id_param,
                    raw_candidates,
                )
                return (
                    jsonify({
                        "status": "error",
                        "message": f"Conflicting values provided for parameter: {case_id_param}.",
                    }),
                    400,
                )

            case_id = non_empty_candidates[0][1]

            if not verify_judge_case_access(user, case_id):
                logger.warning(
                    "Case access denied for user_id %s (role: %s) to case %s.",
                    user.get("user_id"),
                    user.get("role"),
                    case_id,
                )
                return (
                    jsonify({
                        "status": "error",
                        "message": "Access forbidden: you are not authorized to access this case.",
                    }),
                    403,
                )

            # Attach verified case ID to request context for downstream handlers
            g.case_id = case_id
            return f(*args, **kwargs)

        return decorated_function

    return decorator

