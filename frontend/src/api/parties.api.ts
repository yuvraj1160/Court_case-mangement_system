/**
 * Court Case Management System - Parties API Services
 *
 * Endpoints:
 *   GET    /api/parties                       - List legal parties with pagination & filters
 *   GET    /api/parties/:id                   - Retrieve single party details with associated cases
 *   POST   /api/parties                       - Create a new party
 *   PUT    /api/parties/:id                   - Update an existing party
 *   DELETE /api/parties/:id                   - Hard delete a party (Admin only)
 *   POST   /api/parties/:id/phones            - Add phone number to party
 *   DELETE /api/parties/:id/phones/:phone_num - Remove phone number from party
 */

import { apiClient, buildQueryString, type RequestOptions } from './client.ts';
import type {
  AddPartyPhonePayload,
  AddPartyPhoneResponse,
  CreatePartyPayload,
  CreatePartyResponse,
  DeletePartyPhoneResponse,
  DeletePartyResponse,
  PartyDetailResponse,
  PartyListFilters,
  PartyListResponse,
  UpdatePartyPayload,
  UpdatePartyResponse,
} from '../types/index.ts';

/**
 * List legal parties with role-based scoping, searching, filtering, and pagination.
 */
export async function listParties(
  filters?: PartyListFilters,
  options?: RequestOptions
): Promise<PartyListResponse> {
  const query = buildQueryString(filters as Record<string, unknown> | undefined);
  return apiClient.get<PartyListResponse>(`/api/parties${query}`, options);
}

/**
 * Retrieve comprehensive details for a single party including associated cases and contact numbers.
 */
export async function getParty(
  partyId: string,
  options?: RequestOptions
): Promise<PartyDetailResponse> {
  const cleanId = encodeURIComponent(partyId.trim());
  return apiClient.get<PartyDetailResponse>(`/api/parties/${cleanId}`, options);
}

/**
 * Create a new legal party and optional phone numbers.
 * Permitted for Admin and Clerk roles.
 */
export async function createParty(
  payload: CreatePartyPayload,
  options?: RequestOptions
): Promise<CreatePartyResponse> {
  return apiClient.post<CreatePartyResponse>('/api/parties', payload, options);
}

/**
 * Update an existing legal party record.
 * Permitted for Admin and Clerk roles.
 */
export async function updateParty(
  partyId: string,
  payload: UpdatePartyPayload,
  options?: RequestOptions
): Promise<UpdatePartyResponse> {
  const cleanId = encodeURIComponent(partyId.trim());
  return apiClient.put<UpdatePartyResponse>(`/api/parties/${cleanId}`, payload, options);
}

/**
 * Delete a legal party record.
 * Restricted strictly to Admin role.
 */
export async function deleteParty(
  partyId: string,
  options?: RequestOptions
): Promise<DeletePartyResponse> {
  const cleanId = encodeURIComponent(partyId.trim());
  return apiClient.delete<DeletePartyResponse>(`/api/parties/${cleanId}`, options);
}

/**
 * Add a phone number to an existing party.
 * Permitted for Admin and Clerk roles.
 */
export async function addPartyPhone(
  partyId: string,
  payload: AddPartyPhonePayload,
  options?: RequestOptions
): Promise<AddPartyPhoneResponse> {
  const cleanId = encodeURIComponent(partyId.trim());
  return apiClient.post<AddPartyPhoneResponse>(`/api/parties/${cleanId}/phones`, payload, options);
}

/**
 * Remove a phone number from an existing party.
 * Permitted for Admin and Clerk roles.
 */
export async function deletePartyPhone(
  partyId: string,
  phoneNumber: string,
  options?: RequestOptions
): Promise<DeletePartyPhoneResponse> {
  const cleanPartyId = encodeURIComponent(partyId.trim());
  const cleanPhone = encodeURIComponent(phoneNumber.trim());
  return apiClient.delete<DeletePartyPhoneResponse>(
    `/api/parties/${cleanPartyId}/phones/${cleanPhone}`,
    options
  );
}

