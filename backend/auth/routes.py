"""
Court Case Management System - Authentication Routes Blueprint
Exposes endpoints for user authentication, session inspection, and logout.

Endpoints:
  GET  /auth/csrf-token - Generates and returns a valid CSRF token.
  POST /auth/login      - Authenticates user, regenerates session ID, establishes session.
  POST /auth/logout     - Clears user session and evicts server-side session.
  GET  /auth/me         - Returns currently authenticated user context with live DB validation.

Safety Rules:
  - Strict input validation rejecting malformed payloads, non-object JSON, type mismatches.
  - Constant-time password verification and non-blocking bounded progressive throttling.
  - Eliminates circular dependencies by importing extensions from backend.extensions.
  - Never logs or exposes passwords or internal database errors.
"""

from typing import Any, Dict
from flask import Blueprint, jsonify, request
from flask_wtf.csrf import generate_csrf
import psycopg

from backend.auth.services import authenticate_user, get_user_by_id
from backend.auth.session_manager import (
    establish_user_session,
    get_current_session_user,
    terminate_user_session,
)
from backend.extensions import limiter

auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/csrf-token", methods=["GET"])
def get_csrf_token():
    """
    Generate and return a valid CSRF token.
    Clients include this token in the X-CSRF-Token header for state-changing requests.
    """
    token = generate_csrf()
    return jsonify({
        "status": "success",
        "csrf_token": token,
    })


@auth_bp.route("/login", methods=["POST"])
@limiter.limit("10 per minute")
def login():
    """
    Authenticate user credentials, regenerate session ID, and establish server session.

    Payload JSON:
      {
        "username": "...",
        "password": "..."
      }
    """
    # 1. Content-Type and JSON format validation
    if not request.is_json:
        return jsonify({
            "status": "error",
            "message": "Invalid request content type; expected JSON application payload.",
        }), 400

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({
            "status": "error",
            "message": "Invalid JSON payload structure; expected a JSON object.",
        }), 400

    # 2. Key existence and type checks
    username = data.get("username")
    password = data.get("password")

    if username is None or password is None:
        return jsonify({
            "status": "error",
            "message": "Username and password are required.",
        }), 400

    if not isinstance(username, str) or not isinstance(password, str):
        return jsonify({
            "status": "error",
            "message": "Username and password must be valid strings.",
        }), 400

    # 3. String content and length bounds
    username_clean = username.strip()
    if not username_clean or not password:
        return jsonify({
            "status": "error",
            "message": "Username and password cannot be empty or whitespace.",
        }), 400

    if len(username_clean) < 3 or len(username_clean) > 50:
        return jsonify({
            "status": "error",
            "message": "Username must be between 3 and 50 characters in length.",
        }), 400

    if len(password) > 256:
        return jsonify({
            "status": "error",
            "message": "Password exceeds maximum allowable length of 256 characters.",
        }), 400

    if not username_clean.replace("_", "").isalnum():
        return jsonify({
            "status": "error",
            "message": "Username may only contain alphanumeric characters and underscores.",
        }), 400

    client_ip = request.remote_addr or "127.0.0.1"

    # 4. Authentication execution
    try:
        user_info, error_msg, status_code = authenticate_user(
            username=username_clean,
            password=password,
            client_ip=client_ip,
        )

        if error_msg or not user_info:
            return jsonify({
                "status": "error",
                "message": error_msg or "Invalid username or password.",
            }), status_code

        # 5. Successful authentication: establish session and rotate CSRF token
        establish_user_session(user_info)
        new_csrf_token = generate_csrf()

        return jsonify({
            "status": "success",
            "message": "Login successful.",
            "user": user_info,
            "csrf_token": new_csrf_token,
        }), 200

    except psycopg.Error:
        return jsonify({
            "status": "error",
            "message": "Authentication service unavailable. Check server logs.",
        }), 500


@auth_bp.route("/logout", methods=["POST"])
def logout():
    """
    Terminate active user session and evict server-side session.
    """
    terminate_user_session()
    return jsonify({
        "status": "success",
        "message": "Logout successful.",
    }), 200


@auth_bp.route("/me", methods=["GET"])
def get_current_user():
    """
    Return currently authenticated user identity.
    Performs live database verification to prevent stale authorization
    (e.g., if judge account was deactivated after session creation).
    """
    session_user = get_current_session_user()
    if not session_user:
        return jsonify({
            "status": "error",
            "message": "Authentication required.",
        }), 401

    try:
        live_user = get_user_by_id(session_user["user_id"])
        if not live_user:
            terminate_user_session()
            return jsonify({
                "status": "error",
                "message": "Session expired or user account is no longer active.",
            }), 401

        return jsonify({
            "status": "success",
            "user": live_user,
        }), 200

    except psycopg.Error:
        return jsonify({
            "status": "error",
            "message": "Authentication service unavailable. Check server logs.",
        }), 500
