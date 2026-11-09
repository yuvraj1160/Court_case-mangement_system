"""
Court Case Management System - Hearings Blueprint & Routes
Exposes hearings API endpoints with role-based access control and strict scheduling validation.

Endpoints:
  GET  /api/hearings              - List hearings (Admin/Clerk: all/filtered; Judge: assigned only)
  GET  /api/hearings/<hearing_id> - Hearing details (Admin/Clerk: all; Judge: assigned only)
  POST /api/hearings              - Schedule new hearing (Admin, Clerk only; Judge 403)
"""

import logging
from flask import g, jsonify, request

from backend.auth.decorators import require_auth, roles_required
from backend.hearings import hearings_bp
from backend.hearings.services import (
    create_hearing,
    get_hearing_by_id,
    list_hearings,
    validate_uuid,
)

logger = logging.getLogger(__name__)


@hearings_bp.route("", methods=["GET"])
@require_auth
@roles_required("admin", "clerk", "judge")
def get_hearings():
    """
    List scheduled hearings with filtering and pagination.
    Admin & Clerk: Global or filtered visibility.
    Judge: Scoped strictly to hearings where judge_id matches authenticated judge profile.
    """
    page = request.args.get("page", 1)
    limit = request.args.get("limit", 20)
    case_id = request.args.get("case_id")
    judge_id = request.args.get("judge_id")
    start_date = request.args.get("start_date")
    end_date = request.args.get("end_date")

    try:
        page_int = int(page)
        limit_int = int(limit)
    except (ValueError, TypeError):
        return jsonify({
            "status": "error",
            "message": "Invalid page or limit parameter. Must be integers.",
        }), 400

    hearings, pagination, err_msg = list_hearings(
        user=g.current_user,
        case_id=case_id,
        judge_id=judge_id,
        start_date=start_date,
        end_date=end_date,
        page=page_int,
        limit=limit_int,
    )

    if err_msg:
        return jsonify({
            "status": "error",
            "message": err_msg,
        }), 400

    return jsonify({
        "status": "success",
        "message": "Hearings retrieved successfully.",
        "data": hearings,
        "pagination": pagination,
    }), 200


@hearings_bp.route("/<hearing_id>", methods=["GET"])
@require_auth
@roles_required("admin", "clerk", "judge")
def get_hearing(hearing_id: str):
    """
    Retrieve single hearing details by hearing_id UUID.
    Admin & Clerk: Full access.
    Judge: Access permitted only if assigned to this hearing.
    """
    hearing, err_msg, status_code = get_hearing_by_id(hearing_id, g.current_user)
    if err_msg:
        return jsonify({
            "status": "error",
            "message": err_msg,
        }), status_code

    return jsonify({
        "status": "success",
        "message": "Hearing retrieved successfully.",
        "data": hearing,
    }), 200


@hearings_bp.route("", methods=["POST"])
@require_auth
@roles_required("admin", "clerk")
def post_hearing():
    """
    Schedule a new court hearing.
    Restricted to Admin and Clerk roles. Judge role returns HTTP 403.
    """
    if not request.is_json:
        return jsonify({
            "status": "error",
            "message": "Request body must be valid JSON.",
        }), 400

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({
            "status": "error",
            "message": "Request body must be a JSON object.",
        }), 400

    allowed_fields = {"case_id", "judge_id", "start_time", "end_time"}
    unknown_fields = set(data.keys()) - allowed_fields
    if unknown_fields:
        return jsonify({
            "status": "error",
            "message": f"Unexpected fields in request body: {', '.join(sorted(unknown_fields))}.",
        }), 400

    for req_field in ["case_id", "judge_id", "start_time", "end_time"]:
        val = data.get(req_field)
        if val is None or (isinstance(val, str) and not val.strip()):
            return jsonify({
                "status": "error",
                "message": f"Missing required field: '{req_field}'.",
            }), 400

    actor_username = g.current_user.get("username", "system")
    hearing, err_msg, status_code = create_hearing(
        actor_username=actor_username,
        case_id=data["case_id"],
        judge_id=data["judge_id"],
        start_time=data["start_time"],
        end_time=data["end_time"],
    )

    if err_msg:
        return jsonify({
            "status": "error",
            "message": err_msg,
        }), status_code

    return jsonify({
        "status": "success",
        "message": "Hearing scheduled successfully.",
        "data": hearing,
    }), 201

