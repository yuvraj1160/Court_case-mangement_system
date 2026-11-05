"""
Court Case Management System - Phase 5 Verification Test Suite
Tests role-based dashboard APIs and authorization:
  - Admin dashboard access, metrics, upcoming hearings, audit logs.
  - Clerk dashboard access, operational metrics, recent cases, filings.
  - Strict data restrictions on Clerk (no user management, no audit logs).
  - Judge dashboard access and hearing isolation (Judge A != Judge B).
  - Unauthenticated access returns HTTP 401.
  - Inactive users, deactivated judges, and unauthorized roles return HTTP 403.
  - Client-supplied identity overrides (role, user_id, judge_id in params/headers/body) are rejected.
  - Empty database results and database exceptions are handled safely.

Safety Rules:
  - Development database is court_case_dev strictly.
  - Never touches court_case_db.
  - Preserves existing database records, schema, and credentials.
  - Zero hardcoded real passwords.
"""

import os
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch
import psycopg
from psycopg.rows import dict_row

# Ensure backend is on sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.app import create_app
from backend.auth.services import get_user_by_id
from backend.db import execute_read_query
from backend.dashboard.services import (
    get_admin_dashboard_data,
    get_clerk_dashboard_data,
    get_judge_dashboard_data,
)


class Phase5DashboardTestCase(unittest.TestCase):
    """Test suite verifying role-based dashboards and authorization enforcement."""

    @classmethod
    def setUpClass(cls):
        cls.app = create_app(
            config_overrides={
                "TESTING": True,
                "WTF_CSRF_ENABLED": False,  # Isolate authorization from CSRF checks
                "RATELIMIT_ENABLED": False,  # Isolate from rate limits
            }
        )

    def _login_as(self, client, user_dict):
        """Helper to simulate establishing an authenticated session cleanly."""
        dummy_pass = "SecurePass123!@#"
        with patch("backend.auth.routes.authenticate_user", return_value=(user_dict, None, 200)):
            resp = client.post(
                "/auth/login",
                json={"username": user_dict["username"], "password": dummy_pass},
            )
            self.assertEqual(resp.status_code, 200, f"Login failed for {user_dict['username']}")
        return resp

    # -----------------------------------------------------------------------
    # Requirement 1: Unauthenticated Access (HTTP 401)
    # -----------------------------------------------------------------------
    def test_01_unauthenticated_request_returns_401(self):
        """Verify unauthenticated requests to /api/dashboard receive HTTP 401."""
        client = self.app.test_client()
        resp = client.get("/api/dashboard")
        self.assertEqual(resp.status_code, 401)
        data = resp.get_json()
        self.assertEqual(data.get("status"), "error")
        self.assertEqual(data.get("message"), "Authentication required.")

    # -----------------------------------------------------------------------
    # Requirement 2: Admin Dashboard Access & Data
    # -----------------------------------------------------------------------
    def test_02_admin_dashboard_access_and_structure(self):
        """Verify admin receives the full administrative dashboard overview."""
        client = self.app.test_client()
        admin_fixture = {
            "user_id": 1,
            "username": "admin_master",
            "role": "admin",
            "judge_id": None,
        }
        self._login_as(client, admin_fixture)

        resp = client.get("/api/dashboard")
        self.assertEqual(resp.status_code, 200)
        payload = resp.get_json()

        self.assertEqual(payload.get("status"), "success")
        self.assertEqual(payload.get("role"), "admin")

        data = payload.get("data", {})
        # Total cases
        self.assertIn("total_cases", data)
        self.assertIsInstance(data["total_cases"], int)
        self.assertGreaterEqual(data["total_cases"], 0)

        # Cases grouped by status
        self.assertIn("cases_by_status", data)
        self.assertIsInstance(data["cases_by_status"], dict)
        for expected_status in ("Filed", "Active", "Adjourned", "Disposed", "Closed"):
            self.assertIn(expected_status, data["cases_by_status"])
            self.assertIsInstance(data["cases_by_status"][expected_status], int)

        # Total judges and active judges
        self.assertIn("judges", data)
        self.assertIn("total", data["judges"])
        self.assertIn("active", data["judges"])
        self.assertIsInstance(data["judges"]["total"], int)
        self.assertIsInstance(data["judges"]["active"], int)
        self.assertGreaterEqual(data["judges"]["total"], data["judges"]["active"])

        # Total parties
        self.assertIn("total_parties", data)
        self.assertIsInstance(data["total_parties"], int)

        # Upcoming hearings
        self.assertIn("upcoming_hearings", data)
        self.assertIsInstance(data["upcoming_hearings"], list)
        if data["upcoming_hearings"]:
            first_hearing = data["upcoming_hearings"][0]
            for key in ("hearing_id", "case_id", "case_number", "case_status", "judge_name", "start_time", "end_time"):
                self.assertIn(key, first_hearing)

        # Recent audit activity (admin only)
        self.assertIn("recent_audit_activity", data)
        self.assertIsInstance(data["recent_audit_activity"], list)
        if data["recent_audit_activity"]:
            first_log = data["recent_audit_activity"][0]
            for key in ("log_id", "action_type", "changed_at", "username"):
                self.assertIn(key, first_log)

    # -----------------------------------------------------------------------
    # Requirement 3: Clerk Dashboard Access & Data Restrictions
    # -----------------------------------------------------------------------
    def test_03_clerk_dashboard_access_and_structure(self):
        """Verify clerk receives operational dashboard data."""
        client = self.app.test_client()
        clerk_fixture = {
            "user_id": 101,
            "username": "clerk_operations",
            "role": "clerk",
            "judge_id": None,
        }
        self._login_as(client, clerk_fixture)

        # Mock get_user_by_id to revalidate clerk user
        with patch("backend.dashboard.routes.get_user_by_id", return_value=clerk_fixture):
            resp = client.get("/api/dashboard")

        self.assertEqual(resp.status_code, 200)
        payload = resp.get_json()

        self.assertEqual(payload.get("status"), "success")
        self.assertEqual(payload.get("role"), "clerk")

        data = payload.get("data", {})
        # Total cases & cases by status
        self.assertIn("total_cases", data)
        self.assertIn("cases_by_status", data)

        # Recent cases
        self.assertIn("recent_cases", data)
        self.assertIsInstance(data["recent_cases"], list)
        if data["recent_cases"]:
            first_case = data["recent_cases"][0]
            for key in ("case_id", "case_number", "status", "filing_date"):
                self.assertIn(key, first_case)

        # Upcoming hearings
        self.assertIn("upcoming_hearings", data)
        self.assertIsInstance(data["upcoming_hearings"], list)

        # Recent filings
        self.assertIn("recent_filings", data)
        self.assertIsInstance(data["recent_filings"], list)

        # Operational summary
        self.assertIn("operational_summary", data)
        self.assertIsInstance(data["operational_summary"], dict)
        self.assertIn("total_cases", data["operational_summary"])
        self.assertIn("active_cases", data["operational_summary"])
        self.assertIn("upcoming_hearings_count", data["operational_summary"])
        self.assertIn("recent_filings_count", data["operational_summary"])

    def test_04_clerk_dashboard_strictly_omits_admin_data(self):
        """Verify clerk dashboard strictly omits admin user management and audit logs."""
        client = self.app.test_client()
        clerk_fixture = {
            "user_id": 102,
            "username": "clerk_restricted",
            "role": "clerk",
            "judge_id": None,
        }
        self._login_as(client, clerk_fixture)

        with patch("backend.dashboard.routes.get_user_by_id", return_value=clerk_fixture):
            resp = client.get("/api/dashboard")

        self.assertEqual(resp.status_code, 200)
        data = resp.get_json().get("data", {})

        # Critical restriction assertions
        self.assertNotIn("judges", data, "Clerk must NOT receive user-management judges data.")
        self.assertNotIn("recent_audit_activity", data, "Clerk must NOT receive audit logs.")
        self.assertNotIn("audit_logs", data, "Clerk must NOT receive audit logs.")
        self.assertNotIn("total_parties", data, "Clerk must NOT receive admin parties overview.")

    # -----------------------------------------------------------------------
    # Requirement 4: Judge Dashboard Access & Hearing Isolation
    # -----------------------------------------------------------------------
    def test_05_judge_dashboard_access_and_structure(self):
        """Verify judge receives only assigned hearings and case details."""
        client = self.app.test_client()
        active_judge_fixture = {
            "user_id": 2,
            "username": "judge_active",
            "role": "judge",
            "judge_id": "22c38658-774b-494f-ae97-01c82dc88422",
        }
        self._login_as(client, active_judge_fixture)

        resp = client.get("/api/dashboard")
        self.assertEqual(resp.status_code, 200)
        payload = resp.get_json()

        self.assertEqual(payload.get("status"), "success")
        self.assertEqual(payload.get("role"), "judge")

        data = payload.get("data", {})
        self.assertEqual(data.get("judge_id"), "22c38658-774b-494f-ae97-01c82dc88422")
        self.assertIn("upcoming_hearings", data)
        self.assertIsInstance(data["upcoming_hearings"], list)
        self.assertEqual(data.get("assigned_hearings_count"), len(data["upcoming_hearings"]))

        if data["upcoming_hearings"]:
            first_hearing = data["upcoming_hearings"][0]
            for key in ("hearing_id", "case_id", "case_number", "case_status", "filing_date", "start_time", "end_time"):
                self.assertIn(key, first_hearing)

        # Judge must NOT receive system-wide metrics or administrative/clerk lists
        self.assertNotIn("total_cases", data)
        self.assertNotIn("cases_by_status", data)
        self.assertNotIn("judges", data)
        self.assertNotIn("recent_cases", data)
        self.assertNotIn("recent_filings", data)
        self.assertNotIn("recent_audit_activity", data)

    def test_06_judge_isolation_judge_a_cannot_view_judge_b_hearings(self):
        """
        Verify strict isolation between judges:
          - Ensure Judge A and Judge B each have at least one upcoming hearing in the test fixtures.
          - Assert Judge A receives at least one hearing.
          - Assert Judge B receives at least one hearing.
          - Assert every returned hearing belongs to the authenticated judge.
          - Assert the two judges' hearing IDs do not overlap.
          - Ensure the test cannot pass merely because both result lists are empty.
        """
        client = self.app.test_client()
        judge_a_id = "22c38658-774b-494f-ae97-01c82dc88422"
        judge_b_id = "cfcaf53a-405d-490d-9b06-9753d5e9516d"

        # 1. Ensure Judge A and Judge B each have at least one upcoming hearing in test fixtures
        hearings_in_db_a = execute_read_query(
            "SELECT hearing_id, judge_id FROM hearings WHERE judge_id = %s AND start_time >= NOW();",
            params=(judge_a_id,),
            fetch_one=False,
            row_factory=dict_row,
        )
        hearings_in_db_b = execute_read_query(
            "SELECT hearing_id, judge_id FROM hearings WHERE judge_id = %s AND start_time >= NOW();",
            params=(judge_b_id,),
            fetch_one=False,
            row_factory=dict_row,
        )
        self.assertGreater(
            len(hearings_in_db_a or []),
            0,
            f"Test fixture requirement failure: Judge A ({judge_a_id}) must have upcoming hearings in DB.",
        )
        self.assertGreater(
            len(hearings_in_db_b or []),
            0,
            f"Test fixture requirement failure: Judge B ({judge_b_id}) must have upcoming hearings in DB.",
        )

        # 2. Fetch Judge A's dashboard
        judge_a_fixture = {
            "user_id": 2,
            "username": "judge_active",
            "role": "judge",
            "judge_id": judge_a_id,
        }
        self._login_as(client, judge_a_fixture)
        resp_a = client.get("/api/dashboard")
        self.assertEqual(resp_a.status_code, 200)
        data_a = resp_a.get_json().get("data", {})
        hearings_a = data_a.get("upcoming_hearings", [])

        # Assert Judge A receives at least one hearing (cannot pass if empty)
        self.assertGreater(
            len(hearings_a),
            0,
            "Judge A must receive at least one hearing (result list cannot be empty).",
        )
        hearing_ids_a = {h["hearing_id"] for h in hearings_a}

        # 3. Fetch Judge B's dashboard
        judge_b_fixture = {
            "user_id": 202,
            "username": "judge_vasudha",
            "role": "judge",
            "judge_id": judge_b_id,
        }
        client_b = self.app.test_client()
        self._login_as(client_b, judge_b_fixture)
        with patch("backend.dashboard.routes.get_user_by_id", return_value=judge_b_fixture):
            resp_b = client_b.get("/api/dashboard")
        self.assertEqual(resp_b.status_code, 200)
        data_b = resp_b.get_json().get("data", {})
        hearings_b = data_b.get("upcoming_hearings", [])

        # Assert Judge B receives at least one hearing (cannot pass if empty)
        self.assertGreater(
            len(hearings_b),
            0,
            "Judge B must receive at least one hearing (result list cannot be empty).",
        )
        hearing_ids_b = {h["hearing_id"] for h in hearings_b}

        # 4. Assert the two judges' hearing IDs do not overlap
        self.assertTrue(
            hearing_ids_a.isdisjoint(hearing_ids_b),
            f"Judge isolation failure: hearings of Judge A and Judge B must not intersect.",
        )

        # 5. Assert every returned hearing belongs to the authenticated judge
        for h in hearings_a:
            row = execute_read_query(
                "SELECT judge_id FROM hearings WHERE hearing_id = %s;",
                params=(h["hearing_id"],),
                fetch_one=True,
            )
            self.assertIsNotNone(row, f"Hearing {h['hearing_id']} not found in database.")
            self.assertEqual(
                str(row[0]),
                judge_a_id,
                f"Hearing {h['hearing_id']} does not belong to authenticated Judge A ({judge_a_id}).",
            )

        for h in hearings_b:
            row = execute_read_query(
                "SELECT judge_id FROM hearings WHERE hearing_id = %s;",
                params=(h["hearing_id"],),
                fetch_one=True,
            )
            self.assertIsNotNone(row, f"Hearing {h['hearing_id']} not found in database.")
            self.assertEqual(
                str(row[0]),
                judge_b_id,
                f"Hearing {h['hearing_id']} does not belong to authenticated Judge B ({judge_b_id}).",
            )

    # -----------------------------------------------------------------------
    # Requirement 5: Inactive Account & Role Validation (HTTP 403)
    # -----------------------------------------------------------------------
    def test_07_inactive_judge_account_returns_403(self):
        """Verify inactive judge account (user_id: 3) receives 403 and session is terminated."""
        client = self.app.test_client()
        inactive_fixture = {
            "user_id": 3,
            "username": "judge_inactive",
            "role": "judge",
            "judge_id": "00000000-0000-0000-0000-000000000001",
        }
        # Establish session directly
        self._login_as(client, inactive_fixture)

        # GET /api/dashboard should revalidate against DB -> get_user_by_id(3) returns None
        resp = client.get("/api/dashboard")
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(resp.get_json().get("status"), "error")

        # Subsequent call must be 401 because session was cleared
        subsequent_resp = client.get("/api/dashboard")
        self.assertEqual(subsequent_resp.status_code, 401)

    def test_08_nonexistent_user_session_returns_403(self):
        """Verify session referencing a deleted/nonexistent user receives 403."""
        client = self.app.test_client()
        ghost_fixture = {
            "user_id": 999999,
            "username": "ghost_user",
            "role": "admin",
            "judge_id": None,
        }
        self._login_as(client, ghost_fixture)

        resp = client.get("/api/dashboard")
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(resp.get_json().get("status"), "error")

    def test_09_unauthorized_or_unknown_role_returns_403(self):
        """Verify authenticated user with an unauthorized role receives 403."""
        client = self.app.test_client()
        bystander_fixture = {
            "user_id": 303,
            "username": "public_observer",
            "role": "public",
            "judge_id": None,
        }
        self._login_as(client, bystander_fixture)

        with patch("backend.dashboard.routes.get_user_by_id", return_value=bystander_fixture):
            resp = client.get("/api/dashboard")

        self.assertEqual(resp.status_code, 403)
        data = resp.get_json()
        self.assertEqual(data.get("status"), "error")
        self.assertIn("not authorized", data.get("message", "").lower())

    def test_10_judge_without_linked_judge_id_returns_403(self):
        """Verify judge account missing linked judge_id receives 403."""
        client = self.app.test_client()
        corrupt_judge_fixture = {
            "user_id": 404,
            "username": "unlinked_judge",
            "role": "judge",
            "judge_id": None,
        }
        self._login_as(client, corrupt_judge_fixture)

        with patch("backend.dashboard.routes.get_user_by_id", return_value=corrupt_judge_fixture):
            resp = client.get("/api/dashboard")

        self.assertEqual(resp.status_code, 403)
        self.assertEqual(resp.get_json().get("status"), "error")

    # -----------------------------------------------------------------------
    # Requirement 6: Resistance to Client Identity Spoofing
    # -----------------------------------------------------------------------
    def test_11_client_cannot_override_role_via_query_parameters(self):
        """Verify clerk cannot escalate privilege by passing ?role=admin in query string."""
        client = self.app.test_client()
        clerk_fixture = {
            "user_id": 103,
            "username": "clerk_attacker",
            "role": "clerk",
            "judge_id": None,
        }
        self._login_as(client, clerk_fixture)

        with patch("backend.dashboard.routes.get_user_by_id", return_value=clerk_fixture):
            resp = client.get("/api/dashboard?role=admin&user_id=1&judge_id=22c38658-774b-494f-ae97-01c82dc88422")

        self.assertEqual(resp.status_code, 200)
        payload = resp.get_json()
        self.assertEqual(payload.get("role"), "clerk", "Role parameter must be strictly ignored.")
        self.assertNotIn("judges", payload.get("data", {}))
        self.assertNotIn("recent_audit_activity", payload.get("data", {}))

    def test_12_client_cannot_override_judge_id_via_query_parameters(self):
        """Verify Judge A cannot view Judge B's hearings by passing ?judge_id= in query string."""
        client = self.app.test_client()
        judge_a_fixture = {
            "user_id": 2,
            "username": "judge_active",
            "role": "judge",
            "judge_id": "22c38658-774b-494f-ae97-01c82dc88422",
        }
        self._login_as(client, judge_a_fixture)

        # Attacker tries to pass Judge B's ID in query params
        judge_b_id = "cfcaf53a-405d-490d-9b06-9753d5e9516d"
        resp = client.get(f"/api/dashboard?judge_id={judge_b_id}&role=admin")

        self.assertEqual(resp.status_code, 200)
        payload = resp.get_json()
        self.assertEqual(payload.get("role"), "judge")
        self.assertEqual(payload.get("data", {}).get("judge_id"), "22c38658-774b-494f-ae97-01c82dc88422")

    def test_13_client_cannot_override_identity_via_headers_or_body(self):
        """Verify role and identity cannot be spoofed via headers or JSON request body."""
        client = self.app.test_client()
        clerk_fixture = {
            "user_id": 104,
            "username": "clerk_header_spoof",
            "role": "clerk",
            "judge_id": None,
        }
        self._login_as(client, clerk_fixture)

        with patch("backend.dashboard.routes.get_user_by_id", return_value=clerk_fixture):
            resp = client.get(
                "/api/dashboard",
                headers={
                    "X-Role": "admin",
                    "X-User-Id": "1",
                    "X-Judge-Id": "22c38658-774b-494f-ae97-01c82dc88422",
                },
                json={"role": "admin", "user_id": 1},
            )

        self.assertEqual(resp.status_code, 200)
        payload = resp.get_json()
        self.assertEqual(payload.get("role"), "clerk")
        self.assertNotIn("judges", payload.get("data", {}))

    # -----------------------------------------------------------------------
    # Requirement 7: Edge Cases - Empty Tables & NULL Handling
    # -----------------------------------------------------------------------
    def test_14_empty_database_tables_handled_safely(self):
        """Verify empty database tables do not cause 500 errors or unhandled exceptions."""
        with patch("backend.dashboard.services.execute_read_query", return_value=None):
            # Test Admin with empty DB
            admin_data = get_admin_dashboard_data()
            self.assertEqual(admin_data["total_cases"], 0)
            self.assertEqual(admin_data["judges"], {"total": 0, "active": 0})
            self.assertEqual(admin_data["total_parties"], 0)
            self.assertEqual(admin_data["upcoming_hearings"], [])
            self.assertEqual(admin_data["recent_audit_activity"], [])
            for st in ("Filed", "Active", "Adjourned", "Disposed", "Closed"):
                self.assertEqual(admin_data["cases_by_status"][st], 0)

            # Test Clerk with empty DB
            clerk_data = get_clerk_dashboard_data()
            self.assertEqual(clerk_data["total_cases"], 0)
            self.assertEqual(clerk_data["recent_cases"], [])
            self.assertEqual(clerk_data["upcoming_hearings"], [])
            self.assertEqual(clerk_data["recent_filings"], [])
            self.assertEqual(clerk_data["operational_summary"]["total_cases"], 0)
            self.assertEqual(clerk_data["operational_summary"]["active_cases"], 0)
            self.assertEqual(clerk_data["operational_summary"]["upcoming_hearings_count"], 0)
            self.assertEqual(clerk_data["operational_summary"]["recent_filings_count"], 0)

            # Test Judge with empty DB
            judge_data = get_judge_dashboard_data("22c38658-774b-494f-ae97-01c82dc88422")
            self.assertEqual(judge_data["upcoming_hearings"], [])
            self.assertEqual(judge_data["assigned_hearings_count"], 0)

    # -----------------------------------------------------------------------
    # Requirement 8: Database Error Handling (HTTP 500 Safe Failure)
    # -----------------------------------------------------------------------
    def test_15_database_error_fails_safely_with_500(self):
        """Verify unexpected database failures return safe generic HTTP 500 without leaking details."""
        client = self.app.test_client()
        admin_fixture = {
            "user_id": 1,
            "username": "admin_master",
            "role": "admin",
            "judge_id": None,
        }
        self._login_as(client, admin_fixture)

        with patch("backend.dashboard.routes.get_admin_dashboard_data", side_effect=psycopg.OperationalError("Simulated DB failure")):
            resp = client.get("/api/dashboard")

        self.assertEqual(resp.status_code, 500)
        data = resp.get_json()
        self.assertEqual(data.get("status"), "error")
        self.assertEqual(data.get("message"), "Dashboard service unavailable. Check server logs.")
        # Ensure no SQL or connection string leakage
        self.assertNotIn("Simulated DB failure", data.get("message", ""))
        self.assertNotIn("court_case", data.get("message", ""))


if __name__ == "__main__":
    unittest.main()

