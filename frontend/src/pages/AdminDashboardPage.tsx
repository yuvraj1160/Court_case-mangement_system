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

import React, { useState, useEffect } from 'react';
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
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../context/index.ts';
import { useDashboardData } from '../hooks/index.ts';
import {
  AdminOverviewSection,
  AdminUsersSection,
  AdminCasesSection,
  AdminHearingsSection,
  AdminAuditSection,
  AdminJudgesSection,
  EmptyState,
} from '../components/index.ts';
import { PartiesSection } from '../components/clerk/PartiesSection.tsx';
import { listHearings } from '../api/index.ts';
import {
  resolveActiveTab,
  buildPreservedTabSearchParams,
  type AdminTab,
} from '../layouts/dashboardNavigation.ts';
import type { User } from '../types/index.ts';

interface AdminDashboardContentProps {
  user: User;
}

const AdminDashboardContent: React.FC<AdminDashboardContentProps> = ({ user }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = resolveActiveTab('admin', searchParams.get('tab')) as AdminTab;
  const [inspectedCaseId, setInspectedCaseId] = useState<string | null>(null);
  const [totalHearingsCount, setTotalHearingsCount] = useState<number>(0);

  const setActiveTab = (tab: AdminTab) => {
    setSearchParams((prev) => buildPreservedTabSearchParams(prev, tab));
  };

  const handleInspectCase = (caseId: string) => {
    setInspectedCaseId(caseId);
    setActiveTab('cases');
  };

  const {
    data: liveData,
    isLoading,
    error,
    refetch,
  } = useDashboardData('admin', { userId: user.user_id });

  // Query live hearings count for accurate metrics overview
  useEffect(() => {
    let isCurrent = true;
    const fetchHearingsTotal = async () => {
      try {
        const res = await listHearings({ page: 1, limit: 1 });
        if (isCurrent && res?.pagination) {
          setTotalHearingsCount(res.pagination.total_records);
        }
      } catch {
        // Non-blocking fallback
      }
    };

    void fetchHearingsTotal();
    return () => {
      isCurrent = false;
    };
  }, [liveData]);

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
                <Shield className="h-7 w-7 text-indigo-600" />
                Executive Judicial Administration
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                System Administration
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Live enterprise court oversight, judicial personnel, dockets, and audit telemetry
            </p>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center py-24 space-y-4">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
          <p className="text-sm font-medium text-slate-500">
            Connecting to administration service and loading system telemetry...
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
                <Shield className="h-7 w-7 text-indigo-600" />
                Executive Judicial Administration
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                System Administration
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Live enterprise court oversight, judicial personnel, dockets, and audit telemetry
            </p>
          </div>
        </div>

        <div className="p-6 bg-white rounded-xl border border-rose-200 shadow-sm space-y-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-6 w-6 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-rose-900">
                Administration Telemetry Service Error
              </h3>
              <p className="text-sm text-rose-700">{error}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => void refetch()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" />
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
          title="System Telemetry Unavailable"
          description="Administration metrics and server telemetry could not be retrieved."
          icon={Activity}
          actionLabel="Retry Connection"
          onAction={() => void refetch()}
        />
      </div>
    );
  }

  const upcomingCount = liveData.upcoming_hearings?.length ?? 0;
  const auditCount = liveData.recent_audit_activity?.length ?? 0;

  return (
    <div className="space-y-6">
      {/* 1. Executive Portal Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
              <Shield className="h-7 w-7 text-indigo-600" />
              Executive Judicial Administration
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
              System Administration
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
              Live DB Telemetry
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Enterprise system oversight, docket integrity, access management, and audit verification for{' '}
            <span className="font-semibold text-slate-700">{user.username}</span>
          </p>
        </div>

        {/* User Card */}
        <div className="flex items-center space-x-3 bg-white px-4 py-2.5 rounded-xl border border-slate-200 shadow-sm">
          <div className="h-9 w-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-sm uppercase border border-indigo-100">
            {user.username.charAt(0) || 'A'}
          </div>
          <div className="text-left text-xs">
            <p className="font-semibold text-slate-900">{user.username}</p>
            <p className="text-slate-500 font-mono text-[11px]">User ID: #{user.user_id}</p>
          </div>
        </div>
      </div>

      {/* 2. Top Navigation Pill Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-200 text-xs">
        {[
          { key: 'overview', label: 'Overview & Metrics', icon: Shield },
          { key: 'users', label: 'User Directory', icon: Users },
          { key: 'cases', label: 'Case Management', icon: FolderOpen, count: liveData.total_cases },
          { key: 'judges', label: 'Judicial Roster', icon: Gavel, count: liveData.judges?.total },
          { key: 'parties', label: 'Litigants & Parties', icon: UserCheck, count: liveData.total_parties },
          { key: 'hearings', label: 'Court Hearings', icon: Calendar, count: totalHearingsCount || upcomingCount },
          { key: 'audit-logs', label: 'Audit Trail', icon: ScrollText, count: auditCount },
        ].map((tab) => {
          const Icon = tab.icon;
          const isSelected = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              data-testid={`admin-nav-tab-${tab.key}`}
              onClick={() => setActiveTab(tab.key as AdminTab)}
              className={`
                flex items-center gap-2 px-3.5 py-2 rounded-lg font-medium transition-all cursor-pointer whitespace-nowrap
                ${
                  isSelected
                    ? 'bg-indigo-600 text-white shadow-sm'
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

      {/* 3. Section Renderers */}
      {activeTab === 'overview' && (
        <AdminOverviewSection
          liveData={liveData}
          totalHearingsCount={totalHearingsCount}
          onNavigateTab={setActiveTab}
          onInspectCase={handleInspectCase}
        />
      )}

      {activeTab === 'users' && (
        <AdminUsersSection currentUsername={user.username} />
      )}

      {activeTab === 'cases' && (
        <AdminCasesSection
          initialCaseId={inspectedCaseId}
          onClearInitialCaseId={() => setInspectedCaseId(null)}
        />
      )}

      {activeTab === 'judges' && (
        <AdminJudgesSection judgesSummary={liveData.judges} />
      )}

      {activeTab === 'parties' && (
        <PartiesSection />
      )}

      {activeTab === 'hearings' && (
        <AdminHearingsSection />
      )}

      {activeTab === 'audit-logs' && (
        <AdminAuditSection
          auditLogs={liveData.recent_audit_activity ?? []}
          onRefresh={refetch}
          isRefreshing={isLoading}
        />
      )}
    </div>
  );
};

export const AdminDashboardPage: React.FC = () => {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  // Key by both user_id and role to guarantee full in-memory state reset on account switch
  return <AdminDashboardContent key={`${user.user_id}:${user.role}`} user={user} />;
};
