/**
 * Court Case Management System - Protected Route Wrapper
 *
 * Verifies session authentication before rendering protected routes.
 * Handles:
 *   1. Loading state (accessible spinner)
 *   2. Server / Network connectivity errors (retry interface using refreshUser)
 *   3. Unauthenticated sessions (redirect to /login with redirect state)
 *   4. Authenticated sessions (renders nested routes via Outlet)
 */

import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { useAuth } from '../context';

export const ProtectedRoute: React.FC = () => {
  const { user, loading, error, refreshUser } = useAuth();
  const location = useLocation();

  // 1. Session verification in-flight
  if (loading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-center"
      >
        <Loader2 className="h-10 w-10 animate-spin text-indigo-600 mb-4" />
        <span className="text-slate-700 font-medium text-base">Verifying authentication session...</span>
        <span className="sr-only">Loading</span>
      </div>
    );
  }

  // 2. Server or network connectivity failure during session verification
  if (error && !user) {
    return (
      <div
        role="alert"
        className="max-w-md mx-auto my-12 p-6 bg-rose-50 border border-rose-200 rounded-xl shadow-sm text-center"
      >
        <AlertTriangle className="h-10 w-10 text-rose-600 mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-rose-900 mb-2">Authentication Service Unavailable</h2>
        <p className="text-sm text-rose-700 mb-6">{error}</p>
        <button
          type="button"
          onClick={() => void refreshUser()}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors cursor-pointer"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry Connection
        </button>
      </div>
    );
  }

  // 3. User is confirmed unauthenticated (401)
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 4. Authenticated session confirmed
  return <Outlet />;
};

