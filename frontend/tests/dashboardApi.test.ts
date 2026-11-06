/**
 * Court Case Management System - Dashboard API & Controller Unit Tests
 * Uses Node.js native test runner (zero external dependencies).
 *
 * SCOPE & COVERAGE NOTICE:
 * The tests in this suite exercise pure TypeScript controller state machines,
 * generation counters, abort signals, role validation, and API contracts.
 * They run in a Node.js runtime (--experimental-strip-types) without a browser DOM.
 * React component-level DOM rendering (e.g. JSX elements, DOM nodes) is NOT tested here
 * and must not be claimed without a dedicated browser/jsdom rendering harness.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  DashboardDataController,
  type DashboardState,
} from '../src/hooks/dashboardDataController.ts';
import { ApiClientError } from '../src/api/client.ts';
import type {
  AdminDashboardResponse,
  ClerkDashboardResponse,
  JudgeDashboardResponse,
  RecentFiling,
} from '../src/types/index.ts';
import { getLiveFilingStatus } from '../src/layouts/dashboardNavigation.ts';

// ---------------------------------------------------------------------------
// Mock Data Fixtures Aligned with Backend Services
// ---------------------------------------------------------------------------

const mockAdminPayload: AdminDashboardResponse = {
  status: 'success',
  role: 'admin',
  data: {
    total_cases: 100,
    cases_by_status: { Filed: 25, Active: 50, Adjourned: 10, Disposed: 10, Closed: 5 },
    judges: { total: 8, active: 7 },
    total_parties: 210,
    upcoming_hearings: [
      {
        hearing_id: '00000000-0000-0000-0000-000000000101',
        case_id: '00000000-0000-0000-0000-000000000001',
        case_number: 'CR-2026-001',
        case_status: 'Active',
        judge_name: 'Hon. Elena Rostova',
        start_time: '2026-11-20T10:00:00Z',
        end_time: '2026-11-20T11:00:00Z',
      },
    ],
    recent_audit_activity: [
      {
        log_id: '00000000-0000-0000-0000-000000000501',
        case_id: '00000000-0000-0000-0000-000000000001',
        action_type: 'CASE_STATUS_UPDATED',
        changed_at: '2026-11-06T15:30:00Z',
        username: 'admin_sys',
      },
    ],
  },
};

const mockClerkPayload: ClerkDashboardResponse = {
  status: 'success',
  role: 'clerk',
  data: {
    total_cases: 100,
    cases_by_status: { Filed: 25, Active: 50, Adjourned: 10, Disposed: 10, Closed: 5 },
    recent_cases: [
      {
        case_id: '00000000-0000-0000-0000-000000000001',
        case_number: 'CR-2026-001',
        status: 'Active',
        filing_date: '2026-10-15T00:00:00Z',
      },
    ],
    upcoming_hearings: [
      {
        hearing_id: '00000000-0000-0000-0000-000000000101',
        case_id: '00000000-0000-0000-0000-000000000001',
        case_number: 'CR-2026-001',
        case_status: 'Active',
        judge_name: 'Hon. Elena Rostova',
        start_time: '2026-11-20T10:00:00Z',
        end_time: '2026-11-20T11:00:00Z',
      },
    ],
    recent_filings: [
      {
        filing_id: '00000000-0000-0000-0000-000000000201',
        case_id: '00000000-0000-0000-0000-000000000001',
        case_number: 'CR-2026-001',
        filing_type: 'Motion for Continuance',
        filing_date: '2026-11-05T14:00:00Z',
        party_name: 'Apex Global Logistics',
      },
    ],
    operational_summary: {
      total_cases: 100,
      active_cases: 50,
      filed_cases: 25,
      upcoming_hearings_count: 1,
      recent_filings_count: 1,
    },
  },
};

const TEST_JUDGE_ID = '00000000-0000-0000-0000-000000000001';

const mockJudgePayload: JudgeDashboardResponse = {
  status: 'success',
  role: 'judge',
  data: {
    judge_id: TEST_JUDGE_ID,
    upcoming_hearings: [
      {
        hearing_id: '00000000-0000-0000-0000-000000000101',
        case_id: '00000000-0000-0000-0000-000000000001',
        case_number: 'CR-2026-001',
        case_status: 'Active',
        filing_date: '2026-10-15T00:00:00Z',
        start_time: '2026-11-20T10:00:00Z',
        end_time: '2026-11-20T11:00:00Z',
      },
    ],
    assigned_hearings_count: 1,
  },
};

// ---------------------------------------------------------------------------
// Test Suites
// ---------------------------------------------------------------------------

describe('DashboardDataController - Role Success & Data Extraction', () => {
  test('successfully fetches and extracts admin dashboard data (HTTP 200)', async () => {
    const controller = new DashboardDataController({
      expectedRole: 'admin',
      api: {
        getDashboard: async () => mockAdminPayload,
      },
    });

    assert.strictEqual(controller.getState().loading, true);
    assert.strictEqual(controller.getState().isLoading, true);
    assert.strictEqual(controller.getState().data, null);

    await controller.fetch();

    const state = controller.getState();
    assert.strictEqual(state.loading, false);
    assert.strictEqual(state.isLoading, false);
    assert.strictEqual(state.error, null);
    assert.strictEqual(state.statusCode, 200);
    assert.strictEqual(state.role, 'admin');
    assert.ok(state.data);
    assert.strictEqual(state.data.total_cases, 100);
    assert.strictEqual(state.data.judges.active, 7);
    assert.strictEqual(state.data.upcoming_hearings.length, 1);
    assert.strictEqual(state.data.recent_audit_activity.length, 1);
  });

  test('successfully fetches and extracts clerk dashboard data (HTTP 200)', async () => {
    const controller = new DashboardDataController({
      expectedRole: 'clerk',
      api: {
        getDashboard: async () => mockClerkPayload,
      },
    });

    await controller.fetch();

    const state = controller.getState();
    assert.strictEqual(state.loading, false);
    assert.strictEqual(state.error, null);
    assert.strictEqual(state.statusCode, 200);
    assert.strictEqual(state.role, 'clerk');
    assert.ok(state.data);
    assert.strictEqual(state.data.operational_summary.total_cases, 100);
    assert.strictEqual(state.data.recent_cases.length, 1);
    assert.strictEqual(state.data.recent_filings.length, 1);
  });

  test('successfully fetches and extracts judge dashboard data with judge_id verification', async () => {
    const controller = new DashboardDataController({
      expectedRole: 'judge',
      expectedJudgeId: TEST_JUDGE_ID,
      api: {
        getDashboard: async () => mockJudgePayload,
      },
    });

    await controller.fetch();

    const state = controller.getState();
    assert.strictEqual(state.loading, false);
    assert.strictEqual(state.error, null);
    assert.strictEqual(state.statusCode, 200);
    assert.strictEqual(state.role, 'judge');
    assert.ok(state.data);
    assert.strictEqual(state.data.judge_id, TEST_JUDGE_ID);
    assert.strictEqual(state.data.assigned_hearings_count, 1);
    assert.strictEqual(state.data.upcoming_hearings.length, 1);
  });
});

describe('DashboardDataController - Loading State Progression', () => {
  test('notifies onStateChange during loading progression (false -> true -> false)', async () => {
    const states: Array<{ loading: boolean; hasData: boolean }> = [];

    let resolvePromise: (value: AdminDashboardResponse) => void;
    const fetchPromise = new Promise<AdminDashboardResponse>((resolve) => {
      resolvePromise = resolve;
    });

    const controller = new DashboardDataController({
      expectedRole: 'admin',
      api: {
        getDashboard: async () => fetchPromise,
      },
      onStateChange: (s) => {
        states.push({ loading: s.loading, hasData: s.data !== null });
      },
    });

    // Start fetch
    const execution = controller.fetch();
    assert.strictEqual(controller.getState().loading, true);
    assert.strictEqual(controller.isBusy(), true);

    // Resolve API call
    resolvePromise!(mockAdminPayload);
    await execution;

    assert.strictEqual(controller.getState().loading, false);
    assert.strictEqual(controller.getState().isLoading, false);
    assert.strictEqual(controller.isBusy(), false);

    // Verify loading sequence: started loading -> finished loading with data
    assert.ok(states.length >= 2);
    assert.strictEqual(states[0].loading, true);
    assert.strictEqual(states[states.length - 1].loading, false);
    assert.strictEqual(states[states.length - 1].hasData, true);
  });
});

describe('DashboardDataController - Empty Array & Zero-Count Payloads', () => {
  test('cleanly handles empty hearings, filings, and audit activity arrays', async () => {
    const emptyJudgePayload: JudgeDashboardResponse = {
      status: 'success',
      role: 'judge',
      data: {
        judge_id: TEST_JUDGE_ID,
        upcoming_hearings: [],
        assigned_hearings_count: 0,
      },
    };

    const controller = new DashboardDataController({
      expectedRole: 'judge',
      expectedJudgeId: TEST_JUDGE_ID,
      api: {
        getDashboard: async () => emptyJudgePayload,
      },
    });

    await controller.fetch();

    const state = controller.getState();
    assert.strictEqual(state.loading, false);
    assert.strictEqual(state.error, null);
    assert.strictEqual(state.statusCode, 200);
    assert.ok(state.data);
    assert.strictEqual(state.data.assigned_hearings_count, 0);
    assert.deepStrictEqual(state.data.upcoming_hearings, []);
  });
});

describe('DashboardDataController - HTTP Error Handling & Retry Loop Prevention', () => {
  test('handles HTTP 401 unauthenticated safely without auto-retry loops', async () => {
    let callCount = 0;
    const controller = new DashboardDataController({
      expectedRole: 'admin',
      api: {
        getDashboard: async () => {
          callCount++;
          throw new ApiClientError('Authentication required.', 401);
        },
      },
    });

    await controller.fetch();

    const state = controller.getState();
    assert.strictEqual(state.loading, false);
    assert.strictEqual(state.data, null);
    assert.strictEqual(state.statusCode, 401);
    assert.strictEqual(state.error, 'Authentication required. Please sign in again.');
    assert.strictEqual(callCount, 1, 'Must NOT trigger an automatic retry loop on 401');
  });

  test('handles HTTP 403 forbidden safely without auto-retry loops', async () => {
    let callCount = 0;
    const controller = new DashboardDataController({
      expectedRole: 'clerk',
      api: {
        getDashboard: async () => {
          callCount++;
          throw new ApiClientError('Access forbidden: user account is inactive or unauthorized.', 403);
        },
      },
    });

    await controller.fetch();

    const state = controller.getState();
    assert.strictEqual(state.loading, false);
    assert.strictEqual(state.data, null);
    assert.strictEqual(state.statusCode, 403);
    assert.strictEqual(
      state.error,
      'Access forbidden. You do not have permission to view this dashboard.'
    );
    assert.strictEqual(callCount, 1, 'Must NOT trigger an automatic retry loop on 403');
  });

  test('handles HTTP 500 server error safely with user-facing message', async () => {
    let callCount = 0;
    const controller = new DashboardDataController({
      expectedRole: 'judge',
      api: {
        getDashboard: async () => {
          callCount++;
          throw new ApiClientError('Dashboard service unavailable. Check server logs.', 500);
        },
      },
    });

    await controller.fetch();

    const state = controller.getState();
    assert.strictEqual(state.loading, false);
    assert.strictEqual(state.data, null);
    assert.strictEqual(state.statusCode, 500);
    assert.strictEqual(
      state.error,
      'Dashboard service temporarily unavailable. Please try again later.'
    );
    assert.strictEqual(callCount, 1, 'Must NOT trigger an automatic retry loop on 500');
  });
});

describe('DashboardDataController - Role & Identity Mismatch Guards', () => {
  test('rejects response when role does not match expected role', async () => {
    // Controller expects clerk, but server returns admin payload
    const controller = new DashboardDataController({
      expectedRole: 'clerk',
      api: {
        getDashboard: async () => mockAdminPayload as unknown as ClerkDashboardResponse,
      },
    });

    await controller.fetch();

    const state = controller.getState();
    assert.strictEqual(state.loading, false);
    assert.strictEqual(state.data, null);
    assert.strictEqual(state.statusCode, 403);
    assert.strictEqual(
      state.error,
      "Dashboard role mismatch: expected 'clerk', but received 'admin'."
    );
  });

  test('rejects judge payload when returned judge_id does not match expected judge_id', async () => {
    const wrongJudgePayload: JudgeDashboardResponse = {
      status: 'success',
      role: 'judge',
      data: {
        judge_id: '00000000-0000-0000-0000-999999999999',
        upcoming_hearings: [],
        assigned_hearings_count: 0,
      },
    };

    const controller = new DashboardDataController({
      expectedRole: 'judge',
      expectedJudgeId: TEST_JUDGE_ID,
      api: {
        getDashboard: async () => wrongJudgePayload,
      },
    });

    await controller.fetch();

    const state = controller.getState();
    assert.strictEqual(state.loading, false);
    assert.strictEqual(state.data, null);
    assert.strictEqual(state.statusCode, 403);
    assert.ok(state.error?.includes('Judge identity mismatch'));
  });
});

describe('DashboardDataController - Concurrency & Race Condition Guards', () => {
  test('older slow response arriving after newer fast response is discarded', async () => {
    let slowResolve: (val: AdminDashboardResponse) => void;
    const slowPromise = new Promise<AdminDashboardResponse>((resolve) => {
      slowResolve = resolve;
    });

    const fastPayload: AdminDashboardResponse = {
      ...mockAdminPayload,
      data: {
        ...mockAdminPayload.data,
        total_cases: 999, // Distinguishable value
      },
    };

    let callCount = 0;
    const controller = new DashboardDataController({
      expectedRole: 'admin',
      api: {
        getDashboard: async () => {
          callCount++;
          if (callCount === 1) {
            return slowPromise;
          }
          return fastPayload;
        },
      },
    });

    // Request 1 starts (slow)
    const req1 = controller.fetch();

    // Request 2 starts immediately (fast)
    const req2 = controller.fetch();

    // Request 2 completes first
    await req2;
    assert.strictEqual(controller.getState().data?.total_cases, 999);

    // Request 1 completes later with older data (total_cases: 100)
    slowResolve!(mockAdminPayload);
    await req1;

    // Older slow response must NOT overwrite newer state
    assert.strictEqual(
      controller.getState().data?.total_cases,
      999,
      'Newer response data must be preserved when older response resolves'
    );
  });

  test('refetch functionality initiates a fresh request and updates state', async () => {
    let fetchCount = 0;
    const controller = new DashboardDataController({
      expectedRole: 'admin',
      api: {
        getDashboard: async () => {
          fetchCount++;
          return {
            ...mockAdminPayload,
            data: {
              ...mockAdminPayload.data,
              total_cases: fetchCount * 10,
            },
          };
        },
      },
    });

    await controller.fetch();
    assert.strictEqual(controller.getState().data?.total_cases, 10);

    // Trigger refetch
    await controller.fetch();
    assert.strictEqual(controller.getState().data?.total_cases, 20);
    assert.strictEqual(fetchCount, 2);
  });
});

describe('DashboardDataController - Unmount & Disposal Safety', () => {
  test('disposal suppresses pending API resolution and clears listeners', async () => {
    let publishedAfterDisposal = false;
    let pendingResolve: (val: AdminDashboardResponse) => void;
    const pendingPromise = new Promise<AdminDashboardResponse>((resolve) => {
      pendingResolve = resolve;
    });

    const controller = new DashboardDataController({
      expectedRole: 'admin',
      api: {
        getDashboard: async () => pendingPromise,
      },
      onStateChange: () => {
        publishedAfterDisposal = true;
      },
    });

    // Start request
    const inFlight = controller.fetch();
    assert.strictEqual(controller.getState().loading, true);

    // Dispose while request is in flight
    controller.dispose();
    publishedAfterDisposal = false; // Reset to catch any callbacks after dispose

    // API finishes
    pendingResolve!(mockAdminPayload);
    await inFlight;

    // Must not publish state updates or update data
    assert.strictEqual(publishedAfterDisposal, false);
    assert.strictEqual(controller.getState().data, null);
  });
});

// ---------------------------------------------------------------------------
// Targeted Defect Corrections & Lifecycle Simulation Suites
// ---------------------------------------------------------------------------

describe('DashboardDataController - Initial Loading State & Zero-Statistics Protection', () => {
  test('controller initializes synchronously in loading state with null data before API completion', () => {
    const controller = new DashboardDataController({
      expectedRole: 'admin',
      api: {
        getDashboard: async () => mockAdminPayload,
      },
    });

    const state = controller.getState();
    assert.strictEqual(state.loading, true, 'Must initialize with loading: true');
    assert.strictEqual(state.isLoading, true, 'Must initialize with isLoading: true');
    assert.strictEqual(state.data, null, 'Data must be null prior to fetch resolution');
    assert.strictEqual(state.error, null, 'Error must be null prior to fetch resolution');
    assert.strictEqual(state.statusCode, null, 'StatusCode must be null prior to fetch resolution');
    assert.strictEqual(controller.isBusy(), true, 'Controller must report isBusy() === true on initial state');
  });

  test('never converts in-flight loading or API errors into fabricated zero statistics', async () => {
    let rejectPromise!: (err: Error) => void;
    const pendingPromise = new Promise<AdminDashboardResponse>((_, reject) => {
      rejectPromise = reject;
    });

    const controller = new DashboardDataController({
      expectedRole: 'admin',
      api: {
        getDashboard: async () => pendingPromise,
      },
    });

    // Frame 0 - In-flight check
    const inFlight = controller.fetch();
    assert.strictEqual(controller.getState().loading, true);
    assert.strictEqual(controller.getState().data, null, 'In-flight data must never flash zero statistics');

    // Simulate API 500 error
    rejectPromise(new ApiClientError('Internal server error', 500));
    await inFlight;

    const errorState = controller.getState();
    assert.strictEqual(errorState.loading, false);
    assert.strictEqual(errorState.data, null, 'Failed request must leave data as null, not zero statistics');
    assert.strictEqual(errorState.statusCode, 500);
    assert.strictEqual(
      errorState.error,
      'Dashboard service temporarily unavailable. Please try again later.'
    );
  });

  test('distinguishes authentic zero counts from unavailable/unloaded data', async () => {
    const zeroCasesPayload: AdminDashboardResponse = {
      status: 'success',
      role: 'admin',
      data: {
        total_cases: 0,
        cases_by_status: {},
        judges: { total: 0, active: 0 },
        total_parties: 0,
        upcoming_hearings: [],
        recent_audit_activity: [],
      },
    };

    const controller = new DashboardDataController({
      expectedRole: 'admin',
      api: {
        getDashboard: async () => zeroCasesPayload,
      },
    });

    // Before fetch: null (unavailable)
    assert.strictEqual(controller.getState().data, null);

    // After fetch: genuine zeros from backend
    await controller.fetch();
    const state = controller.getState();
    assert.strictEqual(state.loading, false);
    assert.ok(state.data !== null, 'Data is now available');
    assert.strictEqual(state.data.total_cases, 0, 'Genuine zero count preserved');
    assert.strictEqual(state.data.judges.total, 0);
  });
});

describe('DashboardDataController - Judge Identity Enforcement & Missing ID Guards', () => {
  test('rejects with HTTP 403 when expectedJudgeId is undefined', async () => {
    const controller = new DashboardDataController({
      expectedRole: 'judge',
      expectedJudgeId: undefined,
      api: {
        getDashboard: async () => mockJudgePayload,
      },
    });

    await controller.fetch();
    const state = controller.getState();
    assert.strictEqual(state.loading, false);
    assert.strictEqual(state.data, null);
    assert.strictEqual(state.statusCode, 403);
    assert.strictEqual(
      state.error,
      'Judge identity validation failed: missing or invalid expected judge_id.'
    );
  });

  test('rejects with HTTP 403 when expectedJudgeId is null, empty string, or whitespace', async () => {
    const invalidIds: Array<string | null | undefined> = [null, '', '   ', '\t\n'];

    for (const invalidId of invalidIds) {
      const controller = new DashboardDataController({
        expectedRole: 'judge',
        expectedJudgeId: invalidId,
        api: {
          getDashboard: async () => mockJudgePayload,
        },
      });

      await controller.fetch();
      const state = controller.getState();
      assert.strictEqual(state.loading, false);
      assert.strictEqual(state.data, null, `Data must be null for invalid judge ID: ${JSON.stringify(invalidId)}`);
      assert.strictEqual(state.statusCode, 403);
      assert.strictEqual(
        state.error,
        'Judge identity validation failed: missing or invalid expected judge_id.'
      );
    }
  });

  test('rejects with HTTP 403 when backend returns null or empty judge_id in payload', async () => {
    const nullJudgePayload: JudgeDashboardResponse = {
      status: 'success',
      role: 'judge',
      data: {
        judge_id: null as unknown as string,
        upcoming_hearings: [],
        assigned_hearings_count: 0,
      },
    };

    const controller = new DashboardDataController({
      expectedRole: 'judge',
      expectedJudgeId: TEST_JUDGE_ID,
      api: {
        getDashboard: async () => nullJudgePayload,
      },
    });

    await controller.fetch();
    const state = controller.getState();
    assert.strictEqual(state.loading, false);
    assert.strictEqual(state.data, null);
    assert.strictEqual(state.statusCode, 403);
    assert.strictEqual(
      state.error,
      `Judge identity mismatch: expected '${TEST_JUDGE_ID}', but received 'null'.`
    );
  });

  test('rejects with HTTP 403 when backend returns mismatched judge_id', async () => {
    const mismatchedPayload: JudgeDashboardResponse = {
      status: 'success',
      role: 'judge',
      data: {
        judge_id: '00000000-0000-0000-0000-000000000999',
        upcoming_hearings: [],
        assigned_hearings_count: 0,
      },
    };

    const controller = new DashboardDataController({
      expectedRole: 'judge',
      expectedJudgeId: TEST_JUDGE_ID,
      api: {
        getDashboard: async () => mismatchedPayload,
      },
    });

    await controller.fetch();
    const state = controller.getState();
    assert.strictEqual(state.loading, false);
    assert.strictEqual(state.data, null);
    assert.strictEqual(state.statusCode, 403);
    assert.strictEqual(
      state.error,
      `Judge identity mismatch: expected '${TEST_JUDGE_ID}', but received '00000000-0000-0000-0000-000000000999'.`
    );
  });
});

describe('DashboardDataController - Account Identity Transitions & Request Cancellation', () => {
  test('switching judge identity disposes prior controller and cancels slow in-flight requests without cross-talk', async () => {
    let slowResolveJudgeA!: (val: JudgeDashboardResponse) => void;
    const slowPromiseJudgeA = new Promise<JudgeDashboardResponse>((resolve) => {
      slowResolveJudgeA = resolve;
    });

    const judgeAPayload: JudgeDashboardResponse = {
      status: 'success',
      role: 'judge',
      data: {
        judge_id: '00000000-0000-0000-0000-000000000001',
        upcoming_hearings: [],
        assigned_hearings_count: 5,
      },
    };

    const judgeBPayload: JudgeDashboardResponse = {
      status: 'success',
      role: 'judge',
      data: {
        judge_id: '00000000-0000-0000-0000-000000000002',
        upcoming_hearings: [],
        assigned_hearings_count: 9,
      },
    };

    // Controller 1 represents Judge A session
    let judgeACallbackFired = false;
    const controllerA = new DashboardDataController({
      expectedRole: 'judge',
      expectedJudgeId: '00000000-0000-0000-0000-000000000001',
      api: {
        getDashboard: async () => slowPromiseJudgeA,
      },
      onStateChange: () => {
        judgeACallbackFired = true;
      },
    });

    // Start slow request for Judge A
    const inFlightA = controllerA.fetch();

    // User switches accounts -> cleanup disposes controller A
    controllerA.dispose();
    judgeACallbackFired = false; // Reset to detect any rogue callback after disposal

    // Controller 2 represents Judge B session
    const controllerB = new DashboardDataController({
      expectedRole: 'judge',
      expectedJudgeId: '00000000-0000-0000-0000-000000000002',
      api: {
        getDashboard: async () => judgeBPayload,
      },
    });

    // Judge B request completes quickly
    await controllerB.fetch();

    // Judge A request completes late
    slowResolveJudgeA(judgeAPayload);
    await inFlightA;

    // Verify complete isolation
    assert.strictEqual(judgeACallbackFired, false, 'Disposed controller A must not publish callbacks');
    assert.strictEqual(controllerA.getState().data, null, 'Disposed controller A must not store data');
    assert.strictEqual(controllerB.getState().data?.judge_id, '00000000-0000-0000-0000-000000000002');
    assert.strictEqual(controllerB.getState().data?.assigned_hearings_count, 9);
  });

  test('dispose() aborts active AbortController and suppresses all callbacks', async () => {
    let capturedSignal: AbortSignal | undefined;
    let resolveSlowFetch!: (val: AdminDashboardResponse) => void;
    const slowFetchPromise = new Promise<AdminDashboardResponse>((resolve) => {
      resolveSlowFetch = resolve;
    });

    const controller = new DashboardDataController({
      expectedRole: 'admin',
      api: {
        getDashboard: async (options) => {
          capturedSignal = options?.signal;
          return slowFetchPromise;
        },
      },
    });

    const inFlight = controller.fetch();
    assert.ok(capturedSignal, 'AbortSignal should be passed to getDashboard');
    assert.strictEqual(capturedSignal.aborted, false, 'Signal must be active initially');

    controller.dispose();
    assert.strictEqual(capturedSignal.aborted, true, 'Signal must be aborted upon disposal');

    resolveSlowFetch(mockAdminPayload);
    await inFlight;

    assert.strictEqual(controller.getState().data, null, 'Disposed controller must remain null');
  });

  test('refetch executes against updated identity configuration', async () => {
    let requestedJudgeId = TEST_JUDGE_ID;
    const controller = new DashboardDataController({
      expectedRole: 'judge',
      expectedJudgeId: TEST_JUDGE_ID,
      api: {
        getDashboard: async () => ({
          status: 'success',
          role: 'judge',
          data: {
            judge_id: requestedJudgeId,
            upcoming_hearings: [],
            assigned_hearings_count: requestedJudgeId === TEST_JUDGE_ID ? 3 : 7,
          },
        }),
      },
    });

    await controller.fetch();
    assert.strictEqual(controller.getState().data?.assigned_hearings_count, 3);

    // Update expected identity to Judge 2 and trigger refetch
    requestedJudgeId = '00000000-0000-0000-0000-000000000002';
    controller.setExpectedRole('judge', requestedJudgeId);

    await controller.fetch();
    assert.strictEqual(controller.getState().data?.judge_id, '00000000-0000-0000-0000-000000000002');
    assert.strictEqual(controller.getState().data?.assigned_hearings_count, 7);
  });
});

describe('Dashboard Navigation Helpers - getLiveFilingStatus', () => {
  const sampleFiling: RecentFiling = {
    filing_id: '00000000-0000-0000-0000-000000000201',
    case_id: '00000000-0000-0000-0000-000000000001',
    case_number: 'CR-2026-001',
    filing_type: 'Motion for Continuance',
    filing_date: '2026-11-05T14:00:00Z',
    party_name: 'Apex Global Logistics',
  };

  test('returns "Status Unavailable" when filing record has no status column (live backend schema)', () => {
    const status = getLiveFilingStatus(sampleFiling);
    assert.strictEqual(status, 'Status Unavailable');
  });

  test('returns "Status Unavailable" when filing is null or undefined', () => {
    assert.strictEqual(getLiveFilingStatus(null), 'Status Unavailable');
    assert.strictEqual(getLiveFilingStatus(undefined), 'Status Unavailable');
  });

  test('returns "Status Unavailable" when status property is empty string or whitespace', () => {
    assert.strictEqual(
      getLiveFilingStatus({ ...sampleFiling, status: '' } as unknown as RecentFiling),
      'Status Unavailable'
    );
    assert.strictEqual(
      getLiveFilingStatus({ ...sampleFiling, status: '   ' } as unknown as RecentFiling),
      'Status Unavailable'
    );
  });

  test('preserves and trims explicit status string when provided', () => {
    assert.strictEqual(
      getLiveFilingStatus({ ...sampleFiling, status: 'Accepted' } as unknown as RecentFiling),
      'Accepted'
    );
    assert.strictEqual(
      getLiveFilingStatus({ ...sampleFiling, status: '  Filed  ' } as unknown as RecentFiling),
      'Filed'
    );
  });
});

// ---------------------------------------------------------------------------
// Identity Transitions, Stale Data Prevention & Retry Progression Tests
// ---------------------------------------------------------------------------

describe('DashboardDataController - Identity Transition & Synchronous State Reset', () => {
  test('setExpectedRole synchronously resets state to null, increments generation, and aborts pending in-flight request', async () => {
    let slowResolveJudge1!: (val: JudgeDashboardResponse) => void;
    const slowPromiseJudge1 = new Promise<JudgeDashboardResponse>((resolve) => {
      slowResolveJudge1 = resolve;
    });

    const judge1Payload: JudgeDashboardResponse = {
      status: 'success',
      role: 'judge',
      data: {
        judge_id: '00000000-0000-0000-0000-000000000001',
        upcoming_hearings: [],
        assigned_hearings_count: 3,
      },
    };

    const controller = new DashboardDataController({
      expectedRole: 'judge',
      expectedJudgeId: '00000000-0000-0000-0000-000000000001',
      api: {
        getDashboard: async () => slowPromiseJudge1,
      },
    });

    // Start fetch for Judge 1
    const inFlightJudge1 = controller.fetch();
    assert.strictEqual(controller.getState().loading, true);
    assert.strictEqual(controller.getState().data, null);

    // Identity switch occurs while request is in flight: reconfigure to Judge 2
    controller.setExpectedRole('judge', '00000000-0000-0000-0000-000000000002');

    // State must be synchronously reset immediately
    const resetState = controller.getState();
    assert.strictEqual(resetState.data, null, 'State data must be reset to null upon identity reconfiguration');
    assert.strictEqual(resetState.loading, true, 'State must report loading for new identity');
    assert.strictEqual(resetState.error, null);

    // Resolve old Judge 1 request late
    slowResolveJudge1(judge1Payload);
    await inFlightJudge1;

    // Must NOT leak Judge 1 data into Judge 2's controller state
    assert.strictEqual(
      controller.getState().data,
      null,
      'Stale response from old identity must never populate controller state'
    );
  });

  test('switching between roles resets state and prevents cross-role data leaks', async () => {
    let currentResponse: AdminDashboardResponse | ClerkDashboardResponse = mockAdminPayload;

    const controller = new DashboardDataController<any>({
      expectedRole: 'admin',
      api: {
        getDashboard: async () => currentResponse,
      },
    });

    // Fetch as Admin
    await controller.fetch();
    assert.strictEqual(controller.getState().role, 'admin');
    assert.strictEqual(controller.getState().data?.total_cases, 100);

    // Transition to Clerk
    currentResponse = mockClerkPayload;
    controller.setExpectedRole('clerk');

    // Immediately after transition, admin data is purged
    assert.strictEqual(controller.getState().data, null, 'Admin data must be purged immediately upon role change');

    // Fetch as Clerk
    await controller.fetch();
    assert.strictEqual(controller.getState().role, 'clerk');
    assert.ok(controller.getState().data?.operational_summary);
  });
});

describe('DashboardDataController - Retry Progression (Loading -> Error -> Loading -> Success)', () => {
  test('retry correctly transitions from error back to loading and resolves to valid data', async () => {
    let shouldFail = true;
    const states: Array<{ loading: boolean; hasError: boolean; hasData: boolean }> = [];

    const controller = new DashboardDataController({
      expectedRole: 'admin',
      api: {
        getDashboard: async () => {
          if (shouldFail) {
            throw new ApiClientError('Server database connection timeout', 500);
          }
          return mockAdminPayload;
        },
      },
      onStateChange: (s) => {
        states.push({
          loading: s.loading,
          hasError: s.error !== null,
          hasData: s.data !== null,
        });
      },
    });

    // 1. Initial attempt fails
    await controller.fetch();
    const errorState = controller.getState();
    assert.strictEqual(errorState.loading, false);
    assert.strictEqual(errorState.statusCode, 500);
    assert.strictEqual(errorState.data, null);
    assert.strictEqual(
      errorState.error,
      'Dashboard service temporarily unavailable. Please try again later.'
    );

    // 2. Retry succeeds
    shouldFail = false;
    const retryPromise = controller.fetch();

    // Verify immediate return to loading state before retry resolves
    assert.strictEqual(controller.getState().loading, true, 'Retry must immediately enter loading state');
    assert.strictEqual(controller.getState().isLoading, true);
    assert.strictEqual(controller.getState().error, null, 'Error must be cleared when retry initiates');

    await retryPromise;

    const successState = controller.getState();
    assert.strictEqual(successState.loading, false);
    assert.strictEqual(successState.error, null);
    assert.strictEqual(successState.statusCode, 200);
    assert.strictEqual(successState.data?.total_cases, 100);
  });
});

describe('DashboardDataController - React StrictMode Simulation (Setup -> Cleanup -> Setup)', () => {
  test('simulates React StrictMode: active second controller resolves cleanly while first disposed controller is ignored', async () => {
    let resolveFirstFetch!: (val: AdminDashboardResponse) => void;
    const firstFetchPromise = new Promise<AdminDashboardResponse>((resolve) => {
      resolveFirstFetch = resolve;
    });

    let firstControllerFired = false;
    let secondControllerFired = false;

    // --- StrictMode Setup 1 ---
    const controller1 = new DashboardDataController({
      expectedRole: 'admin',
      api: { getDashboard: async () => firstFetchPromise },
      onStateChange: () => { firstControllerFired = true; },
    });
    const inFlight1 = controller1.fetch();

    // --- StrictMode Cleanup 1 ---
    controller1.dispose();
    firstControllerFired = false; // Reset to detect any rogue callbacks

    // --- StrictMode Setup 2 (Re-mount) ---
    const controller2 = new DashboardDataController({
      expectedRole: 'admin',
      api: { getDashboard: async () => mockAdminPayload },
      onStateChange: () => { secondControllerFired = true; },
    });
    await controller2.fetch();

    // Controller 2 must have successfully received and stored data
    assert.strictEqual(secondControllerFired, true);
    assert.strictEqual(controller2.getState().loading, false);
    assert.strictEqual(controller2.getState().data?.total_cases, 100);

    // Now resolve Controller 1's slow response
    resolveFirstFetch(mockAdminPayload);
    await inFlight1;

    // Disposed Controller 1 must remain disposed and silent
    assert.strictEqual(firstControllerFired, false, 'Disposed Controller 1 must not fire callbacks');
    assert.strictEqual(controller1.getState().data, null, 'Disposed Controller 1 must have null data');

    // Refetch on Controller 2 must continue to function normally
    let refetchCount = 0;
    controller2['api'].getDashboard = async () => {
      refetchCount++;
      return mockAdminPayload;
    };
    await controller2.fetch();
    assert.strictEqual(refetchCount, 1, 'Active controller2 refetch must succeed');
  });
});


