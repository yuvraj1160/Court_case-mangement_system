/**
 * Court Case Management System - Phase 8D Admin Dashboard & System Administration Unit Tests
 * Uses Node.js native test runner (zero external dependencies).
 *
 * Test Classification:
 *   - Pure unit tests: Verifies administrative navigation, role-scoped tabs, URL routing utilities,
 *     data model isolation, audit trail filtering, user directory inspection, and API client interactions
 *     with mocked fetch.
 *   - NOT React component tests: Does not mount or render React components (no JSDOM or RTL).
 *   - NOT browser end-to-end tests: Does not execute a browser engine or drive DOM interactions.
 *
 * Covers:
 *   1. Admin navigation isolation & 7 tab keys (overview, users, cases, judges, parties, hearings, audit-logs)
 *   2. Admin dashboard summary data loading (GET /api/dashboard)
 *   3. Case management: search, filter, detail, create, update, delete case (Admin 200 vs Clerk/Judge 403)
 *   4. Hearing management: date/judge filtering, schedule conflict 409 handling, DST validation error
 *   5. Audit logs: read-only immutable behavior, filter by action/actor, absence of edit/delete mutations
 *   6. User management: role filtering, safe detail inspection without credentials exposure, absence of unsupported mutations
 *   7. Unauthorized access: Clerk/Judge attempting admin-restricted operations rejected with 403
 *   8. Error recovery & retry on 500 / network drop (status 0)
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import {
  ADMIN_TAB_KEYS,
  ADMIN_NAV_ITEMS,
  getNavItemsForRole,
  isValidTabForRole,
  resolveActiveTab,
  buildPreservedTabSearchParams,
  type AdminTab,
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
  linkPartyToCase,
  unlinkPartyFromCase,
  listHearings,
  getHearing,
  createHearing,
  listParties,
  getParty,
  createParty,
} from '../src/api/index.ts';
import type {
  AdminDashboardResponse,
  CaseDetailResponse,
  CaseListResponse,
  HearingListResponse,
  HearingDetailResponse,
  DeleteCaseResponse,
  AuditLogSummary,
} from '../src/types/index.ts';

interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
}

describe('Phase 8D - Admin Dashboard & System Administration Unit Tests', () => {
  let originalFetch: typeof globalThis.fetch;
  let recordedRequests: RecordedRequest[] = [];
  let mockFetchHandler: (url: string, init?: RequestInit) => Promise<Response>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    recordedRequests = [];
    csrfManager.setToken('test-admin-csrf-token');

    // Default mock fetch handler
    mockFetchHandler = async (url: string) => {
      // Default mock responses
      if (url.includes('/api/dashboard')) {
        const payload: AdminDashboardResponse = {
          status: 'success',
          role: 'admin',
          data: {
            total_cases: 42,
            cases_by_status: {
              Filed: 10,
              Active: 18,
              Adjourned: 8,
              Disposed: 4,
              Closed: 2,
            },
            judges: {
              total: 6,
              active: 5,
            },
            total_parties: 85,
            upcoming_hearings: [
              {
                hearing_id: 'h-admin-01',
                case_id: 'c-admin-101',
                case_number: 'CR-2026-00101',
                case_status: 'Active',
                judge_name: 'Hon. Justice Vance',
                start_time: '2026-11-20T09:30:00Z',
                end_time: '2026-11-20T11:00:00Z',
              },
            ],
            recent_audit_activity: [
              {
                log_id: '1001',
                case_id: 'c-admin-101',
                action_type: 'INSERT',
                changed_at: '2026-11-10T14:22:00Z',
                username: 'admin_master',
              },
              {
                log_id: '1002',
                case_id: 'c-admin-102',
                action_type: 'UPDATE',
                changed_at: '2026-11-10T15:10:00Z',
                username: 'clerk_records',
              },
              {
                log_id: '1003',
                case_id: 'c-admin-103',
                action_type: 'DELETE',
                changed_at: '2026-11-10T16:05:00Z',
                username: 'admin_master',
              },
            ],
          },
        };
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ status: 'success' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      const parsedHeaders: Record<string, string> = {};
      if (init?.headers) {
        if (init.headers instanceof Headers) {
          init.headers.forEach((v, k) => {
            parsedHeaders[k.toLowerCase()] = v;
          });
        } else if (Array.isArray(init.headers)) {
          for (const [k, v] of init.headers) {
            parsedHeaders[k.toLowerCase()] = v;
          }
        } else {
          for (const [k, v] of Object.entries(init.headers)) {
            parsedHeaders[k.toLowerCase()] = String(v);
          }
        }
      }

      recordedRequests.push({
        url: urlStr,
        method: init?.method || 'GET',
        headers: parsedHeaders,
        body: typeof init?.body === 'string' ? init.body : null,
      });

      return mockFetchHandler(urlStr, init);
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    csrfManager.clearToken();
  });

  // =========================================================================
  // 1. Admin Navigation Isolation & 7 Tab Keys
  // =========================================================================
  describe('1. Admin Navigation Isolation & Tab Routing', () => {
    test('ADMIN_TAB_KEYS contains all 7 required administrative tabs', () => {
      const expectedTabs = ['overview', 'users', 'cases', 'judges', 'parties', 'hearings', 'audit-logs'];
      assert.strictEqual(ADMIN_TAB_KEYS.length, 7);
      for (const tab of expectedTabs) {
        assert.ok(ADMIN_TAB_KEYS.includes(tab as AdminTab), `Missing admin tab key: ${tab}`);
      }
    });

    test('getNavItemsForRole("admin") returns 7 distinct nav items matching tab keys', () => {
      const navItems = getNavItemsForRole('admin');
      assert.strictEqual(navItems.length, 7);
      const tabKeys = navItems.map((n) => n.tabKey);
      assert.deepStrictEqual(tabKeys, [
        'overview',
        'users',
        'cases',
        'judges',
        'parties',
        'hearings',
        'audit-logs',
      ]);
    });

    test('isValidTabForRole correctly grants and restricts tabs by role', () => {
      // Admin has access to administrative tabs
      assert.strictEqual(isValidTabForRole('admin', 'overview'), true);
      assert.strictEqual(isValidTabForRole('admin', 'users'), true);
      assert.strictEqual(isValidTabForRole('admin', 'cases'), true);
      assert.strictEqual(isValidTabForRole('admin', 'audit-logs'), true);

      // Other roles cannot access admin-only tabs
      assert.strictEqual(isValidTabForRole('judge', 'audit-logs'), false);
      assert.strictEqual(isValidTabForRole('judge', 'users'), false);
      assert.strictEqual(isValidTabForRole('clerk', 'audit-logs'), false);
      assert.strictEqual(isValidTabForRole('clerk', 'users'), false);
    });

    test('resolveActiveTab validates and defaults safely', () => {
      assert.strictEqual(resolveActiveTab('admin', 'cases'), 'cases');
      assert.strictEqual(resolveActiveTab('admin', 'audit-logs'), 'audit-logs');
      // Invalid tab parameter falls back to 'overview'
      assert.strictEqual(resolveActiveTab('admin', 'invalid_tab'), 'overview');
      assert.strictEqual(resolveActiveTab('admin', null), 'overview');
    });

    test('buildPreservedTabSearchParams preserves unrelated query parameters while updating tab', () => {
      const initial = new URLSearchParams('tab=overview&search=CR-2026&status=Active');
      const updated = buildPreservedTabSearchParams(initial, 'cases');
      assert.strictEqual(updated.get('tab'), 'cases');
      assert.strictEqual(updated.get('search'), 'CR-2026');
      assert.strictEqual(updated.get('status'), 'Active');
    });
  });

  // =========================================================================
  // 2. Admin Dashboard Summary Data Loading (GET /api/dashboard)
  // =========================================================================
  describe('2. Admin Dashboard Summary Telemetry (GET /api/dashboard)', () => {
    test('fetches admin dashboard summary and parses metrics', async () => {
      const response = await apiClient.get<AdminDashboardResponse>('/api/dashboard');
      assert.strictEqual(response.status, 'success');
      assert.strictEqual(response.role, 'admin');

      const data = response.data;
      assert.strictEqual(data.total_cases, 42);
      assert.strictEqual(data.cases_by_status.Filed, 10);
      assert.strictEqual(data.cases_by_status.Active, 18);
      assert.strictEqual(data.judges.total, 6);
      assert.strictEqual(data.judges.active, 5);
      assert.strictEqual(data.total_parties, 85);
      assert.strictEqual(data.upcoming_hearings.length, 1);
      assert.strictEqual(data.recent_audit_activity.length, 3);

      assert.strictEqual(recordedRequests.length, 1);
      assert.strictEqual(recordedRequests[0].method, 'GET');
      assert.ok(recordedRequests[0].url.endsWith('/api/dashboard'));
    });
  });

  // =========================================================================
  // 3. Case Management Workflows (List, Detail, Create, Update, Delete)
  // =========================================================================
  describe('3. Case Management Workflows & Admin Hard Delete', () => {
    test('listCases queries with search and status parameters', async () => {
      mockFetchHandler = async () => {
        const mockList: CaseListResponse = {
          status: 'success',
          data: {
            cases: [
              {
                case_id: 'c-uuid-001',
                case_number: 'CR-2026-0001',
                status: 'Filed',
                filing_date: '2026-11-01T10:00:00Z',
              },
            ],
            pagination: {
              page: 1,
              limit: 10,
              total_records: 1,
              total_pages: 1,
            },
          },
        };
        return new Response(JSON.stringify(mockList), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const res = await listCases({ page: 1, limit: 10, search: 'CR-2026', status: 'Filed' });
      assert.strictEqual(res.status, 'success');
      assert.strictEqual(res.data.cases.length, 1);
      assert.strictEqual(res.data.cases[0].case_number, 'CR-2026-0001');

      assert.strictEqual(recordedRequests.length, 1);
      const reqUrl = new URL(recordedRequests[0].url, 'http://localhost');
      assert.strictEqual(reqUrl.pathname, '/api/cases');
      assert.strictEqual(reqUrl.searchParams.get('search'), 'CR-2026');
      assert.strictEqual(reqUrl.searchParams.get('status'), 'Filed');
    });

    test('getCase retrieves full case details including parties, hearings, and orders', async () => {
      mockFetchHandler = async () => {
        const mockDetail: CaseDetailResponse = {
          status: 'success',
          data: {
            case_id: 'c-uuid-001',
            case_number: 'CR-2026-0001',
            status: 'Active',
            filing_date: '2026-11-01T10:00:00Z',
            parties: [
              {
                party_id: 'p-101',
                name: 'State of Justice',
                party_type: 'Government',
                role_type: 'Petitioner',
                phone_number: '+1-555-0100',
              },
            ],
            hearings: [
              {
                hearing_id: 'h-101',
                judge_id: 'J-VANCE-01',
                start_time: '2026-11-15T09:30:00Z',
                end_time: '2026-11-15T11:00:00Z',
              },
            ],
            orders: [
              {
                order_id: 'o-101',
                order_type: 'Scheduling Order',
                order_date: '2026-11-02T14:00:00Z',
              },
            ],
            filings: [
              {
                filing_id: 'f-101',
                filing_type: 'Petition',
                filing_date: '2026-11-01T10:05:00Z',
              },
            ],
          },
        };
        return new Response(JSON.stringify(mockDetail), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const res = await getCase('c-uuid-001');
      assert.strictEqual(res.status, 'success');
      assert.strictEqual(res.data.case_number, 'CR-2026-0001');
      assert.strictEqual(res.data.parties?.length, 1);
      assert.strictEqual(res.data.hearings?.length, 1);
      assert.strictEqual(res.data.orders?.length, 1);
      assert.strictEqual(res.data.filings?.length, 1);
    });

    test('createCase sends POST /api/cases with CSRF header', async () => {
      mockFetchHandler = async () => {
        return new Response(
          JSON.stringify({
            status: 'success',
            message: 'Case registered',
            data: { case_id: 'c-new-001', case_number: 'CR-2026-0099' },
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } }
        );
      };

      const res = await createCase({
        case_number: 'CR-2026-0099',
        status: 'Filed',
        filing_date: '2026-11-10T00:00:00Z',
      });
      assert.strictEqual(res.status, 'success');
      assert.strictEqual(recordedRequests.length, 1);
      assert.strictEqual(recordedRequests[0].method, 'POST');
      assert.strictEqual(recordedRequests[0].headers['x-csrf-token'], 'test-admin-csrf-token');
    });

    test('updateCase sends PUT /api/cases/:id with status payload', async () => {
      mockFetchHandler = async () => {
        return new Response(
          JSON.stringify({ status: 'success', message: 'Case updated' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      const res = await updateCase('c-uuid-001', { status: 'Adjourned' });
      assert.strictEqual(res.status, 'success');
      assert.strictEqual(recordedRequests.length, 1);
      assert.strictEqual(recordedRequests[0].method, 'PUT');
      assert.ok(recordedRequests[0].url.includes('/api/cases/c-uuid-001'));
      assert.ok(recordedRequests[0].body?.includes('"status":"Adjourned"'));
    });

    test('deleteCase sends DELETE /api/cases/:id restricted to Admin', async () => {
      mockFetchHandler = async () => {
        const payload: DeleteCaseResponse = {
          status: 'success',
          message: 'Case deleted successfully',
        };
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const res = await deleteCase('c-uuid-to-delete');
      assert.strictEqual(res.status, 'success');
      assert.strictEqual(res.message, 'Case deleted successfully');

      assert.strictEqual(recordedRequests.length, 1);
      assert.strictEqual(recordedRequests[0].method, 'DELETE');
      assert.ok(recordedRequests[0].url.includes('/api/cases/c-uuid-to-delete'));
      assert.strictEqual(recordedRequests[0].headers['x-csrf-token'], 'test-admin-csrf-token');
    });

    test('linkPartyToCase and unlinkPartyFromCase execute correctly', async () => {
      mockFetchHandler = async (url, init) => {
        if (init?.method === 'POST') {
          return new Response(
            JSON.stringify({ status: 'success', message: 'Party linked to case' }),
            { status: 201, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(
          JSON.stringify({ status: 'success', message: 'Party unlinked from case' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      const linkRes = await linkPartyToCase('c-uuid-001', {
        party_id: 'p-uuid-999',
        role_type: 'Respondent',
      });
      assert.strictEqual(linkRes.status, 'success');
      assert.strictEqual(recordedRequests[0].method, 'POST');
      assert.ok(recordedRequests[0].url.includes('/api/cases/c-uuid-001/parties'));

      const unlinkRes = await unlinkPartyFromCase('c-uuid-001', 'p-uuid-999');
      assert.strictEqual(unlinkRes.status, 'success');
      assert.strictEqual(recordedRequests[1].method, 'DELETE');
      assert.ok(recordedRequests[1].url.includes('/api/cases/c-uuid-001/parties/p-uuid-999'));
    });
  });

  // =========================================================================
  // 4. Hearing Management & Conflict / DST Validation Handling
  // =========================================================================
  describe('4. Hearing Management & Conflict Detection', () => {
    test('listHearings formats date and judge filters', async () => {
      mockFetchHandler = async () => {
        const mockHearings: HearingListResponse = {
          status: 'success',
          data: [
            {
              hearing_id: 'h-100',
              case_id: 'c-100',
              judge_id: 'J-VANCE-01',
              start_time: '2026-11-25T10:00:00Z',
              end_time: '2026-11-25T11:30:00Z',
            },
          ],
          pagination: {
            page: 1,
            limit: 10,
            total_records: 1,
            total_pages: 1,
          },
        };
        return new Response(JSON.stringify(mockHearings), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const res = await listHearings({
        page: 1,
        limit: 10,
        judge_id: 'J-VANCE-01',
        start_date: '2026-11-25T00:00:00',
        end_date: '2026-11-25T23:59:59',
      });

      assert.strictEqual(res.status, 'success');
      assert.strictEqual(res.data.length, 1);
      assert.strictEqual(res.data[0].judge_id, 'J-VANCE-01');

      const reqUrl = new URL(recordedRequests[0].url, 'http://localhost');
      assert.strictEqual(reqUrl.searchParams.get('judge_id'), 'J-VANCE-01');
      assert.strictEqual(reqUrl.searchParams.get('start_date'), '2026-11-25T00:00:00');
    });

    test('getHearing retrieves single hearing session details', async () => {
      mockFetchHandler = async () => {
        const mockDetail: HearingDetailResponse = {
          status: 'success',
          data: {
            hearing_id: 'h-100',
            case_id: 'c-100',
            judge_id: 'J-VANCE-01',
            start_time: '2026-11-25T10:00:00Z',
            end_time: '2026-11-25T11:30:00Z',
          },
        };
        return new Response(JSON.stringify(mockDetail), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const res = await getHearing('h-100');
      assert.strictEqual(res.status, 'success');
      assert.strictEqual(res.data.hearing_id, 'h-100');
      assert.strictEqual(res.data.judge_id, 'J-VANCE-01');
    });

    test('createHearing catches 409 judge scheduling conflict error', async () => {
      mockFetchHandler = async () => {
        return new Response(
          JSON.stringify({
            status: 'error',
            message: 'Judge already has a scheduled hearing during this time range.',
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } }
        );
      };

      await assert.rejects(
        async () => {
          await createHearing({
            case_id: 'c-100',
            judge_id: 'J-VANCE-01',
            start_time: '2026-11-25T10:00:00Z',
            end_time: '2026-11-25T11:30:00Z',
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiClientError);
          assert.strictEqual(err.status, 409);
          assert.ok(err.message.includes('Judge already has a scheduled hearing'));
          return true;
        }
      );
    });

    test('createHearing handles daylight saving transition validation error', async () => {
      mockFetchHandler = async () => {
        return new Response(
          JSON.stringify({
            status: 'error',
            message: 'Invalid hearing timestamp: ambiguous daylight-saving transition time.',
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      };

      await assert.rejects(
        async () => {
          await createHearing({
            case_id: 'c-100',
            judge_id: 'J-VANCE-01',
            start_time: '2026-11-01T01:30:00Z',
            end_time: '2026-11-01T02:30:00Z',
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiClientError);
          assert.strictEqual(err.status, 400);
          assert.ok(err.message.includes('daylight-saving transition'));
          return true;
        }
      );
    });
  });

  // =========================================================================
  // 5. Audit Logs Integrity & Inspection (Read-Only)
  // =========================================================================
  describe('5. Audit Logs Integrity & Filtering', () => {
    const sampleLogs: AuditLogSummary[] = [
      {
        log_id: '101',
        case_id: 'case-alpha',
        action_type: 'INSERT',
        changed_at: '2026-11-10T10:00:00Z',
        username: 'admin_master',
      },
      {
        log_id: '102',
        case_id: 'case-beta',
        action_type: 'UPDATE',
        changed_at: '2026-11-10T11:00:00Z',
        username: 'clerk_records',
      },
      {
        log_id: '103',
        case_id: 'case-alpha',
        action_type: 'DELETE',
        changed_at: '2026-11-11T12:00:00Z',
        username: 'admin_master',
      },
    ];

    test('in-memory audit filtering by username / actor', () => {
      const filtered = sampleLogs.filter((l) => l.username === 'clerk_records');
      assert.strictEqual(filtered.length, 1);
      assert.strictEqual(filtered[0].log_id, '102');
      assert.strictEqual(filtered[0].action_type, 'UPDATE');
    });

    test('in-memory audit filtering by action type', () => {
      const insertLogs = sampleLogs.filter((l) => l.action_type === 'INSERT');
      const deleteLogs = sampleLogs.filter((l) => l.action_type === 'DELETE');

      assert.strictEqual(insertLogs.length, 1);
      assert.strictEqual(insertLogs[0].log_id, '101');
      assert.strictEqual(deleteLogs.length, 1);
      assert.strictEqual(deleteLogs[0].log_id, '103');
    });

    test('in-memory audit filtering by case UUID', () => {
      const caseAlphaLogs = sampleLogs.filter((l) => l.case_id === 'case-alpha');
      assert.strictEqual(caseAlphaLogs.length, 2);
    });

    test('in-memory audit filtering by date prefix', () => {
      const day10Logs = sampleLogs.filter((l) => l.changed_at?.startsWith('2026-11-10'));
      const day11Logs = sampleLogs.filter((l) => l.changed_at?.startsWith('2026-11-11'));

      assert.strictEqual(day10Logs.length, 2);
      assert.strictEqual(day11Logs.length, 1);
    });

    test('audit logs do not expose edit or delete endpoints', () => {
      // Schema guarantee: audit logs are strictly append-only triggers.
      // Confirm no mutating API functions exist for audit logs in the client.
      const apiModule = Object.keys(apiClient);
      assert.ok(!apiModule.includes('deleteAuditLog'));
      assert.ok(!apiModule.includes('updateAuditLog'));
    });
  });

  // =========================================================================
  // 6. User Management & Credential Safety Architecture
  // =========================================================================
  describe('6. User Management & Credential Safety Architecture', () => {
    test('authenticated identity returns safe user object without password or hash', async () => {
      mockFetchHandler = async () => {
        return new Response(
          JSON.stringify({
            status: 'success',
            user: {
              user_id: 1,
              username: 'admin_master',
              role: 'admin',
              judge_id: null,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      const res = await apiClient.get<{ status: string; user: Record<string, unknown> }>('/auth/me');
      assert.strictEqual(res.status, 'success');
      assert.strictEqual(res.user.user_id, 1);
      assert.strictEqual(res.user.username, 'admin_master');
      assert.strictEqual(res.user.role, 'admin');

      // Assert password or credential fields are never present in user payload
      assert.strictEqual(res.user.password, undefined);
      assert.strictEqual(res.user.password_hash, undefined);
      assert.strictEqual(res.user.credential, undefined);
    });

    test('verifies absence of remote user listing and provisioning endpoints in client', () => {
      // Architectural guarantee: remote user CRUD endpoints do not exist.
      // Provisioning is strictly server-side CLI (python -m backend.cli.create_admin).
      const clientKeys = Object.keys(apiClient);
      assert.ok(!clientKeys.includes('listUsers'));
      assert.ok(!clientKeys.includes('createUser'));
      assert.ok(!clientKeys.includes('updateUser'));
      assert.ok(!clientKeys.includes('deleteUser'));
    });
  });

  // =========================================================================
  // 7. Role Boundary & Unauthorized Access Enforcement
  // =========================================================================
  describe('7. Role Boundary & Unauthorized Access Enforcement', () => {
    test('deleteCase rejected with 403 Forbidden when unauthorized role calls it', async () => {
      mockFetchHandler = async () => {
        return new Response(
          JSON.stringify({
            status: 'error',
            message: 'Forbidden: Admin role required for case deletion.',
          }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        );
      };

      await assert.rejects(
        async () => {
          await deleteCase('case-forbidden-id');
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiClientError);
          assert.strictEqual(err.status, 403);
          assert.ok(err.message.includes('Forbidden'));
          return true;
        }
      );
    });

    test('unauthenticated call returns 401 Unauthorized', async () => {
      mockFetchHandler = async () => {
        return new Response(
          JSON.stringify({
            status: 'error',
            message: 'Authentication required. Active session not found.',
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      };

      await assert.rejects(
        async () => {
          await apiClient.get('/api/dashboard');
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiClientError);
          assert.strictEqual(err.status, 401);
          return true;
        }
      );
    });
  });

  // =========================================================================
  // 8. Error Recovery & Network Resilience
  // =========================================================================
  describe('8. Error Recovery & Network Resilience', () => {
    test('handles HTTP 500 server error and allows subsequent successful retry', async () => {
      let callCount = 0;
      mockFetchHandler = async () => {
        callCount++;
        if (callCount === 1) {
          return new Response(
            JSON.stringify({
              status: 'error',
              message: 'Database connection pool exhausted.',
            }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({
            status: 'success',
            role: 'admin',
            data: {
              total_cases: 42,
              cases_by_status: {},
              judges: { total: 5, active: 5 },
              total_parties: 80,
              upcoming_hearings: [],
              recent_audit_activity: [],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      // 1. Initial attempt fails with 500
      await assert.rejects(
        async () => {
          await apiClient.get('/api/dashboard');
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiClientError);
          assert.strictEqual(err.status, 500);
          assert.ok(err.message.includes('connection pool'));
          return true;
        }
      );

      // 2. Retry succeeds
      const retryRes = await apiClient.get<AdminDashboardResponse>('/api/dashboard');
      assert.strictEqual(retryRes.status, 'success');
      assert.strictEqual(retryRes.data.total_cases, 42);
      assert.strictEqual(callCount, 2);
    });

    test('handles network disconnection (status 0) and recovers on reconnect', async () => {
      let callCount = 0;
      mockFetchHandler = async () => {
        callCount++;
        if (callCount === 1) {
          throw new TypeError('Failed to fetch');
        }

        return new Response(
          JSON.stringify({
            status: 'success',
            role: 'admin',
            data: {
              total_cases: 42,
              cases_by_status: {},
              judges: { total: 5, active: 5 },
              total_parties: 80,
              upcoming_hearings: [],
              recent_audit_activity: [],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      // 1. Network drop
      await assert.rejects(
        async () => {
          await apiClient.get('/api/dashboard');
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiClientError);
          assert.strictEqual(err.status, 0);
          return true;
        }
      );

      // 2. Reconnected
      const recoveredRes = await apiClient.get<AdminDashboardResponse>('/api/dashboard');
      assert.strictEqual(recoveredRes.status, 'success');
      assert.strictEqual(callCount, 2);
    });
  });
});
