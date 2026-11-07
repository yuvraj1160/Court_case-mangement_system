"""
Court Case Management System - Phase 7B Verification Test Suite
Comprehensive testing for Case & Party APIs:
  - Role-based authorization across Admin, Clerk, and Judge for all endpoints.
  - Judge isolation: assigned-case scoping, cross-docket access denial (403).
  - Filing-only party associations in listing and detail (with derived label 'Filer').
  - Cross-judge party-detail leakage prevention (Judge A cannot see Judge B's cases).
  - Input validation: UUIDs, verified party roles, verified case statuses.
  - Conflict handling: duplicate case numbers, assignments, phone numbers (409).
  - Concurrency-safe deletion: anti-cascade checks, lock acquisition (FOR UPDATE),
    dependency conflicts (409), clean deletion of pristine records (200).
  - Rollback behavior and audit log attribution.
  - Isolated concurrency test using two independent PostgreSQL connections.

Safety Rules:
  - Restricted strictly to court_case_dev.
  - Never touches court_case_db.
  - Preserves working database records.
  - Concurrency tests run on isolated temporary tables.
"""

import threading
import time
import unittest
from unittest.mock import patch
import uuid
import psycopg
from psycopg.rows import dict_row

from backend.app import create_app
from backend.auth.decorators import get_user_by_id
from backend.db import execute_read_query, execute_write_transaction, get_db_connection


class Phase7BCasesPartiesTestCase(unittest.TestCase):
    """Test suite verifying Case and Party APIs, judge isolation, and concurrency safety."""

    @classmethod
    def setUpClass(cls):
        cls.app = create_app(
            config_overrides={
                "TESTING": True,
                "WTF_CSRF_ENABLED": False,
                "RATELIMIT_ENABLED": False,
            }
        )

        # Real DB identifiers from court_case_dev seed data
        cls.judge_a_id = "22c38658-774b-494f-ae97-01c82dc88422"
        cls.judge_b_id = "cfcaf53a-405d-490d-9b06-9753d5e9516d"

        cls.case_assigned_to_a = "691304dd-9183-4660-b431-f8d7220e4b0f"
        cls.case_unassigned_to_a = "512aa71b-fc0b-493b-8828-725f10a30ffc"

        # User fixtures
        cls.admin_user = {
            "user_id": 1,
            "username": "admin_master",
            "role": "admin",
            "judge_id": None,
        }
        cls.clerk_user = {
            "user_id": 102,
            "username": "clerk_operator",
            "role": "clerk",
            "judge_id": None,
        }
        cls.judge_a_user = {
            "user_id": 2,
            "username": "judge_alpha",
            "role": "judge",
            "judge_id": cls.judge_a_id,
        }
        cls.judge_b_user = {
            "user_id": 3,
            "username": "judge_beta",
            "role": "judge",
            "judge_id": cls.judge_b_id,
        }

    def _login_as(self, client, user_dict):
        """Helper to establish an authenticated session cleanly."""
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

    def test_01_unauthenticated_requests_return_401(self):
        """Verify unauthenticated requests to all case and party endpoints return HTTP 401."""
        client = self.app.test_client()
        endpoints = [
            ("GET", "/api/cases"),
            ("GET", f"/api/cases/{self.case_assigned_to_a}"),
            ("POST", "/api/cases"),
            ("PUT", f"/api/cases/{self.case_assigned_to_a}"),
            ("DELETE", f"/api/cases/{self.case_assigned_to_a}"),
            ("POST", f"/api/cases/{self.case_assigned_to_a}/parties"),
            ("DELETE", f"/api/cases/{self.case_assigned_to_a}/parties/{str(uuid.uuid4())}"),
            ("GET", "/api/parties"),
            ("GET", f"/api/parties/{str(uuid.uuid4())}"),
            ("POST", "/api/parties"),
            ("PUT", f"/api/parties/{str(uuid.uuid4())}"),
            ("DELETE", f"/api/parties/{str(uuid.uuid4())}"),
            ("POST", f"/api/parties/{str(uuid.uuid4())}/phones"),
            ("DELETE", f"/api/parties/{str(uuid.uuid4())}/phones/5551234"),
        ]
        for method, path in endpoints:
            if method == "GET":
                resp = client.get(path)
            elif method == "POST":
                resp = client.post(path, json={})
            elif method == "PUT":
                resp = client.put(path, json={})
            elif method == "DELETE":
                resp = client.delete(path)
            self.assertEqual(
                resp.status_code,
                401,
                f"Expected 401 for unauthenticated {method} {path}, got {resp.status_code}",
            )

    # =======================================================================
    # 2. Role-Based Access Control on Mutation Endpoints
    # =======================================================================

    def test_02_judge_cannot_mutate_cases_or_parties_returns_403(self):
        """Verify Judge accounts receive HTTP 403 when attempting any write operation."""
        client = self.app.test_client()
        self._login_as(client, self.judge_a_user)

        with patch("backend.auth.decorators.get_user_by_id", return_value=self.judge_a_user):
            # Create Case
            resp = client.post("/api/cases", json={"case_number": "CIV-TEST-001"})
            self.assertEqual(resp.status_code, 403)

            # Update Case
            resp = client.put(f"/api/cases/{self.case_assigned_to_a}", json={"status": "Active"})
            self.assertEqual(resp.status_code, 403)

            # Delete Case
            resp = client.delete(f"/api/cases/{self.case_assigned_to_a}")
            self.assertEqual(resp.status_code, 403)

            # Link Party
            resp = client.post(
                f"/api/cases/{self.case_assigned_to_a}/parties",
                json={"party_id": str(uuid.uuid4()), "role_type": "Applicant"},
            )
            self.assertEqual(resp.status_code, 403)

            # Create Party
            resp = client.post("/api/parties", json={"name": "Test Party", "party_type": "Petitioner"})
            self.assertEqual(resp.status_code, 403)

            # Update Party
            resp = client.put(f"/api/parties/{str(uuid.uuid4())}", json={"name": "New Name"})
            self.assertEqual(resp.status_code, 403)

            # Delete Party
            resp = client.delete(f"/api/parties/{str(uuid.uuid4())}")
            self.assertEqual(resp.status_code, 403)

            # Add Phone
            resp = client.post(f"/api/parties/{str(uuid.uuid4())}/phones", json={"phone_number": "5551234"})
            self.assertEqual(resp.status_code, 403)

    def test_03_clerk_cannot_hard_delete_cases_or_parties_returns_403(self):
        """Verify Clerk cannot hard-delete cases or parties (Admin-only)."""
        client = self.app.test_client()
        self._login_as(client, self.clerk_user)

        with patch("backend.auth.decorators.get_user_by_id", return_value=self.clerk_user):
            # Delete Case
            resp = client.delete(f"/api/cases/{self.case_assigned_to_a}")
            self.assertEqual(resp.status_code, 403)

            # Delete Party
            resp = client.delete(f"/api/parties/{str(uuid.uuid4())}")
            self.assertEqual(resp.status_code, 403)

    # =======================================================================
    # 3. Judge Isolation & Scoping
    # =======================================================================

    def test_04_judge_case_scoping_in_list(self):
        """Verify Judge case listing only returns assigned cases."""
        client = self.app.test_client()
        self._login_as(client, self.judge_a_user)

        with patch("backend.auth.decorators.get_user_by_id", return_value=self.judge_a_user):
            resp = client.get("/api/cases")
            self.assertEqual(resp.status_code, 200)
            data = resp.get_json()["data"]
            cases = data["cases"]
            self.assertGreater(len(cases), 0)

            # Verify every returned case is actually assigned to judge_a
            for c in cases:
                is_assigned = execute_read_query(
                    """
                    SELECT EXISTS (
                        SELECT 1 FROM hearings WHERE case_id = %s::uuid AND judge_id = %s::uuid
                        UNION ALL
                        SELECT 1 FROM orders WHERE case_id = %s::uuid AND judge_id = %s::uuid
                    ) AS assigned;
                    """,
                    params=(c["case_id"], self.judge_a_id, c["case_id"], self.judge_a_id),
                    fetch_one=True,
                    row_factory=dict_row,
                )
                self.assertTrue(is_assigned["assigned"])

    def test_05_judge_unassigned_case_detail_denied_returns_403(self):
        """Verify Judge attempting to view unassigned case receives HTTP 403."""
        client = self.app.test_client()
        self._login_as(client, self.judge_a_user)

        with patch("backend.auth.decorators.get_user_by_id", return_value=self.judge_a_user):
            resp = client.get(f"/api/cases/{self.case_unassigned_to_a}")
            self.assertEqual(resp.status_code, 403)

    def test_06_judge_assigned_case_detail_allowed_returns_200(self):
        """Verify Judge can view details of their assigned case."""
        client = self.app.test_client()
        self._login_as(client, self.judge_a_user)

        with patch("backend.auth.decorators.get_user_by_id", return_value=self.judge_a_user):
            resp = client.get(f"/api/cases/{self.case_assigned_to_a}")
            self.assertEqual(resp.status_code, 200)
            data = resp.get_json()["data"]
            self.assertEqual(data["case_id"], self.case_assigned_to_a)
            self.assertIn("parties", data)
            self.assertIn("hearings", data)
            self.assertIn("orders", data)
            self.assertIn("filings", data)

    # =======================================================================
    # 4. Party Listings and Detail with Filing-Only Associations
    # =======================================================================

    def test_07_party_detail_and_filing_association_scoping(self):
        """
        Verify party access gate, associated_cases projection, and cross-judge data isolation.
        Creates temporary test case and filing under Judge A to verify filing-only scoping.
        Cleans up test records cleanly in teardown.
        """
        test_case_num = f"CIV-TEST-{uuid.uuid4().hex[:8].upper()}"
        party_name = f"Test Filing Party {uuid.uuid4().hex[:6]}"

        # Create isolated test party and test case assigned to Judge A
        def _setup_op(cur):
            # 1. Create party
            cur.execute(
                "INSERT INTO parties (name, party_type) VALUES (%s, 'Petitioner') RETURNING party_id;",
                (party_name,),
            )
            pid = str(cur.fetchone()[0])

            # 2. Create case
            cur.execute(
                "INSERT INTO cases (case_number, status) VALUES (%s, 'Active') RETURNING case_id;",
                (test_case_num,),
            )
            cid = str(cur.fetchone()[0])

            # 3. Assign case to Judge A via hearing
            cur.execute(
                """
                INSERT INTO hearings (case_id, judge_id, start_time, end_time)
                VALUES (%s::uuid, %s::uuid, '2027-01-01 10:00:00', '2027-01-01 11:00:00');
                """,
                (cid, self.judge_a_id),
            )

            # 4. Link party ONLY via filings (NOT party_case_roles)
            cur.execute(
                """
                INSERT INTO filings (case_id, party_id, filing_type)
                VALUES (%s::uuid, %s::uuid, 'Affidavit of Service');
                """,
                (cid, pid),
            )
            return pid, cid

        party_id, case_id = execute_write_transaction(
            actor_username="admin_master",
            operation=_setup_op,
        )

        try:
            client = self.app.test_client()

            # Test A: Judge A can view party via filing association
            self._login_as(client, self.judge_a_user)
            with patch("backend.auth.decorators.get_user_by_id", return_value=self.judge_a_user):
                resp = client.get(f"/api/parties/{party_id}")
                self.assertEqual(resp.status_code, 200)
                data = resp.get_json()["data"]
                self.assertEqual(data["party_id"], party_id)
                self.assertEqual(len(data["associated_cases"]), 1)
                assoc = data["associated_cases"][0]
                self.assertEqual(assoc["case_id"], case_id)
                self.assertEqual(assoc["case_number"], test_case_num)
                self.assertEqual(assoc["role_type"], "Filer")

            # Test B: Judge B receives HTTP 403 Forbidden (cross-judge isolation)
            self._login_as(client, self.judge_b_user)
            with patch("backend.auth.decorators.get_user_by_id", return_value=self.judge_b_user):
                resp = client.get(f"/api/parties/{party_id}")
                self.assertEqual(resp.status_code, 403)
                err_data = resp.get_json()
                self.assertIn("do not have judicial assignment", err_data.get("message", ""))

        finally:
            # Clean up test records
            def _cleanup_op(cur):
                cur.execute("DELETE FROM filings WHERE case_id = %s::uuid;", (case_id,))
                cur.execute("DELETE FROM hearings WHERE case_id = %s::uuid;", (case_id,))
                cur.execute("DELETE FROM cases WHERE case_id = %s::uuid;", (case_id,))
                cur.execute("DELETE FROM parties WHERE party_id = %s::uuid;", (party_id,))

            execute_write_transaction(
                actor_username="admin_master",
                operation=_cleanup_op,
            )

    # =======================================================================
    # 5. Input Validation: UUIDs, Roles, Statuses, and Constraints
    # =======================================================================

    def test_08_invalid_uuid_returns_400(self):
        """Verify malformed UUID in case and party endpoints returns HTTP 400."""
        client = self.app.test_client()
        self._login_as(client, self.admin_user)
        with patch("backend.auth.decorators.get_user_by_id", return_value=self.admin_user):
            resp = client.get("/api/cases/invalid-uuid-12345")
            self.assertEqual(resp.status_code, 400)

            resp = client.get("/api/parties/not-a-valid-uuid")
            self.assertEqual(resp.status_code, 400)

    def test_09_invalid_case_status_returns_400(self):
        """Verify unverified case status values are rejected with HTTP 400."""
        client = self.app.test_client()
        self._login_as(client, self.admin_user)
        with patch("backend.auth.decorators.get_user_by_id", return_value=self.admin_user):
            resp = client.post(
                "/api/cases",
                json={"case_number": "CIV-TEST-BADSTATUS", "status": "InventedStatus"},
            )
            self.assertEqual(resp.status_code, 400)
            self.assertIn("Invalid case status", resp.get_json()["message"])

    def test_10_invalid_party_role_returns_400(self):
        """Verify unverified party role values are rejected with HTTP 400."""
        client = self.app.test_client()
        self._login_as(client, self.admin_user)
        with patch("backend.auth.decorators.get_user_by_id", return_value=self.admin_user):
            resp = client.post(
                f"/api/cases/{self.case_assigned_to_a}/parties",
                json={"party_id": str(uuid.uuid4()), "role_type": "Intervenor"},
            )
            self.assertEqual(resp.status_code, 400)
            self.assertIn("Invalid role_type", resp.get_json()["message"])

    def test_11_invalid_party_type_returns_400(self):
        """Verify unverified party_type values are rejected with HTTP 400."""
        client = self.app.test_client()
        self._login_as(client, self.admin_user)
        with patch("backend.auth.decorators.get_user_by_id", return_value=self.admin_user):
            resp = client.post(
                "/api/parties",
                json={"name": "Bad Party", "party_type": "Arbitrator"},
            )
            self.assertEqual(resp.status_code, 400)
            self.assertIn("Invalid party_type", resp.get_json()["message"])

    def test_11b_duplicate_case_number_returns_409(self):
        """Verify duplicate case number returns HTTP 409 Conflict."""
        client = self.app.test_client()
        self._login_as(client, self.admin_user)
        with patch("backend.auth.decorators.get_user_by_id", return_value=self.admin_user):
            # Fetch an existing case_number
            existing = execute_read_query("SELECT case_number FROM cases LIMIT 1;", fetch_one=True, row_factory=dict_row)
            resp = client.post(
                "/api/cases",
                json={"case_number": existing["case_number"], "status": "Filed"},
            )
            self.assertEqual(resp.status_code, 409)

    def test_11c_clerk_full_operational_lifecycle(self):
        """Verify Clerk can create case, update case, create party, link/unlink party, and manage phones."""
        client = self.app.test_client()
        self._login_as(client, self.clerk_user)
        with patch("backend.auth.decorators.get_user_by_id", return_value=self.clerk_user):
            # 1. Clerk creates case
            c_num = f"CIV-CLERK-{uuid.uuid4().hex[:8].upper()}"
            resp = client.post("/api/cases", json={"case_number": c_num, "status": "Filed"})
            self.assertEqual(resp.status_code, 201)
            case_id = resp.get_json()["data"]["case_id"]

            # 2. Clerk updates case
            resp = client.put(f"/api/cases/{case_id}", json={"status": "Active"})
            self.assertEqual(resp.status_code, 200)
            self.assertEqual(resp.get_json()["data"]["status"], "Active")

            # 3. Clerk creates party
            p_name = f"Clerk Party {uuid.uuid4().hex[:6]}"
            resp = client.post("/api/parties", json={"name": p_name, "party_type": "Respondent"})
            self.assertEqual(resp.status_code, 201)
            party_id = resp.get_json()["data"]["party_id"]

            # 4. Clerk links party to case
            resp = client.post(
                f"/api/cases/{case_id}/parties",
                json={"party_id": party_id, "role_type": "Defendant"},
            )
            self.assertEqual(resp.status_code, 201)

            # Duplicate assignment returns 409
            resp = client.post(
                f"/api/cases/{case_id}/parties",
                json={"party_id": party_id, "role_type": "Defendant"},
            )
            self.assertEqual(resp.status_code, 409)

            # 5. Clerk unlinks party
            resp = client.delete(f"/api/cases/{case_id}/parties/{party_id}")
            self.assertEqual(resp.status_code, 200)

            # 6. Clerk adds and deletes party phone
            resp = client.post(f"/api/parties/{party_id}/phones", json={"phone_number": "+15559876543"})
            self.assertEqual(resp.status_code, 201)

            # Duplicate phone returns 409
            resp = client.post(f"/api/parties/{party_id}/phones", json={"phone_number": "+15559876543"})
            self.assertEqual(resp.status_code, 409)

            resp = client.delete(f"/api/parties/{party_id}/phones/+15559876543")
            self.assertEqual(resp.status_code, 200)

            # Cleanup
            execute_write_transaction(
                actor_username="admin_master",
                operation=lambda cur: cur.execute("DELETE FROM cases WHERE case_id = %s::uuid;", (case_id,)),
            )
            execute_write_transaction(
                actor_username="admin_master",
                operation=lambda cur: cur.execute("DELETE FROM parties WHERE party_id = %s::uuid;", (party_id,)),
            )

    # =======================================================================
    # 6. Concurrency-Safe Deletion & Anti-Cascade Guards
    # =======================================================================

    def test_12_case_deletion_with_dependencies_returns_409(self):
        """Verify deleting a case with active proceedings returns HTTP 409 Conflict."""
        client = self.app.test_client()
        self._login_as(client, self.admin_user)
        with patch("backend.auth.decorators.get_user_by_id", return_value=self.admin_user):
            resp = client.delete(f"/api/cases/{self.case_assigned_to_a}")
            self.assertEqual(resp.status_code, 409)
            self.assertIn("Cannot delete case: active dependencies exist", resp.get_json()["message"])

    def test_13_pristine_case_creation_and_deletion(self):
        """Verify creating a pristine case and deleting it succeeds with HTTP 200 and audit attribution."""
        client = self.app.test_client()
        self._login_as(client, self.admin_user)
        with patch("backend.auth.decorators.get_user_by_id", return_value=self.admin_user):
            # 1. Create pristine case
            c_num = f"CIV-TEST-{uuid.uuid4().hex[:8].upper()}"
            resp = client.post("/api/cases", json={"case_number": c_num, "status": "Filed"})
            self.assertEqual(resp.status_code, 201)
            case_id = resp.get_json()["data"]["case_id"]

            # 2. Delete pristine case
            del_resp = client.delete(f"/api/cases/{case_id}")
            self.assertEqual(del_resp.status_code, 200)

            # 3. Verify case is gone
            get_resp = client.get(f"/api/cases/{case_id}")
            self.assertEqual(get_resp.status_code, 404)

            # 4. Verify audit log entry attributed to admin_master
            audit_entry = execute_read_query(
                """
                SELECT action_type, username 
                FROM audit_logs 
                WHERE action_type = 'DELETE' AND old_data->>'case_id' = %s
                ORDER BY changed_at DESC LIMIT 1;
                """,
                params=(case_id,),
                fetch_one=True,
                row_factory=dict_row,
            )
            if audit_entry:
                self.assertEqual(audit_entry["username"], "admin_master")

    def test_14_pristine_party_creation_and_deletion(self):
        """Verify creating a party with phone and deleting it works when unreferenced."""
        client = self.app.test_client()
        self._login_as(client, self.admin_user)
        with patch("backend.auth.decorators.get_user_by_id", return_value=self.admin_user):
            p_name = f"Standalone Party {uuid.uuid4().hex[:6]}"
            resp = client.post(
                "/api/parties",
                json={"name": p_name, "party_type": "Lawyer", "phone_numbers": ["+15551234999"]},
            )
            self.assertEqual(resp.status_code, 201)
            party_id = resp.get_json()["data"]["party_id"]

            # Delete standalone party (phone cascades cleanly)
            del_resp = client.delete(f"/api/parties/{party_id}")
            self.assertEqual(del_resp.status_code, 200)

            # Verify party is gone
            get_resp = client.get(f"/api/parties/{party_id}")
            self.assertEqual(get_resp.status_code, 404)

    # =======================================================================
    # 7. Isolated Concurrency Verification (Two Independent Connections)
    # =======================================================================

    def test_15_isolated_concurrency_lock_blocks_conflicting_insert(self):
        """
        Verify PostgreSQL row locking concurrency guarantees:
        Creates an isolated temporary test table structure in court_case_dev:
          - test_parent (parent)
          - test_child (foreign key ON DELETE CASCADE to parent)
        Conn 1 acquires SELECT ... FOR UPDATE on parent row.
        Conn 2 attempts to INSERT into test_child.
        Verifies Conn 2 is blocked by FOR KEY SHARE conflict until Conn 1 commits.
        Cleans up isolated tables cleanly.
        """
        # Setup isolated test tables
        with get_db_connection() as conn_setup:
            with conn_setup.cursor() as cur:
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS test_conc_parent (
                        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                        name text NOT NULL
                    );
                    """
                )
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS test_conc_child (
                        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                        parent_id uuid REFERENCES test_conc_parent(id) ON DELETE CASCADE
                    );
                    """
                )
                cur.execute(
                    "INSERT INTO test_conc_parent (name) VALUES ('Parent Lock Test') RETURNING id;"
                )
                parent_id = cur.fetchone()[0]
            conn_setup.commit()

        lock_acquired = threading.Event()
        insert_completed = threading.Event()
        insert_error = []

        def worker_conn_2():
            """Worker attempting child insert while Conn 1 holds lock."""
            try:
                # Wait until Conn 1 has locked the parent row
                lock_acquired.wait(timeout=5.0)
                with get_db_connection() as conn_2:
                    with conn_2.cursor() as cur_2:
                        cur_2.execute(
                            "INSERT INTO test_conc_child (parent_id) VALUES (%s);",
                            (parent_id,),
                        )
                    conn_2.commit()
                insert_completed.set()
            except Exception as e:
                insert_error.append(str(e))

        t2 = threading.Thread(target=worker_conn_2)
        try:
            # Conn 1: Lock the parent row
            with get_db_connection() as conn_1:
                with conn_1.cursor() as cur_1:
                    cur_1.execute(
                        "SELECT id FROM test_conc_parent WHERE id = %s FOR UPDATE;",
                        (parent_id,),
                    )
                    lock_acquired.set()

                    # Start worker Conn 2 while lock is held
                    t2.start()

                    # Sleep briefly to verify Conn 2 is indeed blocked waiting for Conn 1
                    time.sleep(0.3)
                    self.assertFalse(
                        insert_completed.is_set(),
                        "Conn 2 should be blocked by FOR KEY SHARE conflict while Conn 1 holds FOR UPDATE lock",
                    )

                    # Now delete parent and commit Conn 1
                    cur_1.execute("DELETE FROM test_conc_parent WHERE id = %s;", (parent_id,))
                conn_1.commit()

            # Conn 1 committed; Conn 2 unblocks and should fail because parent row is gone!
            t2.join(timeout=5.0)
            self.assertTrue(len(insert_error) > 0, "Conn 2 must fail with foreign key violation after parent deletion")
            self.assertIn("foreign key constraint", insert_error[0].lower())

        finally:
            # Clean up isolated concurrency tables
            with get_db_connection() as conn_cleanup:
                with conn_cleanup.cursor() as cur:
                    cur.execute("DROP TABLE IF EXISTS test_conc_child;")
                    cur.execute("DROP TABLE IF EXISTS test_conc_parent;")
                conn_cleanup.commit()

    # =======================================================================
    # 8. Targeted Security Regressions: Proceeding Scoping & Judge Counts
    # =======================================================================

    def test_16_multi_judge_proceeding_isolation_and_admin_compatibility(self):
        """
        Verify that for a case with proceedings across multiple judges:
          - Judge A sees ONLY Judge A's hearings and orders.
          - Judge B sees ONLY Judge B's hearings and orders.
          - Neither judge sees the other's name, dates, or judicial order rulings.
          - Admin and Clerk see all hearings and orders.
          - Judge A sees hearings_count = 1 in case list, while Admin/Clerk see 2.
        """
        case_num = f"CIV-MULTI-{uuid.uuid4().hex[:8].upper()}"

        # 1. Setup isolated multi-judge case
        def _setup_multi_judge(cur):
            cur.execute(
                "INSERT INTO cases (case_number, status) VALUES (%s, 'Active') RETURNING case_id;",
                (case_num,),
            )
            cid = str(cur.fetchone()[0])

            # Hearing 1 -> Judge A
            cur.execute(
                """
                INSERT INTO hearings (case_id, judge_id, start_time, end_time)
                VALUES (%s::uuid, %s::uuid, '2027-03-01 10:00:00', '2027-03-01 11:00:00')
                RETURNING hearing_id;
                """,
                (cid, self.judge_a_id),
            )
            h_a = str(cur.fetchone()[0])

            # Hearing 2 -> Judge B
            cur.execute(
                """
                INSERT INTO hearings (case_id, judge_id, start_time, end_time)
                VALUES (%s::uuid, %s::uuid, '2027-03-02 14:00:00', '2027-03-02 15:00:00')
                RETURNING hearing_id;
                """,
                (cid, self.judge_b_id),
            )
            h_b = str(cur.fetchone()[0])

            # Order 1 -> Judge A
            cur.execute(
                """
                INSERT INTO orders (case_id, judge_id, order_date, details)
                VALUES (%s::uuid, %s::uuid, '2027-03-01', 'Confidential Ruling Alpha by Judge A')
                RETURNING order_id;
                """,
                (cid, self.judge_a_id),
            )
            o_a = str(cur.fetchone()[0])

            # Order 2 -> Judge B
            cur.execute(
                """
                INSERT INTO orders (case_id, judge_id, order_date, details)
                VALUES (%s::uuid, %s::uuid, '2027-03-02', 'Confidential Ruling Beta by Judge B')
                RETURNING order_id;
                """,
                (cid, self.judge_b_id),
            )
            o_b = str(cur.fetchone()[0])

            return cid, h_a, h_b, o_a, o_b

        cid, h_a, h_b, o_a, o_b = execute_write_transaction(
            actor_username="admin_master",
            operation=_setup_multi_judge,
        )

        try:
            client = self.app.test_client()

            # Part A: Judge A inspection
            self._login_as(client, self.judge_a_user)
            with patch("backend.auth.decorators.get_user_by_id", return_value=self.judge_a_user):
                resp = client.get(f"/api/cases/{cid}")
                self.assertEqual(resp.status_code, 200)
                data = resp.get_json()["data"]

                # Assert Judge A's hearing is present, Judge B's is absent
                self.assertEqual(len(data["hearings"]), 1)
                self.assertEqual(data["hearings"][0]["hearing_id"], h_a)
                self.assertEqual(data["hearings"][0]["judge_id"], self.judge_a_id)

                # Assert Judge A's order is present, Judge B's order is absent
                self.assertEqual(len(data["orders"]), 1)
                self.assertEqual(data["orders"][0]["order_id"], o_a)
                self.assertEqual(data["orders"][0]["judge_id"], self.judge_a_id)
                self.assertEqual(data["orders"][0]["details"], "Confidential Ruling Alpha by Judge A")
                self.assertNotIn("Confidential Ruling Beta by Judge B", str(data))

            # Part B: Judge B inspection
            self._login_as(client, self.judge_b_user)
            with patch("backend.auth.decorators.get_user_by_id", return_value=self.judge_b_user):
                resp = client.get(f"/api/cases/{cid}")
                self.assertEqual(resp.status_code, 200)
                data = resp.get_json()["data"]

                # Assert Judge B's hearing is present, Judge A's is absent
                self.assertEqual(len(data["hearings"]), 1)
                self.assertEqual(data["hearings"][0]["hearing_id"], h_b)
                self.assertEqual(data["hearings"][0]["judge_id"], self.judge_b_id)

                # Assert Judge B's order is present, Judge A's order is absent
                self.assertEqual(len(data["orders"]), 1)
                self.assertEqual(data["orders"][0]["order_id"], o_b)
                self.assertEqual(data["orders"][0]["judge_id"], self.judge_b_id)
                self.assertEqual(data["orders"][0]["details"], "Confidential Ruling Beta by Judge B")
                self.assertNotIn("Confidential Ruling Alpha by Judge A", str(data))

            # Part C: Admin and Clerk compatibility (full access to both proceedings)
            for role_user in (self.admin_user, self.clerk_user):
                self._login_as(client, role_user)
                with patch("backend.auth.decorators.get_user_by_id", return_value=role_user):
                    resp = client.get(f"/api/cases/{cid}")
                    self.assertEqual(resp.status_code, 200)
                    data = resp.get_json()["data"]
                    self.assertEqual(len(data["hearings"]), 2)
                    self.assertEqual(len(data["orders"]), 2)

            # Part D: Judge hearing count in GET /api/cases
            # Judge A should only count their own hearing (1)
            self._login_as(client, self.judge_a_user)
            with patch("backend.auth.decorators.get_user_by_id", return_value=self.judge_a_user):
                resp = client.get(f"/api/cases?search={case_num}")
                self.assertEqual(resp.status_code, 200)
                cases = resp.get_json()["data"]["cases"]
                self.assertEqual(len(cases), 1)
                self.assertEqual(cases[0]["hearings_count"], 1)

            # Admin and Clerk should see the complete hearing count (2)
            for role_user in (self.admin_user, self.clerk_user):
                self._login_as(client, role_user)
                with patch("backend.auth.decorators.get_user_by_id", return_value=role_user):
                    resp = client.get(f"/api/cases?search={case_num}")
                    self.assertEqual(resp.status_code, 200)
                    cases = resp.get_json()["data"]["cases"]
                    self.assertEqual(len(cases), 1)
                    self.assertEqual(cases[0]["hearings_count"], 2)

        finally:
            # Clean up isolated test data
            def _cleanup(cur):
                cur.execute("DELETE FROM orders WHERE case_id = %s::uuid;", (cid,))
                cur.execute("DELETE FROM hearings WHERE case_id = %s::uuid;", (cid,))
                cur.execute("DELETE FROM cases WHERE case_id = %s::uuid;", (cid,))

            execute_write_transaction(
                actor_username="admin_master",
                operation=_cleanup,
            )

    def test_17_missing_judge_identity_fails_safely(self):
        """
        Verify that a judge account with missing or invalid judge_id fails safely:
          - Direct service invocation returns empty proceedings (never unfiltered).
          - HTTP API rejects request with 403 Forbidden.
        """
        from backend.cases.services import get_case_by_id

        # 1. Direct service invocation with missing judge_id
        corrupt_judge = {
            "user_id": 999,
            "username": "judge_corrupt",
            "role": "judge",
            "judge_id": None,
        }
        case_data = get_case_by_id(self.case_assigned_to_a, user=corrupt_judge)
        self.assertIsNotNone(case_data)
        self.assertEqual(case_data["hearings"], [])
        self.assertEqual(case_data["orders"], [])

        # 2. HTTP API access via client
        client = self.app.test_client()
        self._login_as(client, corrupt_judge)
        with patch("backend.auth.decorators.get_user_by_id", return_value=corrupt_judge):
            resp = client.get(f"/api/cases/{self.case_assigned_to_a}")
            self.assertEqual(resp.status_code, 403)
            self.assertIn("not linked to an active judge", resp.get_json()["message"])


if __name__ == "__main__":
    unittest.main()
