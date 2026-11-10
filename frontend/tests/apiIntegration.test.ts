/**
 * Court Case Management System - Phase 8A API Client Integration Unit Tests
 * Uses Node.js native test runner (zero external dependencies).
 *
 * Exercises:
 *   1. Cases API client methods (list, get, create, update, delete, link party, unlink party)
 *   2. Parties API client methods (list, get, create, update, delete, add phone, remove phone)
 *   3. Hearings API client methods (list, get, create)
 *   4. Filings API client methods (list, get, create, update)
 *   5. Adjournments API client methods (list, get, create)
 *   6. Query string builder (undefined/null omission, number/boolean preservation)
 *   7. HTTP error parsing (401, 403, 404, 409, 422, 500, network error)
 *   8. Credentials & CSRF token behavior (credentials: include, state-changing vs GET)
 *   9. Non-idempotent POST no-retry verification
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import {
  apiClient,
  ApiClientError,
  buildQueryString,
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

interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
  credentials?: RequestCredentials;
}

describe('Phase 8A — API Integration Client Suite', () => {
  const originalFetch = globalThis.fetch;
  let recordedRequests: RecordedRequest[] = [];
  let nextResponse: { status: number; body: unknown; headers?: Record<string, string> };

  beforeEach(() => {
    csrfManager.setToken('test-csrf-token-123');
    recordedRequests = [];
    nextResponse = {
      status: 200,
      body: { status: 'success', data: {} },
      headers: { 'Content-Type': 'application/json' },
    };

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input.toString();
      const headersRecord: Record<string, string> = {};

      if (init?.headers) {
        if (init.headers instanceof Headers) {
          init.headers.forEach((v, k) => {
            headersRecord[k] = v;
          });
        } else if (Array.isArray(init.headers)) {
          for (const [k, v] of init.headers) {
            headersRecord[k] = v;
          }
        } else {
          Object.assign(headersRecord, init.headers);
        }
      }

      recordedRequests.push({
        url,
        method: init?.method?.toUpperCase() || 'GET',
        headers: headersRecord,
        body: typeof init?.body === 'string' ? init.body : undefined,
        credentials: init?.credentials,
      });

      const bodyStr = typeof nextResponse.body === 'string' ? nextResponse.body : JSON.stringify(nextResponse.body);
      return new Response(bodyStr, {
        status: nextResponse.status,
        headers: nextResponse.headers || { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    csrfManager.clearToken();
  });

  // =========================================================================
  // 1. Query String Builder Tests
  // =========================================================================

  describe('buildQueryString Utility', () => {
    test('returns empty string when params is undefined or empty', () => {
      assert.strictEqual(buildQueryString(undefined), '');
      assert.strictEqual(buildQueryString({}), '');
    });

    test('omits undefined, null, and empty string values', () => {
      const result = buildQueryString({
        page: 1,
        search: '',
        status: undefined,
        filter: null,
      });
      assert.strictEqual(result, '?page=1');
    });

    test('preserves 0 and false correctly', () => {
      const result = buildQueryString({
        offset: 0,
        active: false,
      });
      assert.strictEqual(result, '?offset=0&active=false');
    });

    test('encodes special characters cleanly', () => {
      const result = buildQueryString({
        search: 'State vs. Doe & Co.',
      });
      assert.strictEqual(result, '?search=State+vs.+Doe+%26+Co.');
    });
  });

  // =========================================================================
  // 2. Cases API Client Tests
  // =========================================================================

  describe('Cases API Client', () => {
    test('listCases dispatches GET /api/cases with query parameters and credentials: include', async () => {
      nextResponse = {
        status: 200,
        body: {
          status: 'success',
          data: {
            cases: [
              {
                case_id: 'case-1',
                case_number: 'CC-2026-001',
                status: 'Active',
                filing_date: '2026-01-01',
                parties_count: 2,
                hearings_count: 1,
              },
            ],
            pagination: { page: 2, limit: 10, total_records: 25, total_pages: 3 },
          },
        },
      };

      const res = await listCases({
        page: 2,
        limit: 10,
        status: 'Active',
        search: '2026',
        sort: 'case_number',
        order: 'asc',
      });

      assert.strictEqual(recordedRequests.length, 1);
      const req = recordedRequests[0];
      assert.strictEqual(req.method, 'GET');
      assert.ok(req.url.startsWith('/api/cases?'));
      assert.ok(req.url.includes('page=2'));
      assert.ok(req.url.includes('limit=10'));
      assert.ok(req.url.includes('status=Active'));
      assert.ok(req.url.includes('sort=case_number'));
      assert.strictEqual(req.credentials, 'include');
      assert.strictEqual(req.headers['X-CSRF-Token'], undefined, 'GET requests must not attach CSRF token');
      assert.strictEqual(res.data.cases.length, 1);
      assert.strictEqual(res.data.pagination.page, 2);
    });

    test('getCase dispatches GET /api/cases/:id', async () => {
      const caseUuid = '1c51a3f3-e269-47aa-9a2c-7c0406187229';
      nextResponse = {
        status: 200,
        body: {
          status: 'success',
          data: {
            case_id: caseUuid,
            case_number: 'CC-2024-001',
            status: 'Filed',
            filing_date: '2024-01-15',
            parties: [],
            hearings: [],
            orders: [],
            disposition: null,
            filings: [],
          },
        },
      };

      const res = await getCase(caseUuid);
      assert.strictEqual(recordedRequests.length, 1);
      const req = recordedRequests[0];
      assert.strictEqual(req.method, 'GET');
      assert.strictEqual(req.url, `/api/cases/${caseUuid}`);
      assert.strictEqual(req.credentials, 'include');
      assert.strictEqual(res.data.case_id, caseUuid);
    });

    test('createCase dispatches POST /api/cases with JSON body and CSRF header', async () => {
      nextResponse = {
        status: 201,
        body: {
          status: 'success',
          message: 'Case created successfully.',
          data: {
            case_id: 'new-case-id',
            case_number: 'CC-2026-999',
            status: 'Filed',
            filing_date: '2026-03-01',
          },
        },
      };

      const payload = {
        case_number: 'CC-2026-999',
        status: 'Filed',
        filing_date: '2026-03-01',
      };

      const res = await createCase(payload);
      assert.strictEqual(recordedRequests.length, 1);
      const req = recordedRequests[0];
      assert.strictEqual(req.method, 'POST');
      assert.strictEqual(req.url, '/api/cases');
      assert.strictEqual(req.credentials, 'include');
      assert.strictEqual(req.headers['X-CSRF-Token'], 'test-csrf-token-123');
      assert.strictEqual(req.headers['Content-Type'], 'application/json');
      assert.strictEqual(JSON.parse(req.body!).case_number, 'CC-2026-999');
      assert.strictEqual(res.data.case_id, 'new-case-id');
    });

    test('updateCase dispatches PUT /api/cases/:id with JSON body and CSRF header', async () => {
      const caseUuid = 'case-update-id';
      nextResponse = {
        status: 200,
        body: {
          status: 'success',
          message: 'Case updated successfully.',
          data: {
            case_id: caseUuid,
            case_number: 'CC-2026-999',
            status: 'Active',
            filing_date: '2026-03-01',
          },
        },
      };

      const res = await updateCase(caseUuid, { status: 'Active' });
      assert.strictEqual(recordedRequests.length, 1);
      const req = recordedRequests[0];
      assert.strictEqual(req.method, 'PUT');
      assert.strictEqual(req.url, `/api/cases/${caseUuid}`);
      assert.strictEqual(req.headers['X-CSRF-Token'], 'test-csrf-token-123');
      assert.strictEqual(JSON.parse(req.body!).status, 'Active');
      assert.strictEqual(res.data.status, 'Active');
    });

    test('deleteCase dispatches DELETE /api/cases/:id with CSRF header', async () => {
      const caseUuid = 'case-delete-id';
      nextResponse = {
        status: 200,
        body: {
          status: 'success',
          message: 'Case deleted successfully.',
        },
      };

      const res = await deleteCase(caseUuid);
      assert.strictEqual(recordedRequests.length, 1);
      const req = recordedRequests[0];
      assert.strictEqual(req.method, 'DELETE');
      assert.strictEqual(req.url, `/api/cases/${caseUuid}`);
      assert.strictEqual(req.headers['X-CSRF-Token'], 'test-csrf-token-123');
      assert.strictEqual(res.message, 'Case deleted successfully.');
    });

    test('linkPartyToCase dispatches POST /api/cases/:id/parties', async () => {
      const caseUuid = 'case-party-id';
      nextResponse = {
        status: 201,
        body: {
          status: 'success',
          message: 'Party successfully linked to case.',
          data: {
            case_id: caseUuid,
            party_id: 'party-1',
            role_type: 'Petitioner',
          },
        },
      };

      const res = await linkPartyToCase(caseUuid, {
        party_id: 'party-1',
        role_type: 'Petitioner',
      });

      assert.strictEqual(recordedRequests.length, 1);
      const req = recordedRequests[0];
      assert.strictEqual(req.method, 'POST');
      assert.strictEqual(req.url, `/api/cases/${caseUuid}/parties`);
      assert.strictEqual(req.headers['X-CSRF-Token'], 'test-csrf-token-123');
      assert.strictEqual(JSON.parse(req.body!).role_type, 'Petitioner');
      assert.strictEqual(res.data.role_type, 'Petitioner');
    });

    test('unlinkPartyFromCase dispatches DELETE /api/cases/:id/parties/:party_id', async () => {
      const caseUuid = 'case-party-id';
      const partyUuid = 'party-to-unlink';
      nextResponse = {
        status: 200,
        body: {
          status: 'success',
          message: 'Party unlinked from case successfully.',
        },
      };

      const res = await unlinkPartyFromCase(caseUuid, partyUuid);
      assert.strictEqual(recordedRequests.length, 1);
      const req = recordedRequests[0];
      assert.strictEqual(req.method, 'DELETE');
      assert.strictEqual(req.url, `/api/cases/${caseUuid}/parties/${partyUuid}`);
      assert.strictEqual(req.headers['X-CSRF-Token'], 'test-csrf-token-123');
      assert.strictEqual(res.message, 'Party unlinked from case successfully.');
    });
  });

  // =========================================================================
  // 3. Parties API Client Tests
  // =========================================================================

  describe('Parties API Client', () => {
    test('listParties dispatches GET /api/parties with filters', async () => {
      nextResponse = {
        status: 200,
        body: {
          status: 'success',
          data: {
            parties: [
              {
                party_id: 'p-1',
                name: 'Acme Corp',
                party_type: 'Corporation',
                phone_numbers: ['+1-555-0199'],
                case_count: 3,
              },
            ],
            pagination: { page: 1, limit: 20, total_records: 1, total_pages: 1 },
          },
        },
      };

      const res = await listParties({ party_type: 'Corporation', search: 'Acme' });
      assert.strictEqual(recordedRequests.length, 1);
      const req = recordedRequests[0];
      assert.strictEqual(req.method, 'GET');
      assert.ok(req.url.startsWith('/api/parties?'));
      assert.ok(req.url.includes('party_type=Corporation'));
      assert.strictEqual(res.data.parties[0].name, 'Acme Corp');
    });

    test('getParty dispatches GET /api/parties/:id', async () => {
      const partyUuid = 'party-detail-id';
      nextResponse = {
        status: 200,
        body: {
          status: 'success',
          data: {
            party_id: partyUuid,
            name: 'John Doe',
            party_type: 'Individual',
            phone_numbers: ['+1-555-0100'],
            associated_cases: [],
          },
        },
      };

      const res = await getParty(partyUuid);
      assert.strictEqual(recordedRequests.length, 1);
      const req = recordedRequests[0];
      assert.strictEqual(req.method, 'GET');
      assert.strictEqual(req.url, `/api/parties/${partyUuid}`);
      assert.strictEqual(res.data.name, 'John Doe');
    });

    test('createParty dispatches POST /api/parties with phone numbers', async () => {
      nextResponse = {
        status: 201,
        body: {
          status: 'success',
          message: 'Party created successfully.',
          data: {
            party_id: 'new-party-id',
            name: 'Jane Smith',
            party_type: 'Individual',
            phone_numbers: ['+1-555-0101'],
          },
        },
      };

      const res = await createParty({
        name: 'Jane Smith',
        party_type: 'Individual',
        phone_numbers: ['+1-555-0101'],
      });

      assert.strictEqual(recordedRequests.length, 1);
      const req = recordedRequests[0];
      assert.strictEqual(req.method, 'POST');
      assert.strictEqual(req.url, '/api/parties');
      assert.strictEqual(req.headers['X-CSRF-Token'], 'test-csrf-token-123');
      assert.strictEqual(JSON.parse(req.body!).name, 'Jane Smith');
      assert.strictEqual(res.data.party_id, 'new-party-id');
    });

    test('updateParty dispatches PUT /api/parties/:id', async () => {
      const partyUuid = 'party-update-id';
      nextResponse = {
        status: 200,
        body: {
          status: 'success',
          message: 'Party updated successfully.',
          data: {
            party_id: partyUuid,
            name: 'Jane Doe-Smith',
            party_type: 'Individual',
          },
        },
      };

      const res = await updateParty(partyUuid, { name: 'Jane Doe-Smith' });
      assert.strictEqual(recordedRequests.length, 1);
      const req = recordedRequests[0];
      assert.strictEqual(req.method, 'PUT');
      assert.strictEqual(req.url, `/api/parties/${partyUuid}`);
      assert.strictEqual(req.headers['X-CSRF-Token'], 'test-csrf-token-123');
      assert.strictEqual(res.data.name, 'Jane Doe-Smith');
    });

    test('deleteParty dispatches DELETE /api/parties/:id', async () => {
      const partyUuid = 'party-del-id';
      nextResponse = {
        status: 200,
        body: {
          status: 'success',
          message: 'Party deleted successfully.',
        },
      };

      const res = await deleteParty(partyUuid);
      assert.strictEqual(recordedRequests.length, 1);
      const req = recordedRequests[0];
      assert.strictEqual(req.method, 'DELETE');
      assert.strictEqual(req.url, `/api/parties/${partyUuid}`);
      assert.strictEqual(req.headers['X-CSRF-Token'], 'test-csrf-token-123');
      assert.strictEqual(res.message, 'Party deleted successfully.');
    });

    test('addPartyPhone dispatches POST /api/parties/:id/phones', async () => {
      const partyUuid = 'party-phone-id';
      nextResponse = {
        status: 201,
        body: {
          status: 'success',
          message: 'Phone number added successfully.',
          data: {
            party_id: partyUuid,
            phone_number: '+1-555-9999',
          },
        },
      };

      const res = await addPartyPhone(partyUuid, { phone_number: '+1-555-9999' });
      assert.strictEqual(recordedRequests.length, 1);
      const req = recordedRequests[0];
      assert.strictEqual(req.method, 'POST');
      assert.strictEqual(req.url, `/api/parties/${partyUuid}/phones`);
      assert.strictEqual(req.headers['X-CSRF-Token'], 'test-csrf-token-123');
      assert.strictEqual(res.data.phone_number, '+1-555-9999');
    });

    test('deletePartyPhone dispatches DELETE /api/parties/:id/phones/:num', async () => {
      const partyUuid = 'party-phone-id';
      const phoneNum = '+1-555-9999';
      nextResponse = {
        status: 200,
        body: {
          status: 'success',
          message: 'Phone number removed successfully.',
        },
      };

      const res = await deletePartyPhone(partyUuid, phoneNum);
      assert.strictEqual(recordedRequests.length, 1);
      const req = recordedRequests[0];
      assert.strictEqual(req.method, 'DELETE');
      assert.strictEqual(req.url, `/api/parties/${partyUuid}/phones/${encodeURIComponent(phoneNum)}`);
      assert.strictEqual(req.headers['X-CSRF-Token'], 'test-csrf-token-123');
      assert.strictEqual(res.message, 'Phone number removed successfully.');
    });
  });

  // =========================================================================
  // 4. Hearings API Client Tests
  // =========================================================================

  describe('Hearings API Client', () => {
    test('listHearings dispatches GET /api/hearings with date query filters', async () => {
      nextResponse = {
        status: 200,
        body: {
          status: 'success',
          message: 'Hearings retrieved successfully.',
          data: [
            {
              hearing_id: 'h-1',
              case_id: 'c-1',
              case_number: 'CC-2026-001',
              judge_id: 'j-1',
              judge_name: 'Hon. Justice Smith',
              start_time: '2026-11-20T10:00:00',
              end_time: '2026-11-20T11:00:00',
            },
          ],
          pagination: { page: 1, limit: 20, total_records: 1, total_pages: 1 },
        },
      };

      const res = await listHearings({
        start_date: '2026-11-20T00:00:00',
        end_date: '2026-11-20T23:59:59',
      });

      assert.strictEqual(recordedRequests.length, 1);
      const req = recordedRequests[0];
      assert.strictEqual(req.method, 'GET');
      assert.ok(req.url.startsWith('/api/hearings?'));
      assert.ok(req.url.includes('start_date=2026-11-20T00%3A00%3A00'));
      assert.strictEqual(req.headers['X-CSRF-Token'], undefined);
      assert.strictEqual(res.data.length, 1);
      assert.strictEqual(res.data[0].judge_name, 'Hon. Justice Smith');
    });

    test('getHearing dispatches GET /api/hearings/:id', async () => {
      const hearingUuid = 'hearing-detail-id';
      nextResponse = {
        status: 200,
        body: {
          status: 'success',
          message: 'Hearing retrieved successfully.',
          data: {
            hearing_id: hearingUuid,
            case_id: 'c-1',
            case_number: 'CC-2026-001',
            judge_id: 'j-1',
            judge_name: 'Hon. Justice Smith',
            start_time: '2026-11-20T10:00:00',
            end_time: '2026-11-20T11:00:00',
          },
        },
      };

      const res = await getHearing(hearingUuid);
      assert.strictEqual(recordedRequests.length, 1);
      const req = recordedRequests[0];
      assert.strictEqual(req.method, 'GET');
      assert.strictEqual(req.url, `/api/hearings/${hearingUuid}`);
      assert.strictEqual(res.data.hearing_id, hearingUuid);
    });

    test('createHearing dispatches POST /api/hearings with exact payload and CSRF header', async () => {
      nextResponse = {
        status: 201,
        body: {
          status: 'success',
          message: 'Hearing scheduled successfully.',
          data: {
            hearing_id: 'new-hearing-id',
            case_id: 'c-1',
            judge_id: 'j-1',
            start_time: '2026-11-20T10:00:00',
            end_time: '2026-11-20T11:00:00',
          },
        },
      };

      const payload = {
        case_id: 'c-1',
        judge_id: 'j-1',
        start_time: '2026-11-20T10:00:00',
        end_time: '2026-11-20T11:00:00',
      };

      const res = await createHearing(payload);
      assert.strictEqual(recordedRequests.length, 1);
      const req = recordedRequests[0];
      assert.strictEqual(req.method, 'POST');
      assert.strictEqual(req.url, '/api/hearings');
      assert.strictEqual(req.headers['X-CSRF-Token'], 'test-csrf-token-123');
      assert.strictEqual(JSON.parse(req.body!).case_id, 'c-1');
      assert.strictEqual(res.data.hearing_id, 'new-hearing-id');
    });
  });

  // =========================================================================
  // 5. Filings API Client Tests
  // =========================================================================

  describe('Filings API Client', () => {
    test('listFilings dispatches GET /api/filings with filters', async () => {
      nextResponse = {
        status: 200,
        body: {
          status: 'success',
          message: 'Filings retrieved successfully.',
          data: [
            {
              filing_id: 'f-1',
              case_id: 'c-1',
              case_number: 'CC-2026-001',
              party_id: 'p-1',
              party_name: 'Plaintiff Alpha',
              filing_type: 'Complaint',
              filing_date: '2026-11-10T12:00:00',
            },
          ],
          pagination: { page: 1, limit: 20, total_records: 1, total_pages: 1 },
        },
      };

      const res = await listFilings({ case_id: 'c-1', filing_type: 'Complaint' });
      assert.strictEqual(recordedRequests.length, 1);
      const req = recordedRequests[0];
      assert.strictEqual(req.method, 'GET');
      assert.ok(req.url.startsWith('/api/filings?'));
      assert.ok(req.url.includes('filing_type=Complaint'));
      assert.strictEqual(res.data[0].filing_type, 'Complaint');
    });

    test('getFiling dispatches GET /api/filings/:id', async () => {
      const filingUuid = 'filing-detail-id';
      nextResponse = {
        status: 200,
        body: {
          status: 'success',
          message: 'Filing retrieved successfully.',
          data: {
            filing_id: filingUuid,
            case_id: 'c-1',
            case_number: 'CC-2026-001',
            party_id: 'p-1',
            party_name: 'Plaintiff Alpha',
            filing_type: 'Complaint',
            filing_date: '2026-11-10T12:00:00',
          },
        },
      };

      const res = await getFiling(filingUuid);
      assert.strictEqual(recordedRequests.length, 1);
      const req = recordedRequests[0];
      assert.strictEqual(req.method, 'GET');
      assert.strictEqual(req.url, `/api/filings/${filingUuid}`);
      assert.strictEqual(res.data.filing_id, filingUuid);
    });

    test('createFiling dispatches POST /api/filings with CSRF header', async () => {
      nextResponse = {
        status: 201,
        body: {
          status: 'success',
          message: 'Filing created successfully.',
          data: {
            filing_id: 'new-filing-id',
            case_id: 'c-1',
            party_id: 'p-1',
            filing_type: 'Motion to Dismiss',
            filing_date: '2026-11-10T14:00:00',
          },
        },
      };

      const payload = {
        case_id: 'c-1',
        party_id: 'p-1',
        filing_type: 'Motion to Dismiss',
      };

      const res = await createFiling(payload);
      assert.strictEqual(recordedRequests.length, 1);
      const req = recordedRequests[0];
      assert.strictEqual(req.method, 'POST');
      assert.strictEqual(req.url, '/api/filings');
      assert.strictEqual(req.headers['X-CSRF-Token'], 'test-csrf-token-123');
      assert.strictEqual(JSON.parse(req.body!).filing_type, 'Motion to Dismiss');
      assert.strictEqual(res.data.filing_id, 'new-filing-id');
    });

    test('updateFiling dispatches PUT /api/filings/:id with filing_type', async () => {
      const filingUuid = 'filing-update-id';
      nextResponse = {
        status: 200,
        body: {
          status: 'success',
          message: 'Filing updated successfully.',
          data: {
            filing_id: filingUuid,
            case_id: 'c-1',
            party_id: 'p-1',
            filing_type: 'Amended Motion to Dismiss',
            filing_date: '2026-11-10T14:00:00',
          },
        },
      };

      const res = await updateFiling(filingUuid, { filing_type: 'Amended Motion to Dismiss' });
      assert.strictEqual(recordedRequests.length, 1);
      const req = recordedRequests[0];
      assert.strictEqual(req.method, 'PUT');
      assert.strictEqual(req.url, `/api/filings/${filingUuid}`);
      assert.strictEqual(req.headers['X-CSRF-Token'], 'test-csrf-token-123');
      assert.strictEqual(JSON.parse(req.body!).filing_type, 'Amended Motion to Dismiss');
      assert.strictEqual(res.data.filing_type, 'Amended Motion to Dismiss');
    });
  });

  // =========================================================================
  // 6. Adjournments API Client Tests
  // =========================================================================

  describe('Adjournments API Client', () => {
    test('listAdjournments dispatches GET /api/adjournments with hearing_id filter', async () => {
      nextResponse = {
        status: 200,
        body: {
          status: 'success',
          message: 'Adjournments retrieved successfully.',
          data: [
            {
              adj_id: 'adj-1',
              hearing_id: 'h-1',
              reason_code: 'Witness Unavailable',
              case_id: 'c-1',
              case_number: 'CC-2026-001',
              judge_id: 'j-1',
            },
          ],
          pagination: { page: 1, limit: 20, total_records: 1, total_pages: 1 },
        },
      };

      const res = await listAdjournments({ hearing_id: 'h-1' });
      assert.strictEqual(recordedRequests.length, 1);
      const req = recordedRequests[0];
      assert.strictEqual(req.method, 'GET');
      assert.ok(req.url.startsWith('/api/adjournments?'));
      assert.ok(req.url.includes('hearing_id=h-1'));
      assert.strictEqual(res.data[0].reason_code, 'Witness Unavailable');
    });

    test('getAdjournment dispatches GET /api/adjournments/:id', async () => {
      const adjUuid = 'adj-detail-id';
      nextResponse = {
        status: 200,
        body: {
          status: 'success',
          message: 'Adjournment retrieved successfully.',
          data: {
            adj_id: adjUuid,
            hearing_id: 'h-1',
            reason_code: 'Witness Unavailable',
            case_id: 'c-1',
            case_number: 'CC-2026-001',
            judge_id: 'j-1',
          },
        },
      };

      const res = await getAdjournment(adjUuid);
      assert.strictEqual(recordedRequests.length, 1);
      const req = recordedRequests[0];
      assert.strictEqual(req.method, 'GET');
      assert.strictEqual(req.url, `/api/adjournments/${adjUuid}`);
      assert.strictEqual(res.data.adj_id, adjUuid);
    });

    test('createAdjournment dispatches POST /api/adjournments with CSRF header', async () => {
      nextResponse = {
        status: 201,
        body: {
          status: 'success',
          message: 'Adjournment recorded successfully.',
          data: {
            adj_id: 'new-adj-id',
            hearing_id: 'h-1',
            reason_code: 'Counsel Unwell',
          },
        },
      };

      const payload = {
        hearing_id: 'h-1',
        reason_code: 'Counsel Unwell',
      };

      const res = await createAdjournment(payload);
      assert.strictEqual(recordedRequests.length, 1);
      const req = recordedRequests[0];
      assert.strictEqual(req.method, 'POST');
      assert.strictEqual(req.url, '/api/adjournments');
      assert.strictEqual(req.headers['X-CSRF-Token'], 'test-csrf-token-123');
      assert.strictEqual(JSON.parse(req.body!).reason_code, 'Counsel Unwell');
      assert.strictEqual(res.data.adj_id, 'new-adj-id');
    });
  });

  // =========================================================================
  // 7. HTTP Error Envelope & Status Mapping Tests
  // =========================================================================

  describe('HTTP Error Envelope & Status Mapping', () => {
    test('extracts backend message on HTTP 400 Bad Request', async () => {
      nextResponse = {
        status: 400,
        body: { status: 'error', message: 'Invalid start_date format.' },
      };

      await assert.rejects(
        async () => listHearings({ start_date: 'invalid' }),
        (err: unknown) => {
          assert.ok(err instanceof ApiClientError);
          assert.strictEqual(err.status, 400);
          assert.strictEqual(err.message, 'Invalid start_date format.');
          return true;
        }
      );
    });

    test('extracts backend message on HTTP 403 Forbidden', async () => {
      nextResponse = {
        status: 403,
        body: { status: 'error', message: 'Access forbidden: you do not have judicial assignment.' },
      };

      await assert.rejects(
        async () => getHearing('hearing-other-judge'),
        (err: unknown) => {
          assert.ok(err instanceof ApiClientError);
          assert.strictEqual(err.status, 403);
          assert.strictEqual(err.message, 'Access forbidden: you do not have judicial assignment.');
          return true;
        }
      );
    });

    test('extracts backend message on HTTP 404 Not Found', async () => {
      nextResponse = {
        status: 404,
        body: { status: 'error', message: 'Case not found.' },
      };

      await assert.rejects(
        async () => getCase('nonexistent-uuid'),
        (err: unknown) => {
          assert.ok(err instanceof ApiClientError);
          assert.strictEqual(err.status, 404);
          assert.strictEqual(err.message, 'Case not found.');
          return true;
        }
      );
    });

    test('extracts backend message on HTTP 409 Conflict', async () => {
      nextResponse = {
        status: 409,
        body: { status: 'error', message: 'Scheduling conflict: The assigned judge already has a hearing.' },
      };

      await assert.rejects(
        async () =>
          createHearing({
            case_id: 'c-1',
            judge_id: 'j-1',
            start_time: '2026-11-20T10:00:00',
            end_time: '2026-11-20T11:00:00',
          }),
        (err: unknown) => {
          assert.ok(err instanceof ApiClientError);
          assert.strictEqual(err.status, 409);
          assert.strictEqual(err.message, 'Scheduling conflict: The assigned judge already has a hearing.');
          return true;
        }
      );
    });

    test('falls back to standardized status message when backend body is empty or non-JSON', async () => {
      nextResponse = {
        status: 422,
        body: '',
      };

      await assert.rejects(
        async () => createCase({ case_number: 'INVALID' }),
        (err: unknown) => {
          assert.ok(err instanceof ApiClientError);
          assert.strictEqual(err.status, 422);
          assert.strictEqual(err.message, 'Unprocessable entity. Input data could not be processed.');
          return true;
        }
      );
    });

    test('falls back to 500 server error message when backend returns 500 without message', async () => {
      nextResponse = {
        status: 500,
        body: '',
      };

      await assert.rejects(
        async () => listCases(),
        (err: unknown) => {
          assert.ok(err instanceof ApiClientError);
          assert.strictEqual(err.status, 500);
          assert.strictEqual(err.message, 'Internal server error. Please try again later.');
          return true;
        }
      );
    });

    test('translates network connection drop into ApiClientError with status 0', async () => {
      globalThis.fetch = (() => Promise.reject(new TypeError('Failed to fetch'))) as typeof fetch;

      await assert.rejects(
        async () => listCases(),
        (err: unknown) => {
          assert.ok(err instanceof ApiClientError);
          assert.strictEqual(err.status, 0);
          assert.strictEqual(err.message, 'Failed to fetch');
          return true;
        }
      );
    });
  });

  // =========================================================================
  // 8. CSRF Auto-Rotation & Non-Idempotent No-Retry Tests
  // =========================================================================

  describe('CSRF Token Rotation & Request Execution Behavior', () => {
    test('automatically updates in-memory CSRF token when response includes rotated token', async () => {
      nextResponse = {
        status: 200,
        body: {
          status: 'success',
          message: 'Operation succeeded.',
          csrf_token: 'freshly-rotated-csrf-token-456',
          data: {},
        },
      };

      await apiClient.post('/api/cases', { case_number: 'TEST-123' });
      assert.strictEqual(csrfManager.getToken(), 'freshly-rotated-csrf-token-456');
    });

    test('non-idempotent POST does not automatically retry upon failure', async () => {
      let callCount = 0;
      globalThis.fetch = (async () => {
        callCount++;
        return new Response(JSON.stringify({ status: 'error', message: 'Server timeout' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }) as typeof fetch;

      await assert.rejects(
        async () =>
          createHearing({
            case_id: 'c-1',
            judge_id: 'j-1',
            start_time: '2026-11-20T10:00:00',
            end_time: '2026-11-20T11:00:00',
          }),
        ApiClientError
      );

      assert.strictEqual(callCount, 1, 'Non-idempotent POST must be attempted exactly once (zero retries).');
    });
  });
});

