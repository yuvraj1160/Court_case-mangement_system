/**
 * Court Case Management System - Judge Dashboard (Mock Data Preview)
 *
 * Judge-scoped mock data presentation for Phase 6 Step 5 UI review:
 * - Judicial Overview & Docket Snapshot
 * - My Upcoming Hearings (judge-assigned mock hearings docket)
 * - Assigned Cases Roster
 * - Case File & Bench Notes Draft Preview
 *
 * Security & Architecture Notice:
 * - This is purely a client-side mock-data preview.
 * - Frontend filtering and presentation checks do not constitute an authorization boundary.
 * - Access control must be enforced by backend API authorization; this view provides
 *   no confidentiality, encryption, or security guarantees.
 */

import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Scale,
  CalendarCheck,
  Briefcase,
  BookOpen,
  Calendar,
  Clock,
  ArrowUpRight,
  FileText,
  CheckCircle2,
  AlertCircle,
  Save,
} from 'lucide-react';
import { useAuth } from '../context';
import { useDashboardData } from '../hooks';
import { StatCard, StatusBadge, EmptyState } from '../components';
import {
  getMockJudgeAssignedCases,
  getMockJudicialOfficer,
  getMockCaseDetail,
  inspectJudgeCase,
  getInitialBenchNote,
  saveBenchNote,
  type PresidingCaseRecord,
} from '../data/mockDashboardData';
import {
  resolveActiveTab,
  buildPreservedTabSearchParams,
  formatDateSafe,
  formatTimeSafe,
  type JudgeTab,
} from '../layouts/dashboardNavigation';
import type { User } from '../types';

// ---------------------------------------------------------------------------
// Bench Notes Draft Subcomponent (Local Browser Session Only)
// ---------------------------------------------------------------------------

interface BenchNotesDraftProps {
  judgeId: string | null | undefined;
  caseId: string;
}

const BenchNotesDraft: React.FC<BenchNotesDraftProps> = ({ judgeId, caseId }) => {
  const [benchNote, setBenchNote] = useState<string>(() => getInitialBenchNote(judgeId, caseId));
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

  // If judgeId is missing, do not load or display draft editor
  if (!judgeId) {
    return (
      <div className="mt-6 pt-6 border-t border-slate-200">
        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-500">
          Bench notes unavailable: No authenticated judicial profile associated.
        </div>
      </div>
    );
  }

  const handleSaveLocalDraft = () => {
    if (!caseId) return;
    const success = saveBenchNote(judgeId, caseId, benchNote);
    if (success) {
      setSaveFeedback(
        'Draft note saved to local browser session (temporary, unencrypted, not sent to server).'
      );
    } else {
      setSaveFeedback('Unable to save draft note in browser session.');
    }
  };

  return (
    <div className="mt-6 pt-6 border-t border-slate-200 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900">
            Judicial Bench Notes (Local Session Draft)
          </h3>
          <p className="text-xs text-slate-500">
            Draft notes are stored temporarily in your local browser session. They are not
            confidential, encrypted, or persisted to the server database.
          </p>
        </div>
        <span className="text-[11px] font-mono text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 self-start sm:self-auto">
          Local Session Draft
        </span>
      </div>

      {saveFeedback && (
        <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center gap-2 animate-in fade-in duration-200">
          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
          <span>{saveFeedback}</span>
        </div>
      )}

      <textarea
        value={benchNote}
        onChange={(e) => {
          setBenchNote(e.target.value);
          setSaveFeedback(null);
        }}
        rows={4}
        className="w-full p-3 border border-slate-200 rounded-xl text-xs font-sans text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-amber-50/20"
        placeholder="Record draft bench observations or ruling reminders for this browser session..."
      />

      <div className="flex justify-end items-center gap-3">
        <span className="text-[11px] text-slate-400">
          Temporary &bull; Unencrypted &bull; Browser session only
        </span>
        <button
          type="button"
          onClick={handleSaveLocalDraft}
          className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white transition-colors cursor-pointer flex items-center gap-1.5"
        >
          <Save className="h-3.5 w-3.5" />
          <span>Save Local Draft</span>
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Judge Dashboard Content (Keyed by Authenticated Judge Identity)
// ---------------------------------------------------------------------------

interface JudgeDashboardContentProps {
  judgeId: string;
  user: User;
}

const JudgeDashboardContent: React.FC<JudgeDashboardContentProps> = ({ judgeId, user }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = resolveActiveTab('judge', searchParams.get('tab')) as JudgeTab;

  const {
    data: liveData,
    isLoading,
    error,
    refetch,
  } = useDashboardData('judge', { expectedJudgeId: judgeId, userId: user.user_id });

  const assignedCases: PresidingCaseRecord[] = getMockJudgeAssignedCases(judgeId);
  const judicialOfficer = getMockJudicialOfficer(judgeId);

  const upcomingHearings = liveData?.upcoming_hearings ?? [];
  const assignedHearingsCount = liveData?.assigned_hearings_count ?? upcomingHearings.length;

  // Default selected case for this specific judge
  const defaultCaseId =
    assignedCases[0]?.case_id ?? upcomingHearings[0]?.case_id ?? '';
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);

  // If user hasn't explicitly inspected or selected a case, use defaultCaseId;
  // otherwise use the explicitly selected (or invalidated) case ID.
  const effectiveCaseId = selectedCaseId !== null ? selectedCaseId : defaultCaseId;

  const setActiveTab = (tab: JudgeTab) => {
    setSearchParams((prev) => buildPreservedTabSearchParams(prev, tab));
  };

  const handleInspectCase = (caseId: string) => {
    setSelectedCaseId(inspectJudgeCase(judgeId, caseId));
    setActiveTab('details');
  };

  // 1. Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-slate-200">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
              <Scale className="h-7 w-7 text-amber-600" />
              Judicial Chambers & Bench Portal
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Live docket oversight, assigned hearings, and judicial review
            </p>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center py-24 space-y-4">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-600" />
          <p className="text-sm font-medium text-slate-500">
            Connecting to court docket and loading assigned hearings...
          </p>
        </div>
      </div>
    );
  }

  // 2. Error state (with retry)
  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-slate-200">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
              <Scale className="h-7 w-7 text-amber-600" />
              Judicial Chambers & Bench Portal
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Live docket oversight, assigned hearings, and judicial review
            </p>
          </div>

          <div className="flex items-center space-x-3 bg-white px-4 py-2.5 rounded-xl border border-slate-200 shadow-xs">
            <div className="h-9 w-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-sm uppercase border border-amber-100">
              {user.username.charAt(0) || 'J'}
            </div>
            <div className="text-left text-xs">
              <p className="font-semibold text-slate-900">{user.username}</p>
              <p className="text-slate-500 font-mono text-[11px]">Judge ID: {judgeId}</p>
            </div>
          </div>
        </div>

        <div className="p-6 bg-white rounded-xl border border-rose-200 shadow-xs space-y-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-6 w-6 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-rose-900">
                Judicial Docket Connection Error
              </h3>
              <p className="text-sm text-rose-700">{error}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => void refetch()}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white transition-colors cursor-pointer"
            >
              Retry Connection
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!liveData) {
    return (
      <div className="space-y-6">
        <EmptyState
          title="Judicial Docket Unavailable"
          description="Assigned hearings and bench docket records could not be retrieved from the server."
          icon={Scale}
          actionLabel="Retry Connection"
          onAction={() => void refetch()}
        />
      </div>
    );
  }

  const nextHearing = upcomingHearings[0] || null;
  const caseDetail = getMockCaseDetail(judgeId, effectiveCaseId);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
              <Scale className="h-7 w-7 text-amber-600" />
              Judicial Chambers & Bench Portal
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
              {judicialOfficer?.division || 'Judicial Officer'}
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
              Live Docket Connected
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Live docket oversight and scheduled proceedings for{' '}
            <span className="font-semibold text-slate-700">
              {judicialOfficer?.name || user?.username}
            </span>
          </p>
        </div>

        {/* User Card */}
        <div className="flex items-center space-x-3 bg-white px-4 py-2.5 rounded-xl border border-slate-200 shadow-xs">
          <div className="h-9 w-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-sm uppercase border border-amber-100">
            {user?.username.charAt(0) || 'J'}
          </div>
          <div className="text-left text-xs">
            <p className="font-semibold text-slate-900">
              {judicialOfficer?.name || user?.username}
            </p>
            <p className="text-slate-500 font-mono text-[11px]">
              {judicialOfficer?.courtroom
                ? `${judicialOfficer.courtroom} • ID #${judgeId.slice(0, 8)}`
                : `Judge ID: ${judgeId.slice(0, 8)}...`}
            </p>
          </div>
        </div>
      </div>

      {/* Navigation Tabs Pill Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-200 text-xs">
        {[
          { key: 'overview', label: 'Judicial Overview', icon: Scale },
          {
            key: 'hearings',
            label: 'My Hearing Docket',
            icon: CalendarCheck,
            count: upcomingHearings.length,
          },
          {
            key: 'cases',
            label: 'Assigned Cases',
            icon: Briefcase,
            count: assignedCases.length,
          },
          { key: 'details', label: 'Case File & Bench Notes', icon: BookOpen },
        ].map((tab) => {
          const Icon = tab.icon;
          const isSelected = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key as JudgeTab)}
              className={`
                flex items-center gap-2 px-3.5 py-2 rounded-lg font-medium transition-all cursor-pointer whitespace-nowrap
                ${
                  isSelected
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-slate-200'
                }
              `}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                    isSelected ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* TAB CONTENT 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Key Judicial Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
              value={assignedCases.length}
              subtitle="Active matters on bench"
              icon={Briefcase}
              accent="slate"
              badge="Active"
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
            <StatCard
              title="Assigned Chambers"
              value={judicialOfficer?.courtroom || 'Courtroom'}
              subtitle={judicialOfficer?.division || 'Court Division'}
              icon={Scale}
              accent="purple"
              badge="Chambers"
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
                    <StatusBadge status={nextHearing.case_status} size="sm" />
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
                        ? `${formatTimeSafe(nextHearing.start_time)} - ${formatTimeSafe(nextHearing.end_time || nextHearing.start_time)}`
                        : ''}
                    </span>
                    <span>{judicialOfficer?.courtroom || 'Assigned Courtroom'}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleInspectCase(nextHearing.case_id || '')}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer shadow-xs"
                >
                  <BookOpen className="h-4 w-4" />
                  <span>Inspect Case File</span>
                </button>
              </div>
            </div>
          )}

          {/* Upcoming Hearing Docket Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Bench Hearing Docket (Assigned to Your Chambers)
                </h3>
                <p className="text-xs text-slate-500">
                  Hearings scheduled before your bench in the upcoming court term
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('hearings')}
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
                          <StatusBadge status={h.case_status} size="sm" />
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
                                ? `${formatTimeSafe(h.start_time)} - ${formatTimeSafe(h.end_time || h.start_time)}`
                                : ''}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleInspectCase(h.case_id || '')}
                            className="text-xs text-amber-700 hover:text-amber-900 font-semibold cursor-pointer"
                          >
                            Review Case &rarr;
                          </button>
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
      )}

      {/* TAB CONTENT 2: MY UPCOMING HEARINGS */}
      {activeTab === 'hearings' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-200">
            <h2 className="text-base font-bold text-slate-900">
              Assigned Judicial Hearing Docket
            </h2>
            <p className="text-xs text-slate-500">
              Proceedings scheduled before {judicialOfficer?.name || 'your honor'} &bull;{' '}
              {judicialOfficer?.courtroom || 'Assigned Courtroom'}
            </p>
          </div>

          {upcomingHearings.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-3">Hearing ID</th>
                    <th className="px-5 py-3">Case Number</th>
                    <th className="px-5 py-3">Case Status</th>
                    <th className="px-5 py-3">Filing Date</th>
                    <th className="px-5 py-3">Scheduled Time Slot</th>
                    <th className="px-5 py-3 text-right">Bench Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {upcomingHearings.map((h, idx) => (
                    <tr
                      key={h.hearing_id ?? `jh-all-${idx}`}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="px-5 py-3 font-mono text-slate-500 font-medium">
                        {h.hearing_id}
                      </td>
                      <td className="px-5 py-3 font-mono font-bold text-slate-900">
                        {h.case_number}
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge status={h.case_status} size="sm" />
                      </td>
                      <td className="px-5 py-3 text-slate-500">
                        {formatDateSafe(h.filing_date)}
                      </td>
                      <td className="px-5 py-3 text-slate-700">
                        <div>
                          <span className="font-semibold text-slate-900">
                            {formatDateSafe(h.start_time)}
                          </span>
                          <span className="ml-2 text-slate-500">
                            {h.start_time
                              ? `${formatTimeSafe(h.start_time)} - ${formatTimeSafe(h.end_time || h.start_time)}`
                              : ''}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleInspectCase(h.case_id || '')}
                          className="text-xs text-amber-700 hover:text-amber-900 font-medium cursor-pointer"
                        >
                          Inspect Case File
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8">
              <EmptyState
                title="No Hearings on Docket"
                description="No upcoming hearings are currently assigned to your chambers."
                icon={CalendarCheck}
              />
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT 3: ASSIGNED CASES */}
      {activeTab === 'cases' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">Cases Assigned to Your Bench</h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-amber-50 text-amber-800 border border-amber-200">
                  Mock Data Preview
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Active and pending matters currently assigned to {judicialOfficer?.name || 'your honor'} &bull; Case assignment registry API is not yet connected
              </p>
            </div>
          </div>

          {assignedCases.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-3">Case Number</th>
                    <th className="px-5 py-3">Case Title</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Procedural Stage</th>
                    <th className="px-5 py-3">Next Scheduled Hearing</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {assignedCases.map((c) => (
                    <tr key={c.case_id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-5 py-3 font-mono font-bold text-slate-900">
                        {c.case_number}
                      </td>
                      <td className="px-5 py-3 font-semibold text-slate-900">{c.case_title}</td>
                      <td className="px-5 py-3">
                        <StatusBadge status={c.status} size="sm" />
                      </td>
                      <td className="px-5 py-3 text-slate-600">{c.stage}</td>
                      <td className="px-5 py-3 text-slate-600 font-medium">
                        {c.next_hearing_date || 'None scheduled'}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleInspectCase(c.case_id)}
                          className="text-xs text-amber-700 hover:text-amber-900 font-semibold cursor-pointer"
                        >
                          Inspect Docket &rarr;
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8">
              <EmptyState
                title="No Assigned Cases"
                description="There are currently no cases assigned to your judicial chambers roster."
                icon={Briefcase}
              />
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT 4: CASE DETAILS & BENCH NOTES */}
      {activeTab === 'details' && (
        <div className="space-y-6">
          {caseDetail ? (
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
              {/* Case Header Banner */}
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-5 border-b border-slate-200">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-base font-bold text-slate-900">
                      {caseDetail.case_number}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">
                      (ID: {caseDetail.case_id})
                    </span>
                    <StatusBadge status={caseDetail.status} size="md" />
                  </div>
                  <h2 className="text-xl font-bold text-slate-900 mt-1">
                    {caseDetail.case_title}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {caseDetail.case_type} &bull; Filed {formatDateSafe(caseDetail.filing_date)}{' '}
                    &bull; {caseDetail.courtroom}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1.5">
                    <Scale className="h-4 w-4 text-amber-600" />
                    <span>Presiding: {caseDetail.presiding_judge}</span>
                  </span>
                </div>
              </div>

              {/* Litigants & Legal Representation Grid */}
              <div className="mt-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                  Parties & Legal Counsel
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {caseDetail.parties.map((p, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-xl border border-slate-100 bg-slate-50 space-y-1.5"
                    >
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-200 text-slate-700">
                        {p.role}
                      </span>
                      <p className="text-sm font-bold text-slate-900">{p.name}</p>
                      <p className="text-xs text-slate-500">Representation: {p.counsel}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Procedural Summary */}
              <div className="mt-6">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Case Summary & Procedural Notes
                </h3>
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-700 leading-relaxed">
                  {caseDetail.summary}
                </div>
              </div>

              {/* Judicial Orders Issued */}
              <div className="mt-6">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Judicial Orders on Record
                </h3>
                {caseDetail.orders.length > 0 ? (
                  <div className="space-y-2">
                    {caseDetail.orders.map((o, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-3 rounded-lg border border-slate-100 bg-white text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-amber-600" />
                          <span className="font-semibold text-slate-900">{o.title}</span>
                          <span className="text-slate-400">&bull;</span>
                          <span className="text-slate-500">{formatDateSafe(o.date)}</span>
                        </div>
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          <span>Entered by Bench</span>
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">No orders currently on record.</p>
                )}
              </div>

              {/* Bench Notes — Local Browser Session Draft Subcomponent */}
              <BenchNotesDraft
                key={`${judgeId}:${effectiveCaseId}`}
                judgeId={judgeId}
                caseId={effectiveCaseId}
              />
            </div>
          ) : (
            <EmptyState
              title="Case Details Unavailable"
              description={`The selected case record "${effectiveCaseId === '__invalid__' ? 'None' : effectiveCaseId || 'None'}" is not assigned to your chambers docket.`}
              icon={BookOpen}
              actionLabel="Return to Assigned Cases"
              onAction={() => setActiveTab('cases')}
            />
          )}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Judge Dashboard Page (Top-Level Container & Account Boundary)
// ---------------------------------------------------------------------------

export const JudgeDashboardPage: React.FC = () => {
  const { user } = useAuth();
  const judgeId = user?.judge_id;

  // Case 1: Authenticated user is not linked to a judge ID
  if (!user || !judgeId) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-slate-200">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
              <Scale className="h-7 w-7 text-amber-600" />
              Judicial Chambers & Bench Portal
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Docket oversight, assigned hearings, and judicial review
            </p>
          </div>
        </div>

        <EmptyState
          title="No Judicial Profile Associated"
          description={`The authenticated account "${user?.username || 'Current User'}" is not associated with an active judicial bench identifier. Please contact the court administrator.`}
          icon={Scale}
        />
      </div>
    );
  }

  // Key by both user_id and judgeId to guarantee full in-memory state reset on account switch
  return <JudgeDashboardContent key={`${user.user_id}:${judgeId}`} judgeId={judgeId} user={user} />;
};
