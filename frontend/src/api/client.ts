/**
 * Court Case Management System - Centralized Fetch API Client & CSRF Management
 *
 * Safety & Security Rules:
 *   - Relative API paths are used so the Vite dev server proxy forwards to http://127.0.0.1:5000.
 *   - credentials: "include" is set unconditionally on all requests for HTTP-only cookie support.
 *   - CSRF tokens are held strictly in application memory (never in localStorage or sessionStorage).
 *   - X-CSRF-Token headers are attached ONLY to state-changing requests (POST, PUT, PATCH, DELETE).
 *   - Ordinary GET requests never receive unnecessary CSRF headers.
 *   - Rotated csrf_token values returned by backend payloads automatically update the in-memory token.
 *   - Does not implement infinite retry loops for failed CSRF requests.
 */

import type { CsrfTokenResponse } from '../types';

// ---------------------------------------------------------------------------
// Typed API Error
// ---------------------------------------------------------------------------

export class ApiClientError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.details = details;
    Object.setPrototypeOf(this, ApiClientError.prototype);
  }
}

// ---------------------------------------------------------------------------
// In-Memory CSRF Token Manager with Concurrency Race Condition Guards
// ---------------------------------------------------------------------------

let inMemoryCsrfToken: string | null = null;
let inFlightTokenPromise: Promise<string> | null = null;
let csrfGeneration = 0;

export const csrfManager = {
  /**
   * Retrieve the currently stored in-memory CSRF token, if any.
   */
  getToken(): string | null {
    return inMemoryCsrfToken;
  },

  /**
   * Set or update the in-memory CSRF token.
   * Increments generation counter to invalidate older in-flight requests.
   */
  setToken(token: string | null): void {
    csrfGeneration++;
    if (token && typeof token === 'string' && token.trim().length > 0) {
      inMemoryCsrfToken = token.trim();
    } else {
      inMemoryCsrfToken = null;
    }
    inFlightTokenPromise = null;
  },

  /**
   * Clear the in-memory CSRF token and any in-flight token promise.
   * Increments generation counter so any pending in-flight response cannot restore state.
   */
  clearToken(): void {
    csrfGeneration++;
    inMemoryCsrfToken = null;
    inFlightTokenPromise = null;
  },

  /**
   * Ensure a CSRF token is available, fetching a fresh token from /auth/csrf-token if needed.
   * Utilizes the single-flight pattern to coalesce multiple simultaneous invocations
   * into a single shared HTTP request while guarding against race conditions via generation checks.
   */
  async ensureToken(): Promise<string> {
    if (inMemoryCsrfToken) {
      return inMemoryCsrfToken;
    }

    if (inFlightTokenPromise) {
      return inFlightTokenPromise;
    }

    const currentGen = ++csrfGeneration;
    let currentPromise: Promise<string>;

    const executeFetch = async (): Promise<string> => {
      try {
        const response = await fetch('/auth/csrf-token', {
          method: 'GET',
          credentials: 'include',
          headers: {
            Accept: 'application/json',
          },
        });

        if (!response.ok) {
          throw new ApiClientError(
            `Failed to retrieve CSRF token: HTTP ${response.status}`,
            response.status
          );
        }

        const data = (await response.json()) as Partial<CsrfTokenResponse>;
        if (!data || typeof data.csrf_token !== 'string' || !data.csrf_token.trim()) {
          throw new ApiClientError('Invalid CSRF token payload received from server.', 400);
        }

        const freshToken = data.csrf_token.trim();

        // Concurrency Guard: Check if a setToken() or clearToken() call occurred while in-flight
        if (currentGen === csrfGeneration) {
          inMemoryCsrfToken = freshToken;
          return freshToken;
        }

        // Generation changed while request was in-flight:
        // If a new token was explicitly set, return that token to the caller;
        // if the token was cleared, invalidate this request.
        if (inMemoryCsrfToken) {
          return inMemoryCsrfToken;
        }

        throw new ApiClientError('CSRF token request invalidated by session clear.', 400);
      } catch (err) {
        if (err instanceof ApiClientError) {
          throw err;
        }
        const message = err instanceof Error ? err.message : 'Network error during CSRF token acquisition.';
        throw new ApiClientError(message, 0);
      } finally {
        // Only clear inFlightTokenPromise if it still references THIS exact request promise
        if (inFlightTokenPromise === currentPromise) {
          inFlightTokenPromise = null;
        }
      }
    };

    currentPromise = executeFetch();
    inFlightTokenPromise = currentPromise;
    return currentPromise;
  },
};

// ---------------------------------------------------------------------------
// HTTP Request Options & Centralized Client
// ---------------------------------------------------------------------------

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  skipCsrf?: boolean;
}

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Execute an HTTP request with automatic CSRF token management and cookie credentials.
 */
async function request<T>(
  endpoint: string,
  method: string,
  body?: unknown,
  options: RequestOptions = {}
): Promise<T> {
  const upperMethod = method.toUpperCase();
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };

  // State-changing requests require a valid CSRF token header
  if (STATE_CHANGING_METHODS.has(upperMethod) && !options.skipCsrf) {
    const token = await csrfManager.ensureToken();
    headers['X-CSRF-Token'] = token;
  }

  // Format JSON payload if body is provided
  let requestBody: BodyInit | undefined;
  if (body !== undefined && body !== null) {
    if (typeof body === 'string') {
      requestBody = body;
    } else {
      headers['Content-Type'] = 'application/json';
      requestBody = JSON.stringify(body);
    }
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      ...options,
      method: upperMethod,
      headers,
      body: requestBody,
      credentials: 'include',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network connection failed.';
    throw new ApiClientError(message, 0);
  }

  // Safely parse JSON or text response
  let data: unknown = null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  } else {
    try {
      data = await response.text();
    } catch {
      data = null;
    }
  }

  // If the backend returned a rotated csrf_token (e.g. login), update the in-memory token
  if (data && typeof data === 'object' && 'csrf_token' in data) {
    const candidateToken = (data as { csrf_token: unknown }).csrf_token;
    if (typeof candidateToken === 'string' && candidateToken.trim()) {
      csrfManager.setToken(candidateToken);
    }
  }

  // Handle HTTP error responses
  if (!response.ok) {
    let errorMessage: string | null = null;
    if (data && typeof data === 'object' && 'message' in data) {
      const msg = (data as { message: unknown }).message;
      if (typeof msg === 'string' && msg.trim()) {
        errorMessage = msg.trim();
      }
    }

    if (!errorMessage) {
      switch (response.status) {
        case 400:
          errorMessage = 'Bad request. Please check input parameters or CSRF token.';
          break;
        case 401:
          errorMessage = 'Authentication required. Please sign in.';
          break;
        case 403:
          errorMessage = 'Access forbidden. You do not have permission for this resource.';
          break;
        case 429:
          errorMessage = 'Rate limit exceeded. Please wait before retrying.';
          break;
        case 500:
          errorMessage = 'Internal server error. Please try again later.';
          break;
        default:
          errorMessage = `Request failed with status code ${response.status}.`;
      }
    }

    throw new ApiClientError(errorMessage, response.status, data);
  }

  return data as T;
}

export const apiClient = {
  get<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return request<T>(endpoint, 'GET', undefined, options);
  },

  post<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return request<T>(endpoint, 'POST', body, options);
  },

  put<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return request<T>(endpoint, 'PUT', body, options);
  },

  delete<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return request<T>(endpoint, 'DELETE', undefined, options);
  },

  request<T>(endpoint: string, method: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return request<T>(endpoint, method, body, options);
  },
};

