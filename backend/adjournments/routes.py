"""
Court Case Management System - Adjournments Blueprint & Routes
Exposes adjournments API endpoints with role-based access control and append-only ledger semantics.

Endpoints:
  GET  /api/adjournments          - List adjournments (Admin/Clerk: all; Judge: assigned hearings only)
  GET  /api/adjournments/<adj_id> - Adjournment details (Admin/Clerk: all; Judge: assigned hearings only)
  POST /api/adjournments          - Record adjournment (Admin, Clerk only; Judge 403)
"""

import logging
from flask import g, jsonify, request

from backend.adjournments import adjournments_bp
from backend.adjournments.services import (
    create_adjournment,
    get_adjournment_by_id,
    list_adjournments,
    validate_uuid,
)
from backend.auth.decorators import require_auth, roles_required

logger = logging.getLogger(__name__)


@adjournments_bp.route("", methods=["GET"])
@require_auth
@roles_required("admin", "clerk", "judge")
def get_adjournments():
    """
    List hearing adjournments with filtering and pagination.
    Admin & Clerk: Global or filtered visibility.
    Judge: Scoped strictly to adjournments whose parent hearing belongs to the authenticated judge.
    """
    page = request.args.get("page", 1)
    limit = request.args.get("limit", 20)
    hearing_id = request.args.get("hearing_id")

    try:
        page_int = int(page)
        limit_int = int(limit)
    except (ValueError, TypeError):
        return jsonify({
            "status": "error",
            "message": "Invalid page or limit parameter. Must be integers.",
        }), 400

    adjournments, pagination = list_adjournments(
        user=g.current_user,
        hearing_id=hearing_id,
        page=page_int,
        limit=limit_int,
    )

    return jsonify({
        "status": "success",
        "message": "Adjournments retrieved successfully.",
        "data": adjournments,
        "pagination": pagination,
    }), 200


@adjournments_bp.route("/<adj_id>", methods=["GET"])
@require_auth
@roles_required("admin", "clerk", "judge")
def get_adjournment(adj_id: str):
    """
    Retrieve single adjournment details by adj_id UUID.
    Admin & Clerk: Full access.
    Judge: Permitted only if assigned to the parent hearing.
    """
    adjournment, err_msg, status_code = get_adjournment_by_id(adj_id, g.current_user)
    if err_msg:
        return jsonify({
            "status": "error",
            "message": err_msg,
        }), status_code

    return jsonify({
        "status": "success",
        "message": "Adjournment retrieved successfully.",
        "data": adjournment,
    }), 200


@adjournments_bp.route("", methods=["POST"])
@require_auth
@roles_required("admin", "clerk")
def post_adjournment():
    """
    Record an adjournment against a scheduled hearing.
    Restricted to Admin and Clerk roles. Judge role returns HTTP 403.
    Append-only: Does not mutate parent hearing or case status.
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

    allowed_fields = {"hearing_id", "reason_code"}
    disallowed_fields = set(data.keys()) - allowed_fields
    if disallowed_fields:
        return jsonify({
            "status": "error",
            "message": f"Unexpected or unsupported fields in request body: {', '.join(sorted(disallowed_fields))}.",
        }), 400

    for req_field in ["hearing_id", "reason_code"]:
        val = data.get(req_field)
        if val is None or (isinstance(val, str) and not val.strip()):
            return jsonify({
                "status": "error",
                "message": f"Missing required field: '{req_field}'.",
            }), 400

    actor_username = g.current_user.get("username", "system")
    adjournment, err_msg, status_code = create_adjournment(
        actor_username=actor_username,
        hearing_id=data["hearing_id"],
        reason_code=data["reason_code"],
    )

    if err_msg:
        return jsonify({
            "status": "error",
            "message": err_msg,
        }), status_code

    return jsonify({
        "status": "success",
        "message": "Adjournment recorded successfully.",
        "data": adjournment,
    }), 201

