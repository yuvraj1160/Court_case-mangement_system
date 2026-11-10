/**
 * Court Case Management System - Dashboard Navigation, Role Isolation & Mock Domain Tests
 * Uses Node.js native test runner (zero external dependencies).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  getNavItemsForRole,
  getPortalTitleForRole,
  isValidTabForRole,
  resolveActiveTab,
  buildPreservedTabSearchParams,
  formatDateSafe,
  formatTimeSafe,
  formatDateTimeSafe,
  ADMIN_TAB_KEYS,
  CLERK_TAB_KEYS,
  JUDGE_TAB_KEYS,
} from '../src/layouts/dashboardNavigation.ts';
import {
  MOCK_ADMIN_DASHBOARD,
  MOCK_CLERK_DASHBOARD,
  MOCK_JUDGE_DASHBOARDS_BY_ID,
  MOCK_RECENT_FILINGS,
  getMockJudgeDashboard,
  getMockJudgeAssignedCases,
  getMockJudicialOfficer,
  getMockCaseDetail,
  isCaseAssignedToJudge,
  resolveEffectiveCaseId,
  inspectJudgeCase,
  getBenchNoteStorageKey,
  getInitialBenchNote,
  saveBenchNote,
  clearBenchNote,
  getMockFilingStatus,
} from '../src/data/mockDashboardData.ts';
import type { UserRole } from '../src/types/index.ts';

// ---------------------------------------------------------------------------
// 1. Role-Scoped Navigation & Tab Isolation Tests
// ---------------------------------------------------------------------------

describe('Dashboard Navigation - Role Scoping & Isolation', () => {
  test('admin role returns all 7 comprehensive administrative sections', () => {
    const items = getNavItemsForRole('admin');
    const tabKeys = items.map((i) => i.tabKey);

    assert.strictEqual(items.length, 7);
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

  test('clerk role returns exactly the 6 operational registry sections', () => {
    const items = getNavItemsForRole('clerk');
    const tabKeys = items.map((i) => i.tabKey);

    assert.strictEqual(items.length, 6);
    assert.deepStrictEqual(tabKeys, [
      'overview',
      'cases',
      'parties',
      'hearings',
      'filings',
      'adjournments',
    ]);

    // Verification: Clerk must not have admin governance tools
    assert.ok(!tabKeys.includes('users'), 'Clerk must not access user administration');
    assert.ok(!tabKeys.includes('audit-logs'), 'Clerk must not access system audit trail');
    assert.ok(!tabKeys.includes('judges'), 'Clerk must not access judge assignment management');
  });

  test('judge role strictly isolates chambers views and omits admin/clerk features', () => {
    const items = getNavItemsForRole('judge');
    const tabKeys = items.map((i) => i.tabKey);

    assert.strictEqual(items.length, 4);
    assert.deepStrictEqual(tabKeys, [
      'overview',
      'hearings',
      'cases',
      'details',
    ]);

    // Critical security & role boundary assertions
    const forbiddenForJudge = ['users', 'audit-logs', 'filings', 'judges', 'parties'];
    for (const forbiddenKey of forbiddenForJudge) {
      assert.ok(
        !tabKeys.includes(forbiddenKey),
        `Judge navigation must never expose '${forbiddenKey}' section`
      );
    }
  });

  test('unknown or undefined roles safely return an empty navigation list', () => {
    assert.deepStrictEqual(getNavItemsForRole(undefined), []);
    assert.deepStrictEqual(getNavItemsForRole('unknown_role' as unknown as UserRole), []);
    assert.deepStrictEqual(getNavItemsForRole('' as unknown as UserRole), []);
  });

  test('portal titles correctly reflect judicial branch office without inaccurate claims', () => {
    const adminPortal = getPortalTitleForRole('admin');
    assert.strictEqual(adminPortal.title, 'Executive Judicial Admin');

    const clerkPortal = getPortalTitleForRole('clerk');
    assert.strictEqual(clerkPortal.title, 'Office of the Court Clerk');

    const judgePortal = getPortalTitleForRole('judge');
    assert.strictEqual(judgePortal.title, 'Judicial Chambers');

    const fallbackPortal = getPortalTitleForRole(undefined);
    assert.strictEqual(fallbackPortal.title, 'Court Information System');
  });
});

// ---------------------------------------------------------------------------
// 2. Safe Tab Resolution & Query Parameter Preservation Tests
// ---------------------------------------------------------------------------

describe('Dashboard Navigation - Tab Validation & Query Preservation', () => {
  test('isValidTabForRole correctly validates tabs for each role', () => {
    for (const tab of ADMIN_TAB_KEYS) {
      assert.strictEqual(isValidTabForRole('admin', tab), true);
    }
    assert.strictEqual(isValidTabForRole('admin', 'details'), false);
    assert.strictEqual(isValidTabForRole('admin', 'invalid_tab'), false);

    for (const tab of CLERK_TAB_KEYS) {
      assert.strictEqual(isValidTabForRole('clerk', tab), true);
    }
    assert.strictEqual(isValidTabForRole('clerk', 'users'), false);
    assert.strictEqual(isValidTabForRole('clerk', 'details'), false);

    for (const tab of JUDGE_TAB_KEYS) {
      assert.strictEqual(isValidTabForRole('judge', tab), true);
    }
    assert.strictEqual(isValidTabForRole('judge', 'filings'), false);
    assert.strictEqual(isValidTabForRole('judge', 'users'), false);
  });

  test('resolveActiveTab falls back safely to overview when tab is invalid or absent', () => {
    assert.strictEqual(resolveActiveTab('admin', 'cases'), 'cases');
    assert.strictEqual(resolveActiveTab('admin', 'unknown-tab'), 'overview');
    assert.strictEqual(resolveActiveTab('admin', ''), 'overview');
    assert.strictEqual(resolveActiveTab('admin', null), 'overview');

    assert.strictEqual(resolveActiveTab('clerk', 'filings'), 'filings');
    assert.strictEqual(resolveActiveTab('clerk', 'users'), 'overview'); // users is admin-only

    assert.strictEqual(resolveActiveTab('judge', 'details'), 'details');
    assert.strictEqual(resolveActiveTab('judge', 'filings'), 'overview'); // filings is clerk-only
  });

  test('buildPreservedTabSearchParams preserves unrelated query parameters when changing tab', () => {
    const initialParams = new URLSearchParams('search=smith&filter=active&page=2');
    const updatedParams = buildPreservedTabSearchParams(initialParams, 'cases');

    assert.strictEqual(updatedParams.get('tab'), 'cases');
    assert.strictEqual(updatedParams.get('search'), 'smith');
    assert.strictEqual(updatedParams.get('filter'), 'active');
    assert.strictEqual(updatedParams.get('page'), '2');
  });

  test('buildPreservedTabSearchParams overwrites old tab cleanly', () => {
    const initialParams = new URLSearchParams('tab=overview&view=compact');
    const updatedParams = buildPreservedTabSearchParams(initialParams, 'hearings');

    assert.strictEqual(updatedParams.get('tab'), 'hearings');
    assert.strictEqual(updatedParams.get('view'), 'compact');
  });
});

// ---------------------------------------------------------------------------
// 3. Multi-Judge Mock Data & Case Details Lookup Tests
// ---------------------------------------------------------------------------

describe('Judge Dashboard - Multi-Judge Data Isolation & Case Selection', () => {
  const judgeVanceId = '00000000-0000-0000-0000-000000000001';
  const judgeSterlingId = '00000000-0000-0000-0000-000000000002';
  const judgeRostovaId = '00000000-0000-0000-0000-000000000003';
  const nonexistentJudgeId = '99999999-9999-9999-9999-999999999999';

  test('different judges receive distinct mock datasets and hearings', () => {
    const vanceData = getMockJudgeDashboard(judgeVanceId);
    const sterlingData = getMockJudgeDashboard(judgeSterlingId);

    assert.ok(vanceData, 'Judge Vance must have mock dashboard data');
    assert.ok(sterlingData, 'Judge Sterling must have mock dashboard data');
    assert.notStrictEqual(vanceData?.judge_id, sterlingData?.judge_id);

    // Vance has 4 hearings, Sterling has 2
    assert.strictEqual(vanceData?.assigned_hearings_count, 4);
    assert.strictEqual(sterlingData?.assigned_hearings_count, 2);

    // Verify distinct hearing case numbers
    const vanceCases = vanceData?.upcoming_hearings.map((h) => h.case_number);
    const sterlingCases = sterlingData?.upcoming_hearings.map((h) => h.case_number);
    assert.ok(vanceCases?.includes('CR-2026-00104'));
    assert.ok(!sterlingCases?.includes('CR-2026-00104'));
    assert.ok(sterlingCases?.includes('CV-2026-00215'));
  });

  test('unrecognized or missing judge ID returns null (never silently shows another judge data)', () => {
    assert.strictEqual(getMockJudgeDashboard(nonexistentJudgeId), null);
    assert.strictEqual(getMockJudgeDashboard(null), null);
    assert.strictEqual(getMockJudgeDashboard(undefined), null);
    assert.strictEqual(getMockJudgeDashboard(''), null);
  });

  test('assigned cases roster correctly filters by judge ID', () => {
    const vanceCases = getMockJudgeAssignedCases(judgeVanceId);
    const sterlingCases = getMockJudgeAssignedCases(judgeSterlingId);
    const unknownCases = getMockJudgeAssignedCases(nonexistentJudgeId);

    assert.strictEqual(vanceCases.length, 4);
    assert.strictEqual(sterlingCases.length, 2);
    assert.deepStrictEqual(unknownCases, []);
  });

  test('judicial officer profile returns division and courtroom details', () => {
    const vance = getMockJudicialOfficer(judgeVanceId);
    const rostova = getMockJudicialOfficer(judgeRostovaId);
    const unknown = getMockJudicialOfficer(nonexistentJudgeId);

    assert.strictEqual(vance?.name, 'Hon. Justice Sarah Vance');
    assert.strictEqual(vance?.courtroom, 'Courtroom 4A');
    assert.strictEqual(rostova?.name, 'Hon. Judge Elena Rostova');
    assert.strictEqual(rostova?.courtroom, 'Courtroom 5C');
    assert.strictEqual(unknown, null);
  });

  test('case detail lookup returns case-specific details for assigned case ID', () => {
    const case101 = getMockCaseDetail(judgeVanceId, 'c-101');
    const case102 = getMockCaseDetail(judgeSterlingId, 'c-102');
    const case104 = getMockCaseDetail(judgeRostovaId, 'c-104');

    assert.ok(case101);
    assert.ok(case102);
    assert.ok(case104);

    assert.strictEqual(case101?.case_number, 'CR-2026-00104');
    assert.strictEqual(case101?.case_title, 'State vs. Arthur Pendelton');
    assert.strictEqual(case101?.presiding_judge, 'Hon. Justice Sarah Vance');

    assert.strictEqual(case102?.case_number, 'CV-2026-00215');
    assert.strictEqual(case102?.case_title, 'Metro Transit Authority vs. Global Logistics');
    assert.strictEqual(case102?.presiding_judge, 'Hon. Judge Marcus Sterling');

    assert.strictEqual(case104?.case_number, 'CV-2026-00450');
    assert.strictEqual(case104?.presiding_judge, 'Hon. Judge Elena Rostova');
  });

  test('case detail lookup returns null for unassigned cases (ownership verification)', () => {
    // Case c-102 is assigned to Judge Sterling, not Judge Vance
    assert.strictEqual(getMockCaseDetail(judgeVanceId, 'c-102'), null);
    // Case c-101 is assigned to Judge Vance, not Judge Sterling
    assert.strictEqual(getMockCaseDetail(judgeSterlingId, 'c-101'), null);
    // Case c-104 is assigned to Judge Rostova, not Judge Sterling
    assert.strictEqual(getMockCaseDetail(judgeSterlingId, 'c-104'), null);
    // Case c-101 is not assigned to Judge Rostova
    assert.strictEqual(getMockCaseDetail(judgeRostovaId, 'c-101'), null);
    // Nonexistent case ID
    assert.strictEqual(getMockCaseDetail(judgeVanceId, 'c-999'), null);
  });

  test('case detail lookup safely handles missing or invalid judge or case IDs', () => {
    assert.strictEqual(getMockCaseDetail(null, 'c-101'), null);
    assert.strictEqual(getMockCaseDetail(undefined, 'c-101'), null);
    assert.strictEqual(getMockCaseDetail('', 'c-101'), null);
    assert.strictEqual(getMockCaseDetail(judgeVanceId, null), null);
    assert.strictEqual(getMockCaseDetail(judgeVanceId, undefined), null);
    assert.strictEqual(getMockCaseDetail(judgeVanceId, ''), null);
    assert.strictEqual(getMockCaseDetail(judgeVanceId, 'invalid-case-id'), null);
  });
});

// ---------------------------------------------------------------------------
// 4. Bench Notes Session Storage & Multi-Judge Isolation Tests
// ---------------------------------------------------------------------------

describe('Judge Dashboard - Bench Notes Session Drafts & Multi-Judge Isolation', () => {
  const judgeVanceId = '00000000-0000-0000-0000-000000000001';
  const judgeSterlingId = '00000000-0000-0000-0000-000000000002';

  // Ensure clean session storage before running isolation checks
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.clear();
  }

  test('new notes start completely blank without fabricated default text', () => {
    assert.strictEqual(getInitialBenchNote(judgeVanceId, 'c-101'), '');
    assert.strictEqual(getInitialBenchNote(judgeSterlingId, 'c-102'), '');
    assert.strictEqual(getInitialBenchNote(judgeVanceId, 'new-case-unseen'), '');
  });

  test('notes are not loaded or accessible when judge ID is missing', () => {
    assert.strictEqual(getInitialBenchNote(null, 'c-101'), '');
    assert.strictEqual(getInitialBenchNote(undefined, 'c-101'), '');
    assert.strictEqual(getInitialBenchNote('', 'c-101'), '');
    assert.strictEqual(saveBenchNote(null, 'c-101', 'draft text'), false);
    assert.strictEqual(saveBenchNote(undefined, 'c-101', 'draft text'), false);
    assert.strictEqual(saveBenchNote('', 'c-101', 'draft text'), false);
  });

  test('storage keys are strictly scoped by both judge ID and case ID', () => {
    const vanceKey = getBenchNoteStorageKey(judgeVanceId, 'c-101');
    const sterlingKey = getBenchNoteStorageKey(judgeSterlingId, 'c-101');

    assert.strictEqual(
      vanceKey,
      'bench_note_00000000-0000-0000-0000-000000000001_c-101'
    );
    assert.strictEqual(
      sterlingKey,
      'bench_note_00000000-0000-0000-0000-000000000002_c-101'
    );
    assert.notStrictEqual(vanceKey, sterlingKey);

    assert.strictEqual(getBenchNoteStorageKey(null, 'c-101'), null);
    assert.strictEqual(getBenchNoteStorageKey(judgeVanceId, null), null);
    assert.strictEqual(getBenchNoteStorageKey(judgeVanceId, ''), null);
  });

  test("two judges cannot read each other's session drafts for the same or different cases", () => {
    const vanceNoteText = 'Vance draft note: Bail application reserved.';
    const sterlingNoteText = 'Sterling draft note: Injunction motion denied.';

    // Judge Vance writes a draft on c-101
    const savedVance = saveBenchNote(judgeVanceId, 'c-101', vanceNoteText);
    assert.strictEqual(savedVance, true);

    // Judge Sterling inspecting c-101 must NOT see Judge Vance's draft!
    const sterlingViewOfC101 = getInitialBenchNote(judgeSterlingId, 'c-101');
    assert.strictEqual(
      sterlingViewOfC101,
      '',
      "Judge Sterling must not see Judge Vance's draft for c-101"
    );

    // Judge Sterling writes their own draft on c-102
    const savedSterling = saveBenchNote(judgeSterlingId, 'c-102', sterlingNoteText);
    assert.strictEqual(savedSterling, true);

    // Judge Vance inspecting c-102 must NOT see Judge Sterling's draft!
    const vanceViewOfC102 = getInitialBenchNote(judgeVanceId, 'c-102');
    assert.strictEqual(
      vanceViewOfC102,
      '',
      "Judge Vance must not see Judge Sterling's draft for c-102"
    );

    // Each judge still reads their own draft cleanly
    assert.strictEqual(getInitialBenchNote(judgeVanceId, 'c-101'), vanceNoteText);
    assert.strictEqual(getInitialBenchNote(judgeSterlingId, 'c-102'), sterlingNoteText);
  });

  test('clearing a draft note removes only that specific judge and case note', () => {
    const note = 'Temporary observation';
    saveBenchNote(judgeVanceId, 'c-103', note);
    saveBenchNote(judgeSterlingId, 'c-103', 'Different judge note');

    assert.strictEqual(getInitialBenchNote(judgeVanceId, 'c-103'), note);
    clearBenchNote(judgeVanceId, 'c-103');

    assert.strictEqual(getInitialBenchNote(judgeVanceId, 'c-103'), '');
    assert.strictEqual(getInitialBenchNote(judgeSterlingId, 'c-103'), 'Different judge note');
  });

  // Storage failure resilience tests
  test('getInitialBenchNote safely returns empty string if sessionStorage.getItem throws', () => {
    const originalGetItem = Storage.prototype.getItem;
    try {
      Storage.prototype.getItem = () => {
        throw new Error('Simulated SecurityError: sessionStorage access denied');
      };
      const result = getInitialBenchNote(judgeVanceId, 'c-101');
      assert.strictEqual(result, '', 'Must safely return empty string on getItem failure');
    } finally {
      Storage.prototype.getItem = originalGetItem;
    }
  });

  test('saveBenchNote safely returns false if sessionStorage.setItem throws', () => {
    const originalSetItem = Storage.prototype.setItem;
    try {
      Storage.prototype.setItem = () => {
        throw new Error('Simulated QuotaExceededError: storage capacity exceeded');
      };
      const result = saveBenchNote(judgeVanceId, 'c-101', 'Test draft content');
      assert.strictEqual(result, false, 'Must safely return false on setItem failure');
    } finally {
      Storage.prototype.setItem = originalSetItem;
    }
  });

  test('clearBenchNote safely handles exceptions if sessionStorage.removeItem throws without crashing', () => {
    const originalRemoveItem = Storage.prototype.removeItem;
    try {
      Storage.prototype.removeItem = () => {
        throw new Error('Simulated StorageError: unable to remove item');
      };
      assert.doesNotThrow(() => {
        clearBenchNote(judgeVanceId, 'c-101');
      }, 'Must not throw if removeItem fails');
    } finally {
      Storage.prototype.removeItem = originalRemoveItem;
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Case Selection, Inspection & Helper-Level Ownership Logic
// ---------------------------------------------------------------------------

describe('Judge Dashboard - Helper-Level Case Selection & Inspection Logic', () => {
  const judgeVanceId = '00000000-0000-0000-0000-000000000001';
  const judgeSterlingId = '00000000-0000-0000-0000-000000000002';
  const judgeRostovaId = '00000000-0000-0000-0000-000000000003';

  test('isCaseAssignedToJudge correctly verifies case ownership against assigned cases and hearings', () => {
    // Vance assigned cases: c-101, c-103, c-105, c-107
    assert.strictEqual(isCaseAssignedToJudge(judgeVanceId, 'c-101'), true);
    assert.strictEqual(isCaseAssignedToJudge(judgeVanceId, 'c-103'), true);
    assert.strictEqual(isCaseAssignedToJudge(judgeVanceId, 'c-102'), false);

    // Sterling assigned cases: c-102, c-106
    assert.strictEqual(isCaseAssignedToJudge(judgeSterlingId, 'c-102'), true);
    assert.strictEqual(isCaseAssignedToJudge(judgeSterlingId, 'c-106'), true);
    assert.strictEqual(isCaseAssignedToJudge(judgeSterlingId, 'c-101'), false);

    // Rostova assigned cases: c-104
    assert.strictEqual(isCaseAssignedToJudge(judgeRostovaId, 'c-104'), true);
    assert.strictEqual(isCaseAssignedToJudge(judgeRostovaId, 'c-102'), false);

    // Null or invalid inputs safely return false
    assert.strictEqual(isCaseAssignedToJudge(null, 'c-101'), false);
    assert.strictEqual(isCaseAssignedToJudge(judgeVanceId, null), false);
    assert.strictEqual(isCaseAssignedToJudge('', ''), false);
  });

  test('inspectJudgeCase selects requested case when assigned to judge', () => {
    const selected = inspectJudgeCase(judgeVanceId, 'c-101');
    assert.strictEqual(selected, 'c-101');

    const detail = getMockCaseDetail(judgeVanceId, selected);
    assert.ok(detail);
    assert.strictEqual(detail?.case_number, 'CR-2026-00104');
  });

  test('inspectJudgeCase invalidates selection when case is unassigned or invalid', () => {
    // c-102 is assigned to Sterling, NOT Vance
    const unassigned = inspectJudgeCase(judgeVanceId, 'c-102');
    assert.strictEqual(unassigned, 'c-102');
    // Details must be unavailable for unassigned case
    assert.strictEqual(getMockCaseDetail(judgeVanceId, unassigned), null);

    // Completely nonexistent case ID
    const nonexistent = inspectJudgeCase(judgeVanceId, 'c-999');
    assert.strictEqual(nonexistent, 'c-999');
    assert.strictEqual(getMockCaseDetail(judgeVanceId, nonexistent), null);

    // Empty or null case ID invalidates to marker
    const emptyCase = inspectJudgeCase(judgeVanceId, '');
    assert.strictEqual(emptyCase, '__invalid__');
    assert.strictEqual(getMockCaseDetail(judgeVanceId, emptyCase), null);
  });

  test('inspecting an invalid case after a valid case invalidates selection rather than retaining previous case', () => {
    // Step 1: Judge Vance successfully inspects valid case c-101
    const initialSelection = inspectJudgeCase(judgeVanceId, 'c-101');
    assert.strictEqual(initialSelection, 'c-101');
    const initialDetail = getMockCaseDetail(judgeVanceId, initialSelection);
    assert.strictEqual(initialDetail?.case_number, 'CR-2026-00104');

    // Step 2: Judge Vance inspects an unassigned case (e.g. c-102 belonging to Sterling)
    // Must NOT retain 'c-101'
    const nextSelection = inspectJudgeCase(judgeVanceId, 'c-102');
    assert.strictEqual(nextSelection, 'c-102');
    assert.notStrictEqual(
      nextSelection,
      initialSelection,
      'Must replace previous case selection c-101 with invalid selection'
    );

    // Step 3: Case details lookup on the invalidated selection returns null
    const nextDetail = getMockCaseDetail(judgeVanceId, nextSelection);
    assert.strictEqual(
      nextDetail,
      null,
      'Must show Case Details Unavailable (null) rather than previous c-101 details'
    );
  });

  test("resolveEffectiveCaseId helper resets unassigned case ID to judge default case upon identity change", () => {
    // Judge Vance has c-101 selected
    const vanceSelected = resolveEffectiveCaseId(judgeVanceId, 'c-101');
    assert.strictEqual(vanceSelected, 'c-101');

    // Identity changes to Judge Sterling while candidate case was 'c-101'
    // Because c-101 is NOT assigned to Sterling, resolveEffectiveCaseId revalidates to Sterling's default case
    const sterlingRevalidated = resolveEffectiveCaseId(judgeSterlingId, 'c-101');
    assert.strictEqual(sterlingRevalidated, 'c-102');
    assert.notStrictEqual(sterlingRevalidated, 'c-101');

    // Identity changes to Judge Rostova while candidate case was 'c-102'
    // Because c-102 is NOT assigned to Rostova, it revalidates to Rostova's default case
    const rostovaRevalidated = resolveEffectiveCaseId(judgeRostovaId, 'c-102');
    assert.strictEqual(rostovaRevalidated, 'c-104');
    assert.notStrictEqual(rostovaRevalidated, 'c-102');
  });

  test('helper-level case lookup and draft note isolation prevent cross-judge data leakage when switching judge IDs', () => {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.clear();
    }

    // Step 1: Judge Vance is evaluated with c-101 and drafts a note
    const vanceCase = resolveEffectiveCaseId(judgeVanceId, 'c-101');
    const vanceDetails = getMockCaseDetail(judgeVanceId, vanceCase);
    saveBenchNote(judgeVanceId, vanceCase, 'Judge Vance draft ruling on Arthur Pendelton');

    assert.strictEqual(vanceDetails?.case_title, 'State vs. Arthur Pendelton');
    assert.strictEqual(
      getInitialBenchNote(judgeVanceId, vanceCase),
      'Judge Vance draft ruling on Arthur Pendelton'
    );

    // Step 2: Evaluate lookups as Judge Sterling with stale input 'c-101'
    // 2a: Ownership check denies Vance's case to Sterling
    const sterlingIllegalLookup = getMockCaseDetail(judgeSterlingId, 'c-101');
    assert.strictEqual(sterlingIllegalLookup, null, 'Sterling cannot inspect Vance case');

    // 2b: Case revalidation helper resets to Sterling's own docket
    const sterlingEffectiveCase = resolveEffectiveCaseId(judgeSterlingId, 'c-101');
    assert.strictEqual(sterlingEffectiveCase, 'c-102');

    // 2c: Case details retrieved belong strictly to Sterling
    const sterlingDetails = getMockCaseDetail(judgeSterlingId, sterlingEffectiveCase);
    assert.strictEqual(
      sterlingDetails?.case_title,
      'Metro Transit Authority vs. Global Logistics'
    );

    // 2d: Sterling's draft note for their own case is blank (not Vance's note!)
    const sterlingDraft = getInitialBenchNote(judgeSterlingId, sterlingEffectiveCase);
    assert.strictEqual(sterlingDraft, '', "Sterling's draft for c-102 must start blank");

    // 2e: Even if Sterling somehow queried c-101 notes, it is blank
    const sterlingC101Draft = getInitialBenchNote(judgeSterlingId, 'c-101');
    assert.strictEqual(sterlingC101Draft, '', "Sterling cannot access Vance's c-101 draft");
  });

  test('resolveEffectiveCaseId returns empty string for unlinked accounts', () => {
    assert.strictEqual(resolveEffectiveCaseId(null, 'c-101'), '');
    assert.strictEqual(resolveEffectiveCaseId(undefined, 'c-101'), '');
    assert.strictEqual(resolveEffectiveCaseId('', 'c-101'), '');
  });
});

// ---------------------------------------------------------------------------
// 4. Clerk Filings & Accurate Mock Statuses
// ---------------------------------------------------------------------------

describe('Clerk Dashboard - Filing Status Accuracy', () => {
  test('mock filings feature diverse, realistic procedural statuses rather than hardcoded Accepted', () => {
    const statuses = MOCK_RECENT_FILINGS.map(getMockFilingStatus);

    // Must not be all 'Accepted'
    assert.ok(statuses.includes('Pending Review'), 'Must include Pending Review filings');
    assert.ok(statuses.includes('Accepted'), 'Must include Accepted filings');
    assert.ok(statuses.includes('Under Review'), 'Must include Under Review filings');
    assert.ok(!statuses.every((s) => s === 'Accepted'), 'Must not hardcode all filings to Accepted');
  });

  test('getMockFilingStatus safely falls back to Pending Review when status is missing', () => {
    const dummyFiling = {
      filing_id: 'test',
      case_id: 'c-test',
      case_number: 'TEST-01',
      filing_type: 'Motion',
      filing_date: null,
      party_name: 'Test Party',
    };
    assert.strictEqual(getMockFilingStatus(dummyFiling), 'Pending Review');
  });
});

// ---------------------------------------------------------------------------
// 5. Date and Time Formatting Safeguards
// ---------------------------------------------------------------------------

describe('Dashboard Date & Time Safeguards', () => {
  test('formatDateSafe protects against null, undefined, or empty strings', () => {
    assert.strictEqual(formatDateSafe(null), '—');
    assert.strictEqual(formatDateSafe(undefined), '—');
    assert.strictEqual(formatDateSafe(''), '—');
  });

  test('formatDateSafe safely handles invalid date strings without crashing or returning NaN', () => {
    assert.strictEqual(formatDateSafe('not-a-valid-date'), '—');
    assert.strictEqual(formatDateSafe('2026-99-99'), '—');
  });

  test('formatDateSafe formats valid ISO strings', () => {
    const formatted = formatDateSafe('2026-11-10T09:30:00Z');
    assert.ok(formatted !== '—');
    assert.ok(formatted.length > 0);
  });

  test('formatTimeSafe protects against invalid date strings', () => {
    assert.strictEqual(formatTimeSafe(null), '');
    assert.strictEqual(formatTimeSafe(undefined), '');
    assert.strictEqual(formatTimeSafe('invalid-date'), '');
  });

  test('formatDateTimeSafe protects against invalid inputs', () => {
    assert.strictEqual(formatDateTimeSafe(null), '—');
    assert.strictEqual(formatDateTimeSafe('invalid-timestamp'), '—');
  });
});

// ---------------------------------------------------------------------------
// 6. Schema Conformance Tests
// ---------------------------------------------------------------------------

describe('Dashboard Data Models - Schema Conformance', () => {
  test('mock admin dashboard data conforms to AdminDashboardData schema', () => {
    assert.strictEqual(typeof MOCK_ADMIN_DASHBOARD.total_cases, 'number');
    assert.ok(MOCK_ADMIN_DASHBOARD.total_cases > 0);
    assert.strictEqual(typeof MOCK_ADMIN_DASHBOARD.cases_by_status, 'object');
    assert.strictEqual(typeof MOCK_ADMIN_DASHBOARD.judges.total, 'number');
    assert.strictEqual(typeof MOCK_ADMIN_DASHBOARD.judges.active, 'number');
    assert.ok(Array.isArray(MOCK_ADMIN_DASHBOARD.upcoming_hearings));
    assert.ok(Array.isArray(MOCK_ADMIN_DASHBOARD.recent_audit_activity));
    assert.strictEqual(typeof MOCK_ADMIN_DASHBOARD.total_parties, 'number');
  });

  test('mock clerk dashboard data conforms to ClerkDashboardData schema', () => {
    assert.strictEqual(typeof MOCK_CLERK_DASHBOARD.total_cases, 'number');
    assert.ok(Array.isArray(MOCK_CLERK_DASHBOARD.recent_cases));
    assert.ok(Array.isArray(MOCK_CLERK_DASHBOARD.upcoming_hearings));
    assert.ok(Array.isArray(MOCK_CLERK_DASHBOARD.recent_filings));
    assert.strictEqual(typeof MOCK_CLERK_DASHBOARD.operational_summary.total_cases, 'number');
    assert.strictEqual(typeof MOCK_CLERK_DASHBOARD.operational_summary.active_cases, 'number');
    assert.strictEqual(typeof MOCK_CLERK_DASHBOARD.operational_summary.filed_cases, 'number');
    assert.strictEqual(typeof MOCK_CLERK_DASHBOARD.operational_summary.upcoming_hearings_count, 'number');
    assert.strictEqual(typeof MOCK_CLERK_DASHBOARD.operational_summary.recent_filings_count, 'number');
  });

  test('all judge mock datasets conform to JudgeDashboardData schema', () => {
    for (const [judgeId, judgeData] of Object.entries(MOCK_JUDGE_DASHBOARDS_BY_ID)) {
      assert.strictEqual(judgeData.judge_id, judgeId);
      assert.ok(Array.isArray(judgeData.upcoming_hearings));
      assert.strictEqual(typeof judgeData.assigned_hearings_count, 'number');
      assert.strictEqual(judgeData.assigned_hearings_count, judgeData.upcoming_hearings.length);

      for (const hearing of judgeData.upcoming_hearings) {
        assert.ok(hearing.case_number, 'Judge hearing must have a valid case_number');
        assert.ok(hearing.case_status, 'Judge hearing must have a case_status');
      }
    }
  });
});
