/**
 * Court Case Management System - Authentication API Services
 * Endpoints:
 *   GET  /auth/csrf-token - Retrieves fresh CSRF token
 *   POST /auth/login      - Authenticates user, receives rotated CSRF token
 *   POST /auth/logout     - Evicts session and clears in-memory CSRF token
 *   GET  /auth/me         - Validates active session and retrieves user identity
 */

import { apiClient, csrfManager } from './client.ts';
import type {
  CsrfTokenResponse,
  CurrentUserResponse,
  LoginResponse,
  LogoutResponse,
} from '../types';

/**
 * Fetch a fresh CSRF token from the server and store it in memory.
 */
export async function getCsrfToken(): Promise<string> {
  const response = await apiClient.get<CsrfTokenResponse>('/auth/csrf-token');
  const token = response.csrf_token;
  csrfManager.setToken(token);
  return token;
}

/**
 * Authenticate credentials against POST /auth/login.
 * Attaches the latest CSRF token and automatically updates memory with the rotated token.
 */
export async function login(username: string, password: string): Promise<LoginResponse> {
  const payload = {
    username: username.trim(),
    password,
  };

  const response = await apiClient.post<LoginResponse>('/auth/login', payload);
  return response;
}

/**
 * Terminate the active session via POST /auth/logout.
 * Uses the latest available CSRF token and clears the token from memory on success.
 */
export async function logout(): Promise<LogoutResponse> {
  try {
    const response = await apiClient.post<LogoutResponse>('/auth/logout');
    return response;
  } finally {
    // Clear CSRF token from memory regardless of outcome
    csrfManager.clearToken();
  }
}

/**
 * Check active session identity via GET /auth/me.
 * Performs live database revalidation on the server.
 */
export async function getCurrentUser(): Promise<CurrentUserResponse> {
  const response = await apiClient.get<CurrentUserResponse>('/auth/me');
  return response;
}

