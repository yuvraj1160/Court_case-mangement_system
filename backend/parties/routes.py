"""
Court Case Management System - Parties Blueprint & Endpoints
Exposes party management APIs with role-based access control and live database authorization.

Endpoints:
  GET    /api/parties                       - List parties (Admin/Clerk: all; Judge: assigned only)
  GET    /api/parties/<party_id>            - Party details with phones and cases (Judge: scoped)
  POST   /api/parties                       - Create new party (Admin, Clerk)
  PUT    /api/parties/<party_id>            - Update party (Admin, Clerk)
  DELETE /api/parties/<party_id>            - Concurrency-safe delete party (Admin only)
  POST   /api/parties/<party_id>/phones     - Add phone number (Admin, Clerk)
  DELETE /api/parties/<party_id>/phones/<num> - Remove phone number (Admin, Clerk)
"""

import logging
from flask import Blueprint, g, jsonify, request

from backend.auth.decorators import (
    require_auth,
    roles_required,
)
from backend.parties.services import (
    add_party_phone,
    create_party,
    delete_party,
    delete_party_phone,
    get_party_by_id,
    list_parties,
    update_party,
    validate_uuid,
)

logger = logging.getLogger(__name__)

parties_bp = Blueprint("parties", __name__)


@parties_bp.route("", methods=["GET"])
@require_auth
def get_parties():
    """
    List legal parties with role-based scoping and pagination.
    Admin & Clerk: Full system directory.
    Judge: Scoped strictly to parties participating in assigned cases via roles or filings.
    """
    page = request.args.get("page", 1)
    limit = request.args.get("limit", 20)
    search = request.args.get("search")
    party_type = request.args.get("party_type")

    try:
        page_int = int(page)
        limit_int = int(limit)
    except (ValueError, TypeError):
        return jsonify({
            "status": "error",
            "message": "Invalid page or limit parameter. Must be integers.",
        }), 400

    parties, pagination = list_parties(
        user=g.current_user,
        page=page_int,
        limit=limit_int,
        search=search,
        party_type=party_type,
    )

    return jsonify({
        "status": "success",
        "data": {
            "parties": parties,
            "pagination": pagination,
        },
    }), 200


@parties_bp.route("/<party_id>", methods=["GET"])
@require_auth
def get_party(party_id: str):
    """
    Retrieve full details for a single party.
    Protected by judge assignment verification:
      - Admin & Clerk: Full view of all cases.
      - Judge: Denied (403) unless party participates in an assigned case;
        associated_cases returns ONLY cases assigned to that judge.
    """
    party_data, err_msg, code = get_party_by_id(party_id, user=g.current_user)
    if err_msg:
        return jsonify({
            "status": "error",
            "message": err_msg,
        }), code

    return jsonify({
        "status": "success",
        "data": party_data,
    }), 200


@parties_bp.route("", methods=["POST"])
@roles_required("admin", "clerk")
def create_new_party():
    """
    Create a new legal party and optional phone numbers.
    Authorized for Admin and Clerk.
    """
    if not request.is_json:
        return jsonify({
            "status": "error",
            "message": "Request payload must be JSON.",
        }), 400

    body = request.get_json(silent=True) or {}
    name = body.get("name")
    party_type = body.get("party_type")
    phone_numbers = body.get("phone_numbers")

    created, err_msg, code = create_party(
        actor_username=g.current_user["username"],
        name=name,
        party_type=party_type,
        phone_numbers=phone_numbers,
    )

    if err_msg:
        return jsonify({
            "status": "error",
            "message": err_msg,
        }), code

    return jsonify({
        "status": "success",
        "message": "Party created successfully.",
        "data": created,
    }), 201


@parties_bp.route("/<party_id>", methods=["PUT"])
@roles_required("admin", "clerk")
def update_existing_party(party_id: str):
    """
    Update an existing legal party record.
    Authorized for Admin and Clerk.
    """
    if not request.is_json:
        return jsonify({
            "status": "error",
            "message": "Request payload must be JSON.",
        }), 400

    body = request.get_json(silent=True) or {}
    name = body.get("name")
    party_type = body.get("party_type")

    updated, err_msg, code = update_party(
        actor_username=g.current_user["username"],
        party_id=party_id,
        name=name,
        party_type=party_type,
    )

    if err_msg:
        return jsonify({
            "status": "error",
            "message": err_msg,
        }), code

    return jsonify({
        "status": "success",
        "message": "Party updated successfully.",
        "data": updated,
    }), 200


@parties_bp.route("/<party_id>", methods=["DELETE"])
@roles_required("admin")
def delete_existing_party(party_id: str):
    """
    Concurrency-safe hard deletion of a legal party record.
    Restricted strictly to Admin.
    Rejects deletion with HTTP 409 if linked to case dockets or filings.
    """
    success, message, code = delete_party(
        actor_username=g.current_user["username"],
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


@parties_bp.route("/<party_id>/phones", methods=["POST"])
@roles_required("admin", "clerk")
def add_phone_to_party_route(party_id: str):
    """
    Add a phone number to an existing party.
    Authorized for Admin and Clerk.
    """
    if not request.is_json:
        return jsonify({
            "status": "error",
            "message": "Request payload must be JSON.",
        }), 400

    body = request.get_json(silent=True) or {}
    phone_number = body.get("phone_number")

    created, err_msg, code = add_party_phone(
        actor_username=g.current_user["username"],
        party_id=party_id,
        phone_number=phone_number,
    )

    if err_msg:
        return jsonify({
            "status": "error",
            "message": err_msg,
        }), code

    return jsonify({
        "status": "success",
        "message": "Phone number added successfully.",
        "data": created,
    }), 201


@parties_bp.route("/<party_id>/phones/<phone_number>", methods=["DELETE"])
@roles_required("admin", "clerk")
def delete_phone_from_party_route(party_id: str, phone_number: str):
    """
    Remove a phone number from an existing party.
    Authorized for Admin and Clerk.
    """
    success, message, code = delete_party_phone(
        actor_username=g.current_user["username"],
        party_id=party_id,
        phone_number=phone_number,
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

