/**
 * Court Case Management System - Core Frontend Type Definitions
 * Directly aligned with Phase 4 & Phase 5 backend response schemas.
 */

// ---------------------------------------------------------------------------
// User & Auth Types
// ---------------------------------------------------------------------------

export type UserRole = 'admin' | 'clerk' | 'judge';

export interface User {
  user_id: number;
  username: string;
  role: UserRole;
  judge_id: string | null;
}

export interface CsrfTokenResponse {
  status: 'success';
  csrf_token: string;
}

export interface LoginResponse {
  status: 'success';
  message: string;
  user: User;
  csrf_token: string;
}

export interface LogoutResponse {
  status: 'success';
  message: string;
}

export interface CurrentUserResponse {
  status: 'success';
  user: User;
}

export interface ApiErrorResponse {
  status: 'error';
  message: string;
}

// ---------------------------------------------------------------------------
// Dashboard Models (Admin, Clerk, Judge)
// ---------------------------------------------------------------------------

export type CaseStatus = 'Filed' | 'Active' | 'Adjourned' | 'Disposed' | 'Closed';

export type CasesByStatus = Record<string, number>;

export interface SystemUpcomingHearing {
  hearing_id: string | null;
  case_id: string | null;
  case_number: string | null;
  case_status: string | null;
  judge_name: string | null;
  start_time: string | null;
  end_time: string | null;
}

export interface JudgeUpcomingHearing {
  hearing_id: string | null;
  case_id: string | null;
  case_number: string | null;
  case_status: string | null;
  filing_date: string | null;
  start_time: string | null;
  end_time: string | null;
}

export interface JudgesSummary {
  total: number;
  active: number;
}

export interface AuditLogSummary {
  log_id: string | null;
  case_id: string | null;
  action_type: string | null;
  changed_at: string | null;
  username: string | null;
}

export interface RecentCase {
  case_id: string | null;
  case_number: string | null;
  status: string | null;
  filing_date: string | null;
}

export interface RecentFiling {
  filing_id: string | null;
  case_id: string | null;
  case_number: string | null;
  filing_type: string | null;
  filing_date: string | null;
  party_name: string | null;
}

export interface OperationalSummary {
  total_cases: number;
  active_cases: number;
  filed_cases: number;
  upcoming_hearings_count: number;
  recent_filings_count: number;
}

// ---------------------------------------------------------------------------
// Role-Specific Dashboard Data Payloads
// ---------------------------------------------------------------------------

export interface AdminDashboardData {
  total_cases: number;
  cases_by_status: CasesByStatus;
  judges: JudgesSummary;
  total_parties: number;
  upcoming_hearings: SystemUpcomingHearing[];
  recent_audit_activity: AuditLogSummary[];
}

export interface ClerkDashboardData {
  total_cases: number;
  cases_by_status: CasesByStatus;
  recent_cases: RecentCase[];
  upcoming_hearings: SystemUpcomingHearing[];
  recent_filings: RecentFiling[];
  operational_summary: OperationalSummary;
}

export interface JudgeDashboardData {
  judge_id: string | null;
  upcoming_hearings: JudgeUpcomingHearing[];
  assigned_hearings_count: number;
}

// ---------------------------------------------------------------------------
// Polymorphic Dashboard API Responses
// ---------------------------------------------------------------------------

export interface AdminDashboardResponse {
  status: 'success';
  role: 'admin';
  data: AdminDashboardData;
}

export interface ClerkDashboardResponse {
  status: 'success';
  role: 'clerk';
  data: ClerkDashboardData;
}

export interface JudgeDashboardResponse {
  status: 'success';
  role: 'judge';
  data: JudgeDashboardData;
}

export type DashboardResponse =
  | AdminDashboardResponse
  | ClerkDashboardResponse
  | JudgeDashboardResponse;
