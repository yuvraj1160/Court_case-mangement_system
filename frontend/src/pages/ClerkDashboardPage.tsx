/**
 * Court Case Management System - Clerk Dashboard (Placeholder)
 *
 * Protected route for role: 'clerk'.
 * Full dashboard data integration occurs in Phase 6 Step 5.
 */

import React from 'react';
import { FileText, ClipboardList } from 'lucide-react';
import { useAuth } from '../context';

export const ClerkDashboardPage: React.FC = () => {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <ClipboardList className="h-7 w-7 text-emerald-600" />
            Clerk Dashboard
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Case management, filing intake, and hearing scheduling
          </p>
        </div>

        <div className="flex items-center space-x-3 bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-xs">
          <div className="h-8 w-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-xs uppercase">
            {user?.username.charAt(0) || 'C'}
          </div>
          <div className="text-left text-xs">
            <p className="font-semibold text-slate-900">{user?.username}</p>
            <p className="text-slate-500 capitalize">Role: {user?.role}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-xs text-center max-w-2xl mx-auto my-8">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 mb-4 border border-emerald-100">
          <FileText className="h-7 w-7" />
        </div>
        <h2 className="text-lg font-bold text-slate-900 mb-2">Clerk Portal Active</h2>
        <p className="text-sm text-slate-600 mb-6">
          Phase 6 Step 3: RoleGuard verified access for user <code className="font-mono font-semibold text-emerald-600">{user?.username}</code> with role <span className="inline-block bg-emerald-100 text-emerald-800 text-xs px-2.5 py-0.5 rounded-full font-medium">clerk</span>.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
            <p className="text-xs font-medium text-slate-500">Authorized Role</p>
            <p className="text-sm font-semibold text-slate-900 mt-1">clerk</p>
          </div>
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
            <p className="text-xs font-medium text-slate-500">User ID</p>
            <p className="text-sm font-semibold text-slate-900 mt-1">{user?.user_id}</p>
          </div>
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
            <p className="text-xs font-medium text-slate-500">Integration Phase</p>
            <p className="text-sm font-semibold text-emerald-600 mt-1">Step 3 Verified</p>
          </div>
        </div>
      </div>
    </div>
  );
};

