"""
Court Case Management System - Phase 4 Verification Test Suite
Tests all security corrections and requirements across authentication, session management,
CLI admin bootstrap, input validation, atomic throttling, and extension architecture.

Safety & Privacy Rules:
  - No real development passwords are hardcoded in this file.
  - Environment variables or isolated test fixtures are used exclusively.
  - Passwords and secret credentials are never printed or logged.
  - Never accesses or modifies court_case_db.
  - Preserves all existing database records and schema in court_case_dev.
"""

from concurrent.futures import ThreadPoolExecutor
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from flask import Request
from werkzeug.test import EnvironBuilder

# Ensure backend can be imported
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.app import create_app
from backend.auth.routes import auth_bp
from backend.auth.security import hash_password, verify_password
from backend.auth.services import (
    authenticate_user,
    check_and_apply_throttling,
    clear_failed_logins,
    get_throttling_backend,
    get_throttling_cache,
    record_failed_login,
    set_throttling_backend,
    set_throttling_cache,
    LUA_ATOMIC_INCR_EXPIRE,
)
from backend.auth.session_manager import (
    establish_user_session,
    get_current_session_user,
    regenerate_session_id,
    terminate_user_session,
)
from backend.cli.create_admin import (
    ADMIN_BOOTSTRAP_LOCK_KEY,
    bootstrap_admin,
    main as cli_main,
)
from backend.config import Config
from backend.extensions import (
    csrf,
    get_execution_environment,
    is_production_environment,
    limiter,
    server_session,
    CANONICAL_ENV_VAR,
    PRODUCTION_ENVIRONMENTS,
    VALID_ENVIRONMENTS,
)


class Phase4SecurityCorrectionsTestCase(unittest.TestCase):
    """Test suite verifying all Phase 4 security corrections and regression requirements."""

    @classmethod
    def setUpClass(cls):
        cls.app = create_app(
            config_overrides={
                "TESTING": True,
                "WTF_CSRF_ENABLED": False,  # Disabled for payload validation unit tests
                "RATELIMIT_ENABLED": False,  # Isolate from Limiter IP limits for throttling tests
            }
        )
        cls.client = cls.app.test_client()

    def setUp(self):
        # Reset throttling backend before each test
        set_throttling_backend(None, None)

    def tearDown(self):
        set_throttling_backend(None, None)

    # -----------------------------------------------------------------------
    # Requirement 1 & 3: Admin Bootstrap CLI & In-Function Password Policy
    # -----------------------------------------------------------------------
    def test_01_cli_rejects_password_flag(self):
        """Verify --password flag is rejected by argparse."""
        dummy_flag_pass = os.getenv("TEST_DUMMY_PASSWORD", "CandidatePass123!@#")
        with patch("sys.argv", ["create_admin.py", "--username", "testadmin", "--password", dummy_flag_pass]):
            with self.assertRaises(SystemExit) as cm:
                cli_main()
            # Argparse exits with status code 2 on unknown arguments
            self.assertEqual(cm.exception.code, 2)

    def test_02_cli_duplicate_admin_prevention(self):
        """Verify admin bootstrap refuses to create another admin if one exists."""
        dummy_pass = os.getenv("TEST_CANDIDATE_PASSWORD", "CandidatePass123!@#")
        result = bootstrap_admin(username="new_admin_attempt", password=dummy_pass)
        self.assertFalse(result, "bootstrap_admin must return False when an admin already exists.")

    def test_03_cli_advisory_lock_constant(self):
        """Verify advisory lock constant is defined and non-zero."""
        self.assertEqual(ADMIN_BOOTSTRAP_LOCK_KEY, 987654321)

    # -----------------------------------------------------------------------
    # Requirement 4 & 5: Atomic Progressive Throttling & Redis Health Checks
    # -----------------------------------------------------------------------
    def test_04_throttling_uses_bounded_simplecache_in_dev(self):
        """Verify throttling cache uses bounded SimpleCache in development."""
        backend_type, cache = get_throttling_backend()
        from cachelib import SimpleCache

        self.assertEqual(backend_type, "simple")
        self.assertIsInstance(cache, SimpleCache)
        self.assertEqual(cache._threshold, 1000)
        self.assertEqual(cache.default_timeout, 900)

    def test_05_throttling_is_compound_and_non_blocking(self):
        """Verify throttling tracks (client_ip, username) pairs without blocking sleeps."""
        ip_1 = "192.168.1.100"
        ip_2 = "192.168.1.200"
        user = "test_user_throttle"

        clear_failed_logins(ip_1, user)
        clear_failed_logins(ip_2, user)

        # Record 4 failed attempts for (ip_1, user) -> should not be throttled yet
        for _ in range(4):
            record_failed_login(ip_1, user)
        self.assertFalse(check_and_apply_throttling(ip_1, user))

        # 5th attempt reaches threshold -> should be throttled
        record_failed_login(ip_1, user)
        self.assertTrue(check_and_apply_throttling(ip_1, user))

        # Legitimate user from different IP must NOT be throttled (no DoS)
        self.assertFalse(check_and_apply_throttling(ip_2, user))

        # Different user from same IP must NOT be throttled
        self.assertFalse(check_and_apply_throttling(ip_1, "other_user"))

        # Clearing failed logins resets the throttle
        clear_failed_logins(ip_1, user)
        self.assertFalse(check_and_apply_throttling(ip_1, user))

    def test_06_throttling_fails_safely_in_production_without_redis(self):
        """Verify get_throttling_backend raises RuntimeError in production when Redis URI is absent."""
        set_throttling_backend(None, None)
        with patch("backend.auth.services.is_production_environment", return_value=True):
            with patch.dict(os.environ, {"RATELIMIT_STORAGE_URI": "memory://", "REDIS_URL": ""}):
                with patch.object(Config, "RATELIMIT_STORAGE_URI", "memory://"):
                    with self.assertRaises(RuntimeError) as cm:
                        get_throttling_backend()
                    self.assertIn("Shared persistent cache (Redis) is required", str(cm.exception))
        set_throttling_backend(None, None)

    # -----------------------------------------------------------------------
    # Requirement 2 & 3: Session Lifecycle via Supported Public APIs
    # -----------------------------------------------------------------------
    def test_07_regenerate_session_id_missing_interface_raises_error(self):
        """Verify regenerate_session_id raises RuntimeError if regenerate() is missing."""
        with self.app.test_request_context():
            mock_interface = MagicMock(spec=[])  # Object without 'regenerate' attribute
            with patch.object(self.app, "session_interface", mock_interface):
                with self.assertRaises(RuntimeError) as cm:
                    regenerate_session_id()
                self.assertIn("session_interface does not implement 'regenerate'", str(cm.exception))

    def test_08_session_file_lifecycle_login_and_logout(self):
        """
        Comprehensive session lifecycle verification using supported public APIs:
          - Pre-login session acquisition and initial session ID capture.
          - Session ID regeneration upon login (pre-login SID != post-login SID).
          - Identification and verification of the EXACT session file created on disk.
          - Verification that authenticated session record is stored server-side via public open_session().
          - Verification that pre-login session ID cannot be reused after login.
          - Physical verification that the exact server-side session file is deleted upon logout.
          - Verification that client cookie is expired with Max-Age=0 / Expires=1970.
        """
        app_with_csrf = create_app(
            config_overrides={
                "TESTING": True,
                "WTF_CSRF_ENABLED": True,
                "RATELIMIT_ENABLED": False,
            }
        )
        client = app_with_csrf.test_client()
        cookie_name = app_with_csrf.config.get("SESSION_COOKIE_NAME", "ccms_session")
        interface = app_with_csrf.session_interface
        session_dir = Path(app_with_csrf.config.get("SESSION_FILE_DIR"))
        session_dir.mkdir(parents=True, exist_ok=True)

        # Snapshot of filesystem session storage before test
        files_pre_test = {p for p in session_dir.glob("*") if p.is_file()}

        # Step 1: Pre-login request to acquire CSRF token and establish pre-login session
        csrf_resp = client.get("/auth/csrf-token")
        self.assertEqual(csrf_resp.status_code, 200)
        csrf_token = csrf_resp.get_json()["csrf_token"]

        pre_cookie = client.get_cookie(cookie_name)
        self.assertIsNotNone(pre_cookie, "Pre-login session cookie must be set.")
        pre_login_cookie_val = pre_cookie.value

        # Files present after pre-login
        files_pre_login = {p for p in session_dir.glob("*") if p.is_file()}

        # Step 2: Isolated test fixture for authentication (zero hardcoded real passwords)
        fixture_user = {
            "user_id": 9999,
            "username": "session_fixture_user",
            "role": "admin",
            "judge_id": None,
        }
        dummy_test_pass = os.getenv("TEST_FIXTURE_PASSWORD", "FixturePass123!@#")

        with patch("backend.auth.routes.authenticate_user", return_value=(fixture_user, None, 200)):
            login_resp = client.post(
                "/auth/login",
                json={"username": fixture_user["username"], "password": dummy_test_pass},
                headers={"X-CSRF-Token": csrf_token},
            )

        self.assertEqual(login_resp.status_code, 200)
        login_data = login_resp.get_json()
        self.assertEqual(login_data["status"], "success")
        post_login_csrf = login_data["csrf_token"]

        # Step 3: Verify session ID regeneration
        post_cookie = client.get_cookie(cookie_name)
        self.assertIsNotNone(post_cookie, "Post-login session cookie must be set.")
        post_login_cookie_val = post_cookie.value
        self.assertNotEqual(
            pre_login_cookie_val,
            post_login_cookie_val,
            "Pre-login session ID must be regenerated on login to prevent session fixation.",
        )

        # Step 4: Identify the EXACT server-side session file created for the post-login session
        files_post_login = {p for p in session_dir.glob("*") if p.is_file()}
        new_session_files = files_post_login - files_pre_login

        self.assertEqual(
            len(new_session_files),
            1,
            f"Expected exactly 1 new server-side session file, found: {new_session_files}",
        )
        exact_session_file = next(iter(new_session_files))
        self.assertTrue(
            exact_session_file.exists() and exact_session_file.is_file(),
            f"Exact session file {exact_session_file.name} must physically exist on disk.",
        )
        self.assertGreater(
            exact_session_file.stat().st_size,
            0,
            "Server-side session file must not be empty.",
        )

        # Also verify the authenticated session is loaded server-side via public open_session()
        builder = EnvironBuilder(headers={"Cookie": f"{cookie_name}={post_login_cookie_val}"})
        req_with_cookie = Request(builder.get_environ())
        loaded_session = interface.open_session(app_with_csrf, req_with_cookie)

        self.assertTrue(
            bool(loaded_session),
            "Server-side storage must contain an active, non-empty session for the post-login cookie.",
        )
        self.assertEqual(loaded_session.get("username"), fixture_user["username"])
        self.assertEqual(loaded_session.get("user_id"), fixture_user["user_id"])

        # Step 5: Verify pre-login session ID cannot be reused after successful login
        attacker_client = app_with_csrf.test_client()
        attacker_client.set_cookie(cookie_name, pre_login_cookie_val)
        stolen_resp = attacker_client.get("/auth/me")
        self.assertEqual(
            stolen_resp.status_code,
            401,
            "Reusing pre-login session ID must not grant access to authenticated user context.",
        )

        # Step 6: Verify live session verification on /auth/me with active post-login cookie
        with patch("backend.auth.routes.get_user_by_id", return_value=fixture_user):
            me_resp = client.get("/auth/me")
            self.assertEqual(me_resp.status_code, 200)
            self.assertEqual(me_resp.get_json()["user"]["username"], fixture_user["username"])

        # Step 7: Logout
        logout_resp = client.post(
            "/auth/logout",
            headers={"X-CSRF-Token": post_login_csrf},
        )
        self.assertEqual(logout_resp.status_code, 200)

        # Step 8: Physically verify that the EXACT server-side session file is deleted upon logout
        self.assertFalse(
            exact_session_file.exists(),
            f"Exact server-side session file ({exact_session_file.name}) must be physically deleted upon logout.",
        )
        files_after_logout = {p for p in session_dir.glob("*") if p.is_file()}
        self.assertNotIn(
            exact_session_file,
            files_after_logout,
            "Exact authenticated session file must not exist in storage directory after logout.",
        )

        # Also verify via public open_session() that storage record is completely gone
        loaded_after_logout = interface.open_session(app_with_csrf, req_with_cookie)
        self.assertFalse(
            bool(loaded_after_logout) and loaded_after_logout.get("user_id") is not None,
            "Server-side session record must be deleted upon logout.",
        )

        # Step 9: Verify client cookie is expired in response headers
        set_cookie_headers = logout_resp.headers.getlist("Set-Cookie")
        cookie_header_str = " ".join(set_cookie_headers)
        self.assertTrue(
            f"{cookie_name}=" in cookie_header_str,
            "Set-Cookie header must target the session cookie on logout.",
        )
        self.assertTrue(
            "Expires=Thu, 01 Jan 1970" in cookie_header_str
            or "Max-Age=0" in cookie_header_str
            or f"{cookie_name}=;" in cookie_header_str,
            "Set-Cookie header must expire/delete the cookie on logout.",
        )

    # -----------------------------------------------------------------------
    # Requirement 4: Strict JSON Payload Input Validation
    # -----------------------------------------------------------------------
    def test_09_login_malformed_inputs_return_400(self):
        """Verify all malformed payloads return HTTP 400 without 500 error."""
        malformed_cases = [
            ("Non-JSON string", "plain text body", "text/plain"),
            ("JSON array", ["test_admin", "pwd"], "application/json"),
            ("Integer body", 12345, "application/json"),
            ("Missing password", {"username": "test_admin"}, "application/json"),
            ("Missing username", {"password": "pwd"}, "application/json"),
            ("Non-string username (int)", {"username": 123, "password": "pwd"}, "application/json"),
            ("Non-string password (list)", {"username": "test_admin", "password": ["pwd"]}, "application/json"),
            ("Empty username", {"username": "", "password": "pwd"}, "application/json"),
            ("Whitespace username", {"username": "   ", "password": "pwd"}, "application/json"),
            ("Empty password", {"username": "test_admin", "password": ""}, "application/json"),
            ("Too short username (<3 chars)", {"username": "ad", "password": "pwd"}, "application/json"),
            ("Too long username (>50 chars)", {"username": "a" * 51, "password": "pwd"}, "application/json"),
            ("Too long password (>256 chars)", {"username": "test_admin", "password": "p" * 257}, "application/json"),
            ("Special characters in username", {"username": "admin';--", "password": "pwd"}, "application/json"),
        ]

        for desc, payload, content_type in malformed_cases:
            with self.subTest(case=desc):
                if content_type == "application/json":
                    resp = self.client.post("/auth/login", json=payload)
                else:
                    resp = self.client.post(
                        "/auth/login",
                        data=payload,
                        content_type=content_type,
                    )
                self.assertEqual(
                    resp.status_code,
                    400,
                    f"Expected 400 for '{desc}', got {resp.status_code}: {resp.get_data(as_text=True)}",
                )
                data = resp.get_json()
                self.assertEqual(data.get("status"), "error")

    # -----------------------------------------------------------------------
    # Requirement 5: Canonical Database Validation
    # -----------------------------------------------------------------------
    def test_10_app_validates_against_canonical_config_constants(self):
        """Verify create_app refuses blocked databases even if overrides attempt to spoof ALLOWED_DATABASE."""
        with self.assertRaises(RuntimeError) as cm:
            create_app(config_overrides={"ALLOWED_DATABASE": "court_case_db"})
        self.assertIn("Overriding database configuration setting 'ALLOWED_DATABASE' is strictly forbidden", str(cm.exception))

        with self.assertRaises(RuntimeError) as cm:
            create_app(config_overrides={"DB_NAME": "court_case_db"})
        self.assertIn("Overriding database configuration setting 'DB_NAME' is strictly forbidden", str(cm.exception))

    # -----------------------------------------------------------------------
    # Requirement 6: Extension Architecture & Circular Import Prevention
    # -----------------------------------------------------------------------
    def test_11_routes_imports_limiter_from_extensions(self):
        """Verify routes.py imports limiter from backend.extensions."""
        import backend.auth.routes as routes_module

        self.assertIs(routes_module.limiter, limiter)

    # -----------------------------------------------------------------------
    # Requirement 7: Judge Inactive Protection & Read-Only Health Endpoint
    # -----------------------------------------------------------------------
    def test_12_judge_deactivated_login_refused_with_403(self):
        """Verify login for deactivated judge account returns HTTP 403 using isolated fixture."""
        dummy_pass = os.getenv("TEST_INACTIVE_JUDGE_PASSWORD", "InactiveJudgePass123!@#")
        hashed_dummy = hash_password(dummy_pass)

        mock_inactive_judge_row = {
            "user_id": 3,
            "username": "judge_inactive",
            "password": hashed_dummy,
            "role": "judge",
            "judge_id": "00000000-0000-0000-0000-000000000001",
            "judge_active": False,
            "judge_name": "Hon'ble Inactive Judge",
        }

        with patch("backend.auth.services.execute_read_query", return_value=mock_inactive_judge_row):
            resp = self.client.post(
                "/auth/login",
                json={"username": "judge_inactive", "password": dummy_pass},
            )
            self.assertEqual(resp.status_code, 403)
            self.assertIn("deactivated", resp.get_json()["message"].lower())

    def test_13_health_db_read_only(self):
        """Verify /health/db returns connected status and total cases."""
        resp = self.client.get("/health/db")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertEqual(data["status"], "connected")
        self.assertEqual(data["database"], "court_case_dev")
        self.assertEqual(data["total_cases"], 1000)

    def test_14_root_endpoint(self):
        """Verify GET / returns running status."""
        resp = self.client.get("/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.get_json()["status"], "success")

    # -----------------------------------------------------------------------
    # Regression Finding 3: bootstrap_admin() Enforces Password Policy
    # -----------------------------------------------------------------------
    def test_15_bootstrap_admin_enforces_password_strength_directly(self):
        """Verify direct calls to bootstrap_admin() fail if password does not meet policy."""
        weak_passwords = [
            "short",
            "alllowercase123!",
            "ALLUPPERCASE123!",
            "NoSpecialCharacter123",
            "NoDigitsAtAll!@#",
        ]
        for weak in weak_passwords:
            with self.subTest(weak_password=weak):
                result = bootstrap_admin(username="direct_admin_test", password=weak)
                self.assertFalse(result, f"bootstrap_admin must reject weak password: '{weak}'")

    # -----------------------------------------------------------------------
    # Coverage Tests: Requirement 4 Throttling Counter Lifecycle
    # -----------------------------------------------------------------------
    def test_16_failed_login_initializes_counter_to_one(self):
        """Verify that the first failed login initializes the counter to exactly 1."""
        ip = "192.168.10.1"
        user = "counter_init_user"
        clear_failed_logins(ip, user)

        record_failed_login(ip, user)

        backend_type, cache = get_throttling_backend()
        self.assertEqual(backend_type, "simple")
        key = f"ccms:throttle:{ip}:{user}"
        self.assertEqual(cache.get(key), 1, "First failed login must initialize counter to 1.")
        clear_failed_logins(ip, user)

    def test_17_atomic_throttling_concurrency_threads_produces_exact_five(self):
        """Verify 5 concurrent failed attempts produce a counter of exactly 5."""
        ip = "10.0.0.99"
        username = "concurrent_test_user"
        clear_failed_logins(ip, username)

        # Run 5 concurrent failed login recordings across worker threads
        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(record_failed_login, ip, username) for _ in range(5)]
            for f in futures:
                f.result()

        # The count must be exactly 5 and throttling must be active
        self.assertTrue(check_and_apply_throttling(ip, username))

        backend_type, cache = get_throttling_backend()
        key = f"ccms:throttle:{ip}:{username}"
        self.assertEqual(cache.get(key), 5, "Concurrent increments must produce exactly 5.")
        clear_failed_logins(ip, username)

    def test_18_throttling_counter_expires_after_ttl(self):
        """Verify that the throttling counter expires after its configured TTL."""
        ip = "192.168.10.2"
        user = "expire_test_user"
        clear_failed_logins(ip, user)

        # Record attempt at baseline timestamp
        with patch("cachelib.simple.time", return_value=1000.0):
            record_failed_login(ip, user)
            backend_type, cache = get_throttling_backend()
            key = f"ccms:throttle:{ip}:{user}"
            self.assertEqual(cache.get(key), 1)

        # At timestamp 1901.0 (901 seconds later, TTL=900s), counter must be expired (None)
        with patch("cachelib.simple.time", return_value=1901.0):
            self.assertIsNone(cache.get(key), "Counter must be expired after 900s TTL.")
            self.assertFalse(check_and_apply_throttling(ip, user), "Throttling must not be active after expiry.")

        clear_failed_logins(ip, user)

    def test_19_successful_authentication_clears_counter(self):
        """Verify successful authentication clears the throttling counter."""
        ip = "192.168.10.3"
        user = "auth_clear_user"
        clear_failed_logins(ip, user)

        # Record 3 failures
        for _ in range(3):
            record_failed_login(ip, user)

        backend_type, cache = get_throttling_backend()
        key = f"ccms:throttle:{ip}:{user}"
        self.assertEqual(cache.get(key), 3)

        # Clear on successful authentication
        clear_failed_logins(ip, user)
        self.assertIsNone(cache.get(key), "Counter must be deleted upon clear_failed_logins.")
        self.assertFalse(check_and_apply_throttling(ip, user))

    def test_20_redis_lua_script_invoked_via_explicit_client(self):
        """Verify Redis backend triggers atomic Lua script and operations through explicitly managed redis-py client."""
        mock_redis_client = MagicMock()
        set_throttling_backend("redis", mock_redis_client)

        # 1. Test record_failed_login invokes eval() with atomic script
        record_failed_login("10.0.0.1", "redis_user")
        mock_redis_client.eval.assert_called_once_with(
            LUA_ATOMIC_INCR_EXPIRE,
            1,
            "ccms:throttle:10.0.0.1:redis_user",
            900,
        )

        # 2. Test check_and_apply_throttling invokes get()
        mock_redis_client.get.return_value = "5"
        throttled = check_and_apply_throttling("10.0.0.1", "redis_user")
        self.assertTrue(throttled)
        mock_redis_client.get.assert_called_once_with("ccms:throttle:10.0.0.1:redis_user")

        # 3. Test clear_failed_logins invokes delete()
        clear_failed_logins("10.0.0.1", "redis_user")
        mock_redis_client.delete.assert_called_once_with("ccms:throttle:10.0.0.1:redis_user")

        set_throttling_backend(None, None)

    def test_21_production_redis_failures_do_not_expose_credentials(self):
        """Verify Redis connectivity failure during production initialization fails closed without exposing secrets."""
        set_throttling_backend(None, None)

        mock_redis_module = MagicMock()
        mock_client = MagicMock()
        mock_client.ping.side_effect = TimeoutError("Connection to redis://super_secret_user:super_secret_password@host:6379 timed out")
        mock_redis_module.Redis.from_url.return_value = mock_client

        with patch("backend.auth.services.is_production_environment", return_value=True):
            with patch.dict(os.environ, {"RATELIMIT_STORAGE_URI": "redis://super_secret_user:super_secret_password@127.0.0.1:6379/0"}):
                with patch.object(Config, "RATELIMIT_STORAGE_URI", "redis://super_secret_user:super_secret_password@127.0.0.1:6379/0"):
                    with patch.dict("sys.modules", {"redis": mock_redis_module}):
                        with self.assertRaises(RuntimeError) as cm:
                            get_throttling_backend()

                        err_msg = str(cm.exception)
                        # Verify safe error message
                        self.assertIn("unable to establish a verified connection to shared persistent storage", err_msg)
                        # Verify credentials and URLs are NOT exposed
                        self.assertNotIn("super_secret_password", err_msg)
                        self.assertNotIn("super_secret_user", err_msg)

                        # Verify bounded timeouts were passed to from_url
                        mock_redis_module.Redis.from_url.assert_called_once_with(
                            "redis://super_secret_user:super_secret_password@127.0.0.1:6379/0",
                            socket_connect_timeout=2.0,
                            socket_timeout=2.0,
                            decode_responses=True,
                        )

        set_throttling_backend(None, None)

    # -----------------------------------------------------------------------
    # Requirement 5: Development DEBUG Default Setting
    # -----------------------------------------------------------------------
    def test_22_development_debug_defaults_to_false(self):
        """Verify that DEBUG is False by default and only enabled through explicit development configuration."""
        # 1. By default, app created without overrides must have DEBUG=False
        app_default = create_app()
        self.assertFalse(app_default.config["DEBUG"], "DEBUG must be False by default.")

        # 2. Enabled through explicit configuration override in development
        app_debug_override = create_app(config_overrides={"DEBUG": True})
        self.assertTrue(app_debug_override.config["DEBUG"], "DEBUG should be True when explicitly configured.")

        # 3. In production, DEBUG must always be False even if override attempts to enable it
        import redis
        mock_prod_redis = MagicMock(spec=redis.Redis)
        mock_prod_redis.ping.return_value = True
        with patch("backend.app.is_production_environment", return_value=True):
            with patch.object(redis.Redis, "from_url", return_value=mock_prod_redis):
                app_prod = create_app(
                    config_overrides={
                        "DEBUG": True,
                        "SESSION_TYPE": "redis",
                        "SESSION_REDIS_URL": "redis://127.0.0.1:6379/1",
                        "RATELIMIT_STORAGE_URI": "redis://127.0.0.1:6379/1",
                    }
                )
                self.assertFalse(app_prod.config["DEBUG"], "Production must unconditionally force DEBUG=False.")

    # -----------------------------------------------------------------------
    # Requirement 2 & 3: Sliding Window Throttling Semantics
    # -----------------------------------------------------------------------
    def test_23_throttling_sliding_window_semantics_simplecache(self):
        """
        Verify that SimpleCache implements sliding-window TTL semantics:
        every failed login attempt refreshes the 900-second window.
        """
        ip = "192.168.20.1"
        user = "sliding_window_user"
        clear_failed_logins(ip, user)

        # Attempt 1 at t=1000s: Initial window expires at t=1900s
        with patch("cachelib.simple.time", return_value=1000.0):
            record_failed_login(ip, user)
            backend_type, cache = get_throttling_backend()
            key = f"ccms:throttle:{ip}:{user}"
            self.assertEqual(cache.get(key), 1)

        # Attempt 2 at t=1500s (500s later): TTL slides forward by 900s to t=2400s
        with patch("cachelib.simple.time", return_value=1500.0):
            record_failed_login(ip, user)
            self.assertEqual(cache.get(key), 2)

        # At t=2000s (past the initial 1900s expiration, but within the sliding 2400s window):
        # Counter must still be active and equal to 2 (sliding window proved)
        with patch("cachelib.simple.time", return_value=2000.0):
            self.assertEqual(cache.get(key), 2, "Counter must remain active past initial TTL due to sliding window.")
            self.assertFalse(check_and_apply_throttling(ip, user))

        # At t=2401s (after the refreshed 900s window has fully elapsed):
        # Counter must be expired
        with patch("cachelib.simple.time", return_value=2401.0):
            self.assertIsNone(cache.get(key), "Counter must expire once the sliding window has elapsed.")
            self.assertFalse(check_and_apply_throttling(ip, user))

        clear_failed_logins(ip, user)

    def test_24_throttling_sliding_window_semantics_redis_lua(self):
        """
        Verify that the Redis Lua script executes atomic INCR and EXPIRE on every failed attempt,
        providing identical sliding-window semantics to SimpleCache.
        """
        mock_redis_client = MagicMock()
        set_throttling_backend("redis", mock_redis_client)

        record_failed_login("10.0.0.2", "sliding_redis_user")

        # Verify eval was called with the sliding-window Lua script and 900s TTL
        mock_redis_client.eval.assert_called_once_with(
            LUA_ATOMIC_INCR_EXPIRE,
            1,
            "ccms:throttle:10.0.0.2:sliding_redis_user",
            900,
        )

        # Verify that the script unconditionally calls EXPIRE (no conditional guard)
        self.assertIn("redis.call('INCR', KEYS[1])", LUA_ATOMIC_INCR_EXPIRE)
        self.assertIn("redis.call('EXPIRE', KEYS[1], ARGV[1])", LUA_ATOMIC_INCR_EXPIRE)
        self.assertNotIn("if current == 1", LUA_ATOMIC_INCR_EXPIRE, "Sliding window policy must refresh TTL on every attempt.")

        set_throttling_backend(None, None)

    # -----------------------------------------------------------------------
    # Requirement 1, 2, 3: Production Session Storage & Security Enforcement
    # -----------------------------------------------------------------------
    def test_25_development_defaults_to_filesystem_sessions(self):
        """Verify development defaults to filesystem sessions and SESSION_COOKIE_SECURE=False."""
        app_dev = create_app()
        self.assertEqual(app_dev.config["SESSION_TYPE"], "filesystem")
        self.assertFalse(app_dev.config["SESSION_COOKIE_SECURE"])

    def test_26_production_rejects_filesystem_sessions(self):
        """Verify production environment strictly rejects filesystem session storage."""
        with patch("backend.app.is_production_environment", return_value=True):
            with self.assertRaises(RuntimeError) as cm:
                create_app(config_overrides={"SESSION_TYPE": "filesystem"})
            self.assertIn("SESSION_TYPE must be 'redis'", str(cm.exception))
            self.assertIn("Filesystem session storage is strictly forbidden in production", str(cm.exception))

    def test_27_production_rejects_missing_redis_session_configuration(self):
        """Verify production rejects missing or invalid Redis session configuration."""
        with patch("backend.app.is_production_environment", return_value=True):
            with patch.dict(os.environ, {"SESSION_REDIS_URL": "", "REDIS_URL": "", "RATELIMIT_STORAGE_URI": ""}):
                with self.assertRaises(RuntimeError) as cm:
                    create_app(
                        config_overrides={
                            "SESSION_TYPE": "redis",
                            "SESSION_REDIS_URL": "",
                            "REDIS_URL": "",
                            "SESSION_REDIS": None,
                        }
                    )
                self.assertIn("Production session storage configuration failure", str(cm.exception))

    def test_28_production_initializes_redis_sessions_when_configured(self):
        """Verify production initializes Flask-Session with a verified Redis client."""
        import redis
        mock_client = MagicMock(spec=redis.Redis)

        with patch("backend.app.is_production_environment", return_value=True):
            with patch.object(redis.Redis, "from_url", return_value=mock_client) as mock_from_url:
                app_prod = create_app(
                    config_overrides={
                        "SESSION_TYPE": "redis",
                        "SESSION_REDIS_URL": "redis://127.0.0.1:6379/2",
                    }
                )
                self.assertEqual(app_prod.config["SESSION_TYPE"], "redis")
                self.assertIs(app_prod.config["SESSION_REDIS"], mock_client)
                self.assertTrue(app_prod.config["SESSION_COOKIE_SECURE"])
                mock_client.ping.assert_called()
                mock_from_url.assert_any_call(
                    "redis://127.0.0.1:6379/2",
                    socket_connect_timeout=2.0,
                    socket_timeout=2.0,
                )

    def test_29_production_always_enforces_cookie_secure(self):
        """Verify production always enforces SESSION_COOKIE_SECURE=True regardless of overrides."""
        import redis
        mock_client = MagicMock(spec=redis.Redis)
        mock_client.ping.return_value = True
        with patch("backend.app.is_production_environment", return_value=True):
            with patch.object(redis.Redis, "from_url", return_value=mock_client):
                app_prod = create_app(
                    config_overrides={
                        "SESSION_TYPE": "redis",
                        "SESSION_REDIS_URL": "redis://127.0.0.1:6379/1",
                        "RATELIMIT_STORAGE_URI": "redis://127.0.0.1:6379/1",
                        "SESSION_COOKIE_SECURE": False,  # Attempting to override to False
                    }
                )
                self.assertTrue(
                    app_prod.config["SESSION_COOKIE_SECURE"],
                    "Production must unconditionally enforce SESSION_COOKIE_SECURE=True.",
                )

    def test_30_production_cannot_bypass_redis_throttling_through_simplecache(self):
        """Verify production environment strictly forbids SimpleCache injection or bypass."""
        from cachelib import SimpleCache
        dummy_cache = SimpleCache()

        with patch("backend.auth.services.is_production_environment", return_value=True):
            # 1. Attempting to set backend to 'simple' in production raises RuntimeError
            with self.assertRaises(RuntimeError) as cm:
                set_throttling_backend("simple", dummy_cache)
            self.assertIn("SimpleCache is strictly forbidden in production", str(cm.exception))

            # 2. Attempting to use set_throttling_cache with SimpleCache in production raises RuntimeError
            with self.assertRaises(RuntimeError) as cm:
                set_throttling_cache(dummy_cache)
            self.assertIn("SimpleCache is strictly forbidden in production", str(cm.exception))

    # -----------------------------------------------------------------------
    # Requirement 6: Hardened Environment Detection & Canonical Resolution
    # -----------------------------------------------------------------------
    def test_31_conflicting_environment_variables_raise_runtime_error(self):
        """
        Verify that conflicting environment variables (e.g., ENV=development with APP_ENV=production)
        raise a descriptive RuntimeError rather than silently choosing development.
        """
        # Test ENV=development with APP_ENV=production
        with patch.dict(os.environ, {"ENV": "development", "APP_ENV": "production", "FLASK_ENV": ""}):
            with self.assertRaises(RuntimeError) as cm:
                get_execution_environment()
            err = str(cm.exception)
            self.assertIn("Conflicting environment configurations detected", err)
            self.assertIn("ENV='development'", err)
            self.assertIn("APP_ENV='production'", err)

        # Verify is_production_environment also raises on conflict
        with patch.dict(os.environ, {"ENV": "development", "APP_ENV": "production", "FLASK_ENV": ""}):
            with self.assertRaises(RuntimeError) as cm:
                is_production_environment()
            self.assertIn("Conflicting environment configurations detected", str(cm.exception))

        # Verify create_app() raises on conflicting environment variables
        with patch.dict(os.environ, {"ENV": "development", "APP_ENV": "production", "FLASK_ENV": ""}):
            with self.assertRaises(RuntimeError) as cm:
                create_app()
            self.assertIn("Conflicting environment configurations detected", str(cm.exception))

    def test_32_invalid_environment_identifier_rejected(self):
        """
        Verify that unknown environment identifiers or typos (e.g., 'prodution')
        raise a descriptive RuntimeError instead of being treated as development.
        """
        # Test typo 'prodution' in ENV
        with patch.dict(os.environ, {"ENV": "prodution", "APP_ENV": "", "FLASK_ENV": ""}):
            with self.assertRaises(RuntimeError) as cm:
                get_execution_environment()
            err = str(cm.exception)
            self.assertIn("Unknown or invalid environment identifier 'prodution'", err)
            self.assertIn("ENV", err)

        # Direct call to is_production_environment with invalid name raises
        with self.assertRaises(RuntimeError) as cm:
            is_production_environment("prodution")
        self.assertIn("Unknown or invalid environment identifier: 'prodution'", str(cm.exception))

        # Verify create_app() raises when an invalid environment is configured
        with patch.dict(os.environ, {"ENV": "prodution", "APP_ENV": "", "FLASK_ENV": ""}):
            with self.assertRaises(RuntimeError) as cm:
                create_app()
            self.assertIn("Unknown or invalid environment identifier 'prodution'", str(cm.exception))

    def test_33_no_environment_variable_configured_defaults_to_development(self):
        """
        Verify that when no environment variable is configured,
        the environment resolves safely to canonical 'development'.
        """
        with patch.dict(os.environ, {"ENV": "", "APP_ENV": "", "FLASK_ENV": ""}):
            env_name = get_execution_environment()
            self.assertEqual(env_name, "development")
            self.assertFalse(is_production_environment())

            app_dev = create_app()
            self.assertEqual(app_dev.config["SESSION_TYPE"], "filesystem")
            self.assertFalse(app_dev.config["SESSION_COOKIE_SECURE"])
            self.assertFalse(app_dev.config["DEBUG"])

    def test_34_valid_production_identifiers(self):
        """
        Verify all recognized production identifiers: production, prod, live, release.
        """
        production_ids = ["production", "prod", "live", "release"]
        for pid in production_ids:
            with patch.dict(os.environ, {"ENV": pid, "APP_ENV": "", "FLASK_ENV": ""}):
                env_name = get_execution_environment()
                self.assertEqual(env_name, pid)
                self.assertTrue(is_production_environment(), f"Identifier '{pid}' must be recognized as production.")

            # Test direct argument to is_production_environment
            self.assertTrue(is_production_environment(pid))

        # Test fallback: APP_ENV=production when ENV is empty
        with patch.dict(os.environ, {"ENV": "", "APP_ENV": "production", "FLASK_ENV": ""}):
            self.assertEqual(get_execution_environment(), "production")
            self.assertTrue(is_production_environment())

        # Test non-conflicting aliases: ENV=prod with APP_ENV=production (both map to production)
        with patch.dict(os.environ, {"ENV": "prod", "APP_ENV": "production", "FLASK_ENV": ""}):
            self.assertEqual(get_execution_environment(), "prod")
            self.assertTrue(is_production_environment())

    def test_35_valid_development_configuration(self):
        """
        Verify recognized development identifiers: development, dev, local.
        """
        development_ids = ["development", "dev", "local"]
        for did in development_ids:
            with patch.dict(os.environ, {"ENV": did, "APP_ENV": "", "FLASK_ENV": ""}):
                env_name = get_execution_environment()
                self.assertEqual(env_name, did)
                self.assertFalse(is_production_environment(), f"Identifier '{did}' must NOT be recognized as production.")

            # Test direct argument to is_production_environment
            self.assertFalse(is_production_environment(did))

        # Test fallback: APP_ENV=development when ENV is empty
        with patch.dict(os.environ, {"ENV": "", "APP_ENV": "development", "FLASK_ENV": ""}):
            self.assertEqual(get_execution_environment(), "development")
            self.assertFalse(is_production_environment())

        # Test non-conflicting aliases: ENV=development with FLASK_ENV=dev
        with patch.dict(os.environ, {"ENV": "development", "FLASK_ENV": "dev", "APP_ENV": ""}):
            self.assertEqual(get_execution_environment(), "development")
            self.assertFalse(is_production_environment())

    def test_36_production_limiter_rejects_in_memory_storage(self):
        """
        Verify production rate limiting strictly rejects in-memory storage (memory://).
        """
        import redis
        mock_client = MagicMock(spec=redis.Redis)
        mock_client.ping.return_value = True

        with patch("backend.app.is_production_environment", return_value=True):
            with self.assertRaises(RuntimeError) as cm:
                create_app(
                    config_overrides={
                        "SESSION_TYPE": "redis",
                        "SESSION_REDIS": mock_client,
                        "RATELIMIT_STORAGE_URI": "memory://",
                    }
                )
            err = str(cm.exception)
            self.assertIn("Production rate limiting storage violation", err)
            self.assertIn("In-memory rate limiting is strictly forbidden in production", err)

    def test_37_production_limiter_verifies_redis_storage_backend(self):
        """
        Verify production initializes Flask-Limiter with verified Redis-backed storage.
        """
        import redis
        mock_client = MagicMock(spec=redis.Redis)
        mock_client.ping.return_value = True

        with patch("backend.app.is_production_environment", return_value=True):
            with patch.object(redis.Redis, "from_url", return_value=mock_client):
                app_prod = create_app(
                    config_overrides={
                        "SESSION_TYPE": "redis",
                        "SESSION_REDIS_URL": "redis://127.0.0.1:6379/2",
                        "RATELIMIT_STORAGE_URI": "redis://127.0.0.1:6379/3",
                    }
                )
                self.assertEqual(app_prod.config["RATELIMIT_STORAGE_URI"], "redis://127.0.0.1:6379/3")
                effective_storage = limiter.storage
                schemes = getattr(effective_storage, "STORAGE_SCHEME", [])
                self.assertTrue(
                    any(s in ("redis", "rediss") for s in schemes),
                    f"Flask-Limiter must use Redis storage scheme in production, got {schemes}.",
                )

    # -----------------------------------------------------------------------
    # Requirement 4: Final Phase 4 Corrections & Hardening
    # -----------------------------------------------------------------------
    def test_38_bootstrap_admin_uses_normalized_username_in_query_and_insert(self):
        """
        Verify bootstrap_admin uses normalized (trimmed) username in duplicate check and INSERT.
        Never executes queries or inserts with surrounding spaces.
        """
        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_conn.__enter__.return_value = mock_conn
        mock_conn.transaction.return_value.__enter__.return_value = None
        mock_conn.transaction.return_value.__exit__.return_value = None
        mock_conn.cursor.return_value.__enter__.return_value = mock_cur
        mock_conn.cursor.return_value.__exit__.return_value = None

        mock_cur.fetchone.side_effect = [
            (0,),   # admin count check
            (0,),   # duplicate username check
            (42,),  # RETURNING user_id
        ]

        dummy_password = "ValidSecretPassword123!@#"
        raw_username = "  new_clean_admin  "

        with patch("backend.cli.create_admin.get_db_connection", return_value=mock_conn):
            success = bootstrap_admin(raw_username, dummy_password)

        self.assertTrue(success, "bootstrap_admin must succeed with mock connection.")

        executed_calls = mock_cur.execute.call_args_list
        self.assertEqual(len(executed_calls), 4)

        # Call 1: pg_advisory_xact_lock
        self.assertIn("pg_advisory_xact_lock", executed_calls[0][0][0])

        # Call 2: role = 'admin' count
        self.assertIn("role = 'admin'", executed_calls[1][0][0])

        # Call 3: duplicate check must use clean trimmed username
        dup_query_sql, dup_params = executed_calls[2][0]
        self.assertIn("WHERE username = %s", dup_query_sql)
        self.assertEqual(dup_params, ("new_clean_admin",))
        self.assertNotIn("  new_clean_admin  ", dup_params)

        # Call 4: INSERT must use clean trimmed username
        insert_query_sql, insert_params = executed_calls[3][0]
        self.assertIn("INSERT INTO users", insert_query_sql)
        self.assertEqual(insert_params[0], "new_clean_admin")
        self.assertNotEqual(insert_params[0], raw_username)

    def test_39_production_rejects_redis_injection_via_set_throttling_backend(self):
        """
        Verify that in production, set_throttling_backend('redis', instance) strictly
        refuses arbitrary injected clients.
        """
        fake_redis = MagicMock()
        with patch("backend.auth.services.is_production_environment", return_value=True):
            with self.assertRaises(RuntimeError) as cm:
                set_throttling_backend("redis", fake_redis)
            self.assertIn("Throttling backend injection is strictly forbidden in production", str(cm.exception))

            # Reset with None must be permitted
            set_throttling_backend(None, None)

    def test_40_production_rejects_redis_like_injection_via_set_throttling_cache(self):
        """
        Verify that in production, set_throttling_cache(redis_like_instance) strictly
        refuses arbitrary injected clients (even with eval).
        """
        fake_redis = MagicMock()
        fake_redis.eval = MagicMock()
        with patch("backend.auth.services.is_production_environment", return_value=True):
            with self.assertRaises(RuntimeError) as cm:
                set_throttling_cache(fake_redis)
            self.assertIn("Throttling cache injection is strictly forbidden in production", str(cm.exception))

            # Reset with None must be permitted
            set_throttling_cache(None)

    def test_41_production_cached_redis_client_not_returned_without_verification(self):
        """
        Verify that get_throttling_backend() verifies cached Redis clients via ping()
        in production before returning, and fails closed if ping fails.
        """
        mock_cached_client = MagicMock()
        mock_cached_client.ping.side_effect = ConnectionError("Simulated Redis socket failure")

        with patch("backend.auth.services.is_production_environment", return_value=True):
            with patch("backend.auth.services._throttling_redis_client", mock_cached_client):
                with patch("backend.auth.services._throttling_redis_trusted_production", True):
                    with self.assertRaises(RuntimeError) as cm:
                        get_throttling_backend()
                    err = str(cm.exception)
                    self.assertIn("unable to establish a verified connection to shared persistent storage", err)
                    mock_cached_client.ping.assert_called_once()

        # When ping succeeds, cached client is verified and returned
        mock_good_client = MagicMock()
        mock_good_client.ping.return_value = True
        with patch("backend.auth.services.is_production_environment", return_value=True):
            with patch("backend.auth.services._throttling_redis_client", mock_good_client):
                with patch("backend.auth.services._throttling_redis_trusted_production", True):
                    backend_type, client = get_throttling_backend()
                    self.assertEqual(backend_type, "redis")
                    self.assertIs(client, mock_good_client)
                    mock_good_client.ping.assert_called_once()

    def test_42_production_rate_limiter_rejects_missing_or_invented_redis_config(self):
        """
        Verify that in production, rate limiter rejects missing or invented Redis config
        and never silently assigns a dummy localhost URI.
        """
        mock_session_client = MagicMock()
        mock_session_client.ping.return_value = True

        with patch("backend.app.is_production_environment", return_value=True):
            with patch.dict(os.environ, {"RATELIMIT_STORAGE_URI": "", "REDIS_URL": "", "SESSION_REDIS_URL": ""}):
                with self.assertRaises(RuntimeError) as cm:
                    create_app(
                        config_overrides={
                            "SESSION_TYPE": "redis",
                            "SESSION_REDIS": mock_session_client,
                            "RATELIMIT_STORAGE_URI": "",
                        }
                    )
                err = str(cm.exception)
                self.assertIn("Production rate limiting storage violation", err)
                self.assertIn("In-memory rate limiting is strictly forbidden in production", err)

    def test_43_valid_configured_redis_url_initializes_production_rate_limiter(self):
        """
        Verify that an explicitly configured valid Redis URL properly initializes and verifies
        the production rate limiter with bounded timeouts and ping().
        """
        import redis
        mock_rl_client = MagicMock(spec=redis.Redis)
        mock_rl_client.ping.return_value = True

        with patch("backend.app.is_production_environment", return_value=True):
            with patch.object(redis.Redis, "from_url", return_value=mock_rl_client) as mock_from_url:
                app_prod = create_app(
                    config_overrides={
                        "SESSION_TYPE": "redis",
                        "SESSION_REDIS_URL": "redis://127.0.0.1:6379/10",
                        "RATELIMIT_STORAGE_URI": "redis://127.0.0.1:6379/11",
                    }
                )
                self.assertEqual(app_prod.config["RATELIMIT_STORAGE_URI"], "redis://127.0.0.1:6379/11")
                # Verify from_url was invoked with bounded timeouts for rate limiting
                mock_from_url.assert_any_call(
                    "redis://127.0.0.1:6379/11",
                    socket_connect_timeout=2.0,
                    socket_timeout=2.0,
                )
                # Verify ping() was executed on the rate limiting client
                mock_rl_client.ping.assert_called()
                # Verify effective storage backend is RedisStorage
                self.assertTrue(any(s in ("redis", "rediss") for s in limiter.storage.STORAGE_SCHEME))

    def test_44_development_redis_injection_continues_working(self):
        """
        Verify that development/test environments continue allowing Redis injection
        and clean resets without production restrictions.
        """
        mock_dev_redis = MagicMock()
        mock_dev_redis.eval = MagicMock()

        # 1. set_throttling_backend in dev
        set_throttling_backend("redis", mock_dev_redis)
        backend_type, backend = get_throttling_backend()
        self.assertEqual(backend_type, "redis")
        self.assertIs(backend, mock_dev_redis)

        # 2. Reset with None
        set_throttling_backend(None, None)
        backend_type, backend = get_throttling_backend()
        self.assertEqual(backend_type, "simple")

        # 3. set_throttling_cache with redis-like object
        set_throttling_cache(mock_dev_redis)
        backend_type, backend = get_throttling_backend()
        self.assertEqual(backend_type, "redis")
        self.assertIs(backend, mock_dev_redis)

        # 4. Reset with None
        set_throttling_cache(None)
        backend_type, backend = get_throttling_backend()
        self.assertEqual(backend_type, "simple")

    def test_45_dev_injected_redis_rejected_on_production_activation(self):
        """
        Verify that a Redis client injected during development is rejected
        if the environment activates production. Only internally created,
        verified production clients are accepted.
        """
        untrusted_dev_redis = MagicMock()
        # 1. Inject in development
        set_throttling_backend("redis", untrusted_dev_redis)
        backend_type, backend = get_throttling_backend()
        self.assertEqual(backend_type, "redis")
        self.assertIs(backend, untrusted_dev_redis)

        # 2. Environment transitions to production without configured Redis
        with patch("backend.auth.services.is_production_environment", return_value=True):
            with patch.dict(os.environ, {"RATELIMIT_STORAGE_URI": "", "REDIS_URL": ""}):
                with patch.object(Config, "RATELIMIT_STORAGE_URI", ""):
                    with self.assertRaises(RuntimeError) as cm:
                        get_throttling_backend()
                    self.assertIn("Shared persistent cache (Redis) is required", str(cm.exception))

        # 3. Environment transitions to production with configured Redis
        trusted_prod_client = MagicMock()
        trusted_prod_client.ping.return_value = True

        import redis
        with patch("backend.auth.services.is_production_environment", return_value=True):
            with patch.dict(os.environ, {"REDIS_URL": "redis://127.0.0.1:6379/5"}):
                with patch.object(redis.Redis, "from_url", return_value=trusted_prod_client):
                    backend_type, backend = get_throttling_backend()
                    self.assertEqual(backend_type, "redis")
                    self.assertIs(backend, trusted_prod_client)
                    self.assertIsNot(backend, untrusted_dev_redis)

        # Clean up
        set_throttling_backend(None, None)

    def test_46_production_rate_limiter_never_leaks_redis_credentials(self):
        """
        Verify that raw Redis credentials (username/password) in invalid URIs or
        connectivity failures are never included in exceptions, logs, or error messages.
        """
        dummy_user = "secret_db_user_xyz"
        dummy_pass = "SuperSecretPassword123!@#"
        dummy_leak_uri = f"http://{dummy_user}:{dummy_pass}@redis.cluster.internal:6379/0"

        mock_session_client = MagicMock()
        mock_session_client.ping.return_value = True

        # Test A: Invalid scheme containing credentials
        with patch("backend.app.is_production_environment", return_value=True):
            with self.assertRaises(RuntimeError) as cm:
                create_app(
                    config_overrides={
                        "SESSION_TYPE": "redis",
                        "SESSION_REDIS": mock_session_client,
                        "RATELIMIT_STORAGE_URI": dummy_leak_uri,
                    }
                )
            err_msg = str(cm.exception)
            self.assertIn("Production rate limiting storage configuration failure", err_msg)
            self.assertNotIn(dummy_user, err_msg)
            self.assertNotIn(dummy_pass, err_msg)
            self.assertNotIn(dummy_leak_uri, err_msg)

        # Test B: Connection failure with Redis URI containing credentials
        secret_redis_uri = f"redis://{dummy_user}:{dummy_pass}@redis.cluster.internal:6379/0"
        import redis
        mock_failing_client = MagicMock(spec=redis.Redis)
        mock_failing_client.ping.side_effect = TimeoutError(f"Connection to {secret_redis_uri} timed out")

        with patch("backend.app.is_production_environment", return_value=True):
            with patch.object(redis.Redis, "from_url", return_value=mock_failing_client):
                with self.assertRaises(RuntimeError) as cm:
                    create_app(
                        config_overrides={
                            "SESSION_TYPE": "redis",
                            "SESSION_REDIS": mock_session_client,
                            "RATELIMIT_STORAGE_URI": secret_redis_uri,
                        }
                    )
                err_msg = str(cm.exception)
                self.assertIn("Production rate limiting storage connection failure", err_msg)
                self.assertNotIn(dummy_user, err_msg)
                self.assertNotIn(dummy_pass, err_msg)
                self.assertNotIn(secret_redis_uri, err_msg)


if __name__ == "__main__":
    unittest.main()
