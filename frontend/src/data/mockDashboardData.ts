/**
 * Court Case Management System - Typed Mock & Placeholder Dashboard Data
 * Strictly adheres to backend schemas defined in frontend/src/types/index.ts.
 * Provides rich, realistic judicial datasets for Phase 6 Step 5 presentation.
 */

import type {
  AdminDashboardData,
  ClerkDashboardData,
  JudgeDashboardData,
  SystemUpcomingHearing,
  JudgeUpcomingHearing,
  AuditLogSummary,
  RecentCase,
  RecentFiling,
  UserRole,
} from '../types';

// ---------------------------------------------------------------------------
// Shared System Upcoming Hearings (Admin & Clerk)
// ---------------------------------------------------------------------------

export const MOCK_SYSTEM_HEARINGS: SystemUpcomingHearing[] = [
  {
    hearing_id: 'h-001',
    case_id: 'c-101',
    case_number: 'CR-2026-00104',
    case_status: 'Active',
    judge_name: 'Hon. Justice Sarah Vance',
    start_time: '2026-11-10T09:30:00Z',
    end_time: '2026-11-10T11:00:00Z',
  },
  {
    hearing_id: 'h-002',
    case_id: 'c-102',
    case_number: 'CV-2026-00215',
    case_status: 'Active',
    judge_name: 'Hon. Judge Marcus Sterling',
    start_time: '2026-11-10T11:30:00Z',
    end_time: '2026-11-10T12:45:00Z',
  },
  {
    hearing_id: 'h-003',
    case_id: 'c-103',
    case_number: 'CR-2026-00388',
    case_status: 'Adjourned',
    judge_name: 'Hon. Justice Sarah Vance',
    start_time: '2026-11-11T10:00:00Z',
    end_time: '2026-11-11T12:00:00Z',
  },
  {
    hearing_id: 'h-004',
    case_id: 'c-104',
    case_number: 'CV-2026-00450',
    case_status: 'Filed',
    judge_name: 'Hon. Judge Elena Rostova',
    start_time: '2026-11-12T14:00:00Z',
    end_time: '2026-11-12T15:30:00Z',
  },
  {
    hearing_id: 'h-005',
    case_id: 'c-105',
    case_number: 'AP-2026-00512',
    case_status: 'Active',
    judge_name: 'Hon. Justice Sarah Vance',
    start_time: '2026-11-13T09:00:00Z',
    end_time: '2026-11-13T10:30:00Z',
  },
];

// ---------------------------------------------------------------------------
// Recent Audit Activity (Admin)
// ---------------------------------------------------------------------------

export const MOCK_AUDIT_LOGS: AuditLogSummary[] = [
  {
    log_id: 'log-801',
    case_id: 'c-101',
    action_type: 'HEARING_SCHEDULED',
    changed_at: '2026-11-06T08:15:00Z',
    username: 'clerk_records',
  },
  {
    log_id: 'log-802',
    case_id: 'c-104',
    action_type: 'CASE_STATUS_UPDATE',
    changed_at: '2026-11-06T07:42:00Z',
    username: 'admin_sys',
  },
  {
    log_id: 'log-803',
    case_id: 'c-102',
    action_type: 'DOCUMENT_FILED',
    changed_at: '2026-11-05T16:20:00Z',
    username: 'clerk_intake',
  },
  {
    log_id: 'log-804',
    case_id: 'c-103',
    action_type: 'PARTY_REGISTERED',
    changed_at: '2026-11-05T14:10:00Z',
    username: 'clerk_records',
  },
  {
    log_id: 'log-805',
    case_id: 'c-105',
    action_type: 'JUDICIAL_ASSIGNMENT',
    changed_at: '2026-11-05T11:05:00Z',
    username: 'admin_sys',
  },
];

// ---------------------------------------------------------------------------
// Recent Filings (Clerk) with Realistic Mock Statuses
// ---------------------------------------------------------------------------

export interface MockFilingRecord extends RecentFiling {
  status: 'Pending Review' | 'Accepted' | 'Under Review' | 'Rejected';
}

export const MOCK_RECENT_FILINGS: MockFilingRecord[] = [
  {
    filing_id: 'f-301',
    case_id: 'c-101',
    case_number: 'CR-2026-00104',
    filing_type: 'Emergency Motion for Bail',
    filing_date: '2026-11-06T08:00:00Z',
    party_name: 'Arthur Pendelton (Defendant)',
    status: 'Pending Review',
  },
  {
    filing_id: 'f-302',
    case_id: 'c-102',
    case_number: 'CV-2026-00215',
    filing_type: 'Affidavit of Process Service',
    filing_date: '2026-11-05T15:30:00Z',
    party_name: 'Metro Transit Authority (Plaintiff)',
    status: 'Accepted',
  },
  {
    filing_id: 'f-303',
    case_id: 'c-104',
    case_number: 'CV-2026-00450',
    filing_type: 'Initial Verified Complaint',
    filing_date: '2026-11-05T12:00:00Z',
    party_name: 'Highland Ridge HOA (Plaintiff)',
    status: 'Under Review',
  },
  {
    filing_id: 'f-304',
    case_id: 'c-105',
    case_number: 'AP-2026-00512',
    filing_type: 'Appellate Brief & Exhibits',
    filing_date: '2026-11-04T16:45:00Z',
    party_name: 'Apex Global Logistics (Appellant)',
    status: 'Pending Review',
  },
];

export function getMockFilingStatus(filing: RecentFiling): string {
  return (filing as MockFilingRecord).status || 'Pending Review';
}

// ---------------------------------------------------------------------------
// Recent Cases (Clerk & General)
// ---------------------------------------------------------------------------

export const MOCK_RECENT_CASES: RecentCase[] = [
  {
    case_id: 'c-101',
    case_number: 'CR-2026-00104',
    status: 'Active',
    filing_date: '2026-10-15T10:00:00Z',
  },
  {
    case_id: 'c-102',
    case_number: 'CV-2026-00215',
    status: 'Active',
    filing_date: '2026-10-18T11:30:00Z',
  },
  {
    case_id: 'c-103',
    case_number: 'CR-2026-00388',
    status: 'Adjourned',
    filing_date: '2026-10-22T09:15:00Z',
  },
  {
    case_id: 'c-104',
    case_number: 'CV-2026-00450',
    status: 'Filed',
    filing_date: '2026-11-01T14:00:00Z',
  },
  {
    case_id: 'c-105',
    case_number: 'AP-2026-00512',
    status: 'Active',
    filing_date: '2026-11-03T16:20:00Z',
  },
  {
    case_id: 'c-106',
    case_number: 'CV-2026-00089',
    status: 'Disposed',
    filing_date: '2026-09-12T10:00:00Z',
  },
];

// ---------------------------------------------------------------------------
// Judge Upcoming Hearings (Judge Specific - Separated by Judge ID)
// ---------------------------------------------------------------------------

export const MOCK_JUDGE_HEARINGS_VANCE: JudgeUpcomingHearing[] = [
  {
    hearing_id: 'jh-001',
    case_id: 'c-101',
    case_number: 'CR-2026-00104',
    case_status: 'Active',
    filing_date: '2026-10-15T10:00:00Z',
    start_time: '2026-11-10T09:30:00Z',
    end_time: '2026-11-10T11:00:00Z',
  },
  {
    hearing_id: 'jh-002',
    case_id: 'c-103',
    case_number: 'CR-2026-00388',
    case_status: 'Adjourned',
    filing_date: '2026-10-22T09:15:00Z',
    start_time: '2026-11-11T10:00:00Z',
    end_time: '2026-11-11T12:00:00Z',
  },
  {
    hearing_id: 'jh-003',
    case_id: 'c-105',
    case_number: 'AP-2026-00512',
    case_status: 'Active',
    filing_date: '2026-11-03T16:20:00Z',
    start_time: '2026-11-13T09:00:00Z',
    end_time: '2026-11-13T10:30:00Z',
  },
  {
    hearing_id: 'jh-004',
    case_id: 'c-107',
    case_number: 'CV-2026-00620',
    case_status: 'Active',
    filing_date: '2026-10-29T14:45:00Z',
    start_time: '2026-11-14T14:00:00Z',
    end_time: '2026-11-14T16:00:00Z',
  },
];

export const MOCK_JUDGE_HEARINGS_STERLING: JudgeUpcomingHearing[] = [
  {
    hearing_id: 'jh-005',
    case_id: 'c-102',
    case_number: 'CV-2026-00215',
    case_status: 'Active',
    filing_date: '2026-10-18T11:30:00Z',
    start_time: '2026-11-10T11:30:00Z',
    end_time: '2026-11-10T12:45:00Z',
  },
  {
    hearing_id: 'jh-006',
    case_id: 'c-106',
    case_number: 'CV-2026-00089',
    case_status: 'Disposed',
    filing_date: '2026-09-12T10:00:00Z',
    start_time: '2026-11-12T14:00:00Z',
    end_time: '2026-11-12T15:30:00Z',
  },
];

export const MOCK_JUDGE_HEARINGS_ROSTOVA: JudgeUpcomingHearing[] = [
  {
    hearing_id: 'jh-007',
    case_id: 'c-104',
    case_number: 'CV-2026-00450',
    case_status: 'Filed',
    filing_date: '2026-11-01T14:00:00Z',
    start_time: '2026-11-12T14:00:00Z',
    end_time: '2026-11-12T15:30:00Z',
  },
];

export const MOCK_JUDGE_HEARINGS_REYNOLDS: JudgeUpcomingHearing[] = [
  {
    hearing_id: 'jh-008',
    case_id: 'c-108',
    case_number: 'PB-2026-00701',
    case_status: 'Active',
    filing_date: '2026-10-05T09:00:00Z',
    start_time: '2026-11-15T10:00:00Z',
    end_time: '2026-11-15T11:30:00Z',
  },
];

// Fallback legacy export
export const MOCK_JUDGE_HEARINGS = MOCK_JUDGE_HEARINGS_VANCE;

// ---------------------------------------------------------------------------
// Role Payloads
// ---------------------------------------------------------------------------

export const MOCK_ADMIN_DASHBOARD: AdminDashboardData = {
  total_cases: 1000,
  cases_by_status: {
    Active: 520,
    Filed: 180,
    Adjourned: 110,
    Disposed: 140,
    Closed: 50,
  },
  judges: {
    total: 12,
    active: 10,
  },
  total_parties: 1840,
  upcoming_hearings: MOCK_SYSTEM_HEARINGS,
  recent_audit_activity: MOCK_AUDIT_LOGS,
};

export const MOCK_CLERK_DASHBOARD: ClerkDashboardData = {
  total_cases: 1000,
  cases_by_status: {
    Active: 520,
    Filed: 180,
    Adjourned: 110,
    Disposed: 140,
    Closed: 50,
  },
  recent_cases: MOCK_RECENT_CASES,
  upcoming_hearings: MOCK_SYSTEM_HEARINGS,
  recent_filings: MOCK_RECENT_FILINGS,
  operational_summary: {
    total_cases: 1000,
    active_cases: 520,
    filed_cases: 180,
    upcoming_hearings_count: 24,
    recent_filings_count: 38,
  },
};

// ---------------------------------------------------------------------------
// Deterministic Multi-Judge Dashboards by Judge ID
// ---------------------------------------------------------------------------

export const MOCK_JUDGE_DASHBOARDS_BY_ID: Record<string, JudgeDashboardData> = {
  '00000000-0000-0000-0000-000000000001': {
    judge_id: '00000000-0000-0000-0000-000000000001',
    upcoming_hearings: MOCK_JUDGE_HEARINGS_VANCE,
    assigned_hearings_count: MOCK_JUDGE_HEARINGS_VANCE.length,
  },
  '00000000-0000-0000-0000-000000000002': {
    judge_id: '00000000-0000-0000-0000-000000000002',
    upcoming_hearings: MOCK_JUDGE_HEARINGS_STERLING,
    assigned_hearings_count: MOCK_JUDGE_HEARINGS_STERLING.length,
  },
  '00000000-0000-0000-0000-000000000003': {
    judge_id: '00000000-0000-0000-0000-000000000003',
    upcoming_hearings: MOCK_JUDGE_HEARINGS_ROSTOVA,
    assigned_hearings_count: MOCK_JUDGE_HEARINGS_ROSTOVA.length,
  },
  '00000000-0000-0000-0000-000000000004': {
    judge_id: '00000000-0000-0000-0000-000000000004',
    upcoming_hearings: MOCK_JUDGE_HEARINGS_REYNOLDS,
    assigned_hearings_count: MOCK_JUDGE_HEARINGS_REYNOLDS.length,
  },
};

export const MOCK_JUDGE_DASHBOARD: JudgeDashboardData =
  MOCK_JUDGE_DASHBOARDS_BY_ID['00000000-0000-0000-0000-000000000001'];

export function getMockJudgeDashboard(judgeId: string | null | undefined): JudgeDashboardData | null {
  if (!judgeId) return null;
  return MOCK_JUDGE_DASHBOARDS_BY_ID[judgeId] || null;
}

// ---------------------------------------------------------------------------
// Presentational Support Data (Users, Judges Roster, Parties, Case Details)
// Strictly isolated for Phase 6 Step 5 UI presentation before Step 6 API wiring.
// ---------------------------------------------------------------------------

export interface SystemUserRecord {
  user_id: number;
  username: string;
  role: UserRole;
  judge_id: string | null;
  status: 'Active' | 'Suspended';
  created_at: string;
}

export const MOCK_SYSTEM_USERS: SystemUserRecord[] = [
  {
    user_id: 1,
    username: 'admin_master',
    role: 'admin',
    judge_id: null,
    status: 'Active',
    created_at: '2026-01-10',
  },
  {
    user_id: 2,
    username: 'clerk_records',
    role: 'clerk',
    judge_id: null,
    status: 'Active',
    created_at: '2026-01-15',
  },
  {
    user_id: 3,
    username: 'clerk_intake',
    role: 'clerk',
    judge_id: null,
    status: 'Active',
    created_at: '2026-02-01',
  },
  {
    user_id: 4,
    username: 'judge_vance',
    role: 'judge',
    judge_id: '00000000-0000-0000-0000-000000000001',
    status: 'Active',
    created_at: '2026-01-05',
  },
  {
    user_id: 5,
    username: 'judge_sterling',
    role: 'judge',
    judge_id: '00000000-0000-0000-0000-000000000002',
    status: 'Active',
    created_at: '2026-01-12',
  },
  {
    user_id: 6,
    username: 'judge_rostova',
    role: 'judge',
    judge_id: '00000000-0000-0000-0000-000000000003',
    status: 'Active',
    created_at: '2026-02-14',
  },
];

export interface JudicialOfficerRecord {
  judge_id: string;
  name: string;
  division: string;
  courtroom: string;
  active_cases_count: number;
  status: 'Active' | 'On Leave';
}

export const MOCK_JUDICIAL_ROSTER: JudicialOfficerRecord[] = [
  {
    judge_id: '00000000-0000-0000-0000-000000000001',
    name: 'Hon. Justice Sarah Vance',
    division: 'Criminal Division 1',
    courtroom: 'Courtroom 4A',
    active_cases_count: 48,
    status: 'Active',
  },
  {
    judge_id: '00000000-0000-0000-0000-000000000002',
    name: 'Hon. Judge Marcus Sterling',
    division: 'Commercial & Civil Division',
    courtroom: 'Courtroom 2B',
    active_cases_count: 62,
    status: 'Active',
  },
  {
    judge_id: '00000000-0000-0000-0000-000000000003',
    name: 'Hon. Judge Elena Rostova',
    division: 'Appellate & Special Proceedings',
    courtroom: 'Courtroom 5C',
    active_cases_count: 35,
    status: 'Active',
  },
  {
    judge_id: '00000000-0000-0000-0000-000000000004',
    name: 'Hon. Judge David K. Reynolds',
    division: 'Family & Probate Division',
    courtroom: 'Courtroom 1A',
    active_cases_count: 51,
    status: 'Active',
  },
];

export function getMockJudicialOfficer(judgeId: string | null | undefined): JudicialOfficerRecord | null {
  if (!judgeId) return null;
  return MOCK_JUDICIAL_ROSTER.find((j) => j.judge_id === judgeId) || null;
}

export interface PartyRecord {
  party_id: string;
  name: string;
  type: 'Plaintiff' | 'Defendant' | 'Petitioner' | 'Respondent' | 'Appellant';
  linked_case_number: string;
  counsel_name: string;
  contact_status: 'Verified' | 'Pending Service';
}

export const MOCK_PARTIES_ROSTER: PartyRecord[] = [
  {
    party_id: 'p-1',
    name: 'Arthur Pendelton',
    type: 'Defendant',
    linked_case_number: 'CR-2026-00104',
    counsel_name: 'David Vance, Esq.',
    contact_status: 'Verified',
  },
  {
    party_id: 'p-2',
    name: 'Metro Transit Authority',
    type: 'Plaintiff',
    linked_case_number: 'CV-2026-00215',
    counsel_name: 'Kensington Legal Partners',
    contact_status: 'Verified',
  },
  {
    party_id: 'p-3',
    name: 'Apex Global Logistics LLC',
    type: 'Appellant',
    linked_case_number: 'AP-2026-00512',
    counsel_name: 'Patterson & Cole LLP',
    contact_status: 'Verified',
  },
  {
    party_id: 'p-4',
    name: 'Highland Ridge HOA',
    type: 'Plaintiff',
    linked_case_number: 'CV-2026-00450',
    counsel_name: 'Sarah Jenkins, Esq.',
    contact_status: 'Pending Service',
  },
];

export interface PresidingCaseRecord {
  case_id: string;
  case_number: string;
  case_title: string;
  status: string;
  filing_date: string;
  next_hearing_date: string | null;
  stage: string;
}

// ---------------------------------------------------------------------------
// Assigned Cases Partitioned by Presiding Judge ID
// ---------------------------------------------------------------------------

export const MOCK_JUDGE_ASSIGNED_CASES_BY_ID: Record<string, PresidingCaseRecord[]> = {
  '00000000-0000-0000-0000-000000000001': [
    {
      case_id: 'c-101',
      case_number: 'CR-2026-00104',
      case_title: 'State vs. Arthur Pendelton',
      status: 'Active',
      filing_date: '2026-10-15',
      next_hearing_date: '2026-11-10 09:30 AM',
      stage: 'Pre-Trial Motions',
    },
    {
      case_id: 'c-103',
      case_number: 'CR-2026-00388',
      case_title: 'Commonwealth vs. Vance Enterprises',
      status: 'Adjourned',
      filing_date: '2026-10-22',
      next_hearing_date: '2026-11-11 10:00 AM',
      stage: 'Discovery Review',
    },
    {
      case_id: 'c-105',
      case_number: 'AP-2026-00512',
      case_title: 'Apex Global Logistics v. Department of Revenue',
      status: 'Active',
      filing_date: '2026-11-03',
      next_hearing_date: '2026-11-13 09:00 AM',
      stage: 'Appellate Oral Argument',
    },
    {
      case_id: 'c-107',
      case_number: 'CV-2026-00620',
      case_title: 'Beacon Health Systems vs. Sterling Medical',
      status: 'Active',
      filing_date: '2026-10-29',
      next_hearing_date: '2026-11-14 02:00 PM',
      stage: 'Evidentiary Hearing',
    },
  ],
  '00000000-0000-0000-0000-000000000002': [
    {
      case_id: 'c-102',
      case_number: 'CV-2026-00215',
      case_title: 'Metro Transit Authority vs. Global Logistics',
      status: 'Active',
      filing_date: '2026-10-18',
      next_hearing_date: '2026-11-10 11:30 AM',
      stage: 'Civil Pleadings & Injunction',
    },
    {
      case_id: 'c-106',
      case_number: 'CV-2026-00089',
      case_title: 'City of Fairview vs. Harbor Dredging Co.',
      status: 'Disposed',
      filing_date: '2026-09-12',
      next_hearing_date: null,
      stage: 'Final Judgment Executed',
    },
  ],
  '00000000-0000-0000-0000-000000000003': [
    {
      case_id: 'c-104',
      case_number: 'CV-2026-00450',
      case_title: 'Highland Ridge HOA vs. Miller Estate',
      status: 'Filed',
      filing_date: '2026-11-01',
      next_hearing_date: '2026-11-12 02:00 PM',
      stage: 'Initial Summons & Intake',
    },
  ],
  '00000000-0000-0000-0000-000000000004': [
    {
      case_id: 'c-108',
      case_number: 'PB-2026-00701',
      case_title: 'In re Estate of Eleanor Thorne',
      status: 'Active',
      filing_date: '2026-10-05',
      next_hearing_date: '2026-11-15 10:00 AM',
      stage: 'Probate Testamentary Hearing',
    },
  ],
};

export const MOCK_JUDGE_ASSIGNED_CASES: PresidingCaseRecord[] =
  MOCK_JUDGE_ASSIGNED_CASES_BY_ID['00000000-0000-0000-0000-000000000001'];

export function getMockJudgeAssignedCases(judgeId: string | null | undefined): PresidingCaseRecord[] {
  if (!judgeId) return [];
  return MOCK_JUDGE_ASSIGNED_CASES_BY_ID[judgeId] || [];
}

// ---------------------------------------------------------------------------
// Deterministic Case Details by Case ID
// ---------------------------------------------------------------------------

export interface CaseDetailView {
  case_id: string;
  case_number: string;
  case_title: string;
  case_type: string;
  status: string;
  filing_date: string;
  presiding_judge: string;
  courtroom: string;
  parties: { role: string; name: string; counsel: string }[];
  summary: string;
  orders: { date: string; title: string; signed: boolean }[];
}

export const MOCK_CASE_DETAILS_BY_ID: Record<string, CaseDetailView> = {
  'c-101': {
    case_id: 'c-101',
    case_number: 'CR-2026-00104',
    case_title: 'State vs. Arthur Pendelton',
    case_type: 'Criminal - Felony Indictment',
    status: 'Active',
    filing_date: '2026-10-15',
    presiding_judge: 'Hon. Justice Sarah Vance',
    courtroom: 'Courtroom 4A (Bench Division)',
    parties: [
      { role: 'Prosecution', name: 'Office of the District Attorney', counsel: 'ADA Rebecca Stone' },
      { role: 'Defendant', name: 'Arthur Pendelton', counsel: 'David Vance, Esq. (Appointed)' },
    ],
    summary:
      'Indictment concerning alleged financial misrepresentation and grand larceny under Penal Code Section 484. Preliminary hearings concluded; defense has filed a motion for bail reconsideration.',
    orders: [
      { date: '2026-10-16', title: 'Order of Arraignment & Pre-Trial Conditions', signed: true },
      { date: '2026-10-28', title: 'Scheduling Order for Evidentiary Motions', signed: true },
    ],
  },
  'c-102': {
    case_id: 'c-102',
    case_number: 'CV-2026-00215',
    case_title: 'Metro Transit Authority vs. Global Logistics',
    case_type: 'Civil - Commercial Breach of Contract',
    status: 'Active',
    filing_date: '2026-10-18',
    presiding_judge: 'Hon. Judge Marcus Sterling',
    courtroom: 'Courtroom 2B (Commercial Division)',
    parties: [
      { role: 'Plaintiff', name: 'Metro Transit Authority', counsel: 'Kensington Legal Partners' },
      { role: 'Defendant', name: 'Apex Global Logistics LLC', counsel: 'Patterson & Cole LLP' },
    ],
    summary:
      'Contractual dispute regarding non-delivery of municipal fleet components and liquidated damages clause enforcement. Cross-motions for partial summary judgment pending.',
    orders: [
      { date: '2026-10-25', title: 'Preliminary Injunction on Escrow Accounts', signed: true },
      { date: '2026-11-02', title: 'Discovery Schedule & Deposition Order', signed: true },
    ],
  },
  'c-103': {
    case_id: 'c-103',
    case_number: 'CR-2026-00388',
    case_title: 'Commonwealth vs. Vance Enterprises',
    case_type: 'Criminal - Corporate Compliance & Fraud',
    status: 'Adjourned',
    filing_date: '2026-10-22',
    presiding_judge: 'Hon. Justice Sarah Vance',
    courtroom: 'Courtroom 4A (Bench Division)',
    parties: [
      { role: 'Prosecution', name: 'Special Prosecution Unit', counsel: 'Special Counsel Marcus Brody' },
      { role: 'Defendant', name: 'Vance Enterprises Inc.', counsel: 'Latham & Watkins LLP' },
    ],
    summary:
      'Indictment regarding environmental dumping disclosures and false regulatory reporting. Adjourned pending forensic audit report delivery by court-appointed referee.',
    orders: [
      { date: '2026-10-24', title: 'Order for Independent Accounting Audit', signed: true },
      { date: '2026-11-01', title: 'Adjournment Order until Nov 11, 2026', signed: true },
    ],
  },
  'c-104': {
    case_id: 'c-104',
    case_number: 'CV-2026-00450',
    case_title: 'Highland Ridge HOA vs. Miller Estate',
    case_type: 'Civil - Property Injunction & Easement',
    status: 'Filed',
    filing_date: '2026-11-01',
    presiding_judge: 'Hon. Judge Elena Rostova',
    courtroom: 'Courtroom 5C (Special Proceedings)',
    parties: [
      { role: 'Plaintiff', name: 'Highland Ridge HOA', counsel: 'Sarah Jenkins, Esq.' },
      { role: 'Defendant', name: 'Miller Family Trust', counsel: 'Pro Se / Representation Pending' },
    ],
    summary:
      'Petition for emergency injunction regarding unauthorized commercial construction on shared community drainage easement. Summons issued; return date set for Nov 12.',
    orders: [
      { date: '2026-11-02', title: 'Temporary Restraining Order on Ground Excavation', signed: true },
    ],
  },
  'c-105': {
    case_id: 'c-105',
    case_number: 'AP-2026-00512',
    case_title: 'Apex Global Logistics v. Department of Revenue',
    case_type: 'Appellate - Administrative Tax Assessment',
    status: 'Active',
    filing_date: '2026-11-03',
    presiding_judge: 'Hon. Justice Sarah Vance',
    courtroom: 'Courtroom 4A (Appellate Bench)',
    parties: [
      { role: 'Appellant', name: 'Apex Global Logistics LLC', counsel: 'Patterson & Cole LLP' },
      { role: 'Appellee', name: 'State Department of Revenue', counsel: 'Assistant AG Thomas Clarke' },
    ],
    summary:
      'Administrative law appeal concerning commercial interstate carrier fuel tax credits and statutory apportionment formulas under Administrative Code Section 12-401.',
    orders: [
      { date: '2026-11-04', title: 'Order Granting Expedited Oral Argument', signed: true },
    ],
  },
  'c-106': {
    case_id: 'c-106',
    case_number: 'CV-2026-00089',
    case_title: 'City of Fairview vs. Harbor Dredging Co.',
    case_type: 'Civil - Municipal Environmental Compliance',
    status: 'Disposed',
    filing_date: '2026-09-12',
    presiding_judge: 'Hon. Judge Marcus Sterling',
    courtroom: 'Courtroom 2B (Commercial Division)',
    parties: [
      { role: 'Plaintiff', name: 'City of Fairview', counsel: 'City Solicitor Donald Hayes' },
      { role: 'Defendant', name: 'Harbor Dredging Company', counsel: 'Vanguard Maritime Law' },
    ],
    summary:
      'Consent decree entered resolving waterway sediment disposal violations. Settlement terms satisfied; formal disposition entered on docket.',
    orders: [
      { date: '2026-09-30', title: 'Consent Decree & Remediation Order', signed: true },
      { date: '2026-10-30', title: 'Final Judgment & Order of Dismissal with Prejudice', signed: true },
    ],
  },
  'c-107': {
    case_id: 'c-107',
    case_number: 'CV-2026-00620',
    case_title: 'Beacon Health Systems vs. Sterling Medical',
    case_type: 'Civil - Medical Device Patent & Trade Secrets',
    status: 'Active',
    filing_date: '2026-10-29',
    presiding_judge: 'Hon. Justice Sarah Vance',
    courtroom: 'Courtroom 4A (Bench Division)',
    parties: [
      { role: 'Plaintiff', name: 'Beacon Health Systems Inc.', counsel: 'WilmerHale LLP' },
      { role: 'Defendant', name: 'Sterling Medical Technologies', counsel: 'Kirkland & Ellis LLP' },
    ],
    summary:
      'Action for injunctive relief and damages alleging misappropriation of surgical telemetry algorithms and breach of non-disclosure covenants.',
    orders: [
      { date: '2026-10-31', title: 'Protective Order Governing Confidential Discovery', signed: true },
    ],
  },
  'c-108': {
    case_id: 'c-108',
    case_number: 'PB-2026-00701',
    case_title: 'In re Estate of Eleanor Thorne',
    case_type: 'Probate - Will Contest & Estate Administration',
    status: 'Active',
    filing_date: '2026-10-05',
    presiding_judge: 'Hon. Judge David K. Reynolds',
    courtroom: 'Courtroom 1A (Probate Division)',
    parties: [
      { role: 'Petitioner', name: 'Christopher Thorne (Executor)', counsel: 'Bradley & Foster LLP' },
      { role: 'Contestant', name: 'Victoria Thorne (Heir)', counsel: 'Harrison Estate Law' },
    ],
    summary:
      'Contest over testamentary capacity and alleged undue influence concerning the 2024 Codicil of decedent Eleanor Thorne. Expert medical depositions ordered.',
    orders: [
      { date: '2026-10-12', title: 'Order Appointing Special Administrator Pendente Lite', signed: true },
      { date: '2026-11-02', title: 'Order for Evidentiary Hearing on Nov 15, 2026', signed: true },
    ],
  },
};

export const MOCK_CASE_DETAIL: CaseDetailView = MOCK_CASE_DETAILS_BY_ID['c-101'];

// ---------------------------------------------------------------------------
// Case Assignment & Ownership Verification (Judge-Scoped)
// ---------------------------------------------------------------------------

export function isCaseAssignedToJudge(
  judgeId: string | null | undefined,
  caseId: string | null | undefined,
): boolean {
  if (!judgeId || !caseId) return false;

  // Verify against presiding cases assigned to the judge
  const assigned = getMockJudgeAssignedCases(judgeId);
  if (assigned.some((c) => c.case_id === caseId)) {
    return true;
  }

  // Verify against upcoming hearings assigned to the judge
  const dashboard = getMockJudgeDashboard(judgeId);
  if (dashboard?.upcoming_hearings.some((h) => h.case_id === caseId)) {
    return true;
  }

  return false;
}

export function resolveEffectiveCaseId(
  judgeId: string | null | undefined,
  selectedCaseId: string | null | undefined,
): string {
  if (!judgeId) return '';
  const assigned = getMockJudgeAssignedCases(judgeId);
  const dashboard = getMockJudgeDashboard(judgeId);
  const defaultCaseId =
    assigned[0]?.case_id ?? dashboard?.upcoming_hearings[0]?.case_id ?? '';

  if (!selectedCaseId) return defaultCaseId;

  // Revalidate: if selectedCaseId belongs to this judge, retain it; otherwise reset to default
  if (isCaseAssignedToJudge(judgeId, selectedCaseId)) {
    return selectedCaseId;
  }

  return defaultCaseId;
}

export function inspectJudgeCase(
  judgeId: string | null | undefined,
  caseId: string | null | undefined,
): string {
  if (isCaseAssignedToJudge(judgeId, caseId)) {
    return caseId!;
  }
  // Invalidate selected case so previous case details are not retained
  return caseId || '__invalid__';
}

export function getMockCaseDetail(
  judgeId: string | null | undefined,
  caseId: string | null | undefined,
): CaseDetailView | null {
  if (!judgeId || !caseId) return null;

  // Strict ownership check: case must be assigned to this judge
  if (!isCaseAssignedToJudge(judgeId, caseId)) {
    return null;
  }

  return MOCK_CASE_DETAILS_BY_ID[caseId] || null;
}

// ---------------------------------------------------------------------------
// Bench Notes Session Storage Helpers (Judge-Scoped & Case-Scoped)
// ---------------------------------------------------------------------------

export function getBenchNoteStorageKey(
  judgeId: string | null | undefined,
  caseId: string | null | undefined,
): string | null {
  if (!judgeId || !caseId) return null;
  return `bench_note_${judgeId}_${caseId}`;
}

export function getInitialBenchNote(
  judgeId: string | null | undefined,
  caseId: string | null | undefined,
): string {
  if (!judgeId || !caseId) return '';
  const key = getBenchNoteStorageKey(judgeId, caseId);
  if (!key) return '';
  try {
    if (typeof sessionStorage !== 'undefined') {
      const saved = sessionStorage.getItem(key);
      if (saved !== null) return saved;
    }
  } catch {
    // Session storage access restricted or unavailable
  }
  // New notes must start completely blank — no fabricated default text
  return '';
}

export function saveBenchNote(
  judgeId: string | null | undefined,
  caseId: string | null | undefined,
  noteText: string,
): boolean {
  if (!judgeId || !caseId) return false;
  const key = getBenchNoteStorageKey(judgeId, caseId);
  if (!key) return false;
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(key, noteText);
      return true;
    }
  } catch {
    // Session storage write failed or restricted
  }
  return false;
}

export function clearBenchNote(
  judgeId: string | null | undefined,
  caseId: string | null | undefined,
): void {
  if (!judgeId || !caseId) return;
  const key = getBenchNoteStorageKey(judgeId, caseId);
  if (!key) return;
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(key);
    }
  } catch {
    // Session storage remove failed
  }
}
