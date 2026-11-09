"""
Court Case Management System - Filings Blueprint & Routes
Exposes court filings API endpoints with role-based access control and strict field immutability.

Endpoints:
  GET /api/filings              - List filings (Admin/Clerk: all; Judge: assigned cases only)
  GET /api/filings/<filing_id>  - Filing details (Admin/Clerk: all; Judge: assigned cases only)
  POST /api/filings             - Create filing (Admin, Clerk only; Judge 403)
  PUT /api/filings/<filing_id>  - Update filing_type ONLY (Admin, Clerk only; Judge 403)
"""

import logging
from flask import g, jsonify, request

from backend.auth.decorators import require_auth, roles_required
from backend.filings import filings_bp
from backend.filings.services import (
    create_filing,
    get_filing_by_id,
    list_filings,
    update_filing,
    validate_uuid,
)

logger = logging.getLogger(__name__)


@filings_bp.route("", methods=["GET"])
@require_auth
@roles_required("admin", "clerk", "judge")
def get_filings():
    """
    List court filings with filtering and pagination.
    Admin & Clerk: Global or filtered visibility.
    Judge: Scoped strictly to cases assigned to the authenticated judge.
    """
    page = request.args.get("page", 1)
    limit = request.args.get("limit", 20)
    case_id = request.args.get("case_id")
    party_id = request.args.get("party_id")
    filing_type = request.args.get("filing_type")

    try:
        page_int = int(page)
        limit_int = int(limit)
    except (ValueError, TypeError):
        return jsonify({
            "status": "error",
            "message": "Invalid page or limit parameter. Must be integers.",
        }), 400

    filings, pagination = list_filings(
        user=g.current_user,
        case_id=case_id,
        party_id=party_id,
        filing_type=filing_type,
        page=page_int,
        limit=limit_int,
    )

    return jsonify({
        "status": "success",
        "message": "Filings retrieved successfully.",
        "data": filings,
        "pagination": pagination,
    }), 200


@filings_bp.route("/<filing_id>", methods=["GET"])
@require_auth
@roles_required("admin", "clerk", "judge")
def get_filing(filing_id: str):
    """
    Retrieve single filing details by filing_id UUID.
    Admin & Clerk: Full access.
    Judge: Permitted only if assigned to the filing's case.
    """
    filing, err_msg, status_code = get_filing_by_id(filing_id, g.current_user)
    if err_msg:
        return jsonify({
            "status": "error",
            "message": err_msg,
        }), status_code

    return jsonify({
        "status": "success",
        "message": "Filing retrieved successfully.",
        "data": filing,
    }), 200


@filings_bp.route("", methods=["POST"])
@require_auth
@roles_required("admin", "clerk")
def post_filing():
    """
    Create a new court filing.
    Restricted to Admin and Clerk roles. Judge role returns HTTP 403.
    Requires dual-source party-case validation.
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

    allowed_fields = {"case_id", "party_id", "filing_type", "filing_date"}
    disallowed_fields = set(data.keys()) - allowed_fields
    if disallowed_fields:
        return jsonify({
            "status": "error",
            "message": f"Unexpected or unsupported fields in request body: {', '.join(sorted(disallowed_fields))}.",
        }), 400

    for req_field in ["case_id", "party_id", "filing_type"]:
        val = data.get(req_field)
        if val is None or (isinstance(val, str) and not val.strip()):
            return jsonify({
                "status": "error",
                "message": f"Missing required field: '{req_field}'.",
            }), 400

    actor_username = g.current_user.get("username", "system")
    filing, err_msg, status_code = create_filing(
        actor_username=actor_username,
        case_id=data["case_id"],
        party_id=data["party_id"],
        filing_type=data["filing_type"],
        filing_date=data.get("filing_date"),
    )

    if err_msg:
        return jsonify({
            "status": "error",
            "message": err_msg,
        }), status_code

    return jsonify({
        "status": "success",
        "message": "Filing created successfully.",
        "data": filing,
    }), 201


@filings_bp.route("/<filing_id>", methods=["PUT"])
@require_auth
@roles_required("admin", "clerk")
def put_filing(filing_id: str):
    """
    Update filing_type of an existing filing.
    All other fields (case_id, party_id, filing_date, status, file_path) are immutable.
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

    # Only filing_type is mutable
    immutable_or_disallowed = set(data.keys()) - {"filing_type"}
    if immutable_or_disallowed:
        return jsonify({
            "status": "error",
            "message": f"Immutable or unsupported fields cannot be modified: {', '.join(sorted(immutable_or_disallowed))}.",
        }), 400

    if "filing_type" not in data or not isinstance(data["filing_type"], str) or not data["filing_type"].strip():
        return jsonify({
            "status": "error",
            "message": "Missing or empty 'filing_type' field.",
        }), 400

    actor_username = g.current_user.get("username", "system")
    filing, err_msg, status_code = update_filing(
        actor_username=actor_username,
        filing_id=filing_id,
        filing_type=data["filing_type"],
    )

    if err_msg:
        return jsonify({
            "status": "error",
            "message": err_msg,
        }), status_code

    return jsonify({
        "status": "success",
        "message": "Filing updated successfully.",
        "data": filing,
    }), 200

