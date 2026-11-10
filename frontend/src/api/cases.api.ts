/**
 * Court Case Management System - Cases API Services
 *
 * Endpoints:
 *   GET    /api/cases                     - List cases with pagination & filters
 *   GET    /api/cases/:id                 - Retrieve single case full details
 *   POST   /api/cases                     - Register a new case
 *   PUT    /api/cases/:id                 - Update existing case
 *   DELETE /api/cases/:id                 - Hard delete case (Admin only)
 *   POST   /api/cases/:id/parties         - Link party to case
 *   DELETE /api/cases/:id/parties/:party_id - Unlink party from case
 */

import { apiClient, buildQueryString, type RequestOptions } from './client.ts';
import type {
  CaseDetailResponse,
  CaseListFilters,
  CaseListResponse,
  CreateCasePayload,
  CreateCaseResponse,
  DeleteCaseResponse,
  LinkPartyToCasePayload,
  LinkPartyToCaseResponse,
  UnlinkPartyFromCaseResponse,
  UpdateCasePayload,
  UpdateCaseResponse,
} from '../types/index.ts';

/**
 * List cases with role-based scoping, searching, filtering, and pagination.
 */
export async function listCases(
  filters?: CaseListFilters,
  options?: RequestOptions
): Promise<CaseListResponse> {
  const query = buildQueryString(filters as Record<string, unknown> | undefined);
  return apiClient.get<CaseListResponse>(`/api/cases${query}`, options);
}

/**
 * Retrieve comprehensive details for a single case including parties, hearings, orders, and filings.
 */
export async function getCase(
  caseId: string,
  options?: RequestOptions
): Promise<CaseDetailResponse> {
  const cleanId = encodeURIComponent(caseId.trim());
  return apiClient.get<CaseDetailResponse>(`/api/cases/${cleanId}`, options);
}

/**
 * Register a new court case record.
 * Permitted for Admin and Clerk roles.
 */
export async function createCase(
  payload: CreateCasePayload,
  options?: RequestOptions
): Promise<CreateCaseResponse> {
  return apiClient.post<CreateCaseResponse>('/api/cases', payload, options);
}

/**
 * Update case number or status for an existing case.
 * Permitted for Admin and Clerk roles.
 */
export async function updateCase(
  caseId: string,
  payload: UpdateCasePayload,
  options?: RequestOptions
): Promise<UpdateCaseResponse> {
  const cleanId = encodeURIComponent(caseId.trim());
  return apiClient.put<UpdateCaseResponse>(`/api/cases/${cleanId}`, payload, options);
}

/**
 * Delete a court case record.
 * Restricted strictly to Admin role.
 */
export async function deleteCase(
  caseId: string,
  options?: RequestOptions
): Promise<DeleteCaseResponse> {
  const cleanId = encodeURIComponent(caseId.trim());
  return apiClient.delete<DeleteCaseResponse>(`/api/cases/${cleanId}`, options);
}

/**
 * Associate a party with a case under a specific role (e.g. Petitioner, Respondent).
 * Permitted for Admin and Clerk roles.
 */
export async function linkPartyToCase(
  caseId: string,
  payload: LinkPartyToCasePayload,
  options?: RequestOptions
): Promise<LinkPartyToCaseResponse> {
  const cleanId = encodeURIComponent(caseId.trim());
  return apiClient.post<LinkPartyToCaseResponse>(`/api/cases/${cleanId}/parties`, payload, options);
}

/**
 * Remove a party's association from a case.
 * Permitted for Admin and Clerk roles.
 */
export async function unlinkPartyFromCase(
  caseId: string,
  partyId: string,
  options?: RequestOptions
): Promise<UnlinkPartyFromCaseResponse> {
  const cleanCaseId = encodeURIComponent(caseId.trim());
  const cleanPartyId = encodeURIComponent(partyId.trim());
  return apiClient.delete<UnlinkPartyFromCaseResponse>(
    `/api/cases/${cleanCaseId}/parties/${cleanPartyId}`,
    options
  );
}

