"""
Court Case Management System - Cases Blueprint & Endpoints
Exposes case management APIs with role-based access control and live database authorization.

Endpoints:
  GET    /api/cases                     - List cases (Admin/Clerk: all; Judge: assigned only)
  GET    /api/cases/<case_id>           - Case details with parties, hearings, orders, filings
  POST   /api/cases                     - Create new case (Admin, Clerk)
  PUT    /api/cases/<case_id>           - Update case details (Admin, Clerk)
  DELETE /api/cases/<case_id>           - Concurrency-safe delete case (Admin only)
  POST   /api/cases/<case_id>/parties   - Link party to case (Admin, Clerk)
  DELETE /api/cases/<case_id>/parties/<party_id> - Unlink party from case (Admin, Clerk)
"""

import logging
from flask import Blueprint, g, jsonify, request

from backend.auth.decorators import (
    require_auth,
    require_case_access,
    roles_required,
)
from backend.cases.services import (
    add_party_to_case,
    create_case,
    delete_case,
    get_case_by_id,
    list_cases,
    remove_party_from_case,
    update_case,
    validate_uuid,
)

logger = logging.getLogger(__name__)

cases_bp = Blueprint("cases", __name__)


@cases_bp.route("", methods=["GET"])
@require_auth
def get_cases():
    """
    List court cases with role-based scoping and pagination.
    Admin & Clerk: Full system access.
    Judge: Scoped strictly to cases assigned via hearings or orders.
    """
    page = request.args.get("page", 1)
    limit = request.args.get("limit", 20)
    search = request.args.get("search")
    status = request.args.get("status")
    sort_by = request.args.get("sort", "filing_date")
    sort_order = request.args.get("order", "desc")

    try:
        page_int = int(page)
        limit_int = int(limit)
    except (ValueError, TypeError):
        return jsonify({
            "status": "error",
            "message": "Invalid page or limit parameter. Must be integers.",
        }), 400

    cases, pagination = list_cases(
        user=g.current_user,
        page=page_int,
        limit=limit_int,
        search=search,
        status=status,
        sort_by=sort_by,
        sort_order=sort_order,
    )

    return jsonify({
        "status": "success",
        "data": {
            "cases": cases,
            "pagination": pagination,
        },
    }), 200


@cases_bp.route("/<case_id>", methods=["GET"])
@require_case_access()
def get_case(case_id: str):
    """
    Retrieve full details for a single case.
    Protected by @require_case_access:
      - Admin & Clerk: Any valid case.
      - Judge: Only cases assigned to their judge_id via hearings or orders.
    """
    verified_id = getattr(g, "case_id", case_id)
    if not validate_uuid(verified_id):
        return jsonify({
            "status": "error",
            "message": "Invalid case_id UUID.",
        }), 400

    case_data = get_case_by_id(verified_id, user=g.current_user)
    if not case_data:
        return jsonify({
            "status": "error",
            "message": "Case not found.",
        }), 404

    return jsonify({
        "status": "success",
        "data": case_data,
    }), 200


@cases_bp.route("", methods=["POST"])
@roles_required("admin", "clerk")
def create_new_case():
    """
    Register a new court case record.
    Authorized for Admin and Clerk.
    """
    if not request.is_json:
        return jsonify({
            "status": "error",
            "message": "Request payload must be JSON.",
        }), 400

    body = request.get_json(silent=True) or {}
    case_number = body.get("case_number")
    status = body.get("status", "Filed")
    filing_date = body.get("filing_date")

    created, err_msg, code = create_case(
        actor_username=g.current_user["username"],
        case_number=case_number,
        status=status,
        filing_date=filing_date,
    )

    if err_msg:
        return jsonify({
            "status": "error",
            "message": err_msg,
        }), code

    return jsonify({
        "status": "success",
        "message": "Case created successfully.",
        "data": created,
    }), 201


@cases_bp.route("/<case_id>", methods=["PUT"])
@roles_required("admin", "clerk")
@require_case_access()
def update_existing_case(case_id: str):
    """
    Update an existing court case record.
    Authorized for Admin and Clerk.
    """
    if not request.is_json:
        return jsonify({
            "status": "error",
            "message": "Request payload must be JSON.",
        }), 400

    verified_id = getattr(g, "case_id", case_id)
    body = request.get_json(silent=True) or {}
    case_number = body.get("case_number")
    status = body.get("status")

    updated, err_msg, code = update_case(
        actor_username=g.current_user["username"],
        case_id=verified_id,
        case_number=case_number,
        status=status,
    )

    if err_msg:
        return jsonify({
            "status": "error",
            "message": err_msg,
        }), code

    return jsonify({
        "status": "success",
        "message": "Case updated successfully.",
        "data": updated,
    }), 200


@cases_bp.route("/<case_id>", methods=["DELETE"])
@roles_required("admin")
def delete_existing_case(case_id: str):
    """
    Concurrency-safe hard deletion of a court case record.
    Restricted strictly to Admin.
    Rejects deletion with HTTP 409 if proceedings or dependent records exist.
    """
    success, message, code = delete_case(
        actor_username=g.current_user["username"],
        case_id=case_id,
    )

    if not success:
        return jsonify({
            "status": "error",
            "message": message,
        }), code

    return jsonify({
        "status": "success",
        "message": message,
    }), code


@cases_bp.route("/<case_id>/parties", methods=["POST"])
@roles_required("admin", "clerk")
@require_case_access()
def link_party_to_case_route(case_id: str):
    """
    Associate a party with a case under a specific verified role.
    Authorized for Admin and Clerk.
    """
    if not request.is_json:
        return jsonify({
            "status": "error",
            "message": "Request payload must be JSON.",
        }), 400

    verified_case_id = getattr(g, "case_id", case_id)
    body = request.get_json(silent=True) or {}
    party_id = body.get("party_id")
    role_type = body.get("role_type")

    linked, err_msg, code = add_party_to_case(
        actor_username=g.current_user["username"],
        case_id=verified_case_id,
        party_id=party_id,
        role_type=role_type,
    )

    if err_msg:
        return jsonify({
            "status": "error",
            "message": err_msg,
        }), code

    return jsonify({
        "status": "success",
        "message": "Party successfully linked to case.",
        "data": linked,
    }), 201


@cases_bp.route("/<case_id>/parties/<party_id>", methods=["DELETE"])
@roles_required("admin", "clerk")
@require_case_access()
def unlink_party_from_case_route(case_id: str, party_id: str):
    """
    Remove a party's association from a case.
    Authorized for Admin and Clerk.
    """
    verified_case_id = getattr(g, "case_id", case_id)
    success, message, code = remove_party_from_case(
        actor_username=g.current_user["username"],
        case_id=verified_case_id,
        party_id=party_id,
    )

    if not success:
        return jsonify({
            "status": "error",
            "message": message,
        }), code

    return jsonify({
        "status": "success",
        "message": message,
    }), code
