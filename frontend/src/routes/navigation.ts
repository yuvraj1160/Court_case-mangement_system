/**
 * Court Case Management System - Navigation & Route Helpers
 */

import type { UserRole } from '../types';

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

