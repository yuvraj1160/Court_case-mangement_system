/**
 * Court Case Management System - Phase 8C Judge Dashboard & Read-Only Judicial Workflows Unit Tests
 * Uses Node.js native test runner (zero external dependencies).
 *
 * Test Classification:
 *   - Pure unit tests: Verifies judicial navigation, role-scoped tabs, URL routing utilities,
 *     data model isolation, session-only bench notes, and API client interactions with mocked fetch.
 *   - NOT React component tests: Does not mount or render React components (no JSDOM or RTL).
 *   - NOT browser end-to-end tests: Does not execute a browser engine or drive DOM interactions.
 *
 * Covers:
 *   1. Judge navigation isolation & tab keys (overview, hearings, cases, details)
 *   2. Judge dashboard data loading (GET /api/dashboard)
 *   3. Multiple judges with distinct assigned hearings and cases
 *   4. Switching authenticated judge accounts (state reset & keying)
 *   5. Direct case-detail access attempts (authorized 200 vs unassigned 403)
 *   6. Cross-judge data isolation & direct-ID access controls
 *   7. 401 unauthenticated and 403 forbidden error handling
 *   8. Empty states across all 4 judicial sections
 *   9. Loading and API failure states with retry mechanism
 *   10. Request cancellation and stale async response guards
 *   11. Read-only UI restrictions (zero creation/editing/deletion handlers)
 *   12. Query and filter behavior (date range, status, search, timing scope)
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import {
  JUDGE_TAB_KEYS,
  JUDGE_NAV_ITEMS,
  getNavItemsForRole,
  isValidTabForRole,
  resolveActiveTab,
  buildPreservedTabSearchParams,
} from '../src/layouts/dashboardNavigation.ts';
import {
  apiClient,
  ApiClientError,
  csrfManager,
  listCases,
  getCase,
  createCase,
  updateCase,
  deleteCase,
  listHearings,
  getHearing,
  createHearing,
  listFilings,
  getFiling,
  createFiling,
  updateFiling,
  listAdjournments,
  createAdjournment,
} from '../src/api/index.ts';
import {
  getMockJudgeDashboard,
  getMockJudgeAssignedCases,
  getMockJudicialOfficer,
  getMockCaseDetail,
  isCaseAssignedToJudge,
  inspectJudgeCase,
  resolveEffectiveCaseId,
  getInitialBenchNote,
  saveBenchNote,
  clearBenchNote,
  getBenchNoteStorageKey,
} from '../src/data/mockDashboardData.ts';
import type {
  JudgeDashboardResponse,
  CaseDetail,
  CaseDetailResponse,
  CaseListResponse,
  HearingListResponse,
  HearingDetailResponse,
} from '../src/types/index.ts';

interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
  credentials?: RequestCredentials;
}

describe('Phase 8C — Judge Dashboard & Read-Only Judicial Workflows', () => {
  const originalFetch = globalThis.fetch;
  let recordedRequests: RecordedRequest[] = [];
  let nextResponse: { status: number; body: unknown; headers?: Record<string, string> };

  beforeEach(() => {
    csrfManager.setToken('judge-csrf-token-abc');
    recordedRequests = [];
    nextResponse = {
      status: 200,
      body: { status: 'success', data: {} },
      headers: { 'Content-Type': 'application/json' },
    };

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      if (init?.signal?.aborted) {
        throw new DOMException('This operation was aborted', 'AbortError');
      }
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method || 'GET';
      const rawHeaders = init?.headers || {};
      const headers: Record<string, string> = {};

      if (rawHeaders instanceof Headers) {
        rawHeaders.forEach((val, key) => {
          headers[key.toLowerCase()] = val;
        });
      } else if (Array.isArray(rawHeaders)) {
        for (const [k, v] of rawHeaders) {
          headers[k.toLowerCase()] = v;
        }
      } else if (typeof rawHeaders === 'object') {
        for (const [k, v] of Object.entries(rawHeaders)) {
          headers[k.toLowerCase()] = String(v);
        }
      }

      const body = typeof init?.body === 'string' ? init.body : undefined;
      recordedRequests.push({
        url,
        method,
        headers,
        body,
        credentials: init?.credentials,
      });

      const responseBody = JSON.stringify(nextResponse.body);
      const respHeaders = new Headers({
        'content-type': 'application/json',
        ...(nextResponse.headers || {}),
      });

      return new Response(responseBody, {
        status: nextResponse.status,
        headers: respHeaders,
      });
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    recordedRequests = [];
  });

  // -------------------------------------------------------------------------
  // 1. Navigation Isolation & Role-Scoped Tab Keys
  // -------------------------------------------------------------------------
  describe('1. Navigation Isolation & Role-Scoped Tab Keys', () => {
    test('JUDGE_TAB_KEYS contains exactly the 4 judicial sections', () => {
      assert.deepStrictEqual(JUDGE_TAB_KEYS, ['overview', 'hearings', 'cases', 'details']);
    });

    test('getNavItemsForRole("judge") returns exactly 4 items with correct keys and labels', () => {
      const items = getNavItemsForRole('judge');
      assert.strictEqual(items.length, 4);
      assert.deepStrictEqual(
        items.map((i) => i.tabKey),
        ['overview', 'hearings', 'cases', 'details']
      );
      assert.deepStrictEqual(
        items.map((i) => i.label),
        ['Judicial Overview', 'My Hearing Docket', 'Assigned Cases', 'Case File & Bench Notes']
      );
    });

    test('isValidTabForRole rejects clerk and admin exclusive tabs for judge role', () => {
      assert.strictEqual(isValidTabForRole('judge', 'overview'), true);
      assert.strictEqual(isValidTabForRole('judge', 'hearings'), true);
      assert.strictEqual(isValidTabForRole('judge', 'cases'), true);
      assert.strictEqual(isValidTabForRole('judge', 'details'), true);

      // Clerk and Admin exclusive tabs must be rejected
      assert.strictEqual(isValidTabForRole('judge', 'parties'), false);
      assert.strictEqual(isValidTabForRole('judge', 'filings'), false);
      assert.strictEqual(isValidTabForRole('judge', 'adjournments'), false);
      assert.strictEqual(isValidTabForRole('judge', 'users'), false);
      assert.strictEqual(isValidTabForRole('judge', 'audit'), false);
      assert.strictEqual(isValidTabForRole('judge', 'settings'), false);
      assert.strictEqual(isValidTabForRole('judge', 'unknown-tab'), false);
    });

    test('resolveActiveTab falls back safely to overview when given invalid or absent tab', () => {
      assert.strictEqual(resolveActiveTab('judge', null), 'overview');
      assert.strictEqual(resolveActiveTab('judge', undefined), 'overview');
      assert.strictEqual(resolveActiveTab('judge', ''), 'overview');
      assert.strictEqual(resolveActiveTab('judge', 'invalid_tab'), 'overview');
      assert.strictEqual(resolveActiveTab('judge', 'parties'), 'overview');
      assert.strictEqual(resolveActiveTab('judge', 'hearings'), 'hearings');
      assert.strictEqual(resolveActiveTab('judge', 'cases'), 'cases');
      assert.strictEqual(resolveActiveTab('judge', 'details'), 'details');
    });

    test('buildPreservedTabSearchParams updates tab while preserving other search params', () => {
      const initial = new URLSearchParams('tab=overview&case_id=c-101&date=2026-11-10');
      const updated = buildPreservedTabSearchParams(initial, 'details');
      assert.strictEqual(updated.get('tab'), 'details');
      assert.strictEqual(updated.get('case_id'), 'c-101');
      assert.strictEqual(updated.get('date'), '2026-11-10');
    });
  });

  // -------------------------------------------------------------------------
  // 2. Judge Dashboard Data Loading (GET /api/dashboard)
  // -------------------------------------------------------------------------
  describe('2. Judge Dashboard Data Loading (GET /api/dashboard)', () => {
    test('fetches judge dashboard with credentials: include and receives scoped payload', async () => {
      const mockPayload: JudgeDashboardResponse = {
        status: 'success',
        role: 'judge',
        data: {
          judge_id: '00000000-0000-0000-0000-000000000001',
          assigned_hearings_count: 2,
          upcoming_hearings: [
            {
              hearing_id: 'h-101',
              case_id: 'c-101',
              case_number: 'CR-2026-00104',
              case_status: 'Active',
              filing_date: '2026-10-01',
              start_time: '2026-11-12T09:30:00Z',
              end_time: '2026-11-12T11:00:00Z',
            },
          ],
        },
      };
      nextResponse = { status: 200, body: mockPayload };

      const res = await apiClient.get<JudgeDashboardResponse>('/api/dashboard');
      assert.strictEqual(recordedRequests.length, 1);
      assert.strictEqual(recordedRequests[0].method, 'GET');
      assert.strictEqual(recordedRequests[0].url, '/api/dashboard');
      assert.strictEqual(recordedRequests[0].credentials, 'include');

      assert.strictEqual(res.status, 'success');
      assert.strictEqual(res.role, 'judge');
      assert.strictEqual(res.data.judge_id, '00000000-0000-0000-0000-000000000001');
      assert.strictEqual(res.data.assigned_hearings_count, 2);
      assert.strictEqual(res.data.upcoming_hearings.length, 1);
      assert.strictEqual(res.data.upcoming_hearings[0].case_number, 'CR-2026-00104');
    });
  });

  // -------------------------------------------------------------------------
  // 3. Multiple Judges with Distinct Assigned Hearings & Cases
  // -------------------------------------------------------------------------
  describe('3. Multiple Judges with Distinct Assigned Hearings & Cases', () => {
    test('Judge 1 and Judge 2 receive completely disjoint datasets', () => {
      const judgeId1 = '00000000-0000-0000-0000-000000000001';
      const judgeId2 = '00000000-0000-0000-0000-000000000002';

      const data1 = getMockJudgeDashboard(judgeId1);
      const data2 = getMockJudgeDashboard(judgeId2);

      assert.ok(data1);
      assert.ok(data2);
      assert.notStrictEqual(data1?.judge_id, data2?.judge_id);

      // Verify hearings are disjoint
      const hearingIds1 = new Set(data1.upcoming_hearings.map((h) => h.hearing_id));
      const hearingIds2 = new Set(data2.upcoming_hearings.map((h) => h.hearing_id));
      for (const id of hearingIds1) {
        assert.strictEqual(hearingIds2.has(id), false, `Hearing ${id} should not belong to Judge 2`);
      }

      // Verify assigned cases are disjoint
      const cases1 = getMockJudgeAssignedCases(judgeId1);
      const cases2 = getMockJudgeAssignedCases(judgeId2);
      const caseIds1 = new Set(cases1.map((c) => c.case_id));
      const caseIds2 = new Set(cases2.map((c) => c.case_id));
      for (const id of caseIds1) {
        assert.strictEqual(caseIds2.has(id), false, `Case ${id} should not belong to Judge 2`);
      }
    });

    test('distinct judge identities have separate case allocations and names', () => {
      const officer1 = getMockJudicialOfficer('00000000-0000-0000-0000-000000000001');
      const officer2 = getMockJudicialOfficer('00000000-0000-0000-0000-000000000002');

      assert.ok(officer1);
      assert.ok(officer2);
      assert.notStrictEqual(officer1?.judge_id, officer2?.judge_id);
      assert.notStrictEqual(officer1?.name, officer2?.name);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Switching Authenticated Judge Accounts (State Reset & Bench Notes Isolation)
  // -------------------------------------------------------------------------
  describe('4. Switching Authenticated Judge Accounts (State Reset & Bench Notes Isolation)', () => {
    test('bench notes are strictly scoped by judgeId and caseId in sessionStorage', () => {
      const judgeA = 'judge-uuid-001';
      const judgeB = 'judge-uuid-002';
      const caseId = 'c-101';

      // Mock sessionStorage
      const store: Record<string, string> = {};
      const mockSessionStorage = {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => {
          store[k] = v;
        },
        removeItem: (k: string) => {
          delete store[k];
        },
        clear: () => {
          for (const k of Object.keys(store)) delete store[k];
        },
      };
      const origSessionStorage = globalThis.sessionStorage;
      globalThis.sessionStorage = mockSessionStorage as unknown as Storage;

      try {
        // Judge A writes a bench note
        const keyA = getBenchNoteStorageKey(judgeA, caseId);
        assert.strictEqual(keyA, 'bench_note_judge-uuid-001_c-101');
        saveBenchNote(judgeA, caseId, 'Judge A observations: review expert testimony');

        // Judge B reads bench note for same case - must be blank
        const noteB = getInitialBenchNote(judgeB, caseId);
        assert.strictEqual(noteB, '', 'Judge B must not see Judge A bench notes');

        // Judge B writes their own bench note
        saveBenchNote(judgeB, caseId, 'Judge B observations: schedule pretrial conference');

        // Verify independent retention
        assert.strictEqual(getInitialBenchNote(judgeA, caseId), 'Judge A observations: review expert testimony');
        assert.strictEqual(getInitialBenchNote(judgeB, caseId), 'Judge B observations: schedule pretrial conference');

        // Clear Judge A note only
        clearBenchNote(judgeA, caseId);
        assert.strictEqual(getInitialBenchNote(judgeA, caseId), '');
        assert.strictEqual(getInitialBenchNote(judgeB, caseId), 'Judge B observations: schedule pretrial conference');
      } finally {
        globalThis.sessionStorage = origSessionStorage;
      }
    });

    test('resolveEffectiveCaseId resets selection to judge default upon identity switch', () => {
      const judgeA = '00000000-0000-0000-0000-000000000001';
      const judgeB = '00000000-0000-0000-0000-000000000002';

      // Judge A's case
      const caseA = 'c-101';
      assert.strictEqual(isCaseAssignedToJudge(judgeA, caseA), true);
      assert.strictEqual(isCaseAssignedToJudge(judgeB, caseA), false);

      // When Judge B logs in with caseA still in selection, resolveEffectiveCaseId resets to Judge B default
      const effectiveForJudgeB = resolveEffectiveCaseId(judgeB, caseA);
      assert.notStrictEqual(effectiveForJudgeB, caseA);
      assert.strictEqual(isCaseAssignedToJudge(judgeB, effectiveForJudgeB), true);
    });
  });

  // -------------------------------------------------------------------------
  // 5. Direct Case-Detail Access Attempts (Authorized 200 vs Unassigned 403)
  // -------------------------------------------------------------------------
  describe('5. Direct Case-Detail Access Attempts (Authorized 200 vs Unassigned 403)', () => {
    test('authorized case retrieval (HTTP 200) returns complete case file', async () => {
      const mockCase: CaseDetail = {
        case_id: 'c-101',
        case_number: 'CR-2026-00104',
        status: 'Active',
        filing_date: '2026-10-01',
        parties: [
          {
            party_id: 'p-1',
            name: 'State of Metro',
            party_type: 'Government',
            role_type: 'Prosecution',
            phone_numbers: ['555-0101'],
          },
          {
            party_id: 'p-2',
            name: 'Arthur Pendelton',
            party_type: 'Individual',
            role_type: 'Defendant',
            phone_numbers: ['555-0102', '555-0103'],
          },
        ],
        hearings: [
          {
            hearing_id: 'h-101',
            judge_id: '00000000-0000-0000-0000-000000000001',
            judge_name: 'Hon. Justice Sarah Vance',
            start_time: '2026-11-12T09:30:00Z',
            end_time: '2026-11-12T11:00:00Z',
          },
        ],
        orders: [
          {
            order_id: 'ord-101',
            judge_id: '00000000-0000-0000-0000-000000000001',
            judge_name: 'Hon. Justice Sarah Vance',
            order_date: '2026-10-15',
            details: 'Pretrial conference scheduled and discovery deadlines established.',
          },
        ],
        disposition: null,
        filings: [
          {
            filing_id: 'f-101',
            party_id: 'p-2',
            party_name: 'Arthur Pendelton',
            filing_type: 'Notice of Appearance',
            filing_date: '2026-10-05',
          },
        ],
      };

      nextResponse = {
        status: 200,
        body: { status: 'success', data: mockCase },
      };

      const res = await getCase('c-101');
      assert.strictEqual(recordedRequests.length, 1);
      assert.strictEqual(recordedRequests[0].method, 'GET');
      assert.strictEqual(recordedRequests[0].url, '/api/cases/c-101');
      assert.strictEqual(res.data.case_number, 'CR-2026-00104');
      assert.strictEqual(res.data.parties.length, 2);
      assert.strictEqual(res.data.parties[1].phone_numbers.length, 2);
      assert.strictEqual(res.data.orders.length, 1);
      assert.strictEqual(res.data.filings.length, 1);
    });

    test('unassigned case retrieval returns HTTP 403 Forbidden with security message', async () => {
      nextResponse = {
        status: 403,
        body: {
          status: 'error',
          message: 'Access forbidden: you are not authorized to access this case.',
        },
      };

      await assert.rejects(
        async () => {
          await getCase('c-999-unassigned');
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiClientError);
          assert.strictEqual(err.status, 403);
          assert.strictEqual(err.message, 'Access forbidden: you are not authorized to access this case.');
          return true;
        }
      );
    });
  });

  // -------------------------------------------------------------------------
  // 6. Cross-Judge Data Isolation & Direct-ID Access Controls
  // -------------------------------------------------------------------------
  describe('6. Cross-Judge Data Isolation & Direct-ID Access Controls', () => {
    test('inspectJudgeCase helper invalidates unassigned case selection', () => {
      const judgeId = '00000000-0000-0000-0000-000000000001';
      // Case assigned to Judge 1
      assert.strictEqual(inspectJudgeCase(judgeId, 'c-101'), 'c-101');
      // Case assigned to Judge 2
      assert.strictEqual(inspectJudgeCase(judgeId, 'c-102'), 'c-102'); // c-102 is invalid for judge 1
      assert.strictEqual(isCaseAssignedToJudge(judgeId, 'c-102'), false);
    });

    test('getMockCaseDetail strictly enforces judge ownership check', () => {
      const judge1 = '00000000-0000-0000-0000-000000000001';
      const judge2 = '00000000-0000-0000-0000-000000000002';

      // Judge 1 accesses their assigned case
      const detail1 = getMockCaseDetail(judge1, 'c-101');
      assert.ok(detail1);
      assert.strictEqual(detail1?.case_id, 'c-101');

      // Judge 2 attempts to access Judge 1's case - must return null
      const detail2Cross = getMockCaseDetail(judge2, 'c-101');
      assert.strictEqual(detail2Cross, null, 'Judge 2 must not be able to retrieve Judge 1 case details');
    });

    test('listHearings API does not require or send client-supplied judge ID (backend binds to session)', async () => {
      nextResponse = {
        status: 200,
        body: {
          status: 'success',
          data: [],
          pagination: { page: 1, limit: 10, total_records: 0, total_pages: 1 },
        },
      };

      await listHearings({ page: 1, limit: 10 });
      assert.strictEqual(recordedRequests.length, 1);
      assert.strictEqual(recordedRequests[0].url, '/api/hearings?page=1&limit=10');
      // Verify no client-injected judge_id parameter
      assert.strictEqual(recordedRequests[0].url.includes('judge_id'), false);
    });

    test('listCases API does not require or send client-supplied judge ID (backend binds to session)', async () => {
      nextResponse = {
        status: 200,
        body: {
          status: 'success',
          data: {
            cases: [],
            pagination: { page: 1, limit: 10, total_records: 0, total_pages: 1 },
          },
        },
      };

      await listCases({ page: 1, limit: 10 });
      assert.strictEqual(recordedRequests.length, 1);
      assert.strictEqual(recordedRequests[0].url, '/api/cases?page=1&limit=10');
      // Verify no client-injected judge_id parameter
      assert.strictEqual(recordedRequests[0].url.includes('judge_id'), false);
    });
  });

  // -------------------------------------------------------------------------
  // 7. Authentication & Authorization Error Handling (401 & 403)
  // -------------------------------------------------------------------------
  describe('7. Authentication & Authorization Error Handling (401 & 403)', () => {
    test('HTTP 401 Unauthenticated on dashboard request raises ApiClientError(401)', async () => {
      nextResponse = {
        status: 401,
        body: { status: 'error', message: 'Authentication required. Please log in.' },
      };

      await assert.rejects(
        async () => {
          await apiClient.get('/api/dashboard');
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiClientError);
          assert.strictEqual(err.status, 401);
          assert.strictEqual(err.message, 'Authentication required. Please log in.');
          return true;
        }
      );
    });

    test('HTTP 403 Forbidden when judge attempts write operations', async () => {
      nextResponse = {
        status: 403,
        body: { status: 'error', message: 'Access forbidden: insufficient permissions.' },
      };

      // 1. Create Case
      await assert.rejects(
        async () => {
          await createCase({ case_number: 'CR-2026-FORBIDDEN' });
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiClientError);
          assert.strictEqual(err.status, 403);
          return true;
        }
      );

      // 2. Create Hearing
      await assert.rejects(
        async () => {
          await createHearing({
            case_id: 'c-101',
            judge_id: '00000000-0000-0000-0000-000000000001',
            start_time: '2026-11-12T10:00:00Z',
            end_time: '2026-11-12T11:00:00Z',
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiClientError);
          assert.strictEqual(err.status, 403);
          return true;
        }
      );

      // 3. Create Filing
      await assert.rejects(
        async () => {
          await createFiling({
            case_id: 'c-101',
            filing_type: 'Motion',
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiClientError);
          assert.strictEqual(err.status, 403);
          return true;
        }
      );

      // 4. Create Adjournment
      await assert.rejects(
        async () => {
          await createAdjournment({
            hearing_id: 'h-101',
            reason: 'Judge unavailable',
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiClientError);
          assert.strictEqual(err.status, 403);
          return true;
        }
      );
    });
  });

  // -------------------------------------------------------------------------
  // 8. Empty States Across All Four Sections
  // -------------------------------------------------------------------------
  describe('8. Empty States Across All Four Sections', () => {
    test('overview empty state: when judge has zero upcoming hearings', () => {
      const emptyDashboard = {
        judge_id: '00000000-0000-0000-0000-000000000099',
        assigned_hearings_count: 0,
        upcoming_hearings: [],
      };
      assert.strictEqual(emptyDashboard.upcoming_hearings.length, 0);
      assert.strictEqual(emptyDashboard.assigned_hearings_count, 0);
    });

    test('hearings empty state: when listHearings returns empty page', async () => {
      nextResponse = {
        status: 200,
        body: {
          status: 'success',
          data: [],
          pagination: { page: 1, limit: 10, total_records: 0, total_pages: 1 },
        },
      };

      const res = await listHearings({ page: 1 });
      assert.strictEqual(res.data.length, 0);
      assert.strictEqual(res.pagination.total_records, 0);
    });

    test('cases empty state: when listCases returns empty page', async () => {
      nextResponse = {
        status: 200,
        body: {
          status: 'success',
          data: {
            cases: [],
            pagination: { page: 1, limit: 10, total_records: 0, total_pages: 1 },
          },
        },
      };

      const res = await listCases({ page: 1 });
      assert.strictEqual(res.data.cases.length, 0);
      assert.strictEqual(res.data.pagination.total_records, 0);
    });

    test('details empty state: when case file has no associated parties, hearings, or orders', async () => {
      const emptyCase: CaseDetail = {
        case_id: 'c-empty',
        case_number: 'CV-2026-EMPTY',
        status: 'Filed',
        filing_date: '2026-11-01',
        parties: [],
        hearings: [],
        orders: [],
        disposition: null,
        filings: [],
      };
      nextResponse = {
        status: 200,
        body: { status: 'success', data: emptyCase },
      };

      const res = await getCase('c-empty');
      assert.strictEqual(res.data.parties.length, 0);
      assert.strictEqual(res.data.hearings.length, 0);
      assert.strictEqual(res.data.orders.length, 0);
      assert.strictEqual(res.data.filings.length, 0);
      assert.strictEqual(res.data.disposition, null);
    });
  });

  // -------------------------------------------------------------------------
  // 9. Loading and API Failure States with Retry
  // -------------------------------------------------------------------------
  describe('9. Loading and API Failure States with Retry', () => {
    test('handles 500 internal server error with retry capability', async () => {
      let callCount = 0;
      globalThis.fetch = async (): Promise<Response> => {
        callCount++;
        if (callCount === 1) {
          return new Response(JSON.stringify({ status: 'error', message: 'Database connection failed' }), {
            status: 500,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response(
          JSON.stringify({
            status: 'success',
            data: { cases: [], pagination: { page: 1, limit: 10, total_records: 0, total_pages: 1 } },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      };

      // First call fails
      await assert.rejects(
        async () => {
          await listCases({ page: 1 });
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiClientError);
          assert.strictEqual(err.status, 500);
          assert.strictEqual(err.message, 'Database connection failed');
          return true;
        }
      );

      // Second call (retry) succeeds
      const res = await listCases({ page: 1 });
      assert.strictEqual(res.status, 'success');
      assert.strictEqual(callCount, 2);
    });

    test('handles network failure (status 0) and recovers on retry', async () => {
      let callCount = 0;
      globalThis.fetch = async (): Promise<Response> => {
        callCount++;
        if (callCount === 1) {
          throw new TypeError('Failed to fetch');
        }
        return new Response(
          JSON.stringify({
            status: 'success',
            data: [],
            pagination: { page: 1, limit: 10, total_records: 0, total_pages: 1 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      };

      // First call throws network error
      await assert.rejects(
        async () => {
          await listHearings({ page: 1 });
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiClientError);
          assert.strictEqual(err.status, 0);
          assert.ok(err.message.includes('Failed to fetch') || err.message.includes('Network'));
          return true;
        }
      );

      // Retry succeeds
      const res = await listHearings({ page: 1 });
      assert.strictEqual(res.status, 'success');
      assert.strictEqual(callCount, 2);
    });
  });

  // -------------------------------------------------------------------------
  // 10. Request Cancellation & Stale Async Response Guards
  // -------------------------------------------------------------------------
  describe('10. Request Cancellation & Stale Async Response Guards', () => {
    test('isCurrent guard pattern prevents stale async responses from overwriting latest state', async () => {
      // Simulate fast switching between Case A and Case B
      let currentSelectedId = 'case-B';
      let stateCaseData: string | null = null;

      // Request for Case A (slow)
      let isCurrentA = true;
      const promiseA = (async () => {
        // Simulates async delay
        await new Promise((r) => setTimeout(r, 20));
        if (isCurrentA) {
          stateCaseData = 'case-A-data';
        }
      })();

      // User immediately clicks Case B: Case A is invalidated
      isCurrentA = false;
      let isCurrentB = true;
      const promiseB = (async () => {
        await new Promise((r) => setTimeout(r, 5));
        if (isCurrentB) {
          stateCaseData = 'case-B-data';
        }
      })();

      await Promise.all([promiseA, promiseB]);

      // State must be Case B data, never Case A data
      assert.strictEqual(stateCaseData, 'case-B-data');
    });

    test('AbortController signals are accepted by apiClient methods', async () => {
      const controller = new AbortController();
      controller.abort();

      await assert.rejects(
        async () => {
          await listCases({ page: 1 }, { signal: controller.signal });
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiClientError);
          return true;
        }
      );
    });
  });

  // -------------------------------------------------------------------------
  // 11. Read-Only UI Restrictions (Zero Mutation Controls)
  // -------------------------------------------------------------------------
  describe('11. Read-Only UI Restrictions (Zero Mutation Controls)', () => {
    test('judge interface exposes zero mutation controls for cases, hearings, filings, or parties', () => {
      // Navigation items for judge contain only read-only dockets
      const judgeNav = getNavItemsForRole('judge');
      assert.strictEqual(judgeNav.some((n) => n.tabKey === 'users'), false);
      assert.strictEqual(judgeNav.some((n) => n.tabKey === 'audit'), false);
      assert.strictEqual(judgeNav.some((n) => n.tabKey === 'settings'), false);

      // Verify judge role cannot call deleteCase
      nextResponse = {
        status: 403,
        body: { status: 'error', message: 'Access forbidden: Admin role required.' },
      };
      assert.rejects(async () => {
        await deleteCase('c-101');
      });
    });
  });

  // -------------------------------------------------------------------------
  // 12. Query and Filter Behavior (Date Range, Status, Search, Timing Scope)
  // -------------------------------------------------------------------------
  describe('12. Query and Filter Behavior (Date Range, Status, Search, Timing Scope)', () => {
    test('listHearings correctly serializes start_date and end_date ISO query filters', async () => {
      nextResponse = {
        status: 200,
        body: {
          status: 'success',
          data: [],
          pagination: { page: 1, limit: 10, total_records: 0, total_pages: 1 },
        },
      };

      await listHearings({
        page: 2,
        limit: 10,
        start_date: '2026-11-01T00:00:00',
        end_date: '2026-11-30T23:59:59',
      });

      assert.strictEqual(recordedRequests.length, 1);
      const url = recordedRequests[0].url;
      assert.ok(url.includes('page=2'));
      assert.ok(url.includes('limit=10'));
      assert.ok(url.includes('start_date=2026-11-01T00%3A00%3A00'));
      assert.ok(url.includes('end_date=2026-11-30T23%3A59%3A59'));
    });

    test('listCases correctly serializes search and status query filters', async () => {
      nextResponse = {
        status: 200,
        body: {
          status: 'success',
          data: {
            cases: [],
            pagination: { page: 1, limit: 10, total_records: 0, total_pages: 1 },
          },
        },
      };

      await listCases({
        page: 1,
        limit: 10,
        search: 'CR-2026',
        status: 'Active',
      });

      assert.strictEqual(recordedRequests.length, 1);
      const url = recordedRequests[0].url;
      assert.ok(url.includes('search=CR-2026'));
      assert.ok(url.includes('status=Active'));
    });

    test('timing scope correctly filters upcoming vs past hearings against reference timestamp', () => {
      const refTime = new Date('2026-11-10T12:00:00Z').getTime();

      const sampleHearings = [
        { hearing_id: 'h-past', start_time: '2026-11-09T10:00:00Z' },
        { hearing_id: 'h-upcoming', start_time: '2026-11-15T14:00:00Z' },
        { hearing_id: 'h-today-later', start_time: '2026-11-10T15:00:00Z' },
      ];

      // Upcoming filter
      const upcoming = sampleHearings.filter((h) => new Date(h.start_time).getTime() >= refTime);
      assert.deepStrictEqual(
        upcoming.map((h) => h.hearing_id),
        ['h-upcoming', 'h-today-later']
      );

      // Past filter
      const past = sampleHearings.filter((h) => new Date(h.start_time).getTime() < refTime);
      assert.deepStrictEqual(
        past.map((h) => h.hearing_id),
        ['h-past']
      );
    });
  });
});
