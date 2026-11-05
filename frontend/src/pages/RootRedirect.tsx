/**
 * Court Case Management System - Root Route Redirection
 *
 * Redirects authenticated users directly to their designated role dashboard,
 * and redirects unauthenticated users to /login.
 * Avoids any redirect loops by checking loading and error states first.
 */

import React from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { useAuth } from '../context';
import { getRoleDashboardPath } from '../routes/navigation';

export const RootRedirect: React.FC = () => {
  const { user, loading, error, refreshUser } = useAuth();

  if (loading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-center"
      >
        <Loader2 className="h-10 w-10 animate-spin text-indigo-600 mb-4" />
        <span className="text-slate-700 font-medium text-base">Loading session...</span>
        <span className="sr-only">Loading</span>
      </div>
    );
  }

  if (error && !user) {
    return (
      <div
        role="alert"
        className="max-w-md mx-auto my-12 p-6 bg-rose-50 border border-rose-200 rounded-xl shadow-sm text-center"
      >
        <AlertTriangle className="h-10 w-10 text-rose-600 mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-rose-900 mb-2">Connection Error</h2>
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

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Navigate to={getRoleDashboardPath(user.role)} replace />;
};
