/**
 * Court Case Management System - Clerk Dashboard
 *
 * Operational registry and case intake interface providing:
 * - Operational Metrics & Intake Overview
 * - Case Management & Docket Processing
 * - Parties & Litigants Verification
 * - Document Filings Intake Queue
 * - Hearing Calendar Scheduling & Management
 */

import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ClipboardList,
  FolderOpen,
  Users,
  FileText,
  Calendar,
  Activity,
  Search,
  Filter,
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
  MOCK_PARTIES_ROSTER,
} from '../data/mockDashboardData';
import {
  resolveActiveTab,
  buildPreservedTabSearchParams,
  formatDateSafe,
  formatTimeSafe,
  formatDateTimeSafe,
  getLiveFilingStatus,
  type ClerkTab,
} from '../layouts/dashboardNavigation';
import type { User } from '../types';

interface ClerkDashboardContentProps {
  user: User;
}

const ClerkDashboardContent: React.FC<ClerkDashboardContentProps> = ({ user }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = resolveActiveTab('clerk', searchParams.get('tab')) as ClerkTab;

  // Filters
  const [caseSearch, setCaseSearch] = useState('');
  const [caseStatusFilter, setCaseStatusFilter] = useState<string>('all');
  const [partySearch, setPartySearch] = useState('');
  const [filingSearch, setFilingSearch] = useState('');

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
  const upcomingHearings = dashboardData.upcoming_hearings;

  // Filtered cases
  const filteredCases = recentCases.filter((c) => {
    const matchesSearch =
      !caseSearch ||
      (c.case_number && c.case_number.toLowerCase().includes(caseSearch.toLowerCase()));
    const matchesStatus =
      caseStatusFilter === 'all' ||
      (c.status && c.status.toLowerCase() === caseStatusFilter.toLowerCase());
    return matchesSearch && matchesStatus;
  });

  // Filtered parties (Mock Preview)
  const filteredParties = MOCK_PARTIES_ROSTER.filter((p) => {
    return (
      p.name.toLowerCase().includes(partySearch.toLowerCase()) ||
      p.linked_case_number.toLowerCase().includes(partySearch.toLowerCase()) ||
      p.counsel_name.toLowerCase().includes(partySearch.toLowerCase())
    );
  });

  // Filtered filings
  const filteredFilings = recentFilings.filter((f) => {
    return (
      (f.filing_type && f.filing_type.toLowerCase().includes(filingSearch.toLowerCase())) ||
      (f.case_number && f.case_number.toLowerCase().includes(filingSearch.toLowerCase())) ||
      (f.party_name && f.party_name.toLowerCase().includes(filingSearch.toLowerCase()))
    );
  });

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
            Docket intake, document filings, litigants register, and calendar coordination
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
          { key: 'cases', label: 'Case Management', icon: FolderOpen, count: op.total_cases },
          { key: 'parties', label: 'Parties & Litigants', icon: Users, count: MOCK_PARTIES_ROSTER.length },
          { key: 'filings', label: 'Document Filings', icon: FileText, count: op.recent_filings_count },
          { key: 'hearings', label: 'Hearing Calendar', icon: Calendar, count: op.upcoming_hearings_count },
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
                              <span
                                className={`text-[10px] px-1.5 py-0.2 rounded font-medium border ${
                                  filingStatus === 'Accepted'
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : filingStatus === 'Under Review'
                                    ? 'bg-sky-50 text-sky-700 border-sky-200'
                                    : filingStatus === 'Rejected'
                                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                                    : 'bg-slate-100 text-slate-600 border-slate-200'
                                }`}
                              >
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

      {/* TAB CONTENT 2: CASE MANAGEMENT */}
      {activeTab === 'cases' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Case Docket Management</h2>
              <p className="text-xs text-slate-500">
                Case registry, status dispositions, and procedural docket tracking
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search case number..."
                  value={caseSearch}
                  onChange={(e) => setCaseSearch(e.target.value)}
                  className="pl-9 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 w-44 sm:w-56"
                />
              </div>

              <div className="flex items-center gap-1 text-xs">
                <Filter className="h-3.5 w-3.5 text-slate-400" />
                <select
                  value={caseStatusFilter}
                  onChange={(e) => setCaseStatusFilter(e.target.value)}
                  aria-label="Filter cases by status"
                  className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                >
                  <option value="all">All Statuses</option>
                  <option value="Active">Active</option>
                  <option value="Filed">Filed</option>
                  <option value="Adjourned">Adjourned</option>
                  <option value="Disposed">Disposed</option>
                  <option value="Closed">Closed</option>
                </select>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3">Case ID</th>
                  <th className="px-5 py-3">Case Number</th>
                  <th className="px-5 py-3">Current Status</th>
                  <th className="px-5 py-3">Initial Filing Date</th>
                  <th className="px-5 py-3 text-right">Clerk Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCases.length > 0 ? (
                  filteredCases.map((c, idx) => (
                    <tr key={c.case_id ?? `case-clerk-${idx}`} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-5 py-3 font-mono text-slate-500 font-medium">{c.case_id}</td>
                      <td className="px-5 py-3 font-bold text-slate-900 font-mono">{c.case_number}</td>
                      <td className="px-5 py-3">
                        <StatusBadge status={c.status} size="sm" />
                      </td>
                      <td className="px-5 py-3 text-slate-500">
                        {formatDateSafe(c.filing_date)}
                      </td>
                      <td className="px-5 py-3 text-right space-x-2">
                        <button
                          type="button"
                          disabled
                          aria-disabled="true"
                          title="Docket entry workflow is disabled in preview mode"
                          className="text-xs text-slate-400 font-medium cursor-not-allowed"
                        >
                          Docket Entry (Disabled)
                        </button>
                        <span className="text-slate-300">&bull;</span>
                        <button
                          type="button"
                          disabled
                          aria-disabled="true"
                          title="Notice workflow is disabled in preview mode"
                          className="text-xs text-slate-400 font-medium cursor-not-allowed"
                        >
                          Notice (Disabled)
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="p-8">
                      <EmptyState
                        title="No matching docket records"
                        description="Adjust your search filters to find registered cases."
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT 3: PARTIES */}
      {activeTab === 'parties' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">Parties & Litigants Roster</h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-amber-50 text-amber-800 border border-amber-200">
                  Mock Data Preview
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Verify legal representation, party roles, and process service status &bull; Litigants directory API is not yet connected to backend
              </p>
            </div>

            <div className="relative">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search litigant or case..."
                value={partySearch}
                onChange={(e) => setPartySearch(e.target.value)}
                className="pl-9 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 w-52 sm:w-64"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3">Party Name</th>
                  <th className="px-5 py-3">Party Role</th>
                  <th className="px-5 py-3">Docket Number</th>
                  <th className="px-5 py-3">Attorney of Record</th>
                  <th className="px-5 py-3">Service Verification</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredParties.length > 0 ? (
                  filteredParties.map((p) => (
                    <tr key={p.party_id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-5 py-3 font-semibold text-slate-900">{p.name}</td>
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700">
                          {p.type}
                        </span>
                      </td>
                      <td className="px-5 py-3 font-mono font-bold text-emerald-700">
                        {p.linked_case_number}
                      </td>
                      <td className="px-5 py-3 text-slate-600">{p.counsel_name}</td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-medium ${
                            p.contact_status === 'Verified' ? 'text-emerald-700' : 'text-amber-700'
                          }`}
                        >
                          <AlertCircle className="h-3 w-3" />
                          <span>{p.contact_status}</span>
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="p-8">
                      <EmptyState
                        title="No parties found"
                        description="No litigants match your search parameters."
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT 4: FILINGS */}
      {activeTab === 'filings' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Document Filings Intake Queue</h2>
              <p className="text-xs text-slate-500">
                Pleadings, motions, and affidavits received by the registry
              </p>
            </div>

            <div className="relative">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search motion or party..."
                value={filingSearch}
                onChange={(e) => setFilingSearch(e.target.value)}
                className="pl-9 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 w-52 sm:w-64"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3">Filing ID</th>
                  <th className="px-5 py-3">Case Number</th>
                  <th className="px-5 py-3">Document Title / Motion</th>
                  <th className="px-5 py-3">Submitting Litigant</th>
                  <th className="px-5 py-3">Intake Timestamp</th>
                  <th className="px-5 py-3 text-right">Filing Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredFilings.length > 0 ? (
                  filteredFilings.map((f, idx) => {
                    const filingStatus = getLiveFilingStatus(f);
                    return (
                      <tr key={f.filing_id ?? `filing-clerk-${idx}`} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-5 py-3 font-mono text-slate-500 font-medium">{f.filing_id}</td>
                        <td className="px-5 py-3 font-mono font-bold text-emerald-700">{f.case_number}</td>
                        <td className="px-5 py-3 font-semibold text-slate-900">{f.filing_type}</td>
                        <td className="px-5 py-3 text-slate-600">{f.party_name}</td>
                        <td className="px-5 py-3 text-slate-500">
                          {formatDateTimeSafe(f.filing_date)}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${
                              filingStatus === 'Accepted'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : filingStatus === 'Under Review'
                                ? 'bg-sky-50 text-sky-700 border-sky-200'
                                : filingStatus === 'Rejected'
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : 'bg-slate-100 text-slate-600 border-slate-200'
                            }`}
                          >
                            <span>{filingStatus}</span>
                          </span>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="p-8">
                      <EmptyState
                        title="No filings found"
                        description="No documents match your query."
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT 5: HEARINGS */}
      {activeTab === 'hearings' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-200">
            <h2 className="text-base font-bold text-slate-900">Courtroom Hearing Calendar</h2>
            <p className="text-xs text-slate-500">
              Master hearing docket, courtroom allocations, and judicial schedules
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3">Hearing ID</th>
                  <th className="px-5 py-3">Case Number</th>
                  <th className="px-5 py-3">Case Status</th>
                  <th className="px-5 py-3">Presiding Judge</th>
                  <th className="px-5 py-3">Calendar Date & Time</th>
                  <th className="px-5 py-3 text-right">Clerk Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {upcomingHearings.length > 0 ? (
                  upcomingHearings.map((h, idx) => (
                    <tr key={h.hearing_id ?? `hearing-clerk-${idx}`} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-5 py-3 font-mono text-slate-500 font-medium">{h.hearing_id}</td>
                      <td className="px-5 py-3 font-bold text-slate-900 font-mono">{h.case_number}</td>
                      <td className="px-5 py-3">
                        <StatusBadge status={h.case_status} size="sm" />
                      </td>
                      <td className="px-5 py-3 text-slate-800 font-medium">{h.judge_name}</td>
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
                      <td className="px-5 py-3 text-right space-x-2">
                        <button
                          type="button"
                          disabled
                          aria-disabled="true"
                          title="Summons issuance is not available in preview mode"
                          className="text-xs text-slate-400 font-medium cursor-not-allowed"
                        >
                          Summons (Disabled)
                        </button>
                        <span className="text-slate-300">&bull;</span>
                        <button
                          type="button"
                          disabled
                          aria-disabled="true"
                          title="Hearing adjournment is not available in preview mode"
                          className="text-xs text-slate-400 font-medium cursor-not-allowed"
                        >
                          Adjourn (Disabled)
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="p-8">
                      <EmptyState
                        title="No scheduled hearings"
                        description="There are currently no hearings scheduled on the calendar."
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
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
