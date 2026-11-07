"""
Phase 7A - Security Infrastructure Unit Test Suite
Validates authentication enforcement, role-based authorization, judge case isolation,
and safe transactional write execution with audit logging attribution.

Test Categories:
  1. Authentication Revalidation & 401 Responses
  2. Inactive Accounts, Deactivated Judges, & 403 Responses
  3. Role-Based Access Control (Admin, Clerk, Judge write denial)
  4. Judge Case Isolation & Assigned Case Authorization
  5. execute_write_transaction Validation, Setting, Commit, and Rollback
"""

import unittest
from unittest.mock import patch
import uuid
from flask import Blueprint, g, jsonify, request
import psycopg
from psycopg.rows import dict_row

from backend.app import create_app
from backend.auth.decorators import (
    is_case_assigned_to_judge,
    require_auth,
    require_case_access,
    roles_required,
    verify_judge_case_access,
)
from backend.auth.session_manager import get_current_session_user
from backend.db import execute_read_query, execute_write_transaction

# Test Blueprint for testing decorators and routing behaviors
test_bp = Blueprint("phase7a_test_sec", __name__, url_prefix="/test-security")


@test_bp.route("/protected", methods=["GET"])
@require_auth
def sec_protected():
    return jsonify({
        "status": "success",
        "user_id": g.current_user["user_id"],
        "username": g.current_user["username"],
    }), 200


@test_bp.route("/admin-only", methods=["GET"])
@roles_required("admin")
def sec_admin_only():
    return jsonify({
        "status": "success",
        "message": "Admin authorization granted.",
    }), 200


@test_bp.route("/clerk-or-admin-write", methods=["POST"])
@roles_required("admin", "clerk")
def sec_clerk_admin_write():
    return jsonify({
        "status": "success",
        "message": "Write operation authorized.",
    }), 200


@test_bp.route("/judge-only", methods=["GET"])
@roles_required("judge")
def sec_judge_only():
    return jsonify({
        "status": "success",
        "message": "Judge chambers view authorized.",
    }), 200


@test_bp.route("/cases/<case_id>/details", methods=["GET"])
@require_case_access("case_id")
def sec_case_details(case_id):
    return jsonify({
        "status": "success",
        "case_id": case_id,
        "verified_case_id": getattr(g, "case_id", None),
    }), 200


@test_bp.route("/cases/inspect", methods=["POST"])
@require_case_access("case_id")
def sec_case_inspect():
    return jsonify({
        "status": "success",
        "case_id": getattr(g, "case_id", None),
        "verified_case_id": getattr(g, "case_id", None),
    }), 200


class Phase7ASecurityInfrastructureTestCase(unittest.TestCase):
    """Comprehensive test suite for Phase 7A Security & Authorization Infrastructure."""

    @classmethod
    def setUpClass(cls):
        cls.app = create_app(
            config_overrides={
                "TESTING": True,
                "WTF_CSRF_ENABLED": False,
                "RATELIMIT_ENABLED": False,
            }
        )
        cls.app.register_blueprint(test_bp)

        # Real DB identifiers from court_case_dev
        cls.judge_active_id = "22c38658-774b-494f-ae97-01c82dc88422"
        cls.assigned_case_id = "691304dd-9183-4660-b431-f8d7220e4b0f"
        cls.unassigned_case_id = "512aa71b-fc0b-493b-8828-725f10a30ffc"

    def _login_as(self, client, user_dict):
        """Helper to establish an authenticated session."""
        dummy_pass = "SecurePass123!@#"
        with patch("backend.auth.routes.authenticate_user", return_value=(user_dict, None, 200)):
            resp = client.post(
                "/auth/login",
                json={"username": user_dict["username"], "password": dummy_pass},
            )
            self.assertEqual(resp.status_code, 200, f"Login failed for {user_dict['username']}")
        return resp

    # =======================================================================
    # 1. Unauthenticated Requests (HTTP 401)
    # =======================================================================

    def test_01_unauthenticated_request_to_require_auth_returns_401(self):
        """Verify unauthenticated request to @require_auth endpoint returns 401."""
        client = self.app.test_client()
        resp = client.get("/test-security/protected")
        self.assertEqual(resp.status_code, 401)
        data = resp.get_json()
        self.assertEqual(data.get("status"), "error")
        self.assertEqual(data.get("message"), "Authentication required.")

    def test_02_unauthenticated_request_to_roles_required_returns_401(self):
        """Verify unauthenticated request to @roles_required endpoint returns 401."""
        client = self.app.test_client()
        resp = client.post("/test-security/clerk-or-admin-write")
        self.assertEqual(resp.status_code, 401)
        data = resp.get_json()
        self.assertEqual(data.get("status"), "error")
        self.assertEqual(data.get("message"), "Authentication required.")

    def test_03_unauthenticated_request_to_require_case_access_returns_401(self):
        """Verify unauthenticated request to @require_case_access endpoint returns 401."""
        client = self.app.test_client()
        resp = client.get(f"/test-security/cases/{self.assigned_case_id}/details")
        self.assertEqual(resp.status_code, 401)
        data = resp.get_json()
        self.assertEqual(data.get("status"), "error")
        self.assertEqual(data.get("message"), "Authentication required.")

    # =======================================================================
    # 2. Inactive Accounts & Deactivated Judges (HTTP 403)
    # =======================================================================

    def test_04_deleted_user_session_returns_403_and_terminates_session(self):
        """Verify deleted or nonexistent user session is rejected with 403 and evicted."""
        client = self.app.test_client()
        stale_fixture = {
            "user_id": 999999,
            "username": "deleted_user",
            "role": "clerk",
            "judge_id": None,
        }
        self._login_as(client, stale_fixture)

        # Call endpoint - get_user_by_id(999999) returns None from real DB
        resp = client.get("/test-security/protected")
        self.assertEqual(resp.status_code, 403)
        data = resp.get_json()
        self.assertEqual(data.get("status"), "error")
        self.assertIn("inactive or unauthorized", data.get("message", ""))

        # Verify session is invalidated
        with client.session_transaction() as sess:
            self.assertIsNone(sess.get("user_id"))

    def test_05_deactivated_judge_returns_403_and_terminates_session(self):
        """Verify deactivated judge (user_id: 3 in dev DB) is rejected with 403."""
        client = self.app.test_client()
        judge_inactive_fixture = {
            "user_id": 3,
            "username": "judge_inactive",
            "role": "judge",
            "judge_id": "00000000-0000-0000-0000-000000000001",
        }
        self._login_as(client, judge_inactive_fixture)

        resp = client.get("/test-security/protected")
        self.assertEqual(resp.status_code, 403)
        data = resp.get_json()
        self.assertEqual(data.get("status"), "error")

        with client.session_transaction() as sess:
            self.assertIsNone(sess.get("user_id"))

    def test_06_judge_without_linked_judge_id_returns_403(self):
        """Verify judge account without linked judge_id is rejected with 403."""
        client = self.app.test_client()
        judge_corrupt_fixture = {
            "user_id": 204,
            "username": "judge_orphan",
            "role": "judge",
            "judge_id": None,
        }
        self._login_as(client, judge_corrupt_fixture)

        # Mock get_user_by_id returning judge record without judge_id
        with patch("backend.auth.decorators.get_user_by_id", return_value=judge_corrupt_fixture):
            resp = client.get("/test-security/protected")

        self.assertEqual(resp.status_code, 403)
        data = resp.get_json()
        self.assertEqual(data.get("status"), "error")
        self.assertIn("not linked to an active judge", data.get("message", ""))

    # =======================================================================
    # 3. Role-Based Access Control & Judge Write Denial
    # =======================================================================

    def test_07_judge_prohibited_from_write_endpoints_returns_403(self):
        """Verify Judge attempting write operation receives HTTP 403 Forbidden."""
        client = self.app.test_client()
        judge_fixture = {
            "user_id": 2,
            "username": "judge_active",
            "role": "judge",
            "judge_id": self.judge_active_id,
        }
        self._login_as(client, judge_fixture)

        resp = client.post("/test-security/clerk-or-admin-write")
        self.assertEqual(resp.status_code, 403)
        data = resp.get_json()
        self.assertEqual(data.get("status"), "error")
        self.assertEqual(data.get("message"), "Access forbidden: insufficient permissions.")

    def test_08_clerk_prohibited_from_admin_endpoints_returns_403(self):
        """Verify Clerk attempting Admin-only endpoint receives HTTP 403 Forbidden."""
        client = self.app.test_client()
        clerk_fixture = {
            "user_id": 105,
            "username": "clerk_regular",
            "role": "clerk",
            "judge_id": None,
        }
        self._login_as(client, clerk_fixture)

        with patch("backend.auth.decorators.get_user_by_id", return_value=clerk_fixture):
            resp = client.get("/test-security/admin-only")

        self.assertEqual(resp.status_code, 403)
        data = resp.get_json()
        self.assertEqual(data.get("status"), "error")
        self.assertEqual(data.get("message"), "Access forbidden: insufficient permissions.")

    def test_09_clerk_authorized_on_write_endpoints_returns_200(self):
        """Verify Clerk is authorized to perform operational write operations."""
        client = self.app.test_client()
        clerk_fixture = {
            "user_id": 106,
            "username": "clerk_operator",
            "role": "clerk",
            "judge_id": None,
        }
        self._login_as(client, clerk_fixture)

        with patch("backend.auth.decorators.get_user_by_id", return_value=clerk_fixture):
            resp = client.post("/test-security/clerk-or-admin-write")

        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertEqual(data.get("status"), "success")
        self.assertEqual(data.get("message"), "Write operation authorized.")

    def test_10_admin_authorized_on_all_endpoints_returns_200(self):
        """Verify Admin is authorized on both admin-only and clerk write operations."""
        client = self.app.test_client()
        admin_fixture = {
            "user_id": 1,
            "username": "admin_master",
            "role": "admin",
            "judge_id": None,
        }
        self._login_as(client, admin_fixture)

        # Admin accessing admin-only endpoint
        resp_admin = client.get("/test-security/admin-only")
        self.assertEqual(resp_admin.status_code, 200)

        # Admin accessing operational write endpoint
        resp_write = client.post("/test-security/clerk-or-admin-write")
        self.assertEqual(resp_write.status_code, 200)

    def test_11_roles_required_is_case_insensitive(self):
        """Verify role matching handles case-insensitivity cleanly."""
        client = self.app.test_client()
        admin_fixture = {
            "user_id": 1,
            "username": "admin_master",
            "role": "Admin",  # Mixed case
            "judge_id": None,
        }
        self._login_as(client, admin_fixture)

        with patch("backend.auth.decorators.get_user_by_id", return_value=admin_fixture):
            resp = client.get("/test-security/admin-only")
        self.assertEqual(resp.status_code, 200)

    # =======================================================================
    # 4. Judge Case Isolation & Case Access Decorator
    # =======================================================================

    def test_12_judge_authorized_on_assigned_case_returns_200(self):
        """Verify Judge can access details of a case assigned to them."""
        client = self.app.test_client()
        judge_fixture = {
            "user_id": 2,
            "username": "judge_active",
            "role": "judge",
            "judge_id": self.judge_active_id,
        }
        self._login_as(client, judge_fixture)

        resp = client.get(f"/test-security/cases/{self.assigned_case_id}/details")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertEqual(data.get("status"), "success")
        self.assertEqual(data.get("case_id"), self.assigned_case_id)
        self.assertEqual(data.get("verified_case_id"), self.assigned_case_id)

    def test_13_judge_unauthorized_on_unassigned_case_returns_403(self):
        """Verify Judge cannot access details of an unassigned case (belongs to another judge)."""
        client = self.app.test_client()
        judge_fixture = {
            "user_id": 2,
            "username": "judge_active",
            "role": "judge",
            "judge_id": self.judge_active_id,
        }
        self._login_as(client, judge_fixture)

        resp = client.get(f"/test-security/cases/{self.unassigned_case_id}/details")
        self.assertEqual(resp.status_code, 403)
        data = resp.get_json()
        self.assertEqual(data.get("status"), "error")
        self.assertEqual(data.get("message"), "Access forbidden: you are not authorized to access this case.")

    def test_14_admin_and_clerk_authorized_on_any_case(self):
        """Verify Admin and Clerk can access any case (assigned or unassigned)."""
        client = self.app.test_client()

        # Admin
        admin_fixture = {
            "user_id": 1,
            "username": "admin_master",
            "role": "admin",
            "judge_id": None,
        }
        self._login_as(client, admin_fixture)
        resp_admin = client.get(f"/test-security/cases/{self.unassigned_case_id}/details")
        self.assertEqual(resp_admin.status_code, 200)

        # Clerk
        clerk_fixture = {
            "user_id": 107,
            "username": "clerk_auditor",
            "role": "clerk",
            "judge_id": None,
        }
        self._login_as(client, clerk_fixture)
        with patch("backend.auth.decorators.get_user_by_id", return_value=clerk_fixture):
            resp_clerk = client.get(f"/test-security/cases/{self.unassigned_case_id}/details")
        self.assertEqual(resp_clerk.status_code, 200)

    def test_15_require_case_access_missing_case_id_returns_400(self):
        """Verify missing case identifier in JSON request returns HTTP 400 Bad Request."""
        client = self.app.test_client()
        admin_fixture = {
            "user_id": 1,
            "username": "admin_master",
            "role": "admin",
            "judge_id": None,
        }
        self._login_as(client, admin_fixture)

        resp = client.post("/test-security/cases/inspect", json={})
        self.assertEqual(resp.status_code, 400)
        data = resp.get_json()
        self.assertEqual(data.get("status"), "error")
        self.assertIn("Missing required parameter", data.get("message", ""))

    def test_16_require_case_access_supports_json_payload(self):
        """Verify case_id extraction from JSON payload for case access verification."""
        client = self.app.test_client()
        judge_fixture = {
            "user_id": 2,
            "username": "judge_active",
            "role": "judge",
            "judge_id": self.judge_active_id,
        }
        self._login_as(client, judge_fixture)

        # Assigned case in JSON payload -> 200
        resp_assigned = client.post(
            "/test-security/cases/inspect",
            json={"case_id": self.assigned_case_id},
        )
        self.assertEqual(resp_assigned.status_code, 200)
        self.assertEqual(resp_assigned.get_json().get("case_id"), self.assigned_case_id)
        self.assertEqual(resp_assigned.get_json().get("verified_case_id"), self.assigned_case_id)

        # Unassigned case in JSON payload -> 403
        resp_unassigned = client.post(
            "/test-security/cases/inspect",
            json={"case_id": self.unassigned_case_id},
        )
        self.assertEqual(resp_unassigned.status_code, 403)

    # =======================================================================
    # 5. Judge Assignment & Case Access Helpers (Direct Unit Tests)
    # =======================================================================

    def test_17_is_case_assigned_to_judge_helper_validation(self):
        """Verify is_case_assigned_to_judge validates UUIDs and handles invalid inputs safely."""
        # Non-UUID strings
        self.assertFalse(is_case_assigned_to_judge("invalid-judge", str(uuid.uuid4())))
        self.assertFalse(is_case_assigned_to_judge(str(uuid.uuid4()), "invalid-case"))

        # None / empty values
        self.assertFalse(is_case_assigned_to_judge(None, self.assigned_case_id))
        self.assertFalse(is_case_assigned_to_judge(self.judge_active_id, None))
        self.assertFalse(is_case_assigned_to_judge("", ""))

        # Random UUIDs not in DB
        random_judge = str(uuid.uuid4())
        random_case = str(uuid.uuid4())
        self.assertFalse(is_case_assigned_to_judge(random_judge, random_case))

        # Real assigned pair
        self.assertTrue(is_case_assigned_to_judge(self.judge_active_id, self.assigned_case_id))

        # Real unassigned pair
        self.assertFalse(is_case_assigned_to_judge(self.judge_active_id, self.unassigned_case_id))

    def test_18_verify_judge_case_access_helper_matrix(self):
        """Verify verify_judge_case_access authorization matrix for all user configurations."""
        case_id = self.assigned_case_id

        # None user
        self.assertFalse(verify_judge_case_access(None, case_id))

        # Invalid user dict
        self.assertFalse(verify_judge_case_access({}, case_id))
        self.assertFalse(verify_judge_case_access({"role": "invalid"}, case_id))

        # Admin user
        self.assertTrue(verify_judge_case_access({"role": "admin"}, case_id))
        self.assertTrue(verify_judge_case_access({"role": "ADMIN"}, case_id))

        # Clerk user
        self.assertTrue(verify_judge_case_access({"role": "clerk"}, case_id))
        self.assertTrue(verify_judge_case_access({"role": "CLERK"}, case_id))

        # Judge without judge_id
        self.assertFalse(verify_judge_case_access({"role": "judge", "judge_id": None}, case_id))

        # Judge with assigned case
        self.assertTrue(
            verify_judge_case_access(
                {"role": "judge", "judge_id": self.judge_active_id},
                self.assigned_case_id,
            )
        )

        # Judge with unassigned case
        self.assertFalse(
            verify_judge_case_access(
                {"role": "judge", "judge_id": self.judge_active_id},
                self.unassigned_case_id,
            )
        )

    # =======================================================================
    # 6. Safe Database Write Transaction Helper (execute_write_transaction)
    # =======================================================================

    def test_19_execute_write_transaction_rejects_invalid_actor(self):
        """Verify execute_write_transaction raises ValueError on missing or empty actor_username."""
        with self.assertRaises(ValueError):
            execute_write_transaction("", lambda cur: None)

        with self.assertRaises(ValueError):
            execute_write_transaction("   ", lambda cur: None)

        with self.assertRaises(ValueError):
            execute_write_transaction(None, lambda cur: None)  # type: ignore

        with self.assertRaises(ValueError):
            execute_write_transaction(12345, lambda cur: None)  # type: ignore

    def test_20_execute_write_transaction_rejects_invalid_operation(self):
        """Verify execute_write_transaction raises TypeError on non-callable non-string operation."""
        with self.assertRaises(TypeError):
            execute_write_transaction("valid_actor", 12345)  # type: ignore

        with self.assertRaises(TypeError):
            execute_write_transaction("valid_actor", ["INSERT INTO ..."])  # type: ignore

    def test_21_execute_write_transaction_sets_app_username_locally(self):
        """Verify execute_write_transaction sets 'app.username' setting locally to transaction."""
        actor = "test_sec_actor_99"

        # Read setting inside transaction
        setting_val = execute_write_transaction(
            actor,
            lambda cur: cur.execute("SELECT current_setting('app.username', true);").fetchone(),
        )
        self.assertEqual(setting_val, (actor,))

        # Verify setting is reset outside of transaction
        outside_val = execute_read_query("SELECT current_setting('app.username', true);", fetch_one=True)
        self.assertEqual(outside_val, (None,))

    def test_22_execute_write_transaction_commits_and_logs_audit_actor(self):
        """Verify write transaction commits changes and database trigger attributes actor in audit_logs."""
        actor = "test_audit_logger_admin"
        test_party_name = f"Test Security Party {uuid.uuid4().hex[:8]}"

        # 1. Execute write transaction with RETURNING clause
        row = execute_write_transaction(
            actor,
            "INSERT INTO parties (name, party_type) VALUES (%s, %s) RETURNING party_id;",
            params=(test_party_name, "Petitioner"),
            fetch_one=True,
        )
        self.assertIsNotNone(row)
        party_id = row[0]

        try:
            # 2. Verify row exists in parties table
            p_check = execute_read_query(
                "SELECT count(*) FROM parties WHERE party_id = %s;",
                params=(party_id,),
                fetch_one=True,
            )
            self.assertEqual(p_check[0], 1)

            # 3. Verify audit log entry captured the actor from 'app.username'
            audit_entry = execute_read_query(
                "SELECT username, action_type FROM audit_logs WHERE username = %s AND action_type = 'parties:INSERT';",
                params=(actor,),
                fetch_one=True,
            )
            self.assertIsNotNone(audit_entry, "Audit log record must be created by trigger.")
            self.assertEqual(audit_entry[0], actor)
            self.assertEqual(audit_entry[1], "parties:INSERT")

        finally:
            # 4. Clean up test row and audit log to preserve database hygiene
            execute_write_transaction(actor, "DELETE FROM parties WHERE party_id = %s;", params=(party_id,))
            execute_write_transaction(actor, "DELETE FROM audit_logs WHERE username = %s;", params=(actor,))

            # Confirm cleanup
            cleanup_check = execute_read_query(
                "SELECT count(*) FROM parties WHERE party_id = %s;",
                params=(party_id,),
                fetch_one=True,
            )
            self.assertEqual(cleanup_check[0], 0)

    def test_23_execute_write_transaction_rolls_back_on_exception(self):
        """Verify execute_write_transaction rolls back and does not persist rows if exception occurs."""
        actor = "test_rollback_actor"
        test_party_name = f"Test Rollback Party {uuid.uuid4().hex[:8]}"

        def failing_operation(cur):
            cur.execute(
                "INSERT INTO parties (name, party_type) VALUES (%s, %s);",
                (test_party_name, "Petitioner"),
            )
            raise RuntimeError("Intentional operational abort to verify rollback.")

        with self.assertRaises(RuntimeError):
            execute_write_transaction(actor, failing_operation)

        # Assert no party row was persisted
        p_check = execute_read_query(
            "SELECT count(*) FROM parties WHERE name = %s;",
            params=(test_party_name,),
            fetch_one=True,
        )
        self.assertEqual(p_check[0], 0, "No party row should be committed after exception.")

        # Assert no audit log was persisted
        a_check = execute_read_query(
            "SELECT count(*) FROM audit_logs WHERE username = %s;",
            params=(actor,),
            fetch_one=True,
        )
        self.assertEqual(a_check[0], 0, "No audit log should be committed after exception rollback.")

    # =======================================================================
    # 7. Regression & Conflict Tests for Phase 7A Security Review Findings
    # =======================================================================

    def test_24_actor_username_length_boundaries_50_and_51(self):
        """Verify actor_username accepts exactly 50 characters and rejects 51 characters (L-01)."""
        valid_50 = "a" * 50
        invalid_51 = "a" * 51

        # 50 characters must be accepted cleanly
        res = execute_write_transaction(
            valid_50,
            lambda cur: cur.execute("SELECT current_setting('app.username', true);").fetchone(),
        )
        self.assertEqual(res, (valid_50,))

        # 51 characters must be rejected with ValueError
        with self.assertRaises(ValueError) as ctx:
            execute_write_transaction(invalid_51, lambda cur: None)
        self.assertIn("exceeds maximum length of 50 characters", str(ctx.exception))

    def test_25_require_case_access_conflicting_query_and_body_returns_400(self):
        """Verify conflicting case_id across query parameters and JSON body returns HTTP 400 (M-01)."""
        client = self.app.test_client()
        admin_fixture = {
            "user_id": 1,
            "username": "admin_master",
            "role": "admin",
            "judge_id": None,
        }
        self._login_as(client, admin_fixture)

        # Query says assigned_case_id, Body says unassigned_case_id -> conflicting
        resp = client.post(
            f"/test-security/cases/inspect?case_id={self.assigned_case_id}",
            json={"case_id": self.unassigned_case_id},
        )
        self.assertEqual(resp.status_code, 400)
        data = resp.get_json()
        self.assertEqual(data.get("status"), "error")
        self.assertIn("Conflicting values provided", data.get("message", ""))

    def test_26_require_case_access_matching_multiple_sources_succeeds(self):
        """Verify matching identical case_id across query parameters and JSON body succeeds (M-01)."""
        client = self.app.test_client()
        judge_fixture = {
            "user_id": 2,
            "username": "judge_active",
            "role": "judge",
            "judge_id": self.judge_active_id,
        }
        self._login_as(client, judge_fixture)

        # Both query and body supply the same assigned_case_id -> matching
        resp = client.post(
            f"/test-security/cases/inspect?case_id={self.assigned_case_id}",
            json={"case_id": self.assigned_case_id},
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertEqual(data.get("status"), "success")
        self.assertEqual(data.get("case_id"), self.assigned_case_id)
        self.assertEqual(data.get("verified_case_id"), self.assigned_case_id)

    def test_27_require_case_access_conflicting_route_arg_and_query_returns_400(self):
        """Verify conflicting case_id across URL route argument and query string returns HTTP 400 (M-01)."""
        client = self.app.test_client()
        admin_fixture = {
            "user_id": 1,
            "username": "admin_master",
            "role": "admin",
            "judge_id": None,
        }
        self._login_as(client, admin_fixture)

        # Route argument says assigned_case_id, query string says unassigned_case_id
        resp = client.get(
            f"/test-security/cases/{self.assigned_case_id}/details?case_id={self.unassigned_case_id}"
        )
        self.assertEqual(resp.status_code, 400)
        data = resp.get_json()
        self.assertEqual(data.get("status"), "error")
        self.assertIn("Conflicting values provided", data.get("message", ""))

    def test_28_require_case_access_conflicting_route_arg_and_body_returns_400(self):
        """Verify conflicting case_id across URL route argument and JSON body returns HTTP 400 (M-01)."""
        client = self.app.test_client()
        admin_fixture = {
            "user_id": 1,
            "username": "admin_master",
            "role": "admin",
            "judge_id": None,
        }
        self._login_as(client, admin_fixture)

        # Route argument says assigned_case_id, JSON body says unassigned_case_id
        resp = client.get(
            f"/test-security/cases/{self.assigned_case_id}/details",
            json={"case_id": self.unassigned_case_id},
        )
        self.assertEqual(resp.status_code, 400)
        data = resp.get_json()
        self.assertEqual(data.get("status"), "error")
        self.assertIn("Conflicting values provided", data.get("message", ""))

    def test_29_require_case_access_attaches_verified_id_to_g(self):
        """Verify downstream route handler receives exact verified case_id from g.case_id (L-02)."""
        client = self.app.test_client()
        judge_fixture = {
            "user_id": 2,
            "username": "judge_active",
            "role": "judge",
            "judge_id": self.judge_active_id,
        }
        self._login_as(client, judge_fixture)

        # Request assigned case
        resp = client.get(f"/test-security/cases/{self.assigned_case_id}/details")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertEqual(data.get("verified_case_id"), self.assigned_case_id)

    def test_30_require_case_access_empty_query_and_non_empty_json_returns_400(self):
        """Verify empty query case_id combined with non-empty JSON body returns HTTP 400."""
        client = self.app.test_client()
        admin_fixture = {
            "user_id": 1,
            "username": "admin_master",
            "role": "admin",
            "judge_id": None,
        }
        self._login_as(client, admin_fixture)

        resp = client.post(
            "/test-security/cases/inspect?case_id=",
            json={"case_id": self.assigned_case_id},
        )
        self.assertEqual(resp.status_code, 400)
        data = resp.get_json()
        self.assertEqual(data.get("status"), "error")
        self.assertIn("Conflicting values provided", data.get("message", ""))

    def test_31_require_case_access_non_empty_query_and_empty_json_returns_400(self):
        """Verify non-empty query case_id combined with empty JSON body returns HTTP 400."""
        client = self.app.test_client()
        admin_fixture = {
            "user_id": 1,
            "username": "admin_master",
            "role": "admin",
            "judge_id": None,
        }
        self._login_as(client, admin_fixture)

        resp = client.post(
            f"/test-security/cases/inspect?case_id={self.assigned_case_id}",
            json={"case_id": ""},
        )
        self.assertEqual(resp.status_code, 400)
        data = resp.get_json()
        self.assertEqual(data.get("status"), "error")
        self.assertIn("Conflicting values provided", data.get("message", ""))

    def test_32_require_case_access_duplicate_query_parameters_returns_400(self):
        """Verify duplicate query parameters such as ?case_id=A&case_id=B are rejected with HTTP 400."""
        client = self.app.test_client()
        admin_fixture = {
            "user_id": 1,
            "username": "admin_master",
            "role": "admin",
            "judge_id": None,
        }
        self._login_as(client, admin_fixture)

        # Duplicate query parameters with conflicting values on POST endpoint
        resp = client.post(
            f"/test-security/cases/inspect?case_id={self.assigned_case_id}&case_id={self.unassigned_case_id}"
        )
        self.assertEqual(resp.status_code, 400)
        data = resp.get_json()
        self.assertEqual(data.get("status"), "error")
        self.assertIn("Duplicate query parameters provided", data.get("message", ""))

    def test_33_duplicate_json_keys_standard_parser_limitation(self):
        """
        Document limitation: standard Python/Flask json parsing collapses duplicate keys to last occurrence.

        RFC 8259 notes JSON keys SHOULD be unique, but standard Python dict deserialization
        in request.get_json() silently overwrites earlier keys with the last key value.
        Downstream code receives only the final key value from the resulting dictionary.
        """
        client = self.app.test_client()
        judge_fixture = {
            "user_id": 2,
            "username": "judge_active",
            "role": "judge",
            "judge_id": self.judge_active_id,
        }
        self._login_as(client, judge_fixture)

        # Raw JSON payload containing duplicate keys: first assigned_case_id, then unassigned_case_id
        raw_json = (
            f'{{"case_id": "{self.assigned_case_id}", "case_id": "{self.unassigned_case_id}"}}'
        )

        # Due to standard Python dict parsing, json_body becomes {"case_id": "<unassigned_case_id>"}
        resp = client.post(
            "/test-security/cases/inspect",
            data=raw_json,
            content_type="application/json",
        )
        # Because the last key (unassigned_case_id) won, judge is denied with 403
        self.assertEqual(resp.status_code, 403)
        self.assertIn("Access forbidden", resp.get_json().get("message", ""))


if __name__ == "__main__":
    unittest.main()

