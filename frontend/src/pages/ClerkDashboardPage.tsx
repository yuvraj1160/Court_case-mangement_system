/**
 * Court Case Management System - Clerk Dashboard
 *
 * Operational registry and case intake interface providing:
 * 1. Operations Overview: Live metrics, intake summary & recent dockets
 * 2. Case Management: Paginated case list, search/status filters, case details, create, edit, link/unlink party
 * 3. Parties & Litigants: Paginated directory, search/category filters, party details, create, edit, phone management
 * 4. Hearing Calendar: Paginated schedules, case/judge/date filters, conflict-aware scheduling, hearing details
 * 5. Document Filings: Paginated filings queue, case/party/type filters, record filing, update filing_type
 * 6. Hearing Adjournments: Paginated postponements ledger, filter by hearing, record adjournment with reason code
 */

import React from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ClipboardList,
  FolderOpen,
  Users,
  FileText,
  Calendar,
  CalendarClock,
  Activity,
  ArrowUpRight,
  Clock,
  FileCheck,
  Inbox,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '../context';
import { useDashboardData } from '../hooks';
import { StatCard, StatusBadge, EmptyState } from '../components';
import {
  resolveActiveTab,
  buildPreservedTabSearchParams,
  formatDateSafe,
  formatTimeSafe,
  getLiveFilingStatus,
  type ClerkTab,
} from '../layouts/dashboardNavigation';
import type { User } from '../types';
import { CasesSection } from '../components/clerk/CasesSection';
import { PartiesSection } from '../components/clerk/PartiesSection';
import { HearingsSection } from '../components/clerk/HearingsSection';
import { FilingsSection } from '../components/clerk/FilingsSection';
import { AdjournmentsSection } from '../components/clerk/AdjournmentsSection';

interface ClerkDashboardContentProps {
  user: User;
}

const ClerkDashboardContent: React.FC<ClerkDashboardContentProps> = ({ user }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = resolveActiveTab('clerk', searchParams.get('tab')) as ClerkTab;

  const setActiveTab = (tab: ClerkTab) => {
    setSearchParams((prev) => buildPreservedTabSearchParams(prev, tab));
  };

  const {
    data: dashboardData,
    isLoading,
    error,
    refetch,
  } = useDashboardData('clerk', { userId: user.user_id });

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
                <ClipboardList className="h-7 w-7 text-emerald-600" />
                Office of the Court Clerk
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Operations & Registry
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Docket intake, document filings, litigants register, and calendar coordination
            </p>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center py-24 space-y-4">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600" />
          <p className="text-sm font-medium text-slate-500">
            Connecting to registry and loading operational intake data...
          </p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
                <ClipboardList className="h-7 w-7 text-emerald-600" />
                Office of the Court Clerk
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Operations & Registry
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Docket intake, document filings, litigants register, and calendar coordination
            </p>
          </div>

          <div className="flex items-center space-x-3 bg-white px-4 py-2.5 rounded-xl border border-slate-200 shadow-xs">
            <div className="h-9 w-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-sm uppercase border border-emerald-100">
              {user?.username.charAt(0) || 'C'}
            </div>
            <div className="text-left text-xs">
              <p className="font-semibold text-slate-900">{user?.username}</p>
              <p className="text-slate-500">Registry Clerk &bull; UID #{user?.user_id}</p>
            </div>
          </div>
        </div>

        <div className="p-6 bg-white rounded-xl border border-rose-200 shadow-xs space-y-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-6 w-6 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-rose-900">
                Registry API Connection Error
              </h3>
              <p className="text-sm text-rose-700">{error}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => void refetch()}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors cursor-pointer"
            >
              Retry Connection
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!dashboardData) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
                <ClipboardList className="h-7 w-7 text-emerald-600" />
                Office of the Court Clerk
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Operations & Registry
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Docket intake, document filings, litigants register, and calendar coordination
            </p>
          </div>
        </div>

        <EmptyState
          title="Registry Operations Data Unavailable"
          description="Case intake records and operational summary could not be retrieved from the server."
          icon={ClipboardList}
          actionLabel="Retry Connection"
          onAction={() => void refetch()}
        />
      </div>
    );
  }

  const op = dashboardData.operational_summary;
  const recentCases = dashboardData.recent_cases;
  const recentFilings = dashboardData.recent_filings;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
              <ClipboardList className="h-7 w-7 text-emerald-600" />
              Office of the Court Clerk
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              Operations & Registry
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
              Live Registry Connected
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Docket intake, document filings, litigants register, calendar coordination, and adjournments
          </p>
        </div>

        {/* User Card */}
        <div className="flex items-center space-x-3 bg-white px-4 py-2.5 rounded-xl border border-slate-200 shadow-xs">
          <div className="h-9 w-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-sm uppercase border border-emerald-100">
            {user?.username.charAt(0) || 'C'}
          </div>
          <div className="text-left text-xs">
            <p className="font-semibold text-slate-900">{user?.username}</p>
            <p className="text-slate-500">Registry Clerk &bull; UID #{user?.user_id}</p>
          </div>
        </div>
      </div>

      {/* Navigation Tabs Pill Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-200 text-xs">
        {[
          { key: 'overview', label: 'Operations Overview', icon: Activity },
          { key: 'cases', label: 'Case Docket', icon: FolderOpen, count: op.total_cases },
          { key: 'parties', label: 'Parties & Litigants', icon: Users },
          { key: 'hearings', label: 'Hearing Calendar', icon: Calendar, count: op.upcoming_hearings_count },
          { key: 'filings', label: 'Document Filings', icon: FileText, count: op.recent_filings_count },
          { key: 'adjournments', label: 'Hearing Adjournments', icon: CalendarClock },
        ].map((tab) => {
          const Icon = tab.icon;
          const isSelected = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key as ClerkTab)}
              className={`
                flex items-center gap-2 px-3.5 py-2 rounded-lg font-medium transition-all cursor-pointer whitespace-nowrap
                ${
                  isSelected
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-slate-200'
                }
              `}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                    isSelected ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600'
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
          {/* Operational Metrics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <StatCard
              title="Total Registry Cases"
              value={op.total_cases.toLocaleString()}
              subtitle="All docketed cases"
              icon={FolderOpen}
              accent="slate"
              badge="Registry"
            />
            <StatCard
              title="Active Proceedings"
              value={op.active_cases.toLocaleString()}
              subtitle="Pending trial or orders"
              icon={Activity}
              accent="emerald"
              badge="Active"
            />
            <StatCard
              title="Newly Filed Cases"
              value={op.filed_cases.toLocaleString()}
              subtitle="Intake awaiting assignment"
              icon={Inbox}
              accent="sky"
              badge="Intake"
            />
            <StatCard
              title="Recent Filings"
              value={op.recent_filings_count}
              subtitle="Processed past 30 days"
              icon={FileText}
              accent="amber"
              badge="Filings"
            />
            <StatCard
              title="Scheduled Hearings"
              value={op.upcoming_hearings_count}
              subtitle="Calendar slots reserved"
              icon={Calendar}
              accent="purple"
              badge="Docketed"
            />
          </div>

          {/* Clerk Operations Navigation Banner */}
          <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-xl p-5 text-white shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <FileCheck className="h-5 w-5 text-emerald-400" />
                <h3 className="text-sm font-bold tracking-tight">Court Registry Operations</h3>
              </div>
              <p className="text-xs text-slate-300">
                Review incoming pleadings in the filings intake queue and coordinate docket scheduling.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab('filings')}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 text-white transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <span>Review Filings Queue</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('cases')}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-700 hover:bg-slate-600 text-white transition-colors cursor-pointer"
              >
                View Docket Registry
              </button>
            </div>
          </div>

          {/* Side-by-side Overview: Recent Filings & Recent Cases */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Filings Queue Preview */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-emerald-600" />
                    <h3 className="text-sm font-bold text-slate-900">
                      Recent Filings Intake Queue
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('filings')}
                    className="text-xs font-medium text-emerald-600 hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
                  >
                    <span>All Filings</span>
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </button>
                </div>

                {recentFilings.length > 0 ? (
                  <div className="space-y-3">
                    {recentFilings.map((filing, idx) => {
                      const filingStatus = getLiveFilingStatus(filing);
                      return (
                        <div
                          key={filing.filing_id ?? `filing-prev-${idx}`}
                          className="p-3 rounded-lg border border-slate-100 bg-slate-50 hover:bg-slate-100/80 transition-colors flex items-center justify-between text-xs"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-slate-900">
                                {filing.filing_type}
                              </span>
                              <span className="font-mono text-[11px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-100">
                                {filing.case_number}
                              </span>
                              <span className="text-[10px] px-1.5 py-0.2 rounded font-medium bg-slate-100 text-slate-600 border border-slate-200">
                                {filingStatus}
                              </span>
                            </div>
                            <p className="text-slate-600 text-[11px]">{filing.party_name}</p>
                          </div>
                          <div className="text-right text-slate-500">
                            <div className="flex items-center gap-1 text-slate-700 font-medium justify-end">
                              <Clock className="h-3 w-3 text-slate-400" />
                              <span>{formatTimeSafe(filing.filing_date)}</span>
                            </div>
                            <p className="text-[10px]">{formatDateSafe(filing.filing_date)}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState
                    title="No recent filings"
                    description="No documents are currently awaiting intake review."
                    icon={FileText}
                  />
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 text-center">
                <span className="text-[11px] text-slate-500">
                  Document intake logged by Office of the Court Clerk
                </span>
              </div>
            </div>

            {/* Recent Cases Registered Preview */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <FolderOpen className="h-4 w-4 text-emerald-600" />
                    <h3 className="text-sm font-bold text-slate-900">
                      Recent Cases on Docket
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('cases')}
                    className="text-xs font-medium text-emerald-600 hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
                  >
                    <span>View Docket</span>
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </button>
                </div>

                {recentCases.length > 0 ? (
                  <div className="space-y-3">
                    {recentCases.slice(0, 4).map((c, idx) => (
                      <div
                        key={c.case_id ?? `case-prev-${idx}`}
                        className="p-3 rounded-lg border border-slate-100 bg-slate-50 hover:bg-slate-100/80 transition-colors flex items-center justify-between text-xs"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 font-mono">
                              {c.case_number}
                            </span>
                            <StatusBadge status={c.status} size="sm" />
                          </div>
                          <p className="text-slate-500 font-mono text-[11px]">Case ID: {c.case_id}</p>
                        </div>
                        <div className="text-right text-slate-500">
                          <p className="font-medium text-slate-800">
                            {formatDateSafe(c.filing_date)}
                          </p>
                          <p className="text-[10px]">Registered</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="No docket records"
                    description="No case records found in registry."
                    icon={FolderOpen}
                  />
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 text-center">
                <span className="text-[11px] text-slate-500">
                  {op.total_cases} total docketed cases in registry
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT 2: CASES WORKFLOW */}
      {activeTab === 'cases' && <CasesSection />}

      {/* TAB CONTENT 3: PARTIES WORKFLOW */}
      {activeTab === 'parties' && <PartiesSection />}

      {/* TAB CONTENT 4: HEARINGS WORKFLOW */}
      {activeTab === 'hearings' && <HearingsSection />}

      {/* TAB CONTENT 5: FILINGS WORKFLOW */}
      {activeTab === 'filings' && <FilingsSection />}

      {/* TAB CONTENT 6: ADJOURNMENTS WORKFLOW */}
      {activeTab === 'adjournments' && <AdjournmentsSection />}
    </div>
  );
};

export const ClerkDashboardPage: React.FC = () => {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  // Key by both user_id and role to guarantee full in-memory state reset on account switch
  return <ClerkDashboardContent key={`${user.user_id}:${user.role}`} user={user} />;
};
