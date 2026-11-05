"""
Court Case Management System - Dashboard Blueprint & Endpoints
Exposes role-based dashboard endpoints with live database authorization.

Endpoints:
  GET /api/dashboard - Returns role-tailored dashboard data for the authenticated user.

Safety Rules:
  - Role and identity are resolved strictly from the authenticated server-side session.
  - Client-supplied role, user_id, or judge_id parameters/payloads are completely ignored.
  - Revalidates user existence and active status in real-time via get_user_by_id().
  - Inactive judges and deactivated user accounts are immediately rejected with 403.
  - Unauthenticated requests receive HTTP 401.
  - Database queries are read-only; no sensitive credentials or hashes are exposed.
"""

import logging
from flask import Blueprint, jsonify, request
import psycopg

from backend.auth.services import get_user_by_id
from backend.auth.session_manager import (
    get_current_session_user,
    terminate_user_session,
)
from backend.dashboard.services import (
    get_admin_dashboard_data,
    get_clerk_dashboard_data,
    get_judge_dashboard_data,
)

logger = logging.getLogger(__name__)

dashboard_bp = Blueprint("dashboard", __name__)


@dashboard_bp.route("/dashboard", methods=["GET"])
def get_dashboard():
    """
    Authenticated role-based dashboard endpoint.

    Dispatches dashboard data based on the authenticated user's role:
      - Admin: Full system overview, statistics, system-wide upcoming hearings, audit logs.
      - Clerk: Operational metrics, recent cases, system upcoming hearings, filings.
      - Judge: Strictly isolated upcoming hearings and case details for the assigned judge.

    Responses:
      200: Successfully returned role-specific dashboard data.
      401: Unauthenticated request (missing or invalid session).
      403: Forbidden (inactive account, deactivated judge, or unauthorized role).
      500: Internal server or database error.
    """
    # 1. Verify authenticated session presence
    session_user = get_current_session_user()
    if not session_user or not session_user.get("user_id"):
        return jsonify({
            "status": "error",
            "message": "Authentication required.",
        }), 401

    # 2. Live database revalidation of user identity and active status
    try:
        live_user = get_user_by_id(session_user["user_id"])
        if not live_user:
            logger.warning(
                "Access rejected: user_id %s in session is not found or account is deactivated.",
                session_user.get("user_id"),
            )
            terminate_user_session()
            return jsonify({
                "status": "error",
                "message": "Access forbidden: user account is inactive or unauthorized.",
            }), 403

        # 3. Resolve role strictly from live database record
        role = live_user.get("role")

        # 4. Role-based payload dispatch
        if role == "admin":
            dashboard_data = get_admin_dashboard_data()
            return jsonify({
                "status": "success",
                "role": "admin",
                "data": dashboard_data,
            }), 200

        elif role == "clerk":
            dashboard_data = get_clerk_dashboard_data()
            return jsonify({
                "status": "success",
                "role": "clerk",
                "data": dashboard_data,
            }), 200

        elif role == "judge":
            # For judges, resolve judge_id from verified database record
            judge_id = live_user.get("judge_id")
            if not judge_id:
                logger.warning(
                    "Judge access rejected: user_id %s has role 'judge' but no linked judge_id.",
                    live_user.get("user_id"),
                )
                return jsonify({
                    "status": "error",
                    "message": "Access forbidden: judge account is not linked to an active judge.",
                }), 403

            dashboard_data = get_judge_dashboard_data(judge_id)
            return jsonify({
                "status": "success",
                "role": "judge",
                "data": dashboard_data,
            }), 200

        else:
            logger.warning(
                "Access forbidden: unrecognized or unauthorized role '%s' for user_id %s.",
                role,
                live_user.get("user_id"),
            )
            return jsonify({
                "status": "error",
                "message": "Access forbidden: role not authorized for dashboard.",
            }), 403

    except psycopg.Error:
        logger.error("Dashboard database query failed.")
        return jsonify({
            "status": "error",
            "message": "Dashboard service unavailable. Check server logs.",
        }), 500

