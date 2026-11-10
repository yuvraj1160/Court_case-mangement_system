/**
 * Court Case Management System - Adjournments API Services
 *
 * Endpoints:
 *   GET  /api/adjournments     - List hearing adjournments with pagination & filters
 *   GET  /api/adjournments/:id - Retrieve single adjournment details
 *   POST /api/adjournments     - Record an adjournment (Admin, Clerk only)
 */

import { apiClient, buildQueryString, type RequestOptions } from './client.ts';
import type {
  AdjournmentDetailResponse,
  AdjournmentListFilters,
  AdjournmentListResponse,
  CreateAdjournmentPayload,
  CreateAdjournmentResponse,
} from '../types/index.ts';

/**
 * List hearing adjournments with role-based scoping, filtering, and pagination.
 * Admin & Clerk: Full visibility or filtered.
 * Judge: Scoped strictly to parent hearings belonging to authenticated judge.
 */
export async function listAdjournments(
  filters?: AdjournmentListFilters,
  options?: RequestOptions
): Promise<AdjournmentListResponse> {
  const query = buildQueryString(filters as Record<string, unknown> | undefined);
  return apiClient.get<AdjournmentListResponse>(`/api/adjournments${query}`, options);
}

/**
 * Retrieve single adjournment details by adjournment ID.
 * Admin & Clerk: Full access.
 * Judge: Permitted only if assigned to the parent hearing.
 */
export async function getAdjournment(
  adjId: string,
  options?: RequestOptions
): Promise<AdjournmentDetailResponse> {
  const cleanId = encodeURIComponent(adjId.trim());
  return apiClient.get<AdjournmentDetailResponse>(`/api/adjournments/${cleanId}`, options);
}

/**
 * Record an adjournment against a scheduled hearing.
 * Append-only ledger: Does not mutate parent hearing or case status.
 * Permitted for Admin and Clerk roles. Judge role returns HTTP 403.
 */
export async function createAdjournment(
  payload: CreateAdjournmentPayload,
  options?: RequestOptions
): Promise<CreateAdjournmentResponse> {
  return apiClient.post<CreateAdjournmentResponse>('/api/adjournments', payload, options);
}

