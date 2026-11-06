/**
 * Court Case Management System - Navigation & Route Helpers
 */

import type { UserRole } from '../types/index.ts';

/**
 * Maps a given user role to its canonical dashboard route.
 */
export function getRoleDashboardPath(role: UserRole): string {
  switch (role) {
    case 'admin':
      return '/admin';
    case 'clerk':
      return '/clerk';
    case 'judge':
      return '/judge';
    default:
      return '/login';
  }
}

/**
 * Safely resolves the post-login destination URL.
 * Restricts redirects strictly to the authenticated user's own role-specific namespace.
 * Prevents open redirects, protocol-relative URLs, dot-segment escapes, encoded bypasses,
 * unauthorized generic paths, and redirect loops.
 * Preserves valid query strings and hash fragments.
 *
 * @param role The authenticated user's verified role ('admin' | 'clerk' | 'judge').
 * @param from The optional location state provided when redirected from ProtectedRoute.
 * @returns An internal, authorized relative route string belonging to the user's role namespace.
 */
export function resolveSafeRedirect(
  role: UserRole,
  from?: unknown
): string {
  const defaultPath = getRoleDashboardPath(role);

  if (!from) {
    return defaultPath;
  }

  // 1. Extract candidate path string from string or Location-like object
  let rawCandidate = '';
  if (typeof from === 'string') {
    rawCandidate = from.trim();
  } else if (typeof from === 'object' && from !== null && 'pathname' in from) {
    const fromObj = from as { pathname?: unknown; search?: unknown; hash?: unknown };
    if (typeof fromObj.pathname === 'string') {
      rawCandidate = fromObj.pathname.trim();
      if (typeof fromObj.search === 'string') {
        rawCandidate += fromObj.search.trim();
      }
      if (typeof fromObj.hash === 'string') {
        rawCandidate += fromObj.hash.trim();
      }
    }
  }

  if (!rawCandidate) {
    return defaultPath;
  }

  // 2. Open redirect & protocol sanity checks
  // Must be an internal path starting with '/' (but not '//' or '/\')
  if (
    !rawCandidate.startsWith('/') ||
    rawCandidate.startsWith('//') ||
    rawCandidate.startsWith('/\\') ||
    rawCandidate.includes('\\')
  ) {
    return defaultPath;
  }

  // Reject control characters or null bytes
  for (let i = 0; i < rawCandidate.length; i++) {
    const code = rawCandidate.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) {
      return defaultPath;
    }
  }

  // 3. Separate pathname from query string and hash fragment
  const queryIdx = rawCandidate.indexOf('?');
  const hashIdx = rawCandidate.indexOf('#');
  let splitIdx = rawCandidate.length;

  if (queryIdx !== -1 && hashIdx !== -1) {
    splitIdx = Math.min(queryIdx, hashIdx);
  } else if (queryIdx !== -1) {
    splitIdx = queryIdx;
  } else if (hashIdx !== -1) {
    splitIdx = hashIdx;
  }

  const rawPathname = rawCandidate.slice(0, splitIdx);
  const rawQueryAndHash = rawCandidate.slice(splitIdx);

  // 4. Safely decode encoded path variations (e.g. %2e%2e for '..', %2f for '/', %5c for '\')
  let decodedPathname: string;
  try {
    decodedPathname = decodeURIComponent(rawPathname);
  } catch {
    // Malformed percent encoding
    return defaultPath;
  }

  // Check if decoded pathname attempts backslash or protocol-relative bypass
  if (
    decodedPathname.startsWith('//') ||
    decodedPathname.startsWith('/\\') ||
    decodedPathname.includes('\\')
  ) {
    return defaultPath;
  }

  // 5. Normalize dot segments (e.g. '/admin/../clerk', '/admin/./reports')
  let normalizedPathname: string;
  try {
    const resolvedUrl = new URL(decodedPathname, 'http://localhost');
    normalizedPathname = resolvedUrl.pathname;
  } catch {
    return defaultPath;
  }

  // 6. Restrict strictly to the authenticated user's own role namespace prefix
  // Allowed namespaces:
  // - admin: exactly '/admin' or '/admin/...'
  // - clerk: exactly '/clerk' or '/clerk/...'
  // - judge: exactly '/judge' or '/judge/...'
  const rolePrefix = `/${role}`;
  const isAuthorizedRoleNamespace =
    normalizedPathname === rolePrefix || normalizedPathname.startsWith(`${rolePrefix}/`);

  if (!isAuthorizedRoleNamespace) {
    return defaultPath;
  }

  // 7. Prevent redirect loops back to login or root index
  if (normalizedPathname === '/login' || normalizedPathname === '/') {
    return defaultPath;
  }

  // 8. Re-attach valid query string and hash fragment
  return `${normalizedPathname}${rawQueryAndHash}`;
}
