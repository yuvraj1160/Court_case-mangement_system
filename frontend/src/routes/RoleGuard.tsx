/**
 * Court Case Management System - Role-Based Route Guard
 *
 * Enforces role authorization on client-side routes.
 *
 * Security Note:
 *   Frontend guards are strictly for UX routing and avoiding navigation dead ends.
 *   The authoritative authorization boundary is the Flask backend session verification.
 */

import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import type { UserRole } from '../types';
import { useAuth } from '../context';
import { getRoleDashboardPath } from './navigation';

export interface RoleGuardProps {
  allowedRoles: UserRole[];
  children?: React.ReactNode;
}

export const RoleGuard: React.FC<RoleGuardProps> = ({ allowedRoles, children }) => {
  const { user } = useAuth();

  // If no user is authenticated, route to login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // If the user's role does not match the allowed roles for this route,
  // redirect them to their own role dashboard to prevent navigation dead ends
  if (!allowedRoles.includes(user.role)) {
    const targetDashboard = getRoleDashboardPath(user.role);
    return <Navigate to={targetDashboard} replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};
