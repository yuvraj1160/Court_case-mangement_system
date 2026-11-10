/**
 * Court Case Management System - Phase 8B Clerk Dashboard & Case Operations Unit Tests
 * Uses Node.js native test runner (zero external dependencies).
 *
 * Test Classification:
 *   - Pure unit tests: Verifies Clerk navigation helpers, role-scoped tabs, URL routing utilities,
 *     and API client method contracts with mocked fetch responses.
 *   - NOT React component tests: Does not mount or render React components (no JSDOM or RTL).
 *   - NOT browser end-to-end tests: Does not execute a browser engine or drive DOM interactions.
 *
 * Verifies:
 *   1. Clerk Dashboard navigation, section tabs (6 tabs), icons and labels
 *   2. Cases workflow: list with filters, detail retrieval, creation, modification, party link/unlink
 *   3. Parties workflow: list with category filter, detail, creation, edit, add/delete phone numbers
 *   4. Hearings workflow: listing with date filters, scheduling validation, HTTP 409 judge conflict detection, immutability
 *   5. Filings workflow: intake queue, creation, strictly filing_type-only updates, schema contract adherence
 *   6. Adjournments workflow: append-only ledger, hearing_id filtering, standard reason codes, detail lookup
 *   7. Error mapping and fail-safe handling across all clerk operations
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import {
  CLERK_TAB_KEYS,
  CLERK_NAV_ITEMS,
  getNavItemsForRole,
  isValidTabForRole,
  resolveActiveTab,
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
  listParties,
  getParty,
  createParty,
  updateParty,
  deleteParty,
  addPartyPhone,
  deletePartyPhone,
  listHearings,
  getHearing,
  createHearing,
  listFilings,
  getFiling,
  createFiling,
  updateFiling,
  listAdjournments,
  getAdjournment,
  createAdjournment,
} from '../src/api/index.ts';
import type {
  CaseDetail,
  PartyDetail,
  HearingListItem,
  FilingListItem,
  AdjournmentListItem,
} from '../src/types/index.ts';

interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
  credentials?: RequestCredentials;
}

describe('Phase 8B — Clerk Dashboard & Case Operations Workflows', () => {
  const originalFetch = globalThis.fetch;
  let recordedRequests: RecordedRequest[] = [];
  let nextResponse: { status: number; body: unknown; headers?: Record<string, string> };

  beforeEach(() => {
    csrfManager.setToken('clerk-csrf-token-xyz');
    recordedRequests = [];
    nextResponse = {
      status: 200,
      body: { status: 'success', data: {} },
      headers: { 'Content-Type': 'application/json' },
    };

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
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
      } else {
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

      const responseHeaders = new Headers(nextResponse.headers || { 'Content-Type': 'application/json' });
      return new Response(JSON.stringify(nextResponse.body), {
        status: nextResponse.status,
        statusText: nextResponse.status === 200 ? 'OK' : 'Error',
        headers: responseHeaders,
      });
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    csrfManager.clearToken();
  });

  // =========================================================================
  // 1. Clerk Workspace & Navigation Structure
  // =========================================================================
  describe('Clerk Workspace Navigation & Section Routing', () => {
    test('contains all 6 mandatory clerk tabs in correct sequence', () => {
      assert.deepStrictEqual(CLERK_TAB_KEYS, [
        'overview',
        'cases',
        'parties',
        'hearings',
        'filings',
        'adjournments',
      ]);
    });

    test('getNavItemsForRole("clerk") returns exactly 6 items with distinct keys and labels', () => {
      const navItems = getNavItemsForRole('clerk');
      assert.strictEqual(navItems.length, 6);
      const tabKeys = navItems.map((item) => item.tabKey);
      assert.deepStrictEqual(tabKeys, [
        'overview',
        'cases',
        'parties',
        'hearings',
        'filings',
        'adjournments',
      ]);

      // Verify labels and descriptions
      assert.strictEqual(navItems[0].label, 'Operations Overview');
      assert.strictEqual(navItems[1].label, 'Case Docket');
      assert.strictEqual(navItems[2].label, 'Parties & Litigants');
      assert.strictEqual(navItems[3].label, 'Hearing Calendar');
      assert.strictEqual(navItems[4].label, 'Document Filings');
      assert.strictEqual(navItems[5].label, 'Hearing Adjournments');
    });

    test('isValidTabForRole correctly validates clerk tabs', () => {
      for (const tab of CLERK_TAB_KEYS) {
        assert.strictEqual(isValidTabForRole('clerk', tab), true);
      }
      assert.strictEqual(isValidTabForRole('clerk', 'users'), false);
      assert.strictEqual(isValidTabForRole('clerk', 'audit'), false);
      assert.strictEqual(isValidTabForRole('clerk', 'bench-notes'), false);
      assert.strictEqual(isValidTabForRole('clerk', 'random-tab'), false);
    });

    test('resolveActiveTab falls back to overview for invalid tabs', () => {
      assert.strictEqual(resolveActiveTab('clerk', 'invalid-tab'), 'overview');
      assert.strictEqual(resolveActiveTab('clerk', null), 'overview');
      assert.strictEqual(resolveActiveTab('clerk', 'hearings'), 'hearings');
      assert.strictEqual(resolveActiveTab('clerk', 'adjournments'), 'adjournments');
    });
  });

  // =========================================================================
  // 2. Cases Workflow Operations
  // =========================================================================
  describe('Cases Workflow Operations', () => {
    test('listCases requests cases with search, status filter, and pagination', async () => {
      nextResponse = {
        status: 200,
        body: {
          status: 'success',
          data: {
            cases: [
              {
                case_id: 'case-uuid-1',
                case_number: 'CR-2026-001',
                status: 'Filed',
                filing_date: '2026-01-15T10:00:00Z',
                disposition: null,
                closed_at: null,
              },
            ],
            pagination: { page: 2, limit: 10, total_records: 25, total_pages: 3 },
          },
        },
      };

      const res = await listCases({ page: 2, limit: 10, search: 'CR-2026', status: 'Filed' });
      assert.strictEqual(res.data.cases.length, 1);
      assert.strictEqual(res.data.pagination.total_records, 25);

      assert.strictEqual(recordedRequests.length, 1);
      const req = recordedRequests[0];
      assert.strictEqual(req.method, 'GET');
      assert.ok(req.url.includes('/api/cases?'));
      assert.ok(req.url.includes('page=2'));
      assert.ok(req.url.includes('limit=10'));
      assert.ok(req.url.includes('search=CR-2026'));
      assert.ok(req.url.includes('status=Filed'));
    });

    test('getCase retrieves full case docket detail with parties, hearings, filings', async () => {
      const mockDetail: CaseDetail = {
        case_id: 'case-uuid-1',
        case_number: 'CR-2026-001',
        status: 'Active',
        filing_date: '2026-01-15T10:00:00Z',
        disposition: null,
        closed_at: null,
        parties: [
          {
            party_id: 'party-uuid-1',
            name: 'State of New York',
            party_type: 'Government Agency',
            role_type: 'Prosecutor',
            phone_numbers: ['555-0100'],
          },
          {
            party_id: 'party-uuid-2',
            name: 'John Doe',
            party_type: 'Individual',
            role_type: 'Defendant',
            phone_numbers: ['555-0199'],
          },
        ],
        hearings: [
          {
            hearing_id: 'hearing-uuid-1',
            judge_id: 'judge-uuid-1',
            judge_name: 'Hon. Jane Smith',
            start_time: '2026-03-15T10:00:00Z',
            end_time: '2026-03-15T11:00:00Z',
          },
        ],
        filings: [
          {
            filing_id: 'filing-uuid-1',
            party_id: 'party-uuid-1',
            party_name: 'State of New York',
            filing_type: 'Indictment',
            filing_date: '2026-01-15T10:00:00Z',
          },
        ],
        orders: [],
      };

      nextResponse = {
        status: 200,
        body: { status: 'success', data: mockDetail },
      };

      const res = await getCase('case-uuid-1');
      assert.strictEqual(res.data.case_number, 'CR-2026-001');
      assert.strictEqual(res.data.parties.length, 2);
      assert.strictEqual(res.data.hearings.length, 1);
      assert.strictEqual(res.data.filings.length, 1);
      assert.strictEqual(recordedRequests[0].url, '/api/cases/case-uuid-1');
    });

    test('createCase dispatches POST /api/cases with required case_number and CSRF header', async () => {
      nextResponse = {
        status: 201,
        body: {
          status: 'success',
          message: 'Case created successfully',
          data: {
            case_id: 'new-case-uuid',
            case_number: 'CV-2026-999',
            status: 'Filed',
            filing_date: '2026-02-01T09:00:00Z',
            disposition: null,
            closed_at: null,
          },
        },
      };

      const res = await createCase({
        case_number: 'CV-2026-999',
        status: 'Filed',
        filing_date: '2026-02-01T09:00:00Z',
      });

      assert.strictEqual(res.data.case_id, 'new-case-uuid');
      assert.strictEqual(recordedRequests.length, 1);
      const req = recordedRequests[0];
      assert.strictEqual(req.method, 'POST');
      assert.strictEqual(req.url, '/api/cases');
      assert.strictEqual(req.headers['x-csrf-token'], 'clerk-csrf-token-xyz');
      const parsed = JSON.parse(req.body!);
      assert.strictEqual(parsed.case_number, 'CV-2026-999');
      assert.strictEqual(parsed.status, 'Filed');
    });

    test('updateCase dispatches PUT /api/cases/:id with mutable status and case_number', async () => {
      nextResponse = {
        status: 200,
        body: {
          status: 'success',
          message: 'Case updated successfully',
          data: {
            case_id: 'case-uuid-1',
            case_number: 'CR-2026-001A',
            status: 'Active',
            filing_date: '2026-01-15T10:00:00Z',
            disposition: null,
            closed_at: null,
          },
        },
      };

      const res = await updateCase('case-uuid-1', {
        case_number: 'CR-2026-001A',
        status: 'Active',
      });

      assert.strictEqual(res.data.status, 'Active');
      assert.strictEqual(recordedRequests[0].method, 'PUT');
      assert.strictEqual(recordedRequests[0].url, '/api/cases/case-uuid-1');
      assert.strictEqual(recordedRequests[0].headers['x-csrf-token'], 'clerk-csrf-token-xyz');
    });

    test('linkPartyToCase dispatches POST /api/cases/:id/parties with party_id and role_type', async () => {
      nextResponse = {
        status: 201,
        body: {
          status: 'success',
          message: 'Party linked to case successfully',
          data: {
            case_id: 'case-uuid-1',
            party_id: 'party-uuid-3',
            role_type: 'Respondent',
          },
        },
      };

      const res = await linkPartyToCase('case-uuid-1', {
        party_id: 'party-uuid-3',
        role_type: 'Respondent',
      });

      assert.strictEqual(res.status, 'success');
      assert.strictEqual(recordedRequests[0].method, 'POST');
      assert.strictEqual(recordedRequests[0].url, '/api/cases/case-uuid-1/parties');
      const body = JSON.parse(recordedRequests[0].body!);
      assert.strictEqual(body.party_id, 'party-uuid-3');
      assert.strictEqual(body.role_type, 'Respondent');
    });

    test('unlinkPartyFromCase dispatches DELETE /api/cases/:id/parties/:party_id with CSRF', async () => {
      nextResponse = {
        status: 200,
        body: {
          status: 'success',
          message: 'Party unlinked from case successfully',
        },
      };

      const res = await unlinkPartyFromCase('case-uuid-1', 'party-uuid-3');
      assert.strictEqual(res.status, 'success');
      assert.strictEqual(recordedRequests[0].method, 'DELETE');
      assert.strictEqual(recordedRequests[0].url, '/api/cases/case-uuid-1/parties/party-uuid-3');
      assert.strictEqual(recordedRequests[0].headers['x-csrf-token'], 'clerk-csrf-token-xyz');
    });
  });

  // =========================================================================
  // 3. Parties Workflow Operations
  // =========================================================================
  describe('Parties Workflow Operations', () => {
    test('listParties requests parties with category filter and search', async () => {
      nextResponse = {
        status: 200,
        body: {
          status: 'success',
          data: {
            parties: [
              {
                party_id: 'party-1',
                name: 'Acme Corporation',
                party_type: 'Corporation',
                case_count: 3,
                phone_numbers: ['555-1234'],
              },
            ],
            pagination: { page: 1, limit: 10, total_records: 1, total_pages: 1 },
          },
        },
      };

      const res = await listParties({ page: 1, limit: 10, search: 'Acme', party_type: 'Corporation' });
      assert.strictEqual(res.data.parties.length, 1);
      assert.strictEqual(res.data.parties[0].party_type, 'Corporation');

      const req = recordedRequests[0];
      assert.strictEqual(req.method, 'GET');
      assert.ok(req.url.includes('/api/parties?'));
      assert.ok(req.url.includes('search=Acme'));
      assert.ok(req.url.includes('party_type=Corporation'));
    });

    test('getParty retrieves party profile with phone numbers and associated cases', async () => {
      const mockPartyDetail: PartyDetail = {
        party_id: 'party-1',
        name: 'Jane Smith',
        party_type: 'Individual',
        phone_numbers: ['555-4321', '555-8765'],
        associated_cases: [
          {
            case_id: 'case-100',
            case_number: 'CV-2026-050',
            status: 'Active',
            role_type: 'Plaintiff',
          },
        ],
      };

      nextResponse = {
        status: 200,
        body: { status: 'success', data: mockPartyDetail },
      };

      const res = await getParty('party-1');
      assert.strictEqual(res.data.name, 'Jane Smith');
      assert.strictEqual(res.data.phone_numbers.length, 2);
      assert.strictEqual(res.data.associated_cases.length, 1);
      assert.strictEqual(recordedRequests[0].url, '/api/parties/party-1');
    });

    test('createParty sends name, party_type, and initial phone numbers', async () => {
      nextResponse = {
        status: 201,
        body: {
          status: 'success',
          message: 'Party created successfully',
          data: {
            party_id: 'new-party-uuid',
            name: 'Apex Holdings LLC',
            party_type: 'Corporation',
            phone_numbers: ['555-9000'],
          },
        },
      };

      const res = await createParty({
        name: 'Apex Holdings LLC',
        party_type: 'Corporation',
        phone_numbers: ['555-9000'],
      });

      assert.strictEqual(res.data.party_id, 'new-party-uuid');
      assert.strictEqual(recordedRequests[0].method, 'POST');
      assert.strictEqual(recordedRequests[0].url, '/api/parties');
      const body = JSON.parse(recordedRequests[0].body!);
      assert.strictEqual(body.name, 'Apex Holdings LLC');
      assert.deepStrictEqual(body.phone_numbers, ['555-9000']);
    });

    test('updateParty modifies party name and party_type with CSRF header', async () => {
      nextResponse = {
        status: 200,
        body: {
          status: 'success',
          message: 'Party updated successfully',
          data: {
            party_id: 'party-1',
            name: 'Jane Smith-Doe',
            party_type: 'Individual',
            phone_numbers: ['555-4321'],
          },
        },
      };

      const res = await updateParty('party-1', {
        name: 'Jane Smith-Doe',
        party_type: 'Individual',
      });

      assert.strictEqual(res.data.name, 'Jane Smith-Doe');
      assert.strictEqual(recordedRequests[0].method, 'PUT');
      assert.strictEqual(recordedRequests[0].url, '/api/parties/party-1');
      assert.strictEqual(recordedRequests[0].headers['x-csrf-token'], 'clerk-csrf-token-xyz');
    });

    test('addPartyPhone dispatches POST /api/parties/:id/phones', async () => {
      nextResponse = {
        status: 201,
        body: {
          status: 'success',
          message: 'Phone number added successfully',
          data: { phone_number: '555-7777' },
        },
      };

      const res = await addPartyPhone('party-1', { phone_number: '555-7777' });
      assert.strictEqual(res.status, 'success');
      assert.strictEqual(recordedRequests[0].method, 'POST');
      assert.strictEqual(recordedRequests[0].url, '/api/parties/party-1/phones');
      const body = JSON.parse(recordedRequests[0].body!);
      assert.strictEqual(body.phone_number, '555-7777');
    });

    test('deletePartyPhone encodes phone number in URL parameter', async () => {
      nextResponse = {
        status: 200,
        body: {
          status: 'success',
          message: 'Phone number deleted successfully',
        },
      };

      const res = await deletePartyPhone('party-1', '+1 (555) 019-999');
      assert.strictEqual(res.status, 'success');
      assert.strictEqual(recordedRequests[0].method, 'DELETE');
      assert.strictEqual(
        recordedRequests[0].url,
        '/api/parties/party-1/phones/%2B1%20(555)%20019-999'
      );
      assert.strictEqual(recordedRequests[0].headers['x-csrf-token'], 'clerk-csrf-token-xyz');
    });
  });

  // =========================================================================
  // 4. Hearings Workflow & Scheduling Conflict Operations
  // =========================================================================
  describe('Hearings Workflow & Scheduling Conflict Operations', () => {
    test('listHearings filters by case_id, judge_id, and date range', async () => {
      const mockHearing: HearingListItem = {
        hearing_id: 'hearing-1',
        case_id: 'case-1',
        case_number: 'CR-2026-001',
        judge_id: 'judge-1',
        judge_name: 'Hon. Jane Smith',
        start_time: '2026-03-20T10:00:00Z',
        end_time: '2026-03-20T11:00:00Z',
      };

      nextResponse = {
        status: 200,
        body: {
          status: 'success',
          message: 'Hearings retrieved successfully',
          data: [mockHearing],
          pagination: { page: 1, limit: 10, total_records: 1, total_pages: 1 },
        },
      };

      const res = await listHearings({
        page: 1,
        limit: 10,
        case_id: 'case-1',
        judge_id: 'judge-1',
        start_date: '2026-03-01T00:00:00',
        end_date: '2026-03-31T23:59:59',
      });

      assert.strictEqual(res.data.length, 1);
      assert.strictEqual(res.data[0].case_number, 'CR-2026-001');

      const req = recordedRequests[0];
      assert.strictEqual(req.method, 'GET');
      assert.ok(req.url.includes('/api/hearings?'));
      assert.ok(req.url.includes('case_id=case-1'));
      assert.ok(req.url.includes('judge_id=judge-1'));
      assert.ok(req.url.includes('start_date=2026-03-01T00%3A00%3A00'));
    });

    test('createHearing dispatches exact case_id, judge_id, start_time, and end_time', async () => {
      nextResponse = {
        status: 201,
        body: {
          status: 'success',
          message: 'Hearing scheduled successfully',
          data: {
            hearing_id: 'new-hearing-uuid',
            case_id: 'case-1',
            judge_id: 'judge-1',
            start_time: '2026-04-10T14:00:00Z',
            end_time: '2026-04-10T15:30:00Z',
          },
        },
      };

      const res = await createHearing({
        case_id: 'case-1',
        judge_id: 'judge-1',
        start_time: '2026-04-10T14:00:00Z',
        end_time: '2026-04-10T15:30:00Z',
      });

      assert.strictEqual(res.data.hearing_id, 'new-hearing-uuid');
      assert.strictEqual(recordedRequests[0].method, 'POST');
      assert.strictEqual(recordedRequests[0].url, '/api/hearings');
      assert.strictEqual(recordedRequests[0].headers['x-csrf-token'], 'clerk-csrf-token-xyz');
      const body = JSON.parse(recordedRequests[0].body!);
      assert.strictEqual(body.case_id, 'case-1');
      assert.strictEqual(body.judge_id, 'judge-1');
      assert.strictEqual(body.start_time, '2026-04-10T14:00:00Z');
      assert.strictEqual(body.end_time, '2026-04-10T15:30:00Z');
    });

    test('createHearing detects HTTP 409 Conflict when scheduling overlaps', async () => {
      nextResponse = {
        status: 409,
        body: {
          status: 'error',
          message: 'Scheduling conflict: The assigned judge already has a hearing scheduled during this time window.',
        },
      };

      await assert.rejects(
        async () => {
          await createHearing({
            case_id: 'case-1',
            judge_id: 'judge-1',
            start_time: '2026-04-10T14:00:00Z',
            end_time: '2026-04-10T15:30:00Z',
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiClientError);
          assert.strictEqual(err.status, 409);
          assert.ok(err.message.includes('Scheduling conflict'));
          return true;
        }
      );
    });

    test('createHearing detects HTTP 400 when interval crosses daylight saving time transition', async () => {
      nextResponse = {
        status: 400,
        body: {
          status: 'error',
          message:
            "Invalid hearing interval: The requested start_time and end_time cross a daylight saving time transition in court timezone 'America/New_York'. Schedule proceedings within a single offset period.",
        },
      };

      await assert.rejects(
        async () => {
          await createHearing({
            case_id: 'case-1',
            judge_id: 'judge-1',
            start_time: '2026-03-08T01:30:00',
            end_time: '2026-03-08T03:30:00',
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiClientError);
          assert.strictEqual(err.status, 400);
          assert.ok(err.message.includes('daylight saving time transition'));
          return true;
        }
      );
    });

    test('hearings API strictly omits update and delete methods (immutability)', () => {
      // Verify that no updateHearing or deleteHearing exists in the API module
      const apiModule = apiClient as unknown as Record<string, unknown>;
      assert.strictEqual('updateHearing' in apiModule, false);
      assert.strictEqual('deleteHearing' in apiModule, false);
    });
  });

  // =========================================================================
  // 5. Filings Workflow & Immutability Rules
  // =========================================================================
  describe('Filings Workflow & Immutability Rules', () => {
    test('listFilings queries intake queue with case, party, and type filters', async () => {
      const mockFiling: FilingListItem = {
        filing_id: 'filing-1',
        case_id: 'case-1',
        case_number: 'CR-2026-001',
        party_id: 'party-1',
        party_name: 'State of New York',
        filing_type: 'Complaint',
        filing_date: '2026-02-15T09:30:00Z',
      };

      nextResponse = {
        status: 200,
        body: {
          status: 'success',
          message: 'Filings retrieved successfully',
          data: [mockFiling],
          pagination: { page: 1, limit: 10, total_records: 1, total_pages: 1 },
        },
      };

      const res = await listFilings({
        page: 1,
        limit: 10,
        case_id: 'case-1',
        party_id: 'party-1',
        filing_type: 'Complaint',
      });

      assert.strictEqual(res.data.length, 1);
      assert.strictEqual(res.data[0].filing_type, 'Complaint');

      const req = recordedRequests[0];
      assert.strictEqual(req.method, 'GET');
      assert.ok(req.url.includes('/api/filings?'));
      assert.ok(req.url.includes('case_id=case-1'));
      assert.ok(req.url.includes('party_id=party-1'));
      assert.ok(req.url.includes('filing_type=Complaint'));
    });

    test('createFiling sends case_id, party_id, filing_type, and filing_date', async () => {
      nextResponse = {
        status: 201,
        body: {
          status: 'success',
          message: 'Filing created successfully',
          data: {
            filing_id: 'new-filing-uuid',
            case_id: 'case-1',
            party_id: 'party-1',
            filing_type: 'Motion to Dismiss',
            filing_date: '2026-02-20T11:00:00Z',
          },
        },
      };

      const res = await createFiling({
        case_id: 'case-1',
        party_id: 'party-1',
        filing_type: 'Motion to Dismiss',
        filing_date: '2026-02-20T11:00:00Z',
      });

      assert.strictEqual(res.data.filing_id, 'new-filing-uuid');
      assert.strictEqual(recordedRequests[0].method, 'POST');
      assert.strictEqual(recordedRequests[0].url, '/api/filings');
      assert.strictEqual(recordedRequests[0].headers['x-csrf-token'], 'clerk-csrf-token-xyz');
      const body = JSON.parse(recordedRequests[0].body!);
      assert.strictEqual(body.case_id, 'case-1');
      assert.strictEqual(body.party_id, 'party-1');
      assert.strictEqual(body.filing_type, 'Motion to Dismiss');
      assert.strictEqual(body.filing_date, '2026-02-20T11:00:00Z');
    });

    test('updateFiling modifies ONLY filing_type and transmits nothing else', async () => {
      nextResponse = {
        status: 200,
        body: {
          status: 'success',
          message: 'Filing updated successfully',
          data: {
            filing_id: 'filing-1',
            case_id: 'case-1',
            party_id: 'party-1',
            filing_type: 'Amended Complaint',
            filing_date: '2026-02-15T09:30:00Z',
          },
        },
      };

      const res = await updateFiling('filing-1', {
        filing_type: 'Amended Complaint',
      });

      assert.strictEqual(res.data.filing_type, 'Amended Complaint');
      assert.strictEqual(recordedRequests[0].method, 'PUT');
      assert.strictEqual(recordedRequests[0].url, '/api/filings/filing-1');
      assert.strictEqual(recordedRequests[0].headers['x-csrf-token'], 'clerk-csrf-token-xyz');

      // Crucial verification: only filing_type is present in request body
      const body = JSON.parse(recordedRequests[0].body!);
      assert.deepStrictEqual(Object.keys(body), ['filing_type']);
      assert.strictEqual(body.filing_type, 'Amended Complaint');
    });

    test('filings API strictly omits delete method and unsupported file fields', () => {
      const apiModule = apiClient as unknown as Record<string, unknown>;
      assert.strictEqual('deleteFiling' in apiModule, false);
      assert.strictEqual('uploadFilingDocument' in apiModule, false);
    });
  });

  // =========================================================================
  // 6. Adjournments Workflow & Ledger Integrity
  // =========================================================================
  describe('Adjournments Workflow & Ledger Integrity', () => {
    test('listAdjournments retrieves ledger entries with hearing_id filter', async () => {
      const mockAdj: AdjournmentListItem = {
        adj_id: 'adj-uuid-1',
        hearing_id: 'hearing-uuid-1',
        reason_code: 'Witness Unavailable',
        case_id: 'case-uuid-1',
        case_number: 'CR-2026-001',
        judge_id: 'judge-uuid-1',
      };

      nextResponse = {
        status: 200,
        body: {
          status: 'success',
          message: 'Adjournments retrieved successfully',
          data: [mockAdj],
          pagination: { page: 1, limit: 10, total_records: 1, total_pages: 1 },
        },
      };

      const res = await listAdjournments({
        page: 1,
        limit: 10,
        hearing_id: 'hearing-uuid-1',
      });

      assert.strictEqual(res.data.length, 1);
      assert.strictEqual(res.data[0].reason_code, 'Witness Unavailable');
      assert.strictEqual(res.data[0].case_number, 'CR-2026-001');

      const req = recordedRequests[0];
      assert.strictEqual(req.method, 'GET');
      assert.ok(req.url.includes('/api/adjournments?'));
      assert.ok(req.url.includes('hearing_id=hearing-uuid-1'));
    });

    test('getAdjournment retrieves single ledger record by UUID', async () => {
      const mockAdj: AdjournmentListItem = {
        adj_id: 'adj-uuid-1',
        hearing_id: 'hearing-uuid-1',
        reason_code: 'Counsel Unwell',
        case_id: 'case-uuid-1',
        case_number: 'CR-2026-001',
        judge_id: 'judge-uuid-1',
      };

      nextResponse = {
        status: 200,
        body: {
          status: 'success',
          message: 'Adjournment retrieved successfully',
          data: mockAdj,
        },
      };

      const res = await getAdjournment('adj-uuid-1');
      assert.strictEqual(res.data.reason_code, 'Counsel Unwell');
      assert.strictEqual(recordedRequests[0].method, 'GET');
      assert.strictEqual(recordedRequests[0].url, '/api/adjournments/adj-uuid-1');
    });

    test('createAdjournment dispatches POST /api/adjournments with hearing_id and reason_code', async () => {
      nextResponse = {
        status: 201,
        body: {
          status: 'success',
          message: 'Adjournment recorded successfully',
          data: {
            adj_id: 'new-adj-uuid',
            hearing_id: 'hearing-uuid-1',
            reason_code: 'Settlement Discussions',
          },
        },
      };

      const res = await createAdjournment({
        hearing_id: 'hearing-uuid-1',
        reason_code: 'Settlement Discussions',
      });

      assert.strictEqual(res.data.adj_id, 'new-adj-uuid');
      assert.strictEqual(recordedRequests[0].method, 'POST');
      assert.strictEqual(recordedRequests[0].url, '/api/adjournments');
      assert.strictEqual(recordedRequests[0].headers['x-csrf-token'], 'clerk-csrf-token-xyz');
      const body = JSON.parse(recordedRequests[0].body!);
      assert.strictEqual(body.hearing_id, 'hearing-uuid-1');
      assert.strictEqual(body.reason_code, 'Settlement Discussions');
    });

    test('adjournments API strictly omits update and delete methods (append-only ledger)', () => {
      const apiModule = apiClient as unknown as Record<string, unknown>;
      assert.strictEqual('updateAdjournment' in apiModule, false);
      assert.strictEqual('deleteAdjournment' in apiModule, false);
    });
  });

  // =========================================================================
  // 7. Error Mapping and Fail-Safe Handling
  // =========================================================================
  describe('Error Mapping & Fail-Safe Handling in Clerk Operations', () => {
    test('handles 400 Bad Request on invalid UUID parameters cleanly', async () => {
      nextResponse = {
        status: 400,
        body: {
          status: 'error',
          message: 'Invalid case_id UUID format.',
        },
      };

      await assert.rejects(
        async () => {
          await getCase('not-a-valid-uuid');
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiClientError);
          assert.strictEqual(err.status, 400);
          assert.strictEqual(err.message, 'Invalid case_id UUID format.');
          return true;
        }
      );
    });

    test('handles 404 Not Found when entity does not exist in database', async () => {
      nextResponse = {
        status: 404,
        body: {
          status: 'error',
          message: 'Case not found.',
        },
      };

      await assert.rejects(
        async () => {
          await getCase('00000000-0000-0000-0000-000000000000');
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiClientError);
          assert.strictEqual(err.status, 404);
          assert.strictEqual(err.message, 'Case not found.');
          return true;
        }
      );
    });

    test('handles 403 Forbidden when attempting prohibited actions', async () => {
      nextResponse = {
        status: 403,
        body: {
          status: 'error',
          message: 'Access forbidden: clerk cannot modify judicial dispositions.',
        },
      };

      await assert.rejects(
        async () => {
          await updateCase('case-1', { status: 'Closed' });
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiClientError);
          assert.strictEqual(err.status, 403);
          assert.ok(err.message.includes('Access forbidden'));
          return true;
        }
      );
    });

    test('handles 500 Internal Server Error gracefully', async () => {
      nextResponse = {
        status: 500,
        body: {
          status: 'error',
          message: 'Database query execution failed.',
        },
      };

      await assert.rejects(
        async () => {
          await listHearings();
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiClientError);
          assert.strictEqual(err.status, 500);
          assert.strictEqual(err.message, 'Database query execution failed.');
          return true;
        }
      );
    });
  });
});
