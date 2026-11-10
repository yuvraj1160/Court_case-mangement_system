/**
 * Court Case Management System - Filings API Services
 *
 * Endpoints:
 *   GET  /api/filings     - List court filings with pagination & filters
 *   GET  /api/filings/:id - Retrieve single filing details
 *   POST /api/filings     - Create a new court filing (Admin, Clerk only)
 *   PUT  /api/filings/:id - Update filing_type ONLY (Admin, Clerk only)
 */

import { apiClient, buildQueryString, type RequestOptions } from './client.ts';
import type {
  CreateFilingPayload,
  CreateFilingResponse,
  FilingDetailResponse,
  FilingListFilters,
  FilingListResponse,
  UpdateFilingPayload,
  UpdateFilingResponse,
} from '../types/index.ts';

/**
 * List court filings with role-based scoping, filtering, and pagination.
 * Admin & Clerk: Full visibility or filtered.
 * Judge: Scoped strictly to cases assigned to authenticated judge.
 */
export async function listFilings(
  filters?: FilingListFilters,
  options?: RequestOptions
): Promise<FilingListResponse> {
  const query = buildQueryString(filters as Record<string, unknown> | undefined);
  return apiClient.get<FilingListResponse>(`/api/filings${query}`, options);
}

/**
 * Retrieve single filing details by filing ID.
 * Admin & Clerk: Full access.
 * Judge: Permitted only if assigned to the filing's case.
 */
export async function getFiling(
  filingId: string,
  options?: RequestOptions
): Promise<FilingDetailResponse> {
  const cleanId = encodeURIComponent(filingId.trim());
  return apiClient.get<FilingDetailResponse>(`/api/filings/${cleanId}`, options);
}

/**
 * Create a new court filing.
 * Permitted for Admin and Clerk roles. Judge role returns HTTP 403.
 */
export async function createFiling(
  payload: CreateFilingPayload,
  options?: RequestOptions
): Promise<CreateFilingResponse> {
  return apiClient.post<CreateFilingResponse>('/api/filings', payload, options);
}

/**
 * Update filing_type of an existing court filing.
 * All other fields (case_id, party_id, filing_date) are immutable.
 * Permitted for Admin and Clerk roles. Judge role returns HTTP 403.
 */
export async function updateFiling(
  filingId: string,
  payload: UpdateFilingPayload,
  options?: RequestOptions
): Promise<UpdateFilingResponse> {
  const cleanId = encodeURIComponent(filingId.trim());
  return apiClient.put<UpdateFilingResponse>(`/api/filings/${cleanId}`, payload, options);
}

