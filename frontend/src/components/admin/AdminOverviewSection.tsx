/**
 * Court Case Management System - Admin Overview Section
 * Displays executive judicial administration metrics, case status distribution,
 * system upcoming hearings preview, and audit trail activity.
 * Strictly server-backed presentation.
 */

import React from 'react';
import {
  FolderOpen,
  Activity,
  Scale,
  Users,
  Calendar,
  ScrollText,
  ArrowUpRight,
  Clock,
} from 'lucide-react';
import type { AdminDashboardData } from '../../types/index.ts';
import { StatCard, StatusBadge, EmptyState } from '../index.ts';
import {
  formatDateSafe,
  formatTimeSafe,
  type AdminTab,
} from '../../layouts/dashboardNavigation.ts';

export interface AdminOverviewSectionProps {
  liveData: AdminDashboardData;
  totalHearingsCount: number;
  onNavigateTab: (tab: AdminTab) => void;
  onInspectCase: (caseId: string) => void;
}

export const AdminOverviewSection: React.FC<AdminOverviewSectionProps> = ({
  liveData,
  totalHearingsCount,
  onNavigateTab,
  onInspectCase,
}) => {
  const upcomingHearings = liveData?.upcoming_hearings ?? [];
  const recentAudit = liveData?.recent_audit_activity ?? [];

  return (
    <div className="space-y-6">
      {/* 1. Key Administrative Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          title="Total Cases"
          value={liveData.total_cases.toLocaleString()}
          subtitle="All registered matters"
          icon={FolderOpen}
          accent="indigo"
          badge="System Total"
        />
        <StatCard
          title="Active Cases"
          value={liveData.cases_by_status.Active || 0}
          subtitle="Active proceedings"
          icon={Activity}
          accent="emerald"
          badge="In Progress"
        />
        <StatCard
          title="Judicial Officers"
          value={`${liveData.judges.active} / ${liveData.judges.total}`}
          subtitle="Active bench judges"
          icon={Scale}
          accent="amber"
          badge="Bench Roster"
        />
        <StatCard
          title="Litigants & Parties"
          value={liveData.total_parties.toLocaleString()}
          subtitle="Verified participants"
          icon={Users}
          accent="sky"
          badge="Parties"
        />
        <StatCard
          title="Court Hearings"
          value={totalHearingsCount || upcomingHearings.length}
          subtitle="Scheduled proceedings"
          icon={Calendar}
          accent="purple"
          badge="Calendar"
        />
      </div>

      {/* 2. Case Status Distribution Matrix */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 tracking-tight">
              Case Status Distribution
            </h3>
            <p className="text-xs text-slate-500">
              Current court-wide caseload breakdown by procedural disposition
            </p>
          </div>
          <span className="text-xs font-mono text-slate-500">
            {liveData.total_cases} total matters recorded
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {Object.entries(liveData.cases_by_status).map(([status, count]) => {
            const percentage =
              liveData.total_cases > 0
                ? Math.round((count / liveData.total_cases) * 100)
                : 0;
            return (
              <div
                key={status}
                className="p-3.5 rounded-lg border border-slate-100 bg-slate-50/70"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <StatusBadge status={status} size="sm" />
                  <span className="text-xs font-bold text-slate-800 font-mono">
                    {percentage}%
                  </span>
                </div>
                <p className="text-xl font-bold text-slate-900 mt-2">{count}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">cases recorded</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Side-by-side Telemetry: Upcoming Hearings & Audit Trail */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* System Upcoming Hearings Preview */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  System Upcoming Hearings
                </h3>
              </div>
              <button
                type="button"
                onClick={() => onNavigateTab('hearings')}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
              >
                <span>Full Calendar</span>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {upcomingHearings.length > 0 ? (
              <div className="space-y-3">
                {upcomingHearings.slice(0, 4).map((h, idx) => (
                  <div
                    key={h.hearing_id ?? `h-prev-${idx}`}
                    className="p-3 rounded-lg border border-slate-100 bg-slate-50 hover:bg-slate-100/80 transition-colors flex items-center justify-between text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => h.case_id && onInspectCase(h.case_id)}
                          className="font-bold text-slate-900 font-mono hover:text-indigo-600 transition-colors cursor-pointer text-left"
                        >
                          {h.case_number}
                        </button>
                        <StatusBadge status={h.case_status} size="sm" />
                      </div>
                      <p className="text-slate-600">{h.judge_name || 'Presiding Bench'}</p>
                    </div>
                    <div className="text-right text-slate-500">
                      <p className="font-medium text-slate-800">
                        {formatDateSafe(h.start_time)}
                      </p>
                      <p className="text-[11px]">{formatTimeSafe(h.start_time)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No upcoming hearings"
                description="No hearings are currently scheduled across court divisions."
                icon={Calendar}
              />
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 text-center">
            <span className="text-[11px] text-slate-500 font-mono">
              {upcomingHearings.length} upcoming hearings loaded in system docket
            </span>
          </div>
        </div>

        {/* Recent Audit Activity Preview */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <ScrollText className="h-4 w-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  Recent Audit Activity
                </h3>
              </div>
              <button
                type="button"
                onClick={() => onNavigateTab('audit-logs')}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
              >
                <span>Audit Trail</span>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {recentAudit.length > 0 ? (
              <div className="space-y-3">
                {recentAudit.slice(0, 4).map((log, idx) => (
                  <div
                    key={log.log_id ?? `log-prev-${idx}`}
                    className="p-3 rounded-lg border border-slate-100 bg-slate-50 hover:bg-slate-100/80 transition-colors flex items-center justify-between text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-800">
                          {log.action_type}
                        </span>
                        <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.2 rounded font-mono font-medium">
                          {log.username}
                        </span>
                      </div>
                      <p className="text-slate-500 font-mono text-[11px]">
                        Case: {log.case_id ? log.case_id.slice(0, 8) + '...' : 'System'}
                      </p>
                    </div>
                    <div className="text-right text-slate-500">
                      <div className="flex items-center gap-1 text-slate-700 font-medium justify-end">
                        <Clock className="h-3 w-3 text-slate-400" />
                        <span>{formatTimeSafe(log.changed_at)}</span>
                      </div>
                      <p className="text-[10px]">{formatDateSafe(log.changed_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No audit activity"
                description="No system audit events recorded."
                icon={ScrollText}
              />
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 text-center">
            <span className="text-[11px] text-slate-500 font-mono">
              Live audit events recorded via PostgreSQL trigger attribution
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
