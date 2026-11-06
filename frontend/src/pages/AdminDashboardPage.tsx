/**
 * Court Case Management System - Admin Dashboard
 *
 * Comprehensive administrative management interface providing:
 * - Overview & System Statistics
 * - User Directory & Access Management
 * - Full Case Registry & Oversight
 * - Judicial Bench Roster
 * - Litigants & Parties Registry
 * - System-wide Court Hearings Calendar
 * - System Audit Trail
 */

import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Shield,
  Activity,
  Users,
  FolderOpen,
  Gavel,
  UserCheck,
  Calendar,
  ScrollText,
  Search,
  Filter,
  ArrowUpRight,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../context';
import { StatCard, StatusBadge, EmptyState } from '../components';
import {
  MOCK_ADMIN_DASHBOARD,
  MOCK_SYSTEM_USERS,
  MOCK_JUDICIAL_ROSTER,
  MOCK_PARTIES_ROSTER,
  MOCK_RECENT_CASES,
} from '../data/mockDashboardData';
import {
  resolveActiveTab,
  buildPreservedTabSearchParams,
  formatDateSafe,
  formatTimeSafe,
  formatDateTimeSafe,
  type AdminTab,
} from '../layouts/dashboardNavigation';

export const AdminDashboardPage: React.FC = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = resolveActiveTab('admin', searchParams.get('tab')) as AdminTab;

  // Filters for sub-sections
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<string>('all');
  const [caseSearch, setCaseSearch] = useState('');
  const [caseStatusFilter, setCaseStatusFilter] = useState<string>('all');
  const [partySearch, setPartySearch] = useState('');

  const setActiveTab = (tab: AdminTab) => {
    setSearchParams((prev) => buildPreservedTabSearchParams(prev, tab));
  };

  const dashboardData = MOCK_ADMIN_DASHBOARD;

  // Filtered users
  const filteredUsers = MOCK_SYSTEM_USERS.filter((u) => {
    const matchesSearch =
      u.username.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.user_id.toString().includes(userSearch);
    const matchesRole = userRoleFilter === 'all' || u.role === userRoleFilter;
    return matchesSearch && matchesRole;
  });

  // Filtered cases
  const filteredCases = MOCK_RECENT_CASES.filter((c) => {
    const matchesSearch =
      !caseSearch ||
      (c.case_number && c.case_number.toLowerCase().includes(caseSearch.toLowerCase()));
    const matchesStatus =
      caseStatusFilter === 'all' ||
      (c.status && c.status.toLowerCase() === caseStatusFilter.toLowerCase());
    return matchesSearch && matchesStatus;
  });

  // Filtered parties
  const filteredParties = MOCK_PARTIES_ROSTER.filter((p) => {
    return (
      p.name.toLowerCase().includes(partySearch.toLowerCase()) ||
      p.linked_case_number.toLowerCase().includes(partySearch.toLowerCase()) ||
      p.counsel_name.toLowerCase().includes(partySearch.toLowerCase())
    );
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
              <Shield className="h-7 w-7 text-indigo-600" />
              Executive Judicial Administration
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
              Admin Level
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            System governance, user oversight, judicial rosters, and operational audit trail
          </p>
        </div>

        {/* User Card */}
        <div className="flex items-center space-x-3 bg-white px-4 py-2.5 rounded-xl border border-slate-200 shadow-xs">
          <div className="h-9 w-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-sm uppercase border border-indigo-100">
            {user?.username.charAt(0) || 'A'}
          </div>
          <div className="text-left text-xs">
            <p className="font-semibold text-slate-900">{user?.username}</p>
            <p className="text-slate-500">Administrator &bull; UID #{user?.user_id}</p>
          </div>
        </div>
      </div>

      {/* Navigation Tabs Pill Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-200 text-xs">
        {[
          { key: 'overview', label: 'Overview & Metrics', icon: Activity },
          { key: 'users', label: 'User Directory', icon: Users, count: MOCK_SYSTEM_USERS.length },
          { key: 'cases', label: 'Case Management', icon: FolderOpen, count: dashboardData.total_cases },
          { key: 'judges', label: 'Judicial Roster', icon: Gavel, count: dashboardData.judges.total },
          { key: 'parties', label: 'Litigants & Parties', icon: UserCheck, count: dashboardData.total_parties },
          { key: 'hearings', label: 'Court Hearings', icon: Calendar, count: dashboardData.upcoming_hearings.length },
          { key: 'audit-logs', label: 'Audit Trail', icon: ScrollText, count: dashboardData.recent_audit_activity.length },
        ].map((tab) => {
          const Icon = tab.icon;
          const isSelected = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key as AdminTab)}
              className={`
                flex items-center gap-2 px-3.5 py-2 rounded-lg font-medium transition-all cursor-pointer whitespace-nowrap
                ${
                  isSelected
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-slate-200'
                }
              `}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                    isSelected ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-600'
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
          {/* Stat Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <StatCard
              title="Total Cases"
              value={dashboardData.total_cases.toLocaleString()}
              subtitle="All registered matters"
              icon={FolderOpen}
              accent="indigo"
              badge="System Total"
            />
            <StatCard
              title="Active Cases"
              value={dashboardData.cases_by_status.Active || 0}
              subtitle="Active proceedings"
              icon={Activity}
              accent="emerald"
              badge="In Progress"
            />
            <StatCard
              title="Judicial Officers"
              value={`${dashboardData.judges.active} / ${dashboardData.judges.total}`}
              subtitle="Active bench judges"
              icon={Gavel}
              accent="amber"
              badge="Bench Roster"
            />
            <StatCard
              title="Litigants & Parties"
              value={dashboardData.total_parties.toLocaleString()}
              subtitle="Verified participants"
              icon={UserCheck}
              accent="sky"
              badge="Parties"
            />
            <StatCard
              title="Scheduled Hearings"
              value={dashboardData.upcoming_hearings.length}
              subtitle="Pending calendar slots"
              icon={Calendar}
              accent="purple"
              badge="Upcoming"
            />
          </div>

          {/* Case Status Distribution Matrix */}
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
                100% of active docket accounted
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {Object.entries(dashboardData.cases_by_status).map(([status, count]) => {
                const percentage =
                  dashboardData.total_cases > 0
                    ? Math.round((count / dashboardData.total_cases) * 100)
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

          {/* Side-by-side Overview Grids: Upcoming Hearings & Audit Activity */}
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
                    onClick={() => setActiveTab('hearings')}
                    className="text-xs font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
                  >
                    <span>Full Docket</span>
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </button>
                </div>

                {dashboardData.upcoming_hearings.length > 0 ? (
                  <div className="space-y-3">
                    {dashboardData.upcoming_hearings.slice(0, 4).map((h, idx) => (
                      <div
                        key={h.hearing_id ?? `h-prev-${idx}`}
                        className="p-3 rounded-lg border border-slate-100 bg-slate-50 hover:bg-slate-100/80 transition-colors flex items-center justify-between text-xs"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 font-mono">
                              {h.case_number}
                            </span>
                            <StatusBadge status={h.case_status} size="sm" />
                          </div>
                          <p className="text-slate-600">{h.judge_name}</p>
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
                <span className="text-[11px] text-slate-500">
                  {dashboardData.upcoming_hearings.length} total hearings scheduled across all divisions
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
                      System Audit Activity
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('audit-logs')}
                    className="text-xs font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
                  >
                    <span>Audit Log</span>
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </button>
                </div>

                {dashboardData.recent_audit_activity.length > 0 ? (
                  <div className="space-y-3">
                    {dashboardData.recent_audit_activity.slice(0, 4).map((log, idx) => (
                      <div
                        key={log.log_id ?? `log-prev-${idx}`}
                        className="p-3 rounded-lg border border-slate-100 bg-slate-50 hover:bg-slate-100/80 transition-colors flex items-center justify-between text-xs"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-800">
                              {log.action_type}
                            </span>
                            <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.2 rounded font-mono">
                              {log.username}
                            </span>
                          </div>
                          <p className="text-slate-500 font-mono text-[11px]">
                            Case ref: {log.case_id}
                          </p>
                        </div>
                        <div className="text-right text-slate-500">
                          <div className="flex items-center gap-1 text-slate-700 font-medium">
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
                <span className="text-[11px] text-slate-500">
                  Audit events recorded in system log
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT 2: USERS */}
      {activeTab === 'users' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">User Directory & Roles</h2>
              <p className="text-xs text-slate-500">
                Court staff accounts, role assignments, and judicial affiliations
              </p>
            </div>

            {/* Search and Filters */}
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search user or ID..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="pl-9 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 w-44 sm:w-56"
                />
              </div>

              <div className="flex items-center gap-1 text-xs">
                <Filter className="h-3.5 w-3.5 text-slate-400" />
                <select
                  value={userRoleFilter}
                  onChange={(e) => setUserRoleFilter(e.target.value)}
                  aria-label="Filter users by role"
                  className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  <option value="all">All Roles</option>
                  <option value="admin">Admin</option>
                  <option value="clerk">Clerk</option>
                  <option value="judge">Judge</option>
                </select>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3">User ID</th>
                  <th className="px-5 py-3">Username</th>
                  <th className="px-5 py-3">Assigned Role</th>
                  <th className="px-5 py-3">Judge ID Link</th>
                  <th className="px-5 py-3">Account Status</th>
                  <th className="px-5 py-3">Registration Date</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.length > 0 ? (
                  filteredUsers.map((u) => (
                    <tr key={u.user_id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-5 py-3 font-mono text-slate-500 font-medium">#{u.user_id}</td>
                      <td className="px-5 py-3 font-semibold text-slate-900">{u.username}</td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium uppercase tracking-wider ${
                            u.role === 'admin'
                              ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                              : u.role === 'clerk'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="px-5 py-3 font-mono text-slate-500 text-[11px]">
                        {u.judge_id ? `${u.judge_id.slice(0, 8)}...` : '—'}
                      </td>
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-medium text-[11px]">
                          <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                          <span>{u.status}</span>
                        </span>
                      </td>
                      <td className="px-5 py-3 text-slate-500">{formatDateSafe(u.created_at)}</td>
                      <td className="px-5 py-3 text-right">
                        <button
                          type="button"
                          disabled
                          aria-disabled="true"
                          title="User permission management is not available in preview mode"
                          className="text-xs text-slate-400 font-medium cursor-not-allowed"
                        >
                          Edit Permissions (Disabled)
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="p-8">
                      <EmptyState
                        title="No users found"
                        description="No user records match your search criteria."
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT 3: CASES */}
      {activeTab === 'cases' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Case Registry & Oversight</h2>
              <p className="text-xs text-slate-500">
                System-wide case tracking and status disposition monitoring
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
                  className="pl-9 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 w-44 sm:w-56"
                />
              </div>

              <select
                value={caseStatusFilter}
                onChange={(e) => setCaseStatusFilter(e.target.value)}
                aria-label="Filter cases by status"
                className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
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

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3">Case ID</th>
                  <th className="px-5 py-3">Case Number</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Filing Date</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCases.length > 0 ? (
                  filteredCases.map((c, idx) => (
                    <tr key={c.case_id ?? `case-${idx}`} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-5 py-3 font-mono text-slate-500 font-medium">{c.case_id}</td>
                      <td className="px-5 py-3 font-bold text-slate-900 font-mono">{c.case_number}</td>
                      <td className="px-5 py-3">
                        <StatusBadge status={c.status} size="sm" />
                      </td>
                      <td className="px-5 py-3 text-slate-500">
                        {formatDateSafe(c.filing_date)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          type="button"
                          disabled
                          aria-disabled="true"
                          title="Docket inspection is not available in preview mode"
                          className="text-xs text-slate-400 font-medium cursor-not-allowed"
                        >
                          Inspect (Disabled)
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="p-8">
                      <EmptyState
                        title="No cases match filters"
                        description="Try clearing your search query or selecting another status filter."
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT 4: JUDGES */}
      {activeTab === 'judges' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-200">
            <h2 className="text-base font-bold text-slate-900">Judicial Officers Bench Roster</h2>
            <p className="text-xs text-slate-500">
              Active judges, courtroom assignments, and caseload distribution
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-5">
            {MOCK_JUDICIAL_ROSTER.map((judge) => (
              <div
                key={judge.judge_id}
                className="p-4 rounded-xl border border-slate-200 bg-white hover:border-amber-300 transition-all shadow-xs space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="h-9 w-9 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
                    <Gavel className="h-5 w-5" />
                  </div>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                    {judge.status}
                  </span>
                </div>

                <div>
                  <h4 className="text-sm font-bold text-slate-900">{judge.name}</h4>
                  <p className="text-xs text-slate-500">{judge.division}</p>
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                  <span>{judge.courtroom}</span>
                  <span className="font-semibold text-slate-900 font-mono">
                    {judge.active_cases_count} Cases
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB CONTENT 5: PARTIES */}
      {activeTab === 'parties' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Litigants & Parties Registry</h2>
              <p className="text-xs text-slate-500">
                Verified litigants, legal representatives, and procedural status
              </p>
            </div>

            <div className="relative">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search party or case..."
                value={partySearch}
                onChange={(e) => setPartySearch(e.target.value)}
                className="pl-9 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 w-52 sm:w-64"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3">Party Name</th>
                  <th className="px-5 py-3">Party Type</th>
                  <th className="px-5 py-3">Associated Case</th>
                  <th className="px-5 py-3">Legal Counsel</th>
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
                      <td className="px-5 py-3 font-mono font-bold text-indigo-700">
                        {p.linked_case_number}
                      </td>
                      <td className="px-5 py-3 text-slate-600">{p.counsel_name}</td>
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                          <CheckCircle2 className="h-3 w-3 text-emerald-600" />
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
                        description="No litigants or parties match your search query."
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT 6: HEARINGS */}
      {activeTab === 'hearings' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-200">
            <h2 className="text-base font-bold text-slate-900">System Court Hearings Calendar</h2>
            <p className="text-xs text-slate-500">
              Master hearing schedule across all judicial divisions and presiding judges
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
                  <th className="px-5 py-3">Scheduled Date & Time</th>
                  <th className="px-5 py-3 text-right">Calendar Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dashboardData.upcoming_hearings.length > 0 ? (
                  dashboardData.upcoming_hearings.map((h, idx) => (
                    <tr key={h.hearing_id ?? `hearing-all-${idx}`} className="hover:bg-slate-50/80 transition-colors">
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
                      <td className="px-5 py-3 text-right">
                        <button
                          type="button"
                          disabled
                          aria-disabled="true"
                          title="Hearing rescheduling is not available in preview mode"
                          className="text-xs text-slate-400 font-medium cursor-not-allowed"
                        >
                          Reschedule (Disabled)
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="p-8">
                      <EmptyState
                        title="No scheduled hearings"
                        description="There are currently no hearings scheduled on the master court calendar."
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT 7: AUDIT LOGS */}
      {activeTab === 'audit-logs' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">System Audit Trail</h2>
              <p className="text-xs text-slate-500">
                Log of judicial docket modifications, filings, and administrative transactions
              </p>
            </div>
            <span className="px-2.5 py-1 rounded-full text-xs font-mono font-medium bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
              <span>Audit Logging Active</span>
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3">Log ID</th>
                  <th className="px-5 py-3">Action Type</th>
                  <th className="px-5 py-3">Authorizing User</th>
                  <th className="px-5 py-3">Case Reference</th>
                  <th className="px-5 py-3">Timestamp</th>
                  <th className="px-5 py-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dashboardData.recent_audit_activity.length > 0 ? (
                  dashboardData.recent_audit_activity.map((log, idx) => (
                    <tr key={log.log_id ?? `audit-all-${idx}`} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-5 py-3 font-mono text-slate-500 font-medium">{log.log_id}</td>
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-slate-100 text-slate-800">
                          {log.action_type}
                        </span>
                      </td>
                      <td className="px-5 py-3 font-semibold text-slate-900">{log.username}</td>
                      <td className="px-5 py-3 font-mono text-indigo-700">{log.case_id}</td>
                      <td className="px-5 py-3 text-slate-600">
                        {formatDateTimeSafe(log.changed_at)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600">
                          <span>Recorded</span>
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="p-8">
                      <EmptyState
                        title="No audit events"
                        description="No operational audit entries have been logged."
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
