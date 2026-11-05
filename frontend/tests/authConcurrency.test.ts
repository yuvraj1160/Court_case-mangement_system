/**
 * Court Case Management System - Auth Session Concurrency & Generation Tests
 * Uses Node.js native test runner (zero external dependencies).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { AuthSessionController } from '../src/context/authSessionController.ts';
import { ApiClientError } from '../src/api/client.ts';
import type { CurrentUserResponse, LoginResponse, LogoutResponse, User } from '../src/types/index.ts';

const mockAdminUser: User = {
  user_id: 1,
  username: 'admin_boss',
  role: 'admin',
  judge_id: null,
};

const mockClerkUser: User = {
  user_id: 2,
  username: 'clerk_dan',
  role: 'clerk',
  judge_id: null,
};

describe('AuthSessionController - Startup Session Validation', () => {
  test('authenticates and populates user on active session (HTTP 200)', async () => {
    const controller = new AuthSessionController({
      api: {
        getCurrentUser: async (): Promise<CurrentUserResponse> => ({
          status: 'success',
          user: mockAdminUser,
        }),
      },
    });

    assert.strictEqual(controller.getState().loading, true);
    await controller.refreshUser();

    const state = controller.getState();
    assert.strictEqual(state.loading, false);
    assert.strictEqual(state.error, null);
    assert.deepStrictEqual(state.user, mockAdminUser);
  });

  test('clears user and error when backend returns HTTP 401 unauthenticated', async () => {
    const controller = new AuthSessionController({
      api: {
        getCurrentUser: async (): Promise<CurrentUserResponse> => {
          throw new ApiClientError('Authentication required.', 401);
        },
      },
    });

    await controller.refreshUser();

    const state = controller.getState();
    assert.strictEqual(state.loading, false);
    assert.strictEqual(state.user, null);
    assert.strictEqual(state.error, null);
  });

  test('preserves explicit error state on network or server error (HTTP 500 / 0)', async () => {
    const controller = new AuthSessionController({
      api: {
        getCurrentUser: async (): Promise<CurrentUserResponse> => {
          throw new ApiClientError('Internal database failure', 500);
        },
      },
    });

    await controller.refreshUser();

    const state = controller.getState();
    assert.strictEqual(state.loading, false);
    assert.strictEqual(state.user, null);
    assert.strictEqual(state.error, 'Internal database failure');
  });
});

describe('AuthSessionController - Concurrency & Race Condition Guards', () => {
  test('older /auth/me response arriving after successful login does not overwrite state', async () => {
    let resolveRefresh: (res: CurrentUserResponse) => void;
    const refreshPromise = new Promise<CurrentUserResponse>((resolve) => {
      resolveRefresh = resolve;
    });

    const controller = new AuthSessionController({
      api: {
        getCurrentUser: () => refreshPromise,
        login: async (): Promise<LoginResponse> => ({
          status: 'success',
          message: 'Logged in',
          user: mockAdminUser,
          csrf_token: 'csrf-123',
        }),
      },
    });

    // 1. Initial /auth/me request starts (gen 1)
    const pendingRefresh = controller.refreshUser();

    // 2. User logs in while /auth/me is still pending in-flight (gen 2)
    await controller.login('admin_boss', 'SecurePass123!');

    // Verify user is set to newly authenticated user
    assert.deepStrictEqual(controller.getState().user, mockAdminUser);
    assert.strictEqual(controller.getState().loading, false);

    // 3. The older /auth/me response finally resolves with a different/stale user
    const staleUser: User = {
      user_id: 99,
      username: 'stale_pre_login_user',
      role: 'clerk',
      judge_id: null,
    };
    resolveRefresh!({ status: 'success', user: staleUser });
    await pendingRefresh;

    // 4. Stale response MUST BE DISCARDED. Active user MUST REMAIN mockAdminUser.
    assert.deepStrictEqual(
      controller.getState().user,
      mockAdminUser,
      'Older /auth/me must not overwrite active logged-in user'
    );
    assert.strictEqual(controller.getState().loading, false);
    assert.strictEqual(controller.getState().error, null);
  });

  test('older /auth/me response arriving after logout does not restore user session', async () => {
    let resolveRefresh: (res: CurrentUserResponse) => void;
    const refreshPromise = new Promise<CurrentUserResponse>((resolve) => {
      resolveRefresh = resolve;
    });

    const controller = new AuthSessionController({
      api: {
        getCurrentUser: () => refreshPromise,
        logout: async (): Promise<LogoutResponse> => ({
          status: 'success',
          message: 'Logged out',
        }),
      },
    });

    // 1. A session refresh is triggered (gen 1)
    const pendingRefresh = controller.refreshUser();

    // 2. User logs out while refresh is still in-flight (gen 2)
    await controller.logout();

    // Verify state is immediately cleared
    assert.strictEqual(controller.getState().user, null);
    assert.strictEqual(controller.getState().loading, false);

    // 3. Stale /auth/me response arrives after logout with authenticated payload
    resolveRefresh!({ status: 'success', user: mockAdminUser });
    await pendingRefresh;

    // 4. Stale response must be discarded; user must REMAIN null!
    assert.strictEqual(
      controller.getState().user,
      null,
      'Older /auth/me must not resurrect user session after logout'
    );
    assert.strictEqual(controller.getState().loading, false);
    assert.strictEqual(controller.getState().error, null);
  });

  test('concurrent refresh requests: only the latest response updates state', async () => {
    let resolveRefresh1: (res: CurrentUserResponse) => void;
    const promise1 = new Promise<CurrentUserResponse>((resolve) => {
      resolveRefresh1 = resolve;
    });

    let resolveRefresh2: (res: CurrentUserResponse) => void;
    const promise2 = new Promise<CurrentUserResponse>((resolve) => {
      resolveRefresh2 = resolve;
    });

    let callCount = 0;
    const controller = new AuthSessionController({
      api: {
        getCurrentUser: () => {
          callCount++;
          return callCount === 1 ? promise1 : promise2;
        },
      },
    });

    // 1. Dispatch request 1 (gen 1)
    const p1 = controller.refreshUser();

    // 2. Dispatch request 2 (gen 2)
    const p2 = controller.refreshUser();

    assert.strictEqual(controller.getGeneration(), 2);

    // 3. Request 2 completes FIRST with Clerk user
    resolveRefresh2!({ status: 'success', user: mockClerkUser });
    await p2;

    assert.deepStrictEqual(controller.getState().user, mockClerkUser);
    assert.strictEqual(controller.getState().loading, false);

    // 4. Request 1 completes LATER with Admin user
    resolveRefresh1!({ status: 'success', user: mockAdminUser });
    await p1;

    // 5. State must NOT be overwritten by the older request 1!
    assert.deepStrictEqual(
      controller.getState().user,
      mockClerkUser,
      'Older request must not overwrite state of newer request'
    );
    assert.strictEqual(controller.getState().loading, false);
  });
});

describe('Auth Lifecycle & React StrictMode Guard Simulation', () => {
  test('StrictMode replay: setup -> cleanup -> setup schedules only ONE startup session validation', async () => {
    let isMounted = false;
    let didInitialize = false;
    let validationCallCount = 0;

    const simulateEffectLifecycle = () => {
      isMounted = true;
      if (!didInitialize) {
        didInitialize = true;
        queueMicrotask(() => {
          if (isMounted) {
            validationCallCount++;
          }
        });
      }

      return () => {
        isMounted = false;
      };
    };

    // React StrictMode execution:
    // 1. Initial setup
    const cleanup1 = simulateEffectLifecycle();
    // 2. StrictMode immediate cleanup
    cleanup1();
    // 3. StrictMode second setup
    const cleanup2 = simulateEffectLifecycle();

    // Drain microtask queue
    await new Promise((resolve) => queueMicrotask(resolve));

    // Must have executed exactly once
    assert.strictEqual(
      validationCallCount,
      1,
      'StrictMode replay must schedule and execute startup validation exactly once'
    );

    cleanup2();
  });

  test('genuine unmount: queued microtask does not start validation if unmounted before tick', async () => {
    let isMounted = false;
    let didInitialize = false;
    let validationCallCount = 0;

    const simulateEffectLifecycle = () => {
      isMounted = true;
      if (!didInitialize) {
        didInitialize = true;
        queueMicrotask(() => {
          if (isMounted) {
            validationCallCount++;
          }
        });
      }

      return () => {
        isMounted = false;
      };
    };

    // 1. Mount setup
    const cleanup = simulateEffectLifecycle();
    // 2. Genuine unmount occurs immediately before microtask tick
    cleanup();

    // Drain microtask queue
    await new Promise((resolve) => queueMicrotask(resolve));

    // Must not execute after genuine unmount
    assert.strictEqual(
      validationCallCount,
      0,
      'Validation must not start if genuine unmount occurs before microtask tick'
    );
  });

  test('retry via refreshUser() continues to work independently of startup guard', async () => {
    let apiCallCount = 0;
    const controller = new AuthSessionController({
      api: {
        getCurrentUser: async (): Promise<CurrentUserResponse> => {
          apiCallCount++;
          return { status: 'success', user: mockAdminUser };
        },
      },
    });

    // 1. Initial startup validation
    await controller.refreshUser();
    assert.strictEqual(apiCallCount, 1);
    assert.deepStrictEqual(controller.getState().user, mockAdminUser);

    // 2. User invokes manual retry via refreshUser()
    await controller.refreshUser();
    assert.strictEqual(apiCallCount, 2);
    assert.strictEqual(controller.getGeneration(), 2);
  });
});
