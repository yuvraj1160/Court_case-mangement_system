/**
 * Court Case Management System - Dashboard API Services
 * Endpoints:
 *   GET /api/dashboard - Returns role-tailored dashboard payload for authenticated session
 */

import { apiClient } from './client';
import type { DashboardResponse } from '../types';

/**
 * Fetch role-specific dashboard metrics and operational data.
 * Identity and role are derived strictly from the server-side session.
 */
export async function getDashboard(): Promise<DashboardResponse> {
  const response = await apiClient.get<DashboardResponse>('/api/dashboard');
  return response;
}

