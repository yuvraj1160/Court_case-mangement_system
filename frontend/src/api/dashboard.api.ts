/**
 * Court Case Management System - Dashboard API Services
 * Endpoints:
 *   GET /api/dashboard - Returns role-tailored dashboard payload for authenticated session
 */

import { apiClient, type RequestOptions } from './client.ts';
import type { DashboardResponse } from '../types/index.ts';

/**
 * Fetch role-specific dashboard metrics and operational data.
 * Identity and role are derived strictly from the server-side session.
 */
export async function getDashboard(options?: RequestOptions): Promise<DashboardResponse> {
  const response = await apiClient.get<DashboardResponse>('/api/dashboard', options);
  return response;
}
