/**
 * Court Case Management System - Judge Dashboard (Placeholder)
 *
 * Protected route for role: 'judge'.
 * Full dashboard data integration occurs in Phase 6 Step 5.
 */

import React from 'react';
import { Scale, Calendar } from 'lucide-react';
import { useAuth } from '../context';

export const JudgeDashboardPage: React.FC = () => {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Scale className="h-7 w-7 text-amber-600" />
            Judge Dashboard
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Docket oversight, assigned hearings, and judicial proceedings
          </p>
        </div>

        <div className="flex items-center space-x-3 bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-xs">
          <div className="h-8 w-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-xs uppercase">
            {user?.username.charAt(0) || 'J'}
          </div>
          <div className="text-left text-xs">
            <p className="font-semibold text-slate-900">{user?.username}</p>
            <p className="text-slate-500 capitalize">Role: {user?.role}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-xs text-center max-w-2xl mx-auto my-8">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 mb-4 border border-amber-100">
          <Calendar className="h-7 w-7" />
        </div>
        <h2 className="text-lg font-bold text-slate-900 mb-2">Judicial Portal Active</h2>
        <p className="text-sm text-slate-600 mb-6">
          Phase 6 Step 3: RoleGuard verified access for user <code className="font-mono font-semibold text-amber-600">{user?.username}</code> with role <span className="inline-block bg-amber-100 text-amber-800 text-xs px-2.5 py-0.5 rounded-full font-medium">judge</span>.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
            <p className="text-xs font-medium text-slate-500">Authorized Role</p>
            <p className="text-sm font-semibold text-slate-900 mt-1">judge</p>
          </div>
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
            <p className="text-xs font-medium text-slate-500">Judge ID</p>
            <p className="text-sm font-mono text-slate-900 mt-1 truncate" title={user?.judge_id || 'Not assigned'}>
              {user?.judge_id ? `${user.judge_id.slice(0, 8)}...` : 'Not linked'}
            </p>
          </div>
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
            <p className="text-xs font-medium text-slate-500">Integration Phase</p>
            <p className="text-sm font-semibold text-amber-600 mt-1">Step 3 Verified</p>
          </div>
        </div>
      </div>
    </div>
  );
};

