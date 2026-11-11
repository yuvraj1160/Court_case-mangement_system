/**
 * Court Case Management System - Judge Overview Section
 * Displays judicial metrics, today's proceedings, next docket alert, and upcoming hearings.
 * Strictly read-only presentation backed by authenticated server-side data.
 */

import React, { useState } from 'react';
import {
  CalendarCheck,
  Briefcase,
  Clock,
  ArrowUpRight,
  Calendar,
  BookOpen,
} from 'lucide-react';
import type { JudgeDashboardData, JudgeUpcomingHearing } from '../../types/index.ts';
import { StatCard, StatusBadge, EmptyState } from '../index.ts';
import { formatDateSafe, formatTimeSafe, type JudgeTab } from '../../layouts/dashboardNavigation.ts';

export interface JudgeOverviewSectionProps {
  liveData: JudgeDashboardData;
  assignedCasesCount: number;
  onNavigateTab: (tab: JudgeTab) => void;
  onInspectCase: (caseId: string) => void;
  username: string;
}

export const JudgeOverviewSection: React.FC<JudgeOverviewSectionProps> = ({
  liveData,
  assignedCasesCount,
  onNavigateTab,
  onInspectCase,
}) => {
  const upcomingHearings = liveData?.upcoming_hearings ?? [];
  const assignedHearingsCount = liveData?.assigned_hearings_count ?? upcomingHearings.length;
  const nextHearing: JudgeUpcomingHearing | null = upcomingHearings[0] || null;

  // Filter hearings scheduled for today in local calendar
  const [todayStr] = useState(() => new Date().toDateString());
  const todaysHearings = upcomingHearings.filter((h) => {
    if (!h.start_time) return false;
    const hearingDate = new Date(h.start_time);
    return !isNaN(hearingDate.getTime()) && hearingDate.toDateString() === todayStr;
  });

  return (
    <div className="space-y-6">
      {/* Key Judicial Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Assigned Hearings"
          value={assignedHearingsCount}
          subtitle="Scheduled on bench docket"
          icon={CalendarCheck}
          accent="amber"
          badge="Assigned"
        />
        <StatCard
          title="Presiding Cases"
          value={assignedCasesCount}
          subtitle="Active matters on bench"
          icon={Briefcase}
          accent="slate"
          badge="Authorized"
        />
        <StatCard
          title="Next Hearing Date"
          value={nextHearing?.start_time ? formatDateSafe(nextHearing.start_time) : 'None'}
          subtitle={
            nextHearing?.case_number ? `Case ${nextHearing.case_number}` : 'No upcoming hearing'
          }
          icon={Clock}
          accent="emerald"
          badge="Imminent"
        />
      </div>

      {/* Next Scheduled Proceeding Priority Alert */}
      {nextHearing && (
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-xl p-5 text-white border border-amber-500/30 shadow-md">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500 text-slate-950">
                  Next on Docket
                </span>
                <span className="font-mono font-bold text-amber-300 text-sm">
                  {nextHearing.case_number}
                </span>
                {nextHearing.case_status && (
                  <StatusBadge status={nextHearing.case_status} size="sm" />
                )}
              </div>
              <h3 className="text-base font-bold text-white">
                Scheduled Hearing &bull; Case ID: {nextHearing.case_id}
              </h3>
              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300 pt-1">
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-amber-400" />
                  {formatDateSafe(nextHearing.start_time)}
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-amber-400" />
                  {nextHearing.start_time
                    ? `${formatTimeSafe(nextHearing.start_time)} - ${formatTimeSafe(
                        nextHearing.end_time || nextHearing.start_time
                      )}`
                    : ''}
                </span>
              </div>
            </div>

            {nextHearing.case_id && (
              <button
                type="button"
                onClick={() => onInspectCase(nextHearing.case_id!)}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer shadow-xs"
              >
                <BookOpen className="h-4 w-4" />
                <span>Inspect Case File</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Today's Proceedings Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-amber-600" />
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Today's Scheduled Proceedings
            </h3>
          </div>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600">
            {todaysHearings.length} {todaysHearings.length === 1 ? 'Hearing' : 'Hearings'} Today
          </span>
        </div>

        {todaysHearings.length > 0 ? (
          <div className="divide-y divide-slate-100 pt-1">
            {todaysHearings.map((th) => (
              <div
                key={th.hearing_id || th.case_id}
                className="py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold text-slate-900">{th.case_number}</span>
                  {th.case_status && <StatusBadge status={th.case_status} size="sm" />}
                  <span className="text-slate-500">
                    {formatTimeSafe(th.start_time)} – {formatTimeSafe(th.end_time || th.start_time)}
                  </span>
                </div>
                {th.case_id && (
                  <button
                    type="button"
                    onClick={() => onInspectCase(th.case_id!)}
                    className="text-xs text-amber-700 hover:text-amber-900 font-semibold cursor-pointer text-left sm:text-right"
                  >
                    Open Docket &rarr;
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-400 italic pt-3">
            No hearings scheduled for your bench today.
          </p>
        )}
      </div>

      {/* Upcoming Hearing Docket Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Bench Hearing Docket (Assigned to Your Bench)
            </h3>
            <p className="text-xs text-slate-500">
              Hearings scheduled before your bench in the upcoming court term
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('hearings')}
            className="text-xs font-medium text-amber-700 hover:text-amber-900 flex items-center gap-1 cursor-pointer"
          >
            <span>Full Docket</span>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {upcomingHearings.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3">Case Number</th>
                  <th className="px-5 py-3">Case Status</th>
                  <th className="px-5 py-3">Filing Date</th>
                  <th className="px-5 py-3">Hearing Time Slot</th>
                  <th className="px-5 py-3 text-right">Bench Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {upcomingHearings.map((h, idx) => (
                  <tr
                    key={h.hearing_id ?? `jh-prev-${idx}`}
                    className="hover:bg-slate-50/80 transition-colors"
                  >
                    <td className="px-5 py-3 font-bold text-slate-900 font-mono">
                      {h.case_number}
                    </td>
                    <td className="px-5 py-3">
                      {h.case_status && <StatusBadge status={h.case_status} size="sm" />}
                    </td>
                    <td className="px-5 py-3 text-slate-500">
                      {formatDateSafe(h.filing_date)}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      <div>
                        <span className="font-semibold text-slate-900">
                          {formatDateSafe(h.start_time)}
                        </span>
                        <span className="ml-2 text-slate-500">
                          {h.start_time
                            ? `${formatTimeSafe(h.start_time)} - ${formatTimeSafe(
                                h.end_time || h.start_time
                              )}`
                            : ''}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right">
                      {h.case_id && (
                        <button
                          type="button"
                          onClick={() => onInspectCase(h.case_id!)}
                          className="text-xs text-amber-700 hover:text-amber-900 font-semibold cursor-pointer"
                        >
                          Review Case &rarr;
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8">
            <EmptyState
              title="No Upcoming Hearings"
              description="There are currently no hearings scheduled on your bench docket."
              icon={CalendarCheck}
            />
          </div>
        )}
      </div>
    </div>
  );
};
