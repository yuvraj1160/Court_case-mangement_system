/**
 * Court Case Management System - Hearings API Services
 *
 * Endpoints:
 *   GET  /api/hearings     - List scheduled hearings with pagination & filters
 *   GET  /api/hearings/:id - Retrieve single hearing details
 *   POST /api/hearings     - Schedule a new hearing (Admin, Clerk only)
 */

import { apiClient, buildQueryString, type RequestOptions } from './client.ts';
import type {
  CreateHearingPayload,
  CreateHearingResponse,
  HearingDetailResponse,
  HearingListFilters,
  HearingListResponse,
} from '../types/index.ts';

/**
 * List scheduled hearings with role-based scoping, filtering, and pagination.
 * Admin & Clerk: Full visibility or filtered.
 * Judge: Scoped strictly to hearings where judge_id matches authenticated judge profile.
 */
export async function listHearings(
  filters?: HearingListFilters,
  options?: RequestOptions
): Promise<HearingListResponse> {
  const query = buildQueryString(filters as Record<string, unknown> | undefined);
  return apiClient.get<HearingListResponse>(`/api/hearings${query}`, options);
}

/**
 * Retrieve single hearing details by hearing ID.
 * Admin & Clerk: Full access.
 * Judge: Permitted only if assigned to this hearing.
 */
export async function getHearing(
  hearingId: string,
  options?: RequestOptions
): Promise<HearingDetailResponse> {
  const cleanId = encodeURIComponent(hearingId.trim());
  return apiClient.get<HearingDetailResponse>(`/api/hearings/${cleanId}`, options);
}

/**
 * Schedule a new court hearing.
 * Permitted for Admin and Clerk roles. Judge role returns HTTP 403.
 */
export async function createHearing(
  payload: CreateHearingPayload,
  options?: RequestOptions
): Promise<CreateHearingResponse> {
  return apiClient.post<CreateHearingResponse>('/api/hearings', payload, options);
}

