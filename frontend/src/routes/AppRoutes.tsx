/**
 * Court Case Management System - Application Route Configuration
 *
 * Route Hierarchy:
 *   /            -> RootRedirect (routes to /${user.role} if logged in, /login if guest)
 *   /login       -> LoginPage (public; redirects to /${user.role} if already logged in)
 *   /admin       -> AdminDashboardPage (protected, requires role: 'admin')
 *   /clerk       -> ClerkDashboardPage (protected, requires role: 'clerk')
 *   /judge       -> JudgeDashboardPage (protected, requires role: 'judge')
 *   *            -> NotFoundPage (404)
 */

import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { RootLayout } from '../layouts/RootLayout';
import { ProtectedRoute } from './ProtectedRoute';
import { RoleGuard } from './RoleGuard';
import { RootRedirect } from '../pages/RootRedirect';
import { LoginPage } from '../pages/LoginPage';
import { AdminDashboardPage } from '../pages/AdminDashboardPage';
import { ClerkDashboardPage } from '../pages/ClerkDashboardPage';
import { JudgeDashboardPage } from '../pages/JudgeDashboardPage';
import { NotFoundPage } from '../pages/NotFoundPage';

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<RootLayout />}>
        {/* Public root index redirect */}
        <Route index element={<RootRedirect />} />

        {/* Public login route */}
        <Route path="login" element={<LoginPage />} />

        {/* Role-guarded protected routes */}
        <Route element={<ProtectedRoute />}>
          <Route element={<RoleGuard allowedRoles={['admin']} />}>
            <Route path="admin" element={<AdminDashboardPage />} />
          </Route>

          <Route element={<RoleGuard allowedRoles={['clerk']} />}>
            <Route path="clerk" element={<ClerkDashboardPage />} />
          </Route>

          <Route element={<RoleGuard allowedRoles={['judge']} />}>
            <Route path="judge" element={<JudgeDashboardPage />} />
          </Route>
        </Route>

        {/* Catch-all 404 route */}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
};
