/**
 * Court Case Management System - Login Page (Placeholder)
 *
 * Public route placeholder for Phase 6 Step 3.
 * Full interactive login form with CSRF handling and progressive throttling feedback
 * will be implemented in Phase 6 Step 4.
 */

import React from 'react';
import { Navigate } from 'react-router-dom';
import { Lock, Loader2, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context';
import { getRoleDashboardPath } from '../routes/navigation';

export const LoginPage: React.FC = () => {
  const { user, loading } = useAuth();

  // If already authenticated, redirect immediately to role dashboard
  if (loading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-center"
      >
        <Loader2 className="h-10 w-10 animate-spin text-indigo-600 mb-4" />
        <span className="text-slate-700 font-medium text-base">Checking session...</span>
        <span className="sr-only">Loading</span>
      </div>
    );
  }

  if (user) {
    return <Navigate to={getRoleDashboardPath(user.role)} replace />;
  }

  return (
    <div className="max-w-md mx-auto my-12">
      <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 mb-6 border border-indigo-100">
          <Lock className="h-7 w-7" />
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-slate-900 mb-2">
          Sign In to Court Case System
        </h1>
        <p className="text-sm text-slate-500 mb-6">
          Phase 6 Step 3: Route guards and AuthContext active.
        </p>

        <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 text-left text-xs text-indigo-900 space-y-2 mb-6">
          <div className="flex items-center space-x-2 font-semibold">
            <ShieldCheck className="h-4 w-4 text-indigo-600" />
            <span>Phase 6 Step 4 Target:</span>
          </div>
          <p className="text-indigo-700">
            Full authentication UI, CSRF protection, and progressive throttling feedback
            will be built in the next step (Phase 6, Step 4).
          </p>
        </div>

        <div className="text-xs text-slate-400">
          Backend endpoint: <code className="font-mono text-slate-600">POST /auth/login</code>
        </div>
      </div>
    </div>
  );
};
