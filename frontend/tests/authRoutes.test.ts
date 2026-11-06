/**
 * Court Case Management System - Navigation & Route Guard Unit Tests
 * Uses Node.js native test runner (zero external dependencies).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { getRoleDashboardPath, resolveSafeRedirect } from '../src/routes/navigation.ts';
import { LoginSubmissionController } from '../src/pages/loginSubmissionController.ts';
import { ApiClientError } from '../src/api/client.ts';
import type { User, UserRole } from '../src/types/index.ts';

const mockAdminUser: User = {
  user_id: 1,
  username: 'admin_sys',
  role: 'admin',
  judge_id: null,
};

const mockClerkUser: User = {
  user_id: 2,
  username: 'clerk_records',
  role: 'clerk',
  judge_id: null,
};

const mockJudgeUser: User = {
  user_id: 3,
  username: 'judge_dredd',
  role: 'judge',
  judge_id: '00000000-0000-0000-0000-000000000001',
};

describe('Navigation Helpers - getRoleDashboardPath', () => {
  test('correctly routes admin role to /admin', () => {
    assert.strictEqual(getRoleDashboardPath('admin'), '/admin');
  });

  test('correctly routes clerk role to /clerk', () => {
    assert.strictEqual(getRoleDashboardPath('clerk'), '/clerk');
  });

  test('correctly routes judge role to /judge', () => {
    assert.strictEqual(getRoleDashboardPath('judge'), '/judge');
  });

  test('safely falls back to /login for invalid or unexpected roles', () => {
    assert.strictEqual(getRoleDashboardPath('unknown' as unknown as UserRole), '/login');
    assert.strictEqual(getRoleDashboardPath('' as unknown as UserRole), '/login');
  });
});

describe('Navigation Helpers - resolveSafeRedirect', () => {
  test('returns default role dashboard when from is undefined or empty', () => {
    assert.strictEqual(resolveSafeRedirect('admin', undefined), '/admin');
    assert.strictEqual(resolveSafeRedirect('clerk', null), '/clerk');
    assert.strictEqual(resolveSafeRedirect('judge', ''), '/judge');
  });

  test('allows authorized role-specific routes within user role namespace', () => {
    assert.strictEqual(resolveSafeRedirect('admin', '/admin'), '/admin');
    assert.strictEqual(resolveSafeRedirect('admin', '/admin/overview'), '/admin/overview');
    assert.strictEqual(resolveSafeRedirect('clerk', '/clerk'), '/clerk');
    assert.strictEqual(resolveSafeRedirect('clerk', '/clerk/filings'), '/clerk/filings');
    assert.strictEqual(resolveSafeRedirect('judge', '/judge'), '/judge');
    assert.strictEqual(resolveSafeRedirect('judge', '/judge/docket'), '/judge/docket');
  });

  test('rejects unauthorized generic paths outside authorized role namespace', () => {
    assert.strictEqual(resolveSafeRedirect('admin', '/generic'), '/admin');
    assert.strictEqual(resolveSafeRedirect('admin', '/about'), '/admin');
    assert.strictEqual(resolveSafeRedirect('admin', '/settings'), '/admin');
    assert.strictEqual(resolveSafeRedirect('clerk', '/profile'), '/clerk');
    assert.strictEqual(resolveSafeRedirect('clerk', '/cases'), '/clerk');
    assert.strictEqual(resolveSafeRedirect('judge', '/api/dashboard'), '/judge');
    assert.strictEqual(resolveSafeRedirect('judge', '/court-info'), '/judge');
  });

  test('blocks role bypass and falls back to user default role dashboard', () => {
    // Clerk attempting to redirect to admin route
    assert.strictEqual(resolveSafeRedirect('clerk', '/admin'), '/clerk');
    assert.strictEqual(resolveSafeRedirect('clerk', '/admin/users'), '/clerk');

    // Judge attempting to redirect to admin or clerk route
    assert.strictEqual(resolveSafeRedirect('judge', '/admin'), '/judge');
    assert.strictEqual(resolveSafeRedirect('judge', '/clerk/cases'), '/judge');

    // Admin attempting to redirect to judge or clerk route
    assert.strictEqual(resolveSafeRedirect('admin', '/judge'), '/admin');
    assert.strictEqual(resolveSafeRedirect('admin', '/clerk'), '/admin');
  });

  test('safely handles and normalizes dot-segment paths', () => {
    // Path traversal attempting to escape to another role or root is rejected
    assert.strictEqual(resolveSafeRedirect('admin', '/admin/../clerk'), '/admin');
    assert.strictEqual(resolveSafeRedirect('admin', '/admin/%2e%2e/clerk'), '/admin');
    assert.strictEqual(resolveSafeRedirect('admin', '/admin/..%2fclerk'), '/admin');
    assert.strictEqual(resolveSafeRedirect('admin', '/admin/..'), '/admin');
    assert.strictEqual(resolveSafeRedirect('clerk', '/clerk/../judge'), '/clerk');
    assert.strictEqual(resolveSafeRedirect('judge', '/judge/../../etc/passwd'), '/judge');

    // Dot segments resolving within the authorized namespace are normalized and permitted
    assert.strictEqual(resolveSafeRedirect('admin', '/admin/./overview'), '/admin/overview');
    assert.strictEqual(
      resolveSafeRedirect('admin', '/admin/users/../reports'),
      '/admin/reports'
    );
    assert.strictEqual(
      resolveSafeRedirect('clerk', '/clerk/temp/../filings'),
      '/clerk/filings'
    );
  });

  test('safely handles encoded separators (%2f, %5c) and encoded bypass variations', () => {
    // Encoded slashes attempting directory escape
    assert.strictEqual(resolveSafeRedirect('admin', '/admin%2f..%2fclerk'), '/admin');
    assert.strictEqual(resolveSafeRedirect('clerk', '/clerk%2f..%2fadmin'), '/clerk');
    assert.strictEqual(resolveSafeRedirect('admin', '/admin%2f..'), '/admin');

    // Encoded protocol-relative and backslash bypasses
    assert.strictEqual(resolveSafeRedirect('admin', '/%2fevil.com'), '/admin');
    assert.strictEqual(resolveSafeRedirect('clerk', '/%5cevil.com'), '/clerk');
    assert.strictEqual(resolveSafeRedirect('judge', '/%2f%2fevil.com'), '/judge');
  });

  test('prevents open redirect attacks (absolute and protocol-relative URLs)', () => {
    assert.strictEqual(resolveSafeRedirect('admin', 'https://attacker.com/steal-creds'), '/admin');
    assert.strictEqual(resolveSafeRedirect('clerk', 'http://attacker.com'), '/clerk');
    assert.strictEqual(resolveSafeRedirect('judge', '//attacker.com/phishing'), '/judge');
    assert.strictEqual(resolveSafeRedirect('admin', 'javascript:alert(1)'), '/admin');
  });

  test('prevents backslash traversal and evasion tricks', () => {
    assert.strictEqual(resolveSafeRedirect('admin', '/\\attacker.com'), '/admin');
    assert.strictEqual(resolveSafeRedirect('clerk', '\\\\attacker.com'), '/clerk');
  });

  test('prevents redirect loops back to login or root index', () => {
    assert.strictEqual(resolveSafeRedirect('admin', '/login'), '/admin');
    assert.strictEqual(resolveSafeRedirect('clerk', '/'), '/clerk');
  });

  test('preserves valid query strings and hash fragments on authorized routes', () => {
    assert.strictEqual(
      resolveSafeRedirect('admin', '/admin/reports?tab=overview#section-1'),
      '/admin/reports?tab=overview#section-1'
    );
    assert.strictEqual(
      resolveSafeRedirect('clerk', '/clerk/filings?status=Active&page=2#top'),
      '/clerk/filings?status=Active&page=2#top'
    );
    assert.strictEqual(
      resolveSafeRedirect('judge', '/judge/docket?date=2026-11-05#hearing-3'),
      '/judge/docket?date=2026-11-05#hearing-3'
    );

    // Also preserves query and hash after dot-segment normalization within namespace
    assert.strictEqual(
      resolveSafeRedirect('admin', '/admin/./metrics?range=30d#chart'),
      '/admin/metrics?range=30d#chart'
    );
  });

  test('supports Location-like object with search queries for authorized routes', () => {
    const fromObject = {
      pathname: '/clerk/filings',
      search: '?status=Active&page=2',
      hash: '#table',
    };
    assert.strictEqual(
      resolveSafeRedirect('clerk', fromObject),
      '/clerk/filings?status=Active&page=2#table'
    );

    // Mismatched role with location object
    const unauthorizedObject = {
      pathname: '/admin/audit',
      search: '?filter=auth',
    };
    assert.strictEqual(resolveSafeRedirect('clerk', unauthorizedObject), '/clerk');
  });
});

describe('LoginSubmissionController - Component Logic & Submission Lock Tests', () => {
  test('client-side validation: blocks empty username or password before locking or calling API', async () => {
    let loginCalled = false;
    const controller = new LoginSubmissionController({
      login: async () => {
        loginCalled = true;
      },
    });

    // 1. Both empty
    const result1 = await controller.submit('', '');
    assert.strictEqual(result1, false);
    assert.strictEqual(loginCalled, false);
    assert.strictEqual(controller.isSubmissionLocked(), false);
    assert.strictEqual(controller.getState().fieldErrors.username, 'Please enter your username.');
    assert.strictEqual(controller.getState().fieldErrors.password, 'Please enter your password.');

    // 2. Whitespace username
    const result2 = await controller.submit('   ', 'Pass123!');
    assert.strictEqual(result2, false);
    assert.strictEqual(loginCalled, false);
    assert.strictEqual(controller.getState().fieldErrors.username, 'Please enter your username.');

    // 3. Clear errors when fields are edited
    controller.clearFieldError('username');
    assert.strictEqual(controller.getState().fieldErrors.username, undefined);
  });

  test('submission lock: synchronously rejects concurrent submissions within the same frame', async () => {
    let loginCallCount = 0;
    let resolveLogin: () => void;
    const loginPromise = new Promise<void>((resolve) => {
      resolveLogin = resolve;
    });

    const controller = new LoginSubmissionController({
      login: async () => {
        loginCallCount++;
        await loginPromise;
      },
      getUser: () => mockAdminUser,
    });

    // Dispatch two concurrent submission calls before first resolves
    const p1 = controller.submit('admin_sys', 'Pass123!');
    assert.strictEqual(controller.isSubmissionLocked(), true, 'Controller must immediately lock');

    const p2 = controller.submit('admin_sys', 'Pass123!');

    // The second call must return false immediately due to the lock
    const result2 = await p2;
    assert.strictEqual(result2, false, 'Concurrent call must be rejected by lock');
    assert.strictEqual(loginCallCount, 1, 'Login API must be invoked exactly once');

    // Now resolve the first login
    resolveLogin!();
    const result1 = await p1;
    assert.strictEqual(result1, true);
  });

  test('lock release on authentication failure: releases lock and permits retries', async () => {
    let callCount = 0;
    const controller = new LoginSubmissionController({
      login: async () => {
        callCount++;
        if (callCount === 1) {
          throw new ApiClientError('Invalid username or password.', 401);
        }
      },
      getUser: () => mockAdminUser,
    });

    // First attempt fails
    const result1 = await controller.submit('admin_sys', 'WrongPass!');
    assert.strictEqual(result1, false);
    assert.strictEqual(callCount, 1);
    assert.strictEqual(controller.getState().serverError, 'Invalid username or password.');
    assert.strictEqual(controller.isSubmissionLocked(), false, 'Lock must be released on failure');
    assert.strictEqual(controller.getState().isSubmitting, false);

    // Second attempt (retry with corrected credentials) succeeds
    const result2 = await controller.submit('admin_sys', 'CorrectPass!');
    assert.strictEqual(result2, true);
    assert.strictEqual(callCount, 2);
    assert.strictEqual(controller.getState().serverError, null);
  });

  test('successful login path: returns authenticated User from login() and triggers safe redirection immediately', async () => {
    let redirectedDestination: string | null = null;

    const controller = new LoginSubmissionController({
      // AuthContext login() now directly returns the authenticated User
      login: async () => mockClerkUser,
      from: '/clerk/filings?priority=high#section-2',
      onSuccess: (dest) => {
        redirectedDestination = dest;
      },
    });

    const result = await controller.submit('clerk_records', 'ValidSecret123!');
    assert.strictEqual(result, true);
    assert.strictEqual(
      redirectedDestination,
      '/clerk/filings?priority=high#section-2',
      'Should redirect to authorized destination with preserved query and hash'
    );
    assert.strictEqual(controller.getState().serverError, null);
  });

  test('delayed user-state propagation: awaits user state confirmation without arbitrary setTimeout(0) and completes successfully', async () => {
    let delayedUser: User | null = null;
    let redirectedDestination: string | null = null;

    const controller = new LoginSubmissionController({
      // Simulate login returning void where user state arrives asynchronously via React state update
      login: async () => {
        setTimeout(() => {
          delayedUser = mockJudgeUser;
          controller.notifyUserChanged(mockJudgeUser);
        }, 15);
      },
      getUser: () => delayedUser,
      userWaitTimeoutMs: 100,
      onSuccess: (dest) => {
        redirectedDestination = dest;
      },
    });

    const result = await controller.submit('judge_dredd', 'ValidLaw123!');
    assert.strictEqual(result, true, 'Must succeed when state propagates asynchronously');
    assert.strictEqual(redirectedDestination, '/judge');
    assert.strictEqual(controller.getState().serverError, null);
  });

  test('delayed user-state propagation: supports explicit waitForUser option', async () => {
    let redirectedDestination: string | null = null;

    const controller = new LoginSubmissionController({
      login: async () => {
        // returns void
      },
      waitForUser: async () => {
        // reliably awaited confirmation mechanism
        return mockAdminUser;
      },
      onSuccess: (dest) => {
        redirectedDestination = dest;
      },
    });

    const result = await controller.submit('admin_sys', 'AdminPass123!');
    assert.strictEqual(result, true);
    assert.strictEqual(redirectedDestination, '/admin');
    assert.strictEqual(controller.getState().serverError, null);
  });

  test('successful submission behavior: controller cannot remain indefinitely locked if navigation does not occur', async () => {
    // Case 1: onSuccess callback is omitted (e.g. headless or test usage)
    const controllerWithoutNav = new LoginSubmissionController({
      login: async () => mockAdminUser,
    });
    const result1 = await controllerWithoutNav.submit('admin_sys', 'AdminPass123!');
    assert.strictEqual(result1, true);
    assert.strictEqual(
      controllerWithoutNav.isSubmissionLocked(),
      false,
      'Lock must be released immediately when no navigation callback is provided'
    );
    assert.strictEqual(controllerWithoutNav.getState().isSubmitting, false);

    // Case 2: onSuccess callback is provided, but navigation fails to unmount page within timeout window
    let navCalled = false;
    const controllerWithNavStall = new LoginSubmissionController({
      login: async () => mockAdminUser,
      navigationTimeoutMs: 25,
      onSuccess: () => {
        navCalled = true;
        // Navigation callback ran, but did not unmount component
      },
    });

    const result2 = await controllerWithNavStall.submit('admin_sys', 'AdminPass123!');
    assert.strictEqual(result2, true);
    assert.strictEqual(navCalled, true);
    assert.strictEqual(controllerWithNavStall.isSubmissionLocked(), true, 'Initially locked during navigation window');

    // Await navigation timeout safeguard
    await new Promise((resolve) => setTimeout(resolve, 35));
    assert.strictEqual(
      controllerWithNavStall.isSubmissionLocked(),
      false,
      'Safeguard must release lock if navigation does not occur'
    );
    assert.strictEqual(controllerWithNavStall.getState().isSubmitting, false);

    // Case 3: onSuccess callback throws an unhandled navigation error
    const controllerWithThrowingNav = new LoginSubmissionController({
      login: async () => mockAdminUser,
      onSuccess: () => {
        throw new Error('Navigation failed: router error');
      },
    });

    const result3 = await controllerWithThrowingNav.submit('admin_sys', 'AdminPass123!');
    assert.strictEqual(result3, false, 'Should return false when navigation throws');
    assert.strictEqual(
      controllerWithThrowingNav.isSubmissionLocked(),
      false,
      'Lock must be released if navigation callback throws'
    );
    assert.strictEqual(
      controllerWithThrowingNav.getState().serverError,
      'Navigation failed: router error'
    );
  });

  test('permanent-lock safeguard: releases lock if expected state transition does not occur', async () => {
    const controller = new LoginSubmissionController({
      login: async () => {
        // API resolves without error, but session/user state transition is NOT established
      },
      getUser: () => null, // User remains null
      userWaitTimeoutMs: 25,
    });

    const result = await controller.submit('admin_sys', 'Pass123!');

    // Must not succeed
    assert.strictEqual(result, false);

    // Crucial requirement: Lock MUST NOT be left permanently stuck!
    assert.strictEqual(
      controller.isSubmissionLocked(),
      false,
      'Lock must be released when state transition does not occur'
    );
    assert.strictEqual(
      controller.getState().isSubmitting,
      false,
      'isSubmitting must be reset to false'
    );
    assert.ok(
      controller.getState().serverError?.includes('session state was not established'),
      'Must surface actionable error message to user'
    );

    // Subsequent submission must be accepted rather than blocked by a frozen lock
    let retryAttempted = false;
    controller.setOptions({
      login: async () => {
        retryAttempted = true;
        return mockAdminUser;
      },
      getUser: () => mockAdminUser,
    });

    const retryResult = await controller.submit('admin_sys', 'Pass123!');
    assert.strictEqual(retryAttempted, true, 'Subsequent submission must be permitted');
    assert.strictEqual(retryResult, true);
  });

  test('disposal lifecycle: disposal while login is pending invalidates in-flight submission', async () => {
    let resolveLogin: (user: User) => void;
    const loginPromise = new Promise<User>((resolve) => {
      resolveLogin = resolve;
    });

    let navCalled = false;
    let stateChangeCountAfterDispose = 0;

    const controller = new LoginSubmissionController({
      login: async () => loginPromise,
      onSuccess: () => {
        navCalled = true;
      },
      onStateChange: () => {
        if (controller.isDisposedState()) {
          stateChangeCountAfterDispose++;
        }
      },
    });

    // 1. Start submission while component is mounted
    const submissionPromise = controller.submit('admin_sys', 'Pass123!');
    assert.strictEqual(controller.isSubmissionLocked(), true, 'Must lock synchronously');

    // 2. Component unmounts (calls dispose()) before login resolves
    controller.dispose();
    assert.strictEqual(controller.isDisposedState(), true);
    assert.strictEqual(controller.isSubmissionLocked(), false, 'Dispose must release lock');

    // 3. Login API finishes resolving successfully after disposal
    resolveLogin!(mockAdminUser);
    const result = await submissionPromise;

    // 4. Verify in-flight submission was invalidated
    assert.strictEqual(result, false, 'Disposed submission must resolve false');
    assert.strictEqual(navCalled, false, 'Must not invoke onSuccess or navigate after disposal');
    assert.strictEqual(
      stateChangeCountAfterDispose,
      0,
      'Must not publish state updates after disposal'
    );
  });

  test('disposal lifecycle: disposal while waiting for user state invalidates submission without navigation', async () => {
    let navCalled = false;
    let stateChangeCountAfterDispose = 0;

    const controller = new LoginSubmissionController({
      login: async () => {
        // returns void, triggering waitForUserState
      },
      getUser: () => null,
      userWaitTimeoutMs: 1000,
      onSuccess: () => {
        navCalled = true;
      },
      onStateChange: () => {
        if (controller.isDisposedState()) {
          stateChangeCountAfterDispose++;
        }
      },
    });

    const submissionPromise = controller.submit('admin_sys', 'Pass123!');

    // Dispose while in waitForUserState
    controller.dispose();
    assert.strictEqual(controller.isDisposedState(), true);

    // Provide user after disposal
    controller.notifyUserChanged(mockAdminUser);

    const result = await submissionPromise;
    assert.strictEqual(result, false, 'Must return false after disposal');
    assert.strictEqual(navCalled, false, 'Must not navigate after disposal');
    assert.strictEqual(stateChangeCountAfterDispose, 0);
  });

  test('disposal lifecycle: login failure arriving after disposal does not publish errors', async () => {
    let rejectLogin: (err: unknown) => void;
    const loginPromise = new Promise<User>((_, reject) => {
      rejectLogin = reject;
    });

    let stateChangesAfterDispose = 0;

    const controller = new LoginSubmissionController({
      login: async () => loginPromise,
      onStateChange: () => {
        if (controller.isDisposedState()) {
          stateChangesAfterDispose++;
        }
      },
    });

    const submissionPromise = controller.submit('admin_sys', 'Pass123!');
    controller.dispose();

    // Backend responds with 401 after unmount
    rejectLogin!(new ApiClientError('Invalid credentials.', 401));

    const result = await submissionPromise;
    assert.strictEqual(result, false);
    assert.strictEqual(stateChangesAfterDispose, 0);
  });

  test('disposal lifecycle: submissions rejected immediately when controller is disposed', async () => {
    let loginCalled = false;
    const controller = new LoginSubmissionController({
      login: async () => {
        loginCalled = true;
        return mockAdminUser;
      },
    });

    controller.dispose();
    const result = await controller.submit('admin_sys', 'Pass123!');
    assert.strictEqual(result, false);
    assert.strictEqual(loginCalled, false, 'Must not invoke login when already disposed');
  });

  test('active lifecycle: normal login succeeds when controller remains active', async () => {
    let navDestination: string | null = null;
    let stateNotifications = 0;

    const controller = new LoginSubmissionController({
      login: async () => mockAdminUser,
      from: '/admin/settings',
      onSuccess: (dest) => {
        navDestination = dest;
      },
      onStateChange: () => {
        stateNotifications++;
      },
    });

    assert.strictEqual(controller.isDisposedState(), false);
    const result = await controller.submit('admin_sys', 'ValidPass123!');
    assert.strictEqual(result, true);
    assert.strictEqual(navDestination, '/admin/settings');
    assert.ok(stateNotifications > 0, 'Must publish state updates during active lifecycle');
    assert.strictEqual(controller.isDisposedState(), false);
  });

  test('React StrictMode lifecycle: effect replay (setup -> cleanup -> setup) replaces disposed controller with fresh active instance', async () => {
    let isMounted = false;
    let activeController: LoginSubmissionController | null = null;
    const controllersCreated: LoginSubmissionController[] = [];

    // Simulate the exact lifecycle effect in LoginPage.tsx
    const runSetup = () => {
      isMounted = true;
      const controller = new LoginSubmissionController({
        login: async () => mockAdminUser,
        getUser: () => mockAdminUser,
      });
      controllersCreated.push(controller);
      activeController = controller;

      return () => {
        isMounted = false;
        controller.dispose();
        activeController = null;
      };
    };

    // React StrictMode execution sequence:
    // 1. First setup
    const cleanup1 = runSetup();
    assert.strictEqual(controllersCreated.length, 1);
    const controller1 = controllersCreated[0];
    assert.strictEqual(controller1.isDisposedState(), false);
    assert.strictEqual(activeController, controller1);

    // 2. StrictMode immediate cleanup replay
    cleanup1();
    assert.strictEqual(controller1.isDisposedState(), true);
    assert.strictEqual(activeController, null);

    // 3. StrictMode second setup (re-mount)
    const cleanup2 = runSetup();
    assert.strictEqual(controllersCreated.length, 2);
    const controller2 = controllersCreated[1];
    assert.notStrictEqual(controller1, controller2, 'A fresh controller must be instantiated');
    assert.strictEqual(controller1.isDisposedState(), true, 'First controller remains disposed');
    assert.strictEqual(controller2.isDisposedState(), false, 'Second controller must be active and not disposed');
    assert.strictEqual(activeController, controller2);

    // 4. Submit succeeds on the active controller after StrictMode replay
    const submitResult = await activeController!.submit('admin_sys', 'AdminPass123!');
    assert.strictEqual(submitResult, true, 'Controller must submit successfully after StrictMode replay');
    assert.strictEqual(controller2.getState().serverError, null);

    cleanup2();
    assert.strictEqual(controller2.isDisposedState(), true);
  });

  test('genuine unmount: invalidates pending login and suppresses state updates, navigation, and password clearing', async () => {
    let resolveLogin: (user: User) => void;
    const loginPromise = new Promise<User>((resolve) => {
      resolveLogin = resolve;
    });

    let navCalled = false;
    let stateUpdatesAfterUnmount = 0;
    let passwordCleared = false;

    // Simulate LoginPage lifecycle and handleSubmit
    let isMounted = true;
    const controller = new LoginSubmissionController({
      login: async () => loginPromise,
      onSuccess: () => {
        if (isMounted) navCalled = true;
      },
      onStateChange: () => {
        if (!isMounted) stateUpdatesAfterUnmount++;
      },
    });

    const handleComponentSubmit = async () => {
      const success = await controller.submit('admin_sys', 'Pass123!');
      if (!success && isMounted && !controller.isDisposedState()) {
        passwordCleared = true;
      }
      return success;
    };

    // 1. Submit form while mounted
    const submission = handleComponentSubmit();
    assert.strictEqual(controller.isSubmissionLocked(), true);

    // 2. Genuine unmount occurs while submission is in-flight
    isMounted = false;
    controller.dispose();
    assert.strictEqual(controller.isDisposedState(), true);

    // 3. Login resolves on backend after unmount
    resolveLogin!(mockAdminUser);
    const result = await submission;

    // 4. Verify post-unmount safety
    assert.strictEqual(result, false, 'In-flight submission must resolve false on unmount');
    assert.strictEqual(navCalled, false, 'Navigation must not be invoked after unmount');
    assert.strictEqual(stateUpdatesAfterUnmount, 0, 'No state updates after unmount');
    assert.strictEqual(passwordCleared, false, 'setPassword must not be called after unmount');
  });

  test('waiter cleanup: disposal clears all pending user-waiter timers and resolves waiters with null', async () => {
    const controller = new LoginSubmissionController({
      login: async () => {},
      getUser: () => null,
      userWaitTimeoutMs: 10000,
    });

    const waiterPromise1 = controller.waitForUserState();
    const waiterPromise2 = controller.waitForUserState();
    assert.strictEqual(controller.getPendingWaitersCount(), 2);

    controller.dispose();

    const res1 = await waiterPromise1;
    const res2 = await waiterPromise2;
    assert.strictEqual(res1, null);
    assert.strictEqual(res2, null);
    assert.strictEqual(controller.getPendingWaitersCount(), 0, 'All waiter records must be removed on disposal');
  });

  test('waiter cleanup: user notification resolves waiter, clears timer, and removes waiter record', async () => {
    const controller = new LoginSubmissionController({
      login: async () => {},
      getUser: () => null,
      userWaitTimeoutMs: 10000,
    });

    const waiterPromise = controller.waitForUserState();
    assert.strictEqual(controller.getPendingWaitersCount(), 1);

    controller.notifyUserChanged(mockAdminUser);

    const resolvedUser = await waiterPromise;
    assert.deepStrictEqual(resolvedUser, mockAdminUser);
    assert.strictEqual(controller.getPendingWaitersCount(), 0, 'Waiter record must be cleared upon notification');
  });

  test('waiter cleanup: timeout clears its waiter record and resolves with fallback', async () => {
    const controller = new LoginSubmissionController({
      login: async () => {},
      getUser: () => null,
      userWaitTimeoutMs: 20,
    });

    const waiterPromise = controller.waitForUserState(20);
    assert.strictEqual(controller.getPendingWaitersCount(), 1);

    const resolvedUser = await waiterPromise;
    assert.strictEqual(resolvedUser, null);
    assert.strictEqual(controller.getPendingWaitersCount(), 0, 'Waiter record must be cleared upon timeout');
  });
});

describe('RoleGuard Authorization Simulation Matrix', () => {
  /**
   * Evaluates access decision for a user against allowed roles,
   * matching RoleGuard component behavior.
   */
  const evaluateRoleGuard = (
    user: User | null,
    allowedRoles: UserRole[]
  ): { allow: boolean; redirectTo?: string } => {
    if (!user) {
      return { allow: false, redirectTo: '/login' };
    }
    if (!allowedRoles.includes(user.role)) {
      return { allow: false, redirectTo: getRoleDashboardPath(user.role) };
    }
    return { allow: true };
  };

  test('unauthenticated guest is redirected to /login for admin route', () => {
    const res = evaluateRoleGuard(null, ['admin']);
    assert.strictEqual(res.allow, false);
    assert.strictEqual(res.redirectTo, '/login');
  });

  test('unauthenticated guest is redirected to /login for clerk route', () => {
    const res = evaluateRoleGuard(null, ['clerk']);
    assert.strictEqual(res.allow, false);
    assert.strictEqual(res.redirectTo, '/login');
  });

  test('unauthenticated guest is redirected to /login for judge route', () => {
    const res = evaluateRoleGuard(null, ['judge']);
    assert.strictEqual(res.allow, false);
    assert.strictEqual(res.redirectTo, '/login');
  });

  test('admin user accessing admin route is allowed', () => {
    const admin: User = { user_id: 1, username: 'admin_sys', role: 'admin', judge_id: null };
    const res = evaluateRoleGuard(admin, ['admin']);
    assert.strictEqual(res.allow, true);
    assert.strictEqual(res.redirectTo, undefined);
  });

  test('clerk user accessing clerk route is allowed', () => {
    const clerk: User = { user_id: 2, username: 'clerk_records', role: 'clerk', judge_id: null };
    const res = evaluateRoleGuard(clerk, ['clerk']);
    assert.strictEqual(res.allow, true);
    assert.strictEqual(res.redirectTo, undefined);
  });

  test('judge user accessing judge route is allowed', () => {
    const judge: User = {
      user_id: 3,
      username: 'judge_davis',
      role: 'judge',
      judge_id: 'd9b90c2a-6058-45e0-949d-e4dcb2410a01',
    };
    const res = evaluateRoleGuard(judge, ['judge']);
    assert.strictEqual(res.allow, true);
    assert.strictEqual(res.redirectTo, undefined);
  });

  test('clerk attempting to access admin route is redirected to /clerk (no loop, no dead end)', () => {
    const clerk: User = { user_id: 2, username: 'clerk_records', role: 'clerk', judge_id: null };
    const res = evaluateRoleGuard(clerk, ['admin']);
    assert.strictEqual(res.allow, false);
    assert.strictEqual(res.redirectTo, '/clerk');
  });

  test('judge attempting to access admin route is redirected to /judge', () => {
    const judge: User = {
      user_id: 3,
      username: 'judge_davis',
      role: 'judge',
      judge_id: 'd9b90c2a-6058-45e0-949d-e4dcb2410a01',
    };
    const res = evaluateRoleGuard(judge, ['admin']);
    assert.strictEqual(res.allow, false);
    assert.strictEqual(res.redirectTo, '/judge');
  });

  test('admin attempting to access clerk route is redirected to /admin', () => {
    const admin: User = { user_id: 1, username: 'admin_sys', role: 'admin', judge_id: null };
    const res = evaluateRoleGuard(admin, ['clerk']);
    assert.strictEqual(res.allow, false);
    assert.strictEqual(res.redirectTo, '/admin');
  });

  test('admin attempting to access judge route is redirected to /admin', () => {
    const admin: User = { user_id: 1, username: 'admin_sys', role: 'admin', judge_id: null };
    const res = evaluateRoleGuard(admin, ['judge']);
    assert.strictEqual(res.allow, false);
    assert.strictEqual(res.redirectTo, '/admin');
  });

  test('clerk attempting to access judge route is redirected to /clerk', () => {
    const clerk: User = { user_id: 2, username: 'clerk_records', role: 'clerk', judge_id: null };
    const res = evaluateRoleGuard(clerk, ['judge']);
    assert.strictEqual(res.allow, false);
    assert.strictEqual(res.redirectTo, '/clerk');
  });

  test('judge attempting to access clerk route is redirected to /judge', () => {
    const judge: User = {
      user_id: 3,
      username: 'judge_davis',
      role: 'judge',
      judge_id: 'd9b90c2a-6058-45e0-949d-e4dcb2410a01',
    };
    const res = evaluateRoleGuard(judge, ['clerk']);
    assert.strictEqual(res.allow, false);
    assert.strictEqual(res.redirectTo, '/judge');
  });
});

describe('Root & Login Redirection Logic Simulation', () => {
  const evaluateRootRedirect = (
    user: User | null
  ): { target: string } => {
    if (!user) {
      return { target: '/login' };
    }
    return { target: getRoleDashboardPath(user.role) };
  };

  test('root / redirects unauthenticated visitor to /login', () => {
    assert.strictEqual(evaluateRootRedirect(null).target, '/login');
  });

  test('root / redirects authenticated admin to /admin', () => {
    const admin: User = { user_id: 1, username: 'admin', role: 'admin', judge_id: null };
    assert.strictEqual(evaluateRootRedirect(admin).target, '/admin');
  });

  test('root / redirects authenticated clerk to /clerk', () => {
    const clerk: User = { user_id: 2, username: 'clerk', role: 'clerk', judge_id: null };
    assert.strictEqual(evaluateRootRedirect(clerk).target, '/clerk');
  });

  test('root / redirects authenticated judge to /judge', () => {
    const judge: User = { user_id: 3, username: 'judge', role: 'judge', judge_id: 'uuid-1' };
    assert.strictEqual(evaluateRootRedirect(judge).target, '/judge');
  });
});
