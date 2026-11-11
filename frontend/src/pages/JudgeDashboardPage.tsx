/**
 * Court Case Management System - Judge Dashboard
 *
 * Authenticated Judicial Bench Portal:
 * - Overview: Key judicial metrics, priority docket, today's schedule, upcoming hearings table
 * - My Hearings: Live hearings calendar assigned to authenticated judge with filters and detail inspection
 * - My Cases: Live assigned matters roster with search, status filter, and docket inspection
 * - Case Details & Bench Notes: Complete docket review and session-only bench notes
 *
 * Security & Isolation Architecture:
 * - Judge identity derived exclusively from the authenticated session (user.judge_id).
 * - Client-supplied judge IDs are never accepted or used for authorization.
 * - Backend enforces 403 Forbidden on unassigned case access.
 * - Entire component tree is keyed by `${user.user_id}:${judgeId}` to guarantee zero state leakage across account switches.
 * - Strictly read-only: Zero record creation, alteration, or deletion controls.
 */

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Scale,
  CalendarCheck,
  Briefcase,
  BookOpen,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '../context/index.ts';
import { useDashboardData } from '../hooks/index.ts';
import {
  EmptyState,
  JudgeOverviewSection,
  JudgeHearingsSection,
  JudgeCasesSection,
  JudgeCaseDetailSection,
} from '../components/index.ts';
import { listCases } from '../api/index.ts';
import {
  resolveActiveTab,
  buildPreservedTabSearchParams,
  type JudgeTab,
} from '../layouts/dashboardNavigation.ts';
import type { User, CaseListItem } from '../types/index.ts';

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

  // 1. Dashboard summary data for judge
  const {
    data: liveData,
    isLoading: isDashboardLoading,
    error: dashboardError,
    refetch,
  } = useDashboardData('judge', { expectedJudgeId: judgeId, userId: user.user_id });

  // 2. Fetch assigned cases list & count for quick switcher and tab badges
  const [assignedCases, setAssignedCases] = useState<CaseListItem[]>([]);
  const [assignedCasesCount, setAssignedCasesCount] = useState<number>(0);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;

    const fetchJudgeAssignedCases = async () => {
      try {
        const res = await listCases({ page: 1, limit: 20 });
        if (isCurrent) {
          setAssignedCases(res.data.cases);
          setAssignedCasesCount(res.data.pagination.total_records);
        }
      } catch {
        // Non-blocking for tab shell; section-level error handling exists in JudgeCasesSection
      }
    };

    void fetchJudgeAssignedCases();

    return () => {
      isCurrent = false;
    };
  }, [judgeId]);

  const upcomingHearings = liveData?.upcoming_hearings ?? [];

  // Determine effective selected case ID
  const effectiveCaseId =
    selectedCaseId ||
    assignedCases[0]?.case_id ||
    upcomingHearings[0]?.case_id ||
    null;

  const setActiveTab = (tab: JudgeTab) => {
    setSearchParams((prev) => buildPreservedTabSearchParams(prev, tab));
  };

  const handleInspectCase = (caseId: string) => {
    setSelectedCaseId(caseId);
    setActiveTab('details');
  };

  // Loading State
  if (isDashboardLoading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-slate-200">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
              <Scale className="h-7 w-7 text-amber-600" />
              Judicial Bench Portal
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

  // Error State (with Retry)
  if (dashboardError) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-slate-200">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
              <Scale className="h-7 w-7 text-amber-600" />
              Judicial Bench Portal
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
              <p className="text-sm text-rose-700">{dashboardError}</p>
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

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
              <Scale className="h-7 w-7 text-amber-600" />
              Judicial Bench Portal
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
              Judicial Officer
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
              Live Docket Connected
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Live docket oversight and scheduled proceedings for{' '}
            <span className="font-semibold text-slate-700">
              {user.username}
            </span>
          </p>
        </div>

        {/* User Card */}
        <div className="flex items-center space-x-3 bg-white px-4 py-2.5 rounded-xl border border-slate-200 shadow-xs">
          <div className="h-9 w-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-sm uppercase border border-amber-100">
            {user.username.charAt(0) || 'J'}
          </div>
          <div className="text-left text-xs">
            <p className="font-semibold text-slate-900">
              {user.username}
            </p>
            <p className="text-slate-500 font-mono text-[11px]">
              Judge ID: #{judgeId.slice(0, 8)}...
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
            count: assignedCasesCount,
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

      {/* Tab 1: Overview */}
      {activeTab === 'overview' && (
        <JudgeOverviewSection
          liveData={liveData}
          assignedCasesCount={assignedCasesCount}
          onNavigateTab={setActiveTab}
          onInspectCase={handleInspectCase}
          username={user.username}
        />
      )}

      {/* Tab 2: My Hearings */}
      {activeTab === 'hearings' && (
        <JudgeHearingsSection onInspectCase={handleInspectCase} />
      )}

      {/* Tab 3: Assigned Cases */}
      {activeTab === 'cases' && (
        <JudgeCasesSection onInspectCase={handleInspectCase} />
      )}

      {/* Tab 4: Case Details & Bench Notes */}
      {activeTab === 'details' && (
        <JudgeCaseDetailSection
          judgeId={judgeId}
          caseId={effectiveCaseId}
          assignedCases={assignedCases}
          onSelectCaseId={setSelectedCaseId}
          onReturnToCases={() => setActiveTab('cases')}
        />
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
              Judicial Bench Portal
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
