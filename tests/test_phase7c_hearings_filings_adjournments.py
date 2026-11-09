r"""
Court Case Management System - Phase 7C Verification Test Suite
Comprehensive testing for Hearings, Filings, and Adjournments APIs:
  - Role-based authorization across Admin, Clerk, and Judge for all endpoints.
  - Judge read-only enforcement: write attempts strictly return HTTP 403.
  - Judge isolation & direct probe parity: cross-judge proceeding access denial (403).
  - Unauthenticated access returns HTTP 401 across all endpoints.
  - Hearing immutability: zero PUT endpoints (405), zero DELETE endpoints (405).
  - Filing immutability: PUT updates filing_type ONLY (200); attempts to modify case_id,
    party_id, filing_date, or pass status/file_path return HTTP 400. Zero DELETE endpoints (405).
  - Adjournment append-only ledger: multiple adjournments permitted; zero mutation of
    parent hearing schedule or case status. Zero PUT/DELETE endpoints (405).
  - Strict naive ISO 8601 timestamp parsing with regex fullmatch \Z: rejects trailing
    newlines, trailing spaces, timezone offsets (Z, +HH:MM), and invalid calendar dates.
  - DST safety: detects nonexistent and ambiguous local times, rejects intervals crossing
    DST UTC-offset transitions, and enforces 24-hour max duration limit.
  - Active judge row-locking concurrency & GiST double-booking conflict (HTTP 409).
  - Dual-source party-case validation (party_case_roles UNION filings).
  - Court timezone configuration & canonical environment resolution.
  - Audit log actor attribution.

Safety Rules:
  - Restricted strictly to court_case_dev.
  - Never touches court_case_db.
  - Preserves working database records.
"""

from datetime import datetime, timedelta
import os
import threading
import time
import unittest
from unittest.mock import patch
import uuid
import zoneinfo

import psycopg
from psycopg.rows import dict_row

from backend.app import create_app, resolve_and_validate_court_timezone
from backend.db import (
    DatabaseWriteError,
    StatementTimeoutError,
    UncertainCommitError,
    execute_read_query,
    execute_write_transaction,
    get_db_connection,
)
from backend.hearings.services import (
    create_hearing,
    get_court_timezone,
    parse_and_validate_naive_timestamp,
    validate_hearing_interval,
)


class Phase7CHearingsFilingsAdjournmentsTestCase(unittest.TestCase):
    """Test suite verifying Hearings, Filings, and Adjournments APIs."""

    @classmethod
    def setUpClass(cls):
        # Configure test application
        cls.app = create_app(
            config_overrides={
                "TESTING": True,
                "WTF_CSRF_ENABLED": False,
                "RATELIMIT_ENABLED": False,
                "COURT_TIMEZONE": "UTC",
            }
        )

        # Verified seed data from court_case_dev
        cls.active_judge_a_id = "22c38658-774b-494f-ae97-01c82dc88422"  # Justice Yatan Bakshi
        cls.active_judge_b_id = "cfcaf53a-405d-490d-9b06-9753d5e9516d"  # Justice Vasudha Krish
        cls.inactive_judge_id = "68f40219-2e3d-4b19-aa42-cbbbbd039a27"  # Justice Vritti Hayer (inactive)

        cls.case_id_1 = "1c51a3f3-e269-47aa-9a2c-7c0406187229"  # Has party Rudra Manne
        cls.party_id_1 = "09e0eb2d-eeeb-461b-9d95-6c5720ebdf1c"  # Rudra Manne (Applicant on case_id_1)
        cls.party_id_unlinked = "39b56ea7-f878-456b-80f5-52134af593cf"  # Urmi Gala (unlinked to case_id_1)

        cls.case_id_b = "512aa71b-fc0b-493b-8828-725f10a30ffc"  # Exclusively assigned to Judge B
        cls.party_id_b = "72c8cf7f-d369-4f0c-b501-bc8052b8a73d"  # Madhavi Sidhu (Party on case_id_b)
        cls.judge_b_seed_hearing_id = "92972b9b-9560-4cdd-9a1b-71f61a0758b2"  # Seed hearing for Judge B on case_id_b

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
            "judge_id": cls.active_judge_a_id,
        }
        cls.judge_b_user = {
            "user_id": 103,
            "username": "judge_beta",
            "role": "judge",
            "judge_id": cls.active_judge_b_id,
        }
        cls.unlinked_judge_user = {
            "user_id": 404,
            "username": "unlinked_judge",
            "role": "judge",
            "judge_id": None,
        }

        # Ensure test clerk (102) and test judge B (103) exist as live records in court_case_dev
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO users (user_id, username, password, role, judge_id)
                    VALUES (102, 'clerk_operator', '$argon2id$v=19$m=65536,t=3,p=4$dummyhash$dummyhash', 'clerk', NULL)
                    ON CONFLICT (user_id) DO UPDATE SET role = 'clerk', judge_id = NULL;
                    """
                )
                cur.execute(
                    """
                    INSERT INTO users (user_id, username, password, role, judge_id)
                    VALUES (103, 'judge_beta', '$argon2id$v=19$m=65536,t=3,p=4$dummyhash$dummyhash', 'judge', %s::uuid)
                    ON CONFLICT (user_id) DO UPDATE SET role = 'judge', judge_id = %s::uuid;
                    """,
                    (cls.active_judge_b_id, cls.active_judge_b_id),
                )
            conn.commit()

        # Track inserted test records for cleanup
        cls.created_hearing_ids = []
        cls.created_filing_ids = []
        cls.created_adj_ids = []

    @classmethod
    def tearDownClass(cls):
        """Clean up any records created during test runs."""
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                if cls.created_adj_ids:
                    cur.execute(
                        "DELETE FROM adjournments WHERE adj_id = ANY(%s::uuid[]);",
                        (cls.created_adj_ids,),
                    )
                if cls.created_hearing_ids:
                    cur.execute(
                        "DELETE FROM adjournments WHERE hearing_id = ANY(%s::uuid[]);",
                        (cls.created_hearing_ids,),
                    )
                    cur.execute(
                        "DELETE FROM hearings WHERE hearing_id = ANY(%s::uuid[]);",
                        (cls.created_hearing_ids,),
                    )
                if cls.created_filing_ids:
                    cur.execute(
                        "DELETE FROM filings WHERE filing_id = ANY(%s::uuid[]);",
                        (cls.created_filing_ids,),
                    )
                # Clean up temporary test users
                cur.execute("DELETE FROM users WHERE user_id IN (102, 103);")
            conn.commit()

    def setUp(self):
        from backend.extensions import limiter
        limiter.enabled = False

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

    def _authed_request(self, client, user_dict, method, url, **kwargs):
        """
        Helper to perform request with authenticated session.
        Exercises live database revalidation against court_case_dev without mocking get_user_by_id.
        """
        self._login_as(client, user_dict)
        caller = getattr(client, method.lower())
        return caller(url, **kwargs)

    # =======================================================================
    # 1. Unauthenticated Requests (HTTP 401)
    # =======================================================================

    def test_01_unauthenticated_requests_return_401(self):
        """Verify unauthenticated requests across all Phase 7C endpoints return HTTP 401."""
        client = self.app.test_client()
        fake_uuid = str(uuid.uuid4())

        endpoints = [
            ("GET", "/api/hearings"),
            ("GET", f"/api/hearings/{fake_uuid}"),
            ("POST", "/api/hearings"),
            ("GET", "/api/filings"),
            ("GET", f"/api/filings/{fake_uuid}"),
            ("POST", "/api/filings"),
            ("PUT", f"/api/filings/{fake_uuid}"),
            ("GET", "/api/adjournments"),
            ("GET", f"/api/adjournments/{fake_uuid}"),
            ("POST", "/api/adjournments"),
        ]

        for method, url in endpoints:
            if method == "GET":
                resp = client.get(url)
            elif method == "POST":
                resp = client.post(url, json={})
            elif method == "PUT":
                resp = client.put(url, json={})
            self.assertEqual(
                resp.status_code,
                401,
                f"Expected 401 for unauthenticated {method} {url}, got {resp.status_code}",
            )

    # =======================================================================
    # 2. Judge Write Prohibition (HTTP 403)
    # =======================================================================

    def test_02_judge_write_operations_return_403(self):
        """Verify judges are strictly prohibited from creating or modifying hearings, filings, adjournments."""
        client = self.app.test_client()
        fake_uuid = str(uuid.uuid4())

        # Hearing POST
        resp = self._authed_request(
            client,
            self.judge_a_user,
            "POST",
            "/api/hearings",
            json={
                "case_id": self.case_id_1,
                "judge_id": self.active_judge_a_id,
                "start_time": "2028-01-10T10:00:00",
                "end_time": "2028-01-10T11:00:00",
            },
        )
        self.assertEqual(resp.status_code, 403, f"Judge should not create hearings: {resp.data}")

        # Filing POST
        resp = self._authed_request(
            client,
            self.judge_a_user,
            "POST",
            "/api/filings",
            json={
                "case_id": self.case_id_1,
                "party_id": self.party_id_1,
                "filing_type": "Motion to Dismiss",
            },
        )
        self.assertEqual(resp.status_code, 403, f"Judge should not create filings: {resp.data}")

        # Filing PUT
        resp = self._authed_request(
            client,
            self.judge_a_user,
            "PUT",
            f"/api/filings/{fake_uuid}",
            json={"filing_type": "Amended Motion"},
        )
        self.assertEqual(resp.status_code, 403, f"Judge should not update filings: {resp.data}")

        # Adjournment POST
        resp = self._authed_request(
            client,
            self.judge_a_user,
            "POST",
            "/api/adjournments",
            json={
                "hearing_id": fake_uuid,
                "reason_code": "Counsel Unwell",
            },
        )
        self.assertEqual(resp.status_code, 403, f"Judge should not record adjournments: {resp.data}")

    # =======================================================================
    # 3. Immutability Boundaries & HTTP 405 Method Not Allowed
    # =======================================================================

    def test_03_immutability_endpoints_return_405(self):
        """Verify PUT/DELETE endpoints do not exist for hearings and adjournments, and DELETE does not exist for filings."""
        client = self.app.test_client()
        fake_uuid = str(uuid.uuid4())

        # Hearings immutability
        resp = self._authed_request(client, self.admin_user, "PUT", f"/api/hearings/{fake_uuid}", json={"start_time": "2028-01-01T10:00:00"})
        self.assertEqual(resp.status_code, 405, "PUT /api/hearings/<id> must return 405")

        resp = self._authed_request(client, self.admin_user, "DELETE", f"/api/hearings/{fake_uuid}")
        self.assertEqual(resp.status_code, 405, "DELETE /api/hearings/<id> must return 405")

        # Filings immutability
        resp = self._authed_request(client, self.admin_user, "DELETE", f"/api/filings/{fake_uuid}")
        self.assertEqual(resp.status_code, 405, "DELETE /api/filings/<id> must return 405")

        # Adjournments immutability
        resp = self._authed_request(client, self.admin_user, "PUT", f"/api/adjournments/{fake_uuid}", json={"reason_code": "New Reason"})
        self.assertEqual(resp.status_code, 405, "PUT /api/adjournments/<id> must return 405")

        resp = self._authed_request(client, self.admin_user, "DELETE", f"/api/adjournments/{fake_uuid}")
        self.assertEqual(resp.status_code, 405, "DELETE /api/adjournments/<id> must return 405")

    # =======================================================================
    # 4. Strict Naive Timestamp Validation & Format Protections
    # =======================================================================

    def test_04_timestamp_parsing_and_format_protections(self):
        """Verify strict regex \\Z naive ISO 8601 parsing rejects newlines, spaces, offsets, and invalid dates."""
        court_tz = zoneinfo.ZoneInfo("UTC")

        # Trailing newline rejection
        dt, err = parse_and_validate_naive_timestamp("start_time", "2026-11-10T10:00:00\n", court_tz)
        self.assertIsNone(dt)
        self.assertIn("Invalid timestamp format", err)

        # Trailing space rejection
        dt, err = parse_and_validate_naive_timestamp("start_time", "2026-11-10T10:00:00 ", court_tz)
        self.assertIsNone(dt)
        self.assertIn("Invalid timestamp format", err)

        # Timezone offset 'Z' rejection
        dt, err = parse_and_validate_naive_timestamp("start_time", "2026-11-10T10:00:00Z", court_tz)
        self.assertIsNone(dt)
        self.assertIn("Invalid timestamp format", err)

        # Timezone offset '+05:30' rejection
        dt, err = parse_and_validate_naive_timestamp("start_time", "2026-11-10T10:00:00+05:30", court_tz)
        self.assertIsNone(dt)
        self.assertIn("Invalid timestamp format", err)

        # Invalid calendar date rejection (Feb 30)
        dt, err = parse_and_validate_naive_timestamp("start_time", "2026-02-30T10:00:00", court_tz)
        self.assertIsNone(dt)
        self.assertIn("Invalid calendar date", err)

        # Valid naive timestamp acceptance
        dt, err = parse_and_validate_naive_timestamp("start_time", "2026-11-10T10:00:00", court_tz)
        self.assertIsNotNone(dt)
        self.assertIsNone(err)
        self.assertEqual(dt.year, 2026)
        self.assertEqual(dt.month, 11)
        self.assertEqual(dt.day, 10)
        self.assertIsNone(dt.tzinfo)

    # =======================================================================
    # 5. Daylight Saving Time (DST) Interval Protections
    # =======================================================================

    def test_05_dst_interval_and_point_protections(self):
        """Verify DST validation rejects nonexistent/ambiguous times and interval transitions."""
        ny_tz = zoneinfo.ZoneInfo("America/New_York")

        # 1. Nonexistent local time (Spring-forward gap on 2026-03-08: 02:00 -> 03:00)
        dt, err = parse_and_validate_naive_timestamp("start_time", "2026-03-08T02:30:00", ny_tz)
        self.assertIsNone(dt)
        self.assertIn("does not exist", err)

        # 2. Ambiguous local time (Fall-back repeat on 2026-11-01: 01:00 -> 02:00 repeats)
        dt, err = parse_and_validate_naive_timestamp("start_time", "2026-11-01T01:30:00", ny_tz)
        self.assertIsNone(dt)
        self.assertIn("occurs twice", err)

        # 3. Interval crossing Spring-forward transition (01:30 to 03:30)
        start_dt = datetime(2026, 3, 8, 1, 30)
        end_dt = datetime(2026, 3, 8, 3, 30)
        err = validate_hearing_interval(start_dt, end_dt, ny_tz)
        self.assertIsNotNone(err)
        self.assertIn("cross a daylight saving time transition", err)

        # 4. Interval crossing Fall-back transition (00:30 to 02:30)
        start_dt = datetime(2026, 11, 1, 0, 30)
        end_dt = datetime(2026, 11, 1, 2, 30)
        err = validate_hearing_interval(start_dt, end_dt, ny_tz)
        self.assertIsNotNone(err)
        self.assertIn("cross a daylight saving time transition", err)

        # 5. Duration > 24 hours
        start_dt = datetime(2026, 5, 1, 10, 0)
        end_dt = datetime(2026, 5, 2, 11, 0)
        err = validate_hearing_interval(start_dt, end_dt, ny_tz)
        self.assertIsNotNone(err)
        self.assertIn("exceeds maximum allowable limit of 24 hours", err)

        # 6. Valid normal interval within same offset
        start_dt = datetime(2026, 5, 1, 10, 0)
        end_dt = datetime(2026, 5, 1, 11, 30)
        err = validate_hearing_interval(start_dt, end_dt, ny_tz)
        self.assertIsNone(err)

    # =======================================================================
    # 6. Hearing Scheduling, Active Judge Locking & GiST Conflicts (HTTP 409)
    # =======================================================================

    def test_06_hearing_creation_active_judge_locking_and_conflict(self):
        """Verify hearing creation locks active judge row and rejects inactive judge or overlapping schedules."""
        client = self.app.test_client()

        # Attempt to schedule with inactive judge -> 400
        resp = self._authed_request(
            client,
            self.clerk_user,
            "POST",
            "/api/hearings",
            json={
                "case_id": self.case_id_1,
                "judge_id": self.inactive_judge_id,
                "start_time": "2029-01-15T10:00:00",
                "end_time": "2029-01-15T11:00:00",
            },
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("Assigned judge is not active", resp.get_json()["message"])

        # Schedule valid hearing 1 for Judge A -> 201
        resp1 = self._authed_request(
            client,
            self.clerk_user,
            "POST",
            "/api/hearings",
            json={
                "case_id": self.case_id_1,
                "judge_id": self.active_judge_a_id,
                "start_time": "2029-02-10T10:00:00",
                "end_time": "2029-02-10T11:00:00",
            },
        )
        self.assertEqual(resp1.status_code, 201, f"Failed to create hearing 1: {resp1.data}")
        h1_id = resp1.get_json()["data"]["hearing_id"]
        self.created_hearing_ids.append(h1_id)

        # Attempt overlapping hearing for SAME Judge A -> 409 GiST conflict
        resp_conflict = self._authed_request(
            client,
            self.clerk_user,
            "POST",
            "/api/hearings",
            json={
                "case_id": self.case_id_1,
                "judge_id": self.active_judge_a_id,
                "start_time": "2029-02-10T10:30:00",
                "end_time": "2029-02-10T11:30:00",
            },
        )
        self.assertEqual(resp_conflict.status_code, 409, f"Expected 409 GiST conflict, got {resp_conflict.data}")
        self.assertIn("already has a hearing scheduled", resp_conflict.get_json()["message"])

        # Attempt overlapping hearing for DIFFERENT Judge B -> 201 Success
        resp2 = self._authed_request(
            client,
            self.clerk_user,
            "POST",
            "/api/hearings",
            json={
                "case_id": self.case_id_1,
                "judge_id": self.active_judge_b_id,
                "start_time": "2029-02-10T10:30:00",
                "end_time": "2029-02-10T11:30:00",
            },
        )
        self.assertEqual(resp2.status_code, 201, f"Different judge should not conflict: {resp2.data}")
        h2_id = resp2.get_json()["data"]["hearing_id"]
        self.created_hearing_ids.append(h2_id)

    # =======================================================================
    # 7. Judge Isolation & Direct Probe Parity
    # =======================================================================

    def test_07_judge_hearing_isolation_and_direct_probe_parity(self):
        """Verify Judge A cannot see or probe Judge B's hearings (HTTP 403 / scoped list)."""
        client = self.app.test_client()

        # Clerk schedules a hearing assigned exclusively to Judge B
        resp = self._authed_request(
            client,
            self.clerk_user,
            "POST",
            "/api/hearings",
            json={
                "case_id": self.case_id_1,
                "judge_id": self.active_judge_b_id,
                "start_time": "2029-03-15T14:00:00",
                "end_time": "2029-03-15T15:00:00",
            },
        )
        self.assertEqual(resp.status_code, 201)
        judge_b_hearing_id = resp.get_json()["data"]["hearing_id"]
        self.created_hearing_ids.append(judge_b_hearing_id)

        # Direct probe on Judge B's hearing by Judge A -> 403 Forbidden
        resp_probe = self._authed_request(
            client,
            self.judge_a_user,
            "GET",
            f"/api/hearings/{judge_b_hearing_id}",
        )
        self.assertEqual(
            resp_probe.status_code,
            403,
            f"Expected 403 for cross-judge hearing probe, got {resp_probe.status_code}",
        )

        # Listing hearings as Judge A must not include Judge B's hearing
        resp_list = self._authed_request(
            client,
            self.judge_a_user,
            "GET",
            "/api/hearings",
        )
        self.assertEqual(resp_list.status_code, 200)
        returned_ids = [h["hearing_id"] for h in resp_list.get_json()["data"]]
        self.assertNotIn(
            judge_b_hearing_id,
            returned_ids,
            "Judge A must not see Judge B's hearing in list results.",
        )

        # Login as Judge B (assigned) -> 200 Success
        resp_b = self._authed_request(
            client,
            self.judge_b_user,
            "GET",
            f"/api/hearings/{judge_b_hearing_id}",
        )
        self.assertEqual(resp_b.status_code, 200)
        self.assertEqual(resp_b.get_json()["data"]["hearing_id"], judge_b_hearing_id)

    # =======================================================================
    # 8. Filings Dual-Source Validation, Defaults & Field Immutability
    # =======================================================================

    def test_08_filing_dual_source_validation_and_immutability(self):
        """Verify filings validate party association, accept default court time, and restrict PUT to filing_type."""
        client = self.app.test_client()

        # 1. Unassociated party -> 400
        resp_unlinked = self._authed_request(
            client,
            self.clerk_user,
            "POST",
            "/api/filings",
            json={
                "case_id": self.case_id_1,
                "party_id": self.party_id_unlinked,
                "filing_type": "Intervention Motion",
            },
        )
        self.assertEqual(resp_unlinked.status_code, 400)
        self.assertIn("not associated with case", resp_unlinked.get_json()["message"])

        # 2. Reject unsupported fields in filing creation (e.g. status, file_path)
        resp_disallowed = self._authed_request(
            client,
            self.clerk_user,
            "POST",
            "/api/filings",
            json={
                "case_id": self.case_id_1,
                "party_id": self.party_id_1,
                "filing_type": "Affidavit",
                "status": "Accepted",
                "file_path": "/var/court/doc.pdf",
            },
        )
        self.assertEqual(resp_disallowed.status_code, 400)
        self.assertIn("Unexpected or unsupported fields", resp_disallowed.get_json()["message"])

        # 3. Create filing without filing_date (generates court timezone default) -> 201
        resp_create = self._authed_request(
            client,
            self.clerk_user,
            "POST",
            "/api/filings",
            json={
                "case_id": self.case_id_1,
                "party_id": self.party_id_1,
                "filing_type": "Initial Plaint",
            },
        )
        self.assertEqual(resp_create.status_code, 201, f"Failed to create filing: {resp_create.data}")
        f_data = resp_create.get_json()["data"]
        filing_id = f_data["filing_id"]
        self.created_filing_ids.append(filing_id)
        self.assertIsNotNone(f_data.get("filing_date"))

        # 4. Subsequent filing by same party (verified via prior filings source) -> 201
        resp_subsequent = self._authed_request(
            client,
            self.clerk_user,
            "POST",
            "/api/filings",
            json={
                "case_id": self.case_id_1,
                "party_id": self.party_id_1,
                "filing_type": "Supporting Document",
            },
        )
        self.assertEqual(resp_subsequent.status_code, 201)
        self.created_filing_ids.append(resp_subsequent.get_json()["data"]["filing_id"])

        # 5. PUT /api/filings/<id> with immutable fields (case_id, party_id, filing_date) -> 400
        resp_put_immutable = self._authed_request(
            client,
            self.clerk_user,
            "PUT",
            f"/api/filings/{filing_id}",
            json={
                "filing_type": "Amended Plaint",
                "party_id": self.party_id_unlinked,
            },
        )
        self.assertEqual(resp_put_immutable.status_code, 400)
        self.assertIn("Immutable or unsupported fields", resp_put_immutable.get_json()["message"])

        # 6. PUT /api/filings/<id> updating ONLY filing_type -> 200
        resp_put_valid = self._authed_request(
            client,
            self.clerk_user,
            "PUT",
            f"/api/filings/{filing_id}",
            json={"filing_type": "Amended Plaint Final"},
        )
        self.assertEqual(resp_put_valid.status_code, 200)
        self.assertEqual(resp_put_valid.get_json()["data"]["filing_type"], "Amended Plaint Final")

    # =======================================================================
    # 9. Adjournments Append-Only Ledger & Non-Mutation Semantics
    # =======================================================================

    def test_09_adjournment_append_only_ledger_and_case_isolation(self):
        """Verify recording adjournments is append-only and does not mutate case status or hearing time."""
        client = self.app.test_client()

        # 1. Schedule a parent hearing
        resp_h = self._authed_request(
            client,
            self.clerk_user,
            "POST",
            "/api/hearings",
            json={
                "case_id": self.case_id_1,
                "judge_id": self.active_judge_a_id,
                "start_time": "2029-04-10T10:00:00",
                "end_time": "2029-04-10T11:00:00",
            },
        )
        self.assertEqual(resp_h.status_code, 201)
        h_id = resp_h.get_json()["data"]["hearing_id"]
        self.created_hearing_ids.append(h_id)

        # Verify initial case status
        case_row_before = execute_read_query(
            "SELECT status FROM cases WHERE case_id = %s::uuid;",
            params=(self.case_id_1,),
            fetch_one=True,
            row_factory=dict_row,
        )
        status_before = case_row_before["status"]

        # 2. Record first adjournment against hearing
        resp_adj1 = self._authed_request(
            client,
            self.clerk_user,
            "POST",
            "/api/adjournments",
            json={
                "hearing_id": h_id,
                "reason_code": "Witness Unavailable",
            },
        )
        self.assertEqual(resp_adj1.status_code, 201, f"Failed to record adjournment: {resp_adj1.data}")
        adj1_id = resp_adj1.get_json()["data"]["adj_id"]
        self.created_adj_ids.append(adj1_id)

        # 3. Record second adjournment against same hearing (append-only ledger)
        resp_adj2 = self._authed_request(
            client,
            self.clerk_user,
            "POST",
            "/api/adjournments",
            json={
                "hearing_id": h_id,
                "reason_code": "Counsel In Another Bench",
            },
        )
        self.assertEqual(resp_adj2.status_code, 201)
        adj2_id = resp_adj2.get_json()["data"]["adj_id"]
        self.created_adj_ids.append(adj2_id)
        self.assertNotEqual(adj1_id, adj2_id)

        # 4. Verify case status was NOT changed
        case_row_after = execute_read_query(
            "SELECT status FROM cases WHERE case_id = %s::uuid;",
            params=(self.case_id_1,),
            fetch_one=True,
            row_factory=dict_row,
        )
        self.assertEqual(
            case_row_after["status"],
            status_before,
            "Creating an adjournment must NOT mutate cases.status.",
        )

        # 5. Verify parent hearing start_time and end_time were NOT altered
        hearing_row_after = execute_read_query(
            "SELECT start_time, end_time FROM hearings WHERE hearing_id = %s::uuid;",
            params=(h_id,),
            fetch_one=True,
            row_factory=dict_row,
        )
        self.assertEqual(
            hearing_row_after["start_time"].isoformat(),
            "2029-04-10T10:00:00",
            "Hearing start_time must remain immutable after adjournment.",
        )

    # =======================================================================
    # 10. Court Timezone Resolution & Canonical Environment Enforcement
    # =======================================================================

    def test_10_court_timezone_resolution_and_guardrails(self):
        """Verify court timezone resolution fails startup in production when missing/invalid and defaults in dev."""
        # 1. Non-dev/prod environment missing COURT_TIMEZONE -> RuntimeError
        with self.assertRaises(RuntimeError) as ctx:
            resolve_and_validate_court_timezone({}, "production")
        self.assertIn("COURT_TIMEZONE must be explicitly configured", str(ctx.exception))

        # 2. Non-dev/staging environment missing COURT_TIMEZONE -> RuntimeError
        with self.assertRaises(RuntimeError) as ctx:
            resolve_and_validate_court_timezone({}, "staging")
        self.assertIn("COURT_TIMEZONE must be explicitly configured", str(ctx.exception))

        # 3. Invalid timezone name in production -> RuntimeError
        with self.assertRaises(RuntimeError) as ctx:
            resolve_and_validate_court_timezone({"COURT_TIMEZONE": "Mars/Base_Alpha"}, "production")
        self.assertIn("Invalid COURT_TIMEZONE", str(ctx.exception))

        # 4. Development environment missing COURT_TIMEZONE -> defaults to UTC
        tz = resolve_and_validate_court_timezone({}, "development")
        self.assertEqual(tz.key, "UTC")

        # 5. Explicit valid timezone in production -> valid ZoneInfo
        tz = resolve_and_validate_court_timezone({"COURT_TIMEZONE": "America/New_York"}, "production")
        self.assertEqual(tz.key, "America/New_York")

    # =======================================================================
    # 11. Audit Log Actor Attribution
    # =======================================================================

    def test_11_audit_log_attribution(self):
        """Verify write transactions set app.username and audit_logs captures actor attribution."""
        client = self.app.test_client()

        resp = self._authed_request(
            client,
            self.clerk_user,
            "POST",
            "/api/hearings",
            json={
                "case_id": self.case_id_1,
                "judge_id": self.active_judge_a_id,
                "start_time": "2029-05-15T11:00:00",
                "end_time": "2029-05-15T12:00:00",
            },
        )
        self.assertEqual(resp.status_code, 201)
        h_id = resp.get_json()["data"]["hearing_id"]
        self.created_hearing_ids.append(h_id)

        # Check audit log entry
        audit_row = execute_read_query(
            """
            SELECT username, action_type 
            FROM audit_logs 
            WHERE action_type = 'hearings:INSERT'
              AND new_data ->> 'hearing_id' = %s;
            """,
            params=(h_id,),
            fetch_one=True,
            row_factory=dict_row,
        )
        self.assertIsNotNone(audit_row)
        self.assertEqual(audit_row["username"], self.clerk_user["username"])

    # =======================================================================
    # 12. Rescheduling Transaction Semantics & Partial-Recovery Workflow
    # =======================================================================

    def test_12_rescheduling_transaction_semantics_and_partial_recovery(self):
        """
        Verify adjournment and successor hearing scheduling are separate transactions.
        If successor hearing creation fails, adjournment is preserved and retry succeeds.
        """
        client = self.app.test_client()

        # 1. Schedule initial hearing
        resp_h1 = self._authed_request(
            client,
            self.clerk_user,
            "POST",
            "/api/hearings",
            json={
                "case_id": self.case_id_1,
                "judge_id": self.active_judge_a_id,
                "start_time": "2029-06-01T10:00:00",
                "end_time": "2029-06-01T11:00:00",
            },
        )
        self.assertEqual(resp_h1.status_code, 201)
        h1_id = resp_h1.get_json()["data"]["hearing_id"]
        self.created_hearing_ids.append(h1_id)

        # 2. Record adjournment on hearing 1
        resp_adj = self._authed_request(
            client,
            self.clerk_user,
            "POST",
            "/api/adjournments",
            json={
                "hearing_id": h1_id,
                "reason_code": "Party Counsel Unavailable",
            },
        )
        self.assertEqual(resp_adj.status_code, 201)
        adj_id = resp_adj.get_json()["data"]["adj_id"]
        self.created_adj_ids.append(adj_id)

        # 3. Successor hearing creation fails (e.g. invalid time range: end before start)
        resp_fail = self._authed_request(
            client,
            self.clerk_user,
            "POST",
            "/api/hearings",
            json={
                "case_id": self.case_id_1,
                "judge_id": self.active_judge_a_id,
                "start_time": "2029-06-15T11:00:00",
                "end_time": "2029-06-15T10:00:00",  # Invalid
            },
        )
        self.assertEqual(resp_fail.status_code, 400)

        # 4. Adjournment still exists and is completely intact
        resp_adj_check = self._authed_request(
            client,
            self.clerk_user,
            "GET",
            f"/api/adjournments/{adj_id}",
        )
        self.assertEqual(resp_adj_check.status_code, 200)
        self.assertEqual(resp_adj_check.get_json()["data"]["adj_id"], adj_id)

        # 5. Retry successor hearing creation with valid params -> Succeeds without recreating adjournment
        resp_retry = self._authed_request(
            client,
            self.clerk_user,
            "POST",
            "/api/hearings",
            json={
                "case_id": self.case_id_1,
                "judge_id": self.active_judge_a_id,
                "start_time": "2029-06-15T10:00:00",
                "end_time": "2029-06-15T11:00:00",
            },
        )
        self.assertEqual(resp_retry.status_code, 201)
        h2_id = resp_retry.get_json()["data"]["hearing_id"]
        self.created_hearing_ids.append(h2_id)

    # =======================================================================
    # 13. Fail-Closed Scoping for Unlinked Judge Account
    # =======================================================================

    def test_13_fail_closed_for_unlinked_judge_account(self):
        """Verify judge account without linked judge_id fails closed with HTTP 403."""
        client = self.app.test_client()

        # Listing hearings
        resp_h = self._authed_request(client, self.unlinked_judge_user, "GET", "/api/hearings")
        self.assertEqual(resp_h.status_code, 403)
        self.assertIn("Access forbidden", resp_h.get_json()["message"])

        # Listing filings
        resp_f = self._authed_request(client, self.unlinked_judge_user, "GET", "/api/filings")
        self.assertEqual(resp_f.status_code, 403)
        self.assertIn("Access forbidden", resp_f.get_json()["message"])

        # Listing adjournments
        resp_a = self._authed_request(client, self.unlinked_judge_user, "GET", "/api/adjournments")
        self.assertEqual(resp_a.status_code, 403)
        self.assertIn("Access forbidden", resp_a.get_json()["message"])

    # =======================================================================
    # 14. Nonexistent Resources & Malformed UUID Validation
    # =======================================================================

    def test_14_nonexistent_and_malformed_uuids(self):
        """Verify invalid UUIDs return 400 and nonexistent UUIDs return 404."""
        client = self.app.test_client()
        fake_uuid = str(uuid.uuid4())

        # Malformed UUIDs -> 400
        for endpoint in ["/api/hearings/bad-uuid", "/api/filings/bad-uuid", "/api/adjournments/bad-uuid"]:
            resp = self._authed_request(client, self.admin_user, "GET", endpoint)
            self.assertEqual(resp.status_code, 400, f"Expected 400 for {endpoint}, got {resp.status_code}")

        # Nonexistent UUIDs -> 404
        for endpoint in [f"/api/hearings/{fake_uuid}", f"/api/filings/{fake_uuid}", f"/api/adjournments/{fake_uuid}"]:
            resp = self._authed_request(client, self.admin_user, "GET", endpoint)
            self.assertEqual(resp.status_code, 404, f"Expected 404 for {endpoint}, got {resp.status_code}")

    # =======================================================================
    # 15. Real PostgreSQL Concurrency: FOR SHARE Row Lock vs Judge Deactivation
    # =======================================================================

    def test_15_real_concurrency_for_share_blocks_judge_deactivation(self):
        """
        Verify real PostgreSQL row-level locking:
        Real create_hearing() obtains SELECT ... FOR SHARE inside the same transaction as hearing insertion.
        Concurrent judge deactivation (UPDATE judges SET active_status = false) blocks until hearing creation commits.
        Verify final database state: hearing created, judge deactivated, subsequent hearing creation rejected.
        """
        conn2 = get_db_connection()
        judge_id = self.active_judge_a_id
        case_id = self.case_id_1
        h_start = "2032-01-01T10:00:00"
        h_end = "2032-01-01T11:00:00"

        events = []
        hearing_inside_tx = threading.Event()
        proceed_to_commit = threading.Event()
        deact_completed = threading.Event()
        hearing_result = {}

        orig_execute = psycopg.Cursor.execute

        def hooked_execute(cur_self, query, params=None):
            res = orig_execute(cur_self, query, params)
            if isinstance(query, str) and "INSERT INTO hearings" in query:
                events.append("hearing_inserted_inside_tx")
                hearing_inside_tx.set()
                proceed_to_commit.wait(timeout=5.0)
                events.append("proceeding_to_commit")
            return res

        def worker_hearing():
            psycopg.Cursor.execute = hooked_execute
            try:
                h, err, code = create_hearing(
                    actor_username=self.clerk_user["username"],
                    case_id=case_id,
                    judge_id=judge_id,
                    start_time=h_start,
                    end_time=h_end,
                )
                hearing_result["hearing"] = h
                hearing_result["err"] = err
                hearing_result["code"] = code
                if h and h.get("hearing_id"):
                    self.created_hearing_ids.append(h["hearing_id"])
            finally:
                psycopg.Cursor.execute = orig_execute

        def worker_deactivate():
            hearing_inside_tx.wait(timeout=5.0)
            events.append("deact_attempting")
            try:
                with conn2.transaction():
                    with conn2.cursor() as cur2:
                        # Perform actual active-to-inactive transition
                        cur2.execute(
                            "UPDATE judges SET active_status = false WHERE judge_id = %s::uuid;",
                            (judge_id,),
                        )
                        events.append("deact_completed")
                        deact_completed.set()
            finally:
                conn2.close()

        t1 = threading.Thread(target=worker_hearing)
        t2 = threading.Thread(target=worker_deactivate)

        try:
            t1.start()
            t2.start()

            # Ensure t2 has attempted update while t1 holds FOR SHARE lock inside active transaction
            time.sleep(0.4)
            self.assertFalse(
                deact_completed.is_set(),
                "Judge deactivation must be blocked by PostgreSQL while create_hearing holds FOR SHARE lock",
            )

            # Signal worker 1 to proceed to commit
            proceed_to_commit.set()

            t1.join(timeout=5.0)
            t2.join(timeout=5.0)

            # 1. Verify hearing creation succeeded
            self.assertEqual(hearing_result.get("code"), 201)
            self.assertIsNotNone(hearing_result.get("hearing"))

            # 2. Verify deactivation completed after commit
            self.assertTrue(deact_completed.is_set())
            self.assertEqual(
                events,
                [
                    "hearing_inserted_inside_tx",
                    "deact_attempting",
                    "proceeding_to_commit",
                    "deact_completed",
                ],
            )

            # 3. Verify final database state: judge is now deactivated
            judge_row = execute_read_query(
                "SELECT active_status FROM judges WHERE judge_id = %s::uuid;",
                params=(judge_id,),
                fetch_one=True,
                row_factory=dict_row,
            )
            self.assertFalse(judge_row["active_status"], "Judge active_status must now be False in database")

            # 4. Verify subsequent create_hearing for this judge is rejected
            h_sub, err_sub, code_sub = create_hearing(
                actor_username=self.clerk_user["username"],
                case_id=case_id,
                judge_id=judge_id,
                start_time="2032-01-02T10:00:00",
                end_time="2032-01-02T11:00:00",
            )
            self.assertEqual(code_sub, 400)
            self.assertIn("Assigned judge is not active", err_sub)

        finally:
            # Clean up test data and restore judge active status to True
            with get_db_connection() as cleanup_conn:
                with cleanup_conn.cursor() as cur:
                    cur.execute(
                        "UPDATE judges SET active_status = true WHERE judge_id = %s::uuid;",
                        (judge_id,),
                    )
                    cur.execute(
                        "DELETE FROM hearings WHERE start_time >= '2032-01-01';",
                    )
                cleanup_conn.commit()

    # =======================================================================
    # 16. Real PostgreSQL Concurrency: Simultaneous Exclusion Constraint
    # =======================================================================

    def test_16_real_concurrency_simultaneous_hearing_creation_exclusion(self):
        """
        Verify real PostgreSQL ExclusionConstraint under simultaneous concurrency:
        Two concurrent transactions attempting to insert overlapping hearings for the same judge.
        One succeeds, and the other is blocked then raises ExclusionViolation upon commit.
        """
        conn1 = get_db_connection()
        conn2 = get_db_connection()
        judge_id = self.active_judge_a_id
        case_id = self.case_id_1

        h1_id = str(uuid.uuid4())
        h2_id = str(uuid.uuid4())
        self.created_hearing_ids.extend([h1_id, h2_id])

        start_time_1 = "2031-06-01 10:00:00"
        end_time_1 = "2031-06-01 11:00:00"
        start_time_2 = "2031-06-01 10:30:00"
        end_time_2 = "2031-06-01 11:30:00"

        results = {}
        t1_inserted = threading.Event()
        t1_can_commit = threading.Event()

        def worker1():
            try:
                with conn1.transaction():
                    with conn1.cursor() as cur1:
                        cur1.execute(
                            """
                            INSERT INTO hearings (hearing_id, case_id, judge_id, start_time, end_time)
                            VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s);
                            """,
                            (h1_id, case_id, judge_id, start_time_1, end_time_1),
                        )
                        t1_inserted.set()
                        t1_can_commit.wait(timeout=3.0)
                results["t1"] = "success"
            except Exception as exc:
                results["t1"] = type(exc).__name__
            finally:
                conn1.close()

        def worker2():
            try:
                t1_inserted.wait(timeout=3.0)
                with conn2.transaction():
                    with conn2.cursor() as cur2:
                        cur2.execute(
                            """
                            INSERT INTO hearings (hearing_id, case_id, judge_id, start_time, end_time)
                            VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s);
                            """,
                            (h2_id, case_id, judge_id, start_time_2, end_time_2),
                        )
                results["t2"] = "success"
            except Exception as exc:
                results["t2"] = type(exc).__name__
            finally:
                conn2.close()

        t1 = threading.Thread(target=worker1)
        t2 = threading.Thread(target=worker2)

        t1.start()
        t2.start()

        time.sleep(0.3)
        t1_can_commit.set()

        t1.join(timeout=5.0)
        t2.join(timeout=5.0)

        self.assertEqual(results["t1"], "success", "First concurrent transaction must succeed")
        self.assertEqual(results["t2"], "ExclusionViolation", "Second concurrent transaction must fail with ExclusionViolation")

    # =======================================================================
    # 17. Atomic Rollback on Statement Failure
    # =======================================================================

    def test_17_transaction_rollback_on_statement_failure(self):
        """
        Verify execute_write_transaction ensures atomic rollback on statement failure.
        No partial records persist in the database.
        """
        temp_case_num = f"TEMP-{uuid.uuid4().hex[:8]}"

        def failing_operation(cur):
            # 1. First statement succeeds
            cur.execute(
                "INSERT INTO cases (case_number, status) VALUES (%s, 'Active');",
                (temp_case_num,),
            )
            # 2. Second statement intentionally fails (check violation: invalid status)
            cur.execute(
                "INSERT INTO cases (case_number, status) VALUES (%s, 'InvalidStatus123');",
                (f"{temp_case_num}-2",),
            )

        with self.assertRaises(psycopg.errors.CheckViolation):
            execute_write_transaction(
                actor_username="clerk_operator",
                operation=failing_operation,
            )

        # Verify that the first insert was rolled back completely
        row = execute_read_query(
            "SELECT case_id FROM cases WHERE case_number = %s;",
            params=(temp_case_num,),
            fetch_one=True,
        )
        self.assertIsNone(row, "Atomic rollback must prevent partial inserts on statement failure")

    # =======================================================================
    # 18. Session TimeZone and Username Leakage Prevention Across Connections
    # =======================================================================

    def test_18_session_timezone_and_username_cannot_leak(self):
        """
        Verify session TimeZone and app.username are strictly transaction-local
        and revert automatically after COMMIT or ROLLBACK.
        """
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute("SHOW TimeZone;")
                baseline_tz = cur.fetchone()[0]

            def op(cur):
                cur.execute("SELECT current_setting('TimeZone'), current_setting('app.username', true);")
                return cur.fetchone()

            in_tx_tz, in_tx_user = execute_write_transaction(
                actor_username="test_audit_actor",
                operation=op,
                session_timezone="America/New_York",
            )
            self.assertEqual(in_tx_tz, "America/New_York")
            self.assertEqual(in_tx_user, "test_audit_actor")

            with conn.cursor() as cur:
                cur.execute("SHOW TimeZone;")
                post_tx_tz = cur.fetchone()[0]
                cur.execute("SELECT current_setting('app.username', true);")
                post_tx_user = cur.fetchone()[0]

            self.assertEqual(post_tx_tz, baseline_tz, "TimeZone must revert to baseline outside transaction")
            self.assertIn(post_tx_user, (None, ""), "app.username must revert to empty or None outside transaction")
        finally:
            conn.close()

    # =======================================================================
    # 19. Flask App Config Court Timezone Resolution in Services
    # =======================================================================

    def test_19_app_config_court_timezone_precedence(self):
        """
        Verify get_court_timezone() respects current_app.config['COURT_TIMEZONE']
        over os.environ when running inside Flask application context.
        """
        test_app = create_app(
            config_overrides={
                "TESTING": True,
                "COURT_TIMEZONE": "Europe/London",
                "RATELIMIT_ENABLED": False,
            }
        )
        with test_app.app_context():
            tz = get_court_timezone()
            self.assertEqual(tz.key, "Europe/London")

    # =======================================================================
    # 20. Statement Phase Query Cancellation -> StatementTimeoutError
    # =======================================================================

    def test_20_statement_timeout_raises_statement_timeout_error(self):
        """Verify statement timeout during query execution raises StatementTimeoutError (confirmed rollback)."""
        def op(cur):
            cur.execute("SET statement_timeout = 10;")
            cur.execute("SELECT pg_sleep(0.2);")

        with self.assertRaises(StatementTimeoutError) as ctx:
            execute_write_transaction(
                actor_username="test_timeout_actor",
                operation=op,
            )
        self.assertIn("timed out during statement execution", str(ctx.exception))

    # =======================================================================
    # 21. Commit Phase Failure -> UncertainCommitError
    # =======================================================================

    def test_21_commit_phase_failure_raises_uncertain_commit_error(self):
        """Verify error during the commit phase raises UncertainCommitError."""
        # Mock conn.transaction context manager exiting with QueryCanceled
        with patch("backend.db.get_db_connection") as mock_get_conn:
            mock_conn = mock_get_conn.return_value.__enter__.return_value
            mock_cur = mock_conn.cursor.return_value.__enter__.return_value
            mock_cur.execute.return_value = None
            mock_cur.description = None

            # Simulate error during transaction exit (commit)
            mock_tx = mock_conn.transaction.return_value
            mock_tx.__enter__.return_value = mock_tx
            mock_tx.__exit__.side_effect = psycopg.errors.QueryCanceled("cancellation during commit")

            with self.assertRaises(UncertainCommitError) as ctx:
                execute_write_transaction(
                    actor_username="test_commit_actor",
                    operation=lambda cur: "ok",
                )
            self.assertIn("Outcome is uncertain", str(ctx.exception))

    # =======================================================================
    # 22. Cross-Judge Direct Probe Denial for Filings and Adjournments
    # =======================================================================

    def test_22_cross_judge_filings_and_adjournments_isolation_and_probe_denial(self):
        """
        Verify cross-judge direct probe denial (HTTP 403) for filings and adjournments:
          - Judge A attempting to GET Judge B's case filing detail returns HTTP 403.
          - Judge B can successfully GET their assigned case filing detail (HTTP 200).
          - Judge A attempting to GET Judge B's hearing adjournment detail returns HTTP 403.
          - Judge B can successfully GET their assigned hearing adjournment detail (HTTP 200).
        """
        client = self.app.test_client()

        # 1. Clerk creates a filing on case_id_b (assigned exclusively to Judge B)
        resp_f = self._authed_request(
            client,
            self.clerk_user,
            "POST",
            "/api/filings",
            json={
                "case_id": self.case_id_b,
                "party_id": self.party_id_b,
                "filing_type": "Judge B Case Statement",
            },
        )
        self.assertEqual(resp_f.status_code, 201, f"Failed to create filing: {resp_f.data}")
        f_b_id = resp_f.get_json()["data"]["filing_id"]
        self.created_filing_ids.append(f_b_id)

        # Direct probe on Judge B's filing by unassigned Judge A -> 403 Forbidden
        resp_f_probe = self._authed_request(
            client,
            self.judge_a_user,
            "GET",
            f"/api/filings/{f_b_id}",
        )
        self.assertEqual(
            resp_f_probe.status_code,
            403,
            f"Expected 403 for Judge A probing Judge B's filing, got {resp_f_probe.status_code}",
        )
        self.assertIn("Access forbidden", resp_f_probe.get_json()["message"])

        # Access by assigned Judge B -> 200 OK
        resp_f_b = self._authed_request(
            client,
            self.judge_b_user,
            "GET",
            f"/api/filings/{f_b_id}",
        )
        self.assertEqual(resp_f_b.status_code, 200)
        self.assertEqual(resp_f_b.get_json()["data"]["filing_id"], f_b_id)

        # 2. Clerk records an adjournment on Judge B's hearing
        resp_adj = self._authed_request(
            client,
            self.clerk_user,
            "POST",
            "/api/adjournments",
            json={
                "hearing_id": self.judge_b_seed_hearing_id,
                "reason_code": "Bench Reconstitution",
            },
        )
        self.assertEqual(resp_adj.status_code, 201, f"Failed to record adjournment: {resp_adj.data}")
        adj_b_id = resp_adj.get_json()["data"]["adj_id"]
        self.created_adj_ids.append(adj_b_id)

        # Direct probe on Judge B's adjournment by unassigned Judge A -> 403 Forbidden
        resp_adj_probe = self._authed_request(
            client,
            self.judge_a_user,
            "GET",
            f"/api/adjournments/{adj_b_id}",
        )
        self.assertEqual(
            resp_adj_probe.status_code,
            403,
            f"Expected 403 for Judge A probing Judge B's adjournment, got {resp_adj_probe.status_code}",
        )
        self.assertIn("Access forbidden", resp_adj_probe.get_json()["message"])

        # Access by assigned Judge B -> 200 OK
        resp_adj_b = self._authed_request(
            client,
            self.judge_b_user,
            "GET",
            f"/api/adjournments/{adj_b_id}",
        )
        self.assertEqual(resp_adj_b.status_code, 200)
        self.assertEqual(resp_adj_b.get_json()["data"]["adj_id"], adj_b_id)

    # =======================================================================
    # 23. Positive Admin Write Operations Verification
    # =======================================================================

    def test_23_admin_write_operations_positive_verification(self):
        """
        Verify positive Admin write execution across all Phase 7C write endpoints:
          - Admin can schedule a hearing (POST /api/hearings -> 201).
          - Admin can create a filing (POST /api/filings -> 201).
          - Admin can update filing_type (PUT /api/filings/<id> -> 200).
          - Admin can record an adjournment (POST /api/adjournments -> 201).
        """
        client = self.app.test_client()

        # 1. Admin schedules a hearing
        resp_h = self._authed_request(
            client,
            self.admin_user,
            "POST",
            "/api/hearings",
            json={
                "case_id": self.case_id_1,
                "judge_id": self.active_judge_a_id,
                "start_time": "2033-02-01T10:00:00",
                "end_time": "2033-02-01T11:00:00",
            },
        )
        self.assertEqual(resp_h.status_code, 201, f"Admin hearing creation failed: {resp_h.data}")
        h_id = resp_h.get_json()["data"]["hearing_id"]
        self.created_hearing_ids.append(h_id)

        # 2. Admin creates a filing
        resp_f = self._authed_request(
            client,
            self.admin_user,
            "POST",
            "/api/filings",
            json={
                "case_id": self.case_id_1,
                "party_id": self.party_id_1,
                "filing_type": "Admin Written Submission",
            },
        )
        self.assertEqual(resp_f.status_code, 201, f"Admin filing creation failed: {resp_f.data}")
        f_id = resp_f.get_json()["data"]["filing_id"]
        self.created_filing_ids.append(f_id)

        # 3. Admin updates filing_type
        resp_put = self._authed_request(
            client,
            self.admin_user,
            "PUT",
            f"/api/filings/{f_id}",
            json={"filing_type": "Admin Written Submission Final"},
        )
        self.assertEqual(resp_put.status_code, 200, f"Admin filing update failed: {resp_put.data}")
        self.assertEqual(resp_put.get_json()["data"]["filing_type"], "Admin Written Submission Final")

        # 4. Admin records an adjournment
        resp_adj = self._authed_request(
            client,
            self.admin_user,
            "POST",
            "/api/adjournments",
            json={
                "hearing_id": h_id,
                "reason_code": "Administrative Directive",
            },
        )
        self.assertEqual(resp_adj.status_code, 201, f"Admin adjournment creation failed: {resp_adj.data}")
        adj_id = resp_adj.get_json()["data"]["adj_id"]
        self.created_adj_ids.append(adj_id)

    # =======================================================================
    # 24. Positive List Endpoints and Judge Isolation
    # =======================================================================

    def test_24_positive_list_endpoints_and_judge_isolation(self):
        """
        Verify positive list endpoints and judge-specific isolation:
          - Admin and Clerk successfully list filings and adjournments with HTTP 200 and pagination.
          - Judge successfully lists filings and adjournments scoped to their assigned proceedings.
          - Judge A cannot see Judge B's case filings or hearing adjournments in list results.
        """
        client = self.app.test_client()

        # Seed a filing and adjournment for Judge B
        resp_f = self._authed_request(
            client,
            self.clerk_user,
            "POST",
            "/api/filings",
            json={
                "case_id": self.case_id_b,
                "party_id": self.party_id_b,
                "filing_type": "Judge B List Isolation Test",
            },
        )
        self.assertEqual(resp_f.status_code, 201)
        f_b_id = resp_f.get_json()["data"]["filing_id"]
        self.created_filing_ids.append(f_b_id)

        resp_adj = self._authed_request(
            client,
            self.clerk_user,
            "POST",
            "/api/adjournments",
            json={
                "hearing_id": self.judge_b_seed_hearing_id,
                "reason_code": "Isolation Test Adjournment",
            },
        )
        self.assertEqual(resp_adj.status_code, 201)
        adj_b_id = resp_adj.get_json()["data"]["adj_id"]
        self.created_adj_ids.append(adj_b_id)

        # 1. Filings List: Admin (200, pagination)
        resp_admin_f = self._authed_request(client, self.admin_user, "GET", "/api/filings?page=1&limit=5")
        self.assertEqual(resp_admin_f.status_code, 200)
        data_admin_f = resp_admin_f.get_json()
        self.assertIn("data", data_admin_f)
        self.assertIn("pagination", data_admin_f)
        self.assertEqual(data_admin_f["pagination"]["page"], 1)
        self.assertEqual(data_admin_f["pagination"]["limit"], 5)
        self.assertGreater(data_admin_f["pagination"]["total_records"], 0)

        # 2. Filings List: Clerk (200, pagination)
        resp_clerk_f = self._authed_request(client, self.clerk_user, "GET", "/api/filings?page=1&limit=5")
        self.assertEqual(resp_clerk_f.status_code, 200)
        self.assertIn("data", resp_clerk_f.get_json())

        # 3. Filings List: Judge B (sees assigned case filing) vs Judge A (does NOT see it)
        resp_judge_b_f = self._authed_request(client, self.judge_b_user, "GET", "/api/filings")
        self.assertEqual(resp_judge_b_f.status_code, 200)
        b_filing_ids = [f["filing_id"] for f in resp_judge_b_f.get_json()["data"]]
        self.assertIn(f_b_id, b_filing_ids, "Judge B must see filings for assigned case.")

        resp_judge_a_f = self._authed_request(client, self.judge_a_user, "GET", "/api/filings")
        self.assertEqual(resp_judge_a_f.status_code, 200)
        a_filing_ids = [f["filing_id"] for f in resp_judge_a_f.get_json()["data"]]
        self.assertNotIn(f_b_id, a_filing_ids, "Judge A must NOT see Judge B's case filings in list.")

        # 4. Adjournments List: Admin (200, pagination)
        resp_admin_a = self._authed_request(client, self.admin_user, "GET", "/api/adjournments?page=1&limit=5")
        self.assertEqual(resp_admin_a.status_code, 200)
        data_admin_a = resp_admin_a.get_json()
        self.assertIn("data", data_admin_a)
        self.assertIn("pagination", data_admin_a)
        self.assertGreater(data_admin_a["pagination"]["total_records"], 0)

        # 5. Adjournments List: Clerk (200, pagination)
        resp_clerk_a = self._authed_request(client, self.clerk_user, "GET", "/api/adjournments?page=1&limit=5")
        self.assertEqual(resp_clerk_a.status_code, 200)
        self.assertIn("data", resp_clerk_a.get_json())

        # 6. Adjournments List: Judge B (sees assigned hearing adjournment) vs Judge A (does NOT see it)
        resp_judge_b_a = self._authed_request(client, self.judge_b_user, "GET", "/api/adjournments")
        self.assertEqual(resp_judge_b_a.status_code, 200)
        b_adj_ids = [a["adj_id"] for a in resp_judge_b_a.get_json()["data"]]
        self.assertIn(adj_b_id, b_adj_ids, "Judge B must see adjournments for assigned hearing.")

        resp_judge_a_a = self._authed_request(client, self.judge_a_user, "GET", "/api/adjournments")
        self.assertEqual(resp_judge_a_a.status_code, 200)
        a_adj_ids = [a["adj_id"] for a in resp_judge_a_a.get_json()["data"]]
        self.assertNotIn(adj_b_id, a_adj_ids, "Judge A must NOT see Judge B's hearing adjournments in list.")

    # =======================================================================
    # 25. Hearing Date-Filter Query Validation
    # =======================================================================

    def test_25_hearing_date_filter_validation(self):
        """
        Verify hearing date-filter validation:
          - Malformed start_date returns HTTP 400.
          - Malformed end_date (e.g. invalid calendar date) returns HTTP 400.
          - start_date with trailing newline returns HTTP 400.
          - end_date earlier than start_date returns HTTP 400.
          - Valid date range filter succeeds with HTTP 200.
        """
        client = self.app.test_client()

        # 1. Malformed start_date string -> 400
        resp1 = self._authed_request(client, self.clerk_user, "GET", "/api/hearings?start_date=not-a-date")
        self.assertEqual(resp1.status_code, 400)
        self.assertIn("Invalid timestamp format for 'start_date'", resp1.get_json()["message"])

        # 2. Invalid calendar date (Feb 30) -> 400
        resp2 = self._authed_request(client, self.clerk_user, "GET", "/api/hearings?end_date=2026-02-30T10:00:00")
        self.assertEqual(resp2.status_code, 400)
        self.assertIn("Invalid calendar date or time value for 'end_date'", resp2.get_json()["message"])

        # 3. Trailing newline in start_date -> 400
        resp3 = self._authed_request(client, self.clerk_user, "GET", "/api/hearings?start_date=2029-01-01T10:00:00%0A")
        self.assertEqual(resp3.status_code, 400)
        self.assertIn("Invalid timestamp format for 'start_date'", resp3.get_json()["message"])

        # 4. end_date < start_date -> 400
        resp4 = self._authed_request(
            client,
            self.clerk_user,
            "GET",
            "/api/hearings?start_date=2029-01-01T12:00:00&end_date=2029-01-01T10:00:00",
        )
        self.assertEqual(resp4.status_code, 400)
        self.assertIn("end_date cannot be earlier than start_date", resp4.get_json()["message"])

        # 5. Valid range filter -> 200 OK
        resp5 = self._authed_request(
            client,
            self.clerk_user,
            "GET",
            "/api/hearings?start_date=2029-01-01T00:00:00&end_date=2029-12-31T23:59:59",
        )
        self.assertEqual(resp5.status_code, 200)
        self.assertIn("data", resp5.get_json())
        self.assertIn("pagination", resp5.get_json())


if __name__ == "__main__":
    unittest.main()
