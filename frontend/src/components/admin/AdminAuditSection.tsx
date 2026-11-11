/**
 * Court Case Management System - Admin Audit Section
 * System Audit Trail and Transaction Integrity Viewer.
 *
 * Implements:
 * - Read-only inspection of server-backed audit trail (`recent_audit_activity`).
 * - Filters by actor/username, action type (INSERT, UPDATE, DELETE), case ID, and date.
 * - Transaction detail inspection modal displaying audit log metadata.
 * - Tamper-evident immutable governance explanation: PostgreSQL audit triggers
 *   capture transaction-local `app.username` into append-only tables.
 * - Zero edit/delete mutation capabilities.
 */

import React, { useState, useMemo } from 'react';
import {
  ScrollText,
  Search,
  Filter,
  Eye,
  Shield,
  User,
  Lock,
  Calendar,
} from 'lucide-react';
import type { AuditLogSummary } from '../../types';
import { Modal, EmptyState } from '../index';
import { formatDateTimeSafe } from '../../layouts/dashboardNavigation';

export interface AdminAuditSectionProps {
  auditLogs: AuditLogSummary[];
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const AdminAuditSection: React.FC<AdminAuditSectionProps> = ({
  auditLogs,
  onRefresh,
  isRefreshing = false,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('');
  const [selectedLog, setSelectedLog] = useState<AuditLogSummary | null>(null);

  // Filtered Audit Logs
  const filteredLogs = useMemo(() => {
    return auditLogs.filter((log) => {
      const term = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !term ||
        (log.username && log.username.toLowerCase().includes(term)) ||
        (log.case_id && log.case_id.toLowerCase().includes(term)) ||
        (log.log_id && log.log_id.toLowerCase().includes(term)) ||
        (log.action_type && log.action_type.toLowerCase().includes(term));

      const matchesAction =
        actionFilter === 'all' ||
        (log.action_type && log.action_type.toUpperCase() === actionFilter.toUpperCase());

      const matchesDate =
        !dateFilter ||
        (log.changed_at && log.changed_at.startsWith(dateFilter));

      return matchesSearch && matchesAction && matchesDate;
    });
  }, [auditLogs, searchTerm, actionFilter, dateFilter]);

  const getActionBadge = (action: string | null) => {
    const act = (action || '').toUpperCase();
    switch (act) {
      case 'INSERT':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            INSERT
          </span>
        );
      case 'UPDATE':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            UPDATE
          </span>
        );
      case 'DELETE':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            DELETE
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            {action || 'ACTION'}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header & Immutability Architecture Banner */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <ScrollText className="h-6 w-6 text-indigo-600" />
              Judicial Audit Trail & Security Ledger
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Append-only transaction telemetry recorded by PostgreSQL row-level database triggers
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
              <Lock className="h-3.5 w-3.5 text-slate-600" />
              Tamper-Evident / Append-Only
            </span>
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={isRefreshing}
                className="px-3 py-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                {isRefreshing ? 'Refreshing...' : 'Refresh Logs'}
              </button>
            )}
          </div>
        </div>

        {/* Database Audit Standard Explanation */}
        <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 space-y-1.5">
          <div className="flex items-center gap-2 font-semibold text-slate-900">
            <Shield className="h-4 w-4 text-indigo-600 shrink-0" />
            Audit Architecture Standard
          </div>
          <p>
            Every mutating transaction across cases, hearings, parties, filings, and adjournments executes within a transaction-local session environment where <code className="bg-slate-200 px-1 py-0.5 rounded font-mono">SET LOCAL app.username = &lt;authenticated_actor&gt;</code> is pinned.
          </p>
          <p className="text-slate-500">
            PostgreSQL triggers read <code className="bg-slate-200 px-1 py-0.5 rounded font-mono">current_setting('app.username', true)</code> and append immutable rows directly into <code className="bg-slate-200 px-1 py-0.5 rounded font-mono">audit_logs</code>. Audit records cannot be modified, deleted, or overridden via API or administrative dashboard.
          </p>
        </div>
      </div>

      {/* 2. Search & Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            data-testid="audit-search-input"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search actor username, case ID, log ID..."
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-400" />
            <select
              data-testid="audit-action-filter"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Action Types</option>
              <option value="INSERT">INSERT (Create)</option>
              <option value="UPDATE">UPDATE (Modify)</option>
              <option value="DELETE">DELETE (Remove)</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-slate-400" />
            <input
              type="date"
              data-testid="audit-date-filter"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {(searchTerm || actionFilter !== 'all' || dateFilter) && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setActionFilter('all');
                setDateFilter('');
              }}
              className="px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* 3. Audit Ledger Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {filteredLogs.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title="No Audit Records Found"
            description="No transaction audit events match the selected search or action criteria."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" data-testid="audit-logs-table">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-semibold uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3.5">Timestamp</th>
                  <th className="px-6 py-3.5">Actor (app.username)</th>
                  <th className="px-6 py-3.5">Action</th>
                  <th className="px-6 py-3.5">Affected Case UUID</th>
                  <th className="px-6 py-3.5">Log ID</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredLogs.map((log, idx) => (
                  <tr
                    key={log.log_id || `audit-${idx}`}
                    className="hover:bg-slate-50/80 transition-colors"
                    data-testid={`audit-row-${log.log_id || idx}`}
                  >
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900 text-xs">
                        {formatDateTimeSafe(log.changed_at)}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {log.changed_at ? new Date(log.changed_at).toISOString() : ''}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 font-medium text-slate-800 text-xs">
                        <User className="h-3.5 w-3.5 text-slate-400" />
                        <span>{log.username || 'system_trigger'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">{getActionBadge(log.action_type)}</td>
                    <td className="px-6 py-4 font-mono text-xs text-slate-600">
                      {log.case_id ? (
                        <span className="bg-slate-100 px-2 py-0.5 rounded">{log.case_id}</span>
                      ) : (
                        <span className="text-slate-400">N/A</span>
                      )}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-slate-400">
                      #{log.log_id}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedLog(log)}
                        data-testid={`inspect-audit-${log.log_id || idx}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors cursor-pointer"
                      >
                        <Eye className="h-3 w-3" />
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4. Audit Log Detail Modal */}
      {selectedLog && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedLog(null)}
          title="Audit Trail Transaction Record"
        >
          <div className="space-y-4" data-testid="audit-detail-modal">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <span className="text-xs font-mono text-slate-400">Log ID: #{selectedLog.log_id}</span>
                <div className="text-sm font-bold text-slate-900 mt-0.5">
                  Action: {selectedLog.action_type}
                </div>
              </div>
              <div>{getActionBadge(selectedLog.action_type)}</div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-slate-500 block">Authenticated Actor</span>
                <span className="font-semibold text-slate-800 text-sm">{selectedLog.username || 'System Trigger'}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-slate-500 block">Transaction Timestamp</span>
                <span className="font-semibold text-slate-800">
                  {formatDateTimeSafe(selectedLog.changed_at)}
                </span>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 space-y-1 text-xs">
              <span className="text-slate-500 block">Target Case Entity UUID</span>
              <span className="font-mono text-slate-800 font-semibold block">
                {selectedLog.case_id || 'Global / Non-Case Transaction'}
              </span>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 space-y-1 text-xs">
              <span className="text-slate-500 block">PostgreSQL Trigger Context</span>
              <p className="text-slate-600 font-mono text-[11px]">
                Trigger Function: fn_audit_log_record()
                <br />
                Session Parameter: app.username = &apos;{selectedLog.username}&apos;
                <br />
                Storage Guarantee: Append-Only Immutable Ledger
              </p>
            </div>

            <div className="pt-3 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
