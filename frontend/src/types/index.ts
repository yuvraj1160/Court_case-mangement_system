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

export type DashboardDataForRole<T extends UserRole> =
  T extends 'admin'
    ? AdminDashboardData
    : T extends 'clerk'
    ? ClerkDashboardData
    : T extends 'judge'
    ? JudgeDashboardData
    : never;

export type DashboardResponseForRole<T extends UserRole> =
  T extends 'admin'
    ? AdminDashboardResponse
    : T extends 'clerk'
    ? ClerkDashboardResponse
    : T extends 'judge'
    ? JudgeDashboardResponse
    : never;

// ---------------------------------------------------------------------------
// Common Pagination & Envelope Models
// ---------------------------------------------------------------------------

export interface PaginationInfo {
  page: number;
  limit: number;
  total_records: number;
  total_pages: number;
}

export interface ApiSuccessMessageResponse {
  status: 'success';
  message: string;
}

// ---------------------------------------------------------------------------
// Cases Domain Models & API Contracts
// ---------------------------------------------------------------------------

export interface CaseListItem {
  case_id: string;
  case_number: string;
  status: string;
  filing_date: string;
  parties_count: number;
  hearings_count: number;
}

export interface CaseListFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  sort?: 'filing_date' | 'case_number' | 'status';
  order?: 'asc' | 'desc';
}

export interface CaseListResponse {
  status: 'success';
  data: {
    cases: CaseListItem[];
    pagination: PaginationInfo;
  };
}

export interface CasePartyDetail {
  party_id: string;
  name: string;
  party_type: string;
  role_type: string;
  phone_numbers: string[];
}

export interface CaseHearingDetail {
  hearing_id: string;
  judge_id: string | null;
  judge_name: string | null;
  start_time: string;
  end_time: string;
}

export interface CaseOrderDetail {
  order_id: string;
  judge_id: string | null;
  judge_name: string | null;
  order_date: string;
  details: string;
}

export interface CaseDispositionDetail {
  disp_id: string;
  final_judgment: string;
  disposition_date: string;
}

export interface CaseFilingDetail {
  filing_id: string;
  party_id: string | null;
  party_name: string | null;
  filing_type: string;
  filing_date: string;
}

export interface CaseDetail {
  case_id: string;
  case_number: string;
  status: string;
  filing_date: string;
  parties: CasePartyDetail[];
  hearings: CaseHearingDetail[];
  orders: CaseOrderDetail[];
  disposition: CaseDispositionDetail | null;
  filings: CaseFilingDetail[];
}

export interface CaseDetailResponse {
  status: 'success';
  data: CaseDetail;
}

export interface CreateCasePayload {
  case_number: string;
  status?: string;
  filing_date?: string;
}

export interface CaseRecord {
  case_id: string;
  case_number: string;
  status: string;
  filing_date: string;
}

export interface CreateCaseResponse {
  status: 'success';
  message: string;
  data: CaseRecord;
}

export interface UpdateCasePayload {
  case_number?: string;
  status?: string;
}

export interface UpdateCaseResponse {
  status: 'success';
  message: string;
  data: CaseRecord;
}

export type DeleteCaseResponse = ApiSuccessMessageResponse;

export interface LinkPartyToCasePayload {
  party_id: string;
  role_type: string;
}

export interface LinkPartyToCaseRecord {
  case_id: string;
  party_id: string;
  role_type: string;
}

export interface LinkPartyToCaseResponse {
  status: 'success';
  message: string;
  data: LinkPartyToCaseRecord;
}

export type UnlinkPartyFromCaseResponse = ApiSuccessMessageResponse;

// ---------------------------------------------------------------------------
// Parties Domain Models & API Contracts
// ---------------------------------------------------------------------------

export type PartyType = 'Individual' | 'Corporation' | 'Government Agency' | 'Legal Representative';

export interface PartyListItem {
  party_id: string;
  name: string;
  party_type: string;
  phone_numbers: string[];
  case_count: number;
}

export interface PartyListFilters {
  page?: number;
  limit?: number;
  search?: string;
  party_type?: string;
}

export interface PartyListResponse {
  status: 'success';
  data: {
    parties: PartyListItem[];
    pagination: PaginationInfo;
  };
}

export interface PartyAssociatedCase {
  case_id: string;
  case_number: string;
  status: string;
  filing_date: string;
  role_type: string;
}

export interface PartyDetail {
  party_id: string;
  name: string;
  party_type: string;
  phone_numbers: string[];
  associated_cases: PartyAssociatedCase[];
}

export interface PartyDetailResponse {
  status: 'success';
  data: PartyDetail;
}

export interface CreatePartyPayload {
  name: string;
  party_type: string;
  phone_numbers?: string[];
}

export interface CreatePartyRecord {
  party_id: string;
  name: string;
  party_type: string;
  phone_numbers: string[];
}

export interface CreatePartyResponse {
  status: 'success';
  message: string;
  data: CreatePartyRecord;
}

export interface UpdatePartyPayload {
  name?: string;
  party_type?: string;
}

export interface UpdatePartyRecord {
  party_id: string;
  name: string;
  party_type: string;
}

export interface UpdatePartyResponse {
  status: 'success';
  message: string;
  data: UpdatePartyRecord;
}

export type DeletePartyResponse = ApiSuccessMessageResponse;

export interface AddPartyPhonePayload {
  phone_number: string;
}

export interface AddPartyPhoneRecord {
  party_id: string;
  phone_number: string;
}

export interface AddPartyPhoneResponse {
  status: 'success';
  message: string;
  data: AddPartyPhoneRecord;
}

export type DeletePartyPhoneResponse = ApiSuccessMessageResponse;

// ---------------------------------------------------------------------------
// Hearings Domain Models & API Contracts
// ---------------------------------------------------------------------------

export interface HearingListItem {
  hearing_id: string;
  case_id: string;
  case_number: string;
  judge_id: string;
  judge_name: string;
  start_time: string;
  end_time: string;
}

export interface HearingListFilters {
  page?: number;
  limit?: number;
  case_id?: string;
  judge_id?: string;
  start_date?: string;
  end_date?: string;
}

export interface HearingListResponse {
  status: 'success';
  message: string;
  data: HearingListItem[];
  pagination: PaginationInfo;
}

export interface HearingDetailResponse {
  status: 'success';
  message: string;
  data: HearingListItem;
}

export type HearingDetail = HearingListItem;

export interface CreateHearingPayload {
  case_id: string;
  judge_id: string;
  start_time: string;
  end_time: string;
}

export interface CreateHearingRecord {
  hearing_id: string;
  case_id: string;
  judge_id: string;
  start_time: string;
  end_time: string;
}

export interface CreateHearingResponse {
  status: 'success';
  message: string;
  data: CreateHearingRecord;
}

// ---------------------------------------------------------------------------
// Filings Domain Models & API Contracts
// ---------------------------------------------------------------------------

export interface FilingListItem {
  filing_id: string;
  case_id: string;
  case_number: string;
  party_id: string;
  party_name: string;
  filing_type: string;
  filing_date: string;
}

export interface FilingListFilters {
  page?: number;
  limit?: number;
  case_id?: string;
  party_id?: string;
  filing_type?: string;
}

export interface FilingListResponse {
  status: 'success';
  message: string;
  data: FilingListItem[];
  pagination: PaginationInfo;
}

export interface FilingDetailResponse {
  status: 'success';
  message: string;
  data: FilingListItem;
}

export type FilingDetail = FilingListItem;

export interface CreateFilingPayload {
  case_id: string;
  party_id: string;
  filing_type: string;
  filing_date?: string;
}

export interface CreateFilingRecord {
  filing_id: string;
  case_id: string;
  party_id: string;
  filing_type: string;
  filing_date: string;
}

export interface CreateFilingResponse {
  status: 'success';
  message: string;
  data: CreateFilingRecord;
}

export interface UpdateFilingPayload {
  filing_type: string;
}

export interface UpdateFilingResponse {
  status: 'success';
  message: string;
  data: CreateFilingRecord;
}

// ---------------------------------------------------------------------------
// Adjournments Domain Models & API Contracts
// ---------------------------------------------------------------------------

export interface AdjournmentListItem {
  adj_id: string;
  hearing_id: string;
  reason_code: string;
  case_id: string;
  case_number: string;
  judge_id: string;
}

export interface AdjournmentListFilters {
  page?: number;
  limit?: number;
  hearing_id?: string;
}

export interface AdjournmentListResponse {
  status: 'success';
  message: string;
  data: AdjournmentListItem[];
  pagination: PaginationInfo;
}

export interface AdjournmentDetailResponse {
  status: 'success';
  message: string;
  data: AdjournmentListItem;
}

export type AdjournmentDetail = AdjournmentListItem;

export interface CreateAdjournmentPayload {
  hearing_id: string;
  reason_code: string;
}

export interface CreateAdjournmentRecord {
  adj_id: string;
  hearing_id: string;
  reason_code: string;
}

export interface CreateAdjournmentResponse {
  status: 'success';
  message: string;
  data: CreateAdjournmentRecord;
}
