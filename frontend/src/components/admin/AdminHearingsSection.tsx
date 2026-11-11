/**
 * Court Case Management System - Admin Hearings Section
 * Provides system-wide hearing calendar oversight and scheduling for Administrators.
 *
 * Implements:
 * - Live hearings query with date range, judge ID, and case ID filters.
 * - Hearing scheduling (POST /api/hearings) with conflict detection (HTTP 409)
 *   and daylight saving validation reporting.
 * - Hearing detail inspection with immutability notice (hearings cannot be updated
 *   or deleted; adjournments record postponements).
 * - Strictly preserves schema fidelity: NO courtroom/chambers fields.
 */

import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Plus,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  User,
  Filter,
  Eye,
  Info,
} from 'lucide-react';
import {
  listHearings,
  getHearing,
  createHearing,
  ApiClientError,
} from '../../api';
import type {
  HearingListItem,
  HearingDetail,
  PaginationInfo,
} from '../../types';
import {
  EmptyState,
  Modal,
  PaginationControls,
} from '../index';
import { formatDateSafe, formatTimeSafe } from '../../layouts/dashboardNavigation';

export const AdminHearingsSection: React.FC = () => {
  const [hearings, setHearings] = useState<HearingListItem[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 10,
    total_records: 0,
    total_pages: 1,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters
  const [caseIdFilter, setCaseIdFilter] = useState('');
  const [judgeIdFilter, setJudgeIdFilter] = useState('');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  const [appliedFilters, setAppliedFilters] = useState({
    caseId: '',
    judgeId: '',
    startDate: '',
    endDate: '',
  });
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);

  // Detail Modal State
  const [selectedHearingId, setSelectedHearingId] = useState<string | null>(null);
  const [hearingDetail, setHearingDetail] = useState<HearingDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Schedule Hearing Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newCaseId, setNewCaseId] = useState('');
  const [newJudgeId, setNewJudgeId] = useState('');
  const [newStartTime, setNewStartTime] = useState('');
  const [newEndTime, setNewEndTime] = useState('');
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const [dstError, setDstError] = useState<string | null>(null);

  // Fetch Hearings
  useEffect(() => {
    let isCurrent = true;
    const run = async () => {
      try {
        setIsLoading(true);
        const res = await listHearings({
          page,
          limit: 10,
          case_id: appliedFilters.caseId.trim() || undefined,
          judge_id: appliedFilters.judgeId.trim() || undefined,
          start_date: appliedFilters.startDate ? `${appliedFilters.startDate}T00:00:00` : undefined,
          end_date: appliedFilters.endDate ? `${appliedFilters.endDate}T23:59:59` : undefined,
        });
        if (isCurrent) {
          setHearings(res.data);
          setPagination(res.pagination);
          setError(null);
        }
      } catch (err) {
        if (isCurrent) {
          if (err instanceof ApiClientError) {
            setError(err.message);
          } else {
            setError('Failed to retrieve system hearings calendar.');
          }
        }
      } finally {
        if (isCurrent) {
          setIsLoading(false);
        }
      }
    };

    run();
    return () => {
      isCurrent = false;
    };
  }, [page, appliedFilters, reloadKey]);

  // Fetch Hearing Detail
  useEffect(() => {
    if (!selectedHearingId) {
      return;
    }

    let isCurrent = true;
    const loadDetail = async () => {
      try {
        setIsLoadingDetail(true);
        setDetailError(null);
        const res = await getHearing(selectedHearingId);
        if (isCurrent) {
          setHearingDetail(res.data);
        }
      } catch (err) {
        if (isCurrent) {
          if (err instanceof ApiClientError) {
            setDetailError(err.message);
          } else {
            setDetailError('Unable to load hearing session details.');
          }
        }
      } finally {
        if (isCurrent) {
          setIsLoadingDetail(false);
        }
      }
    };

    void loadDetail();
    return () => {
      isCurrent = false;
    };
  }, [selectedHearingId]);

  const handleApplyFilters = (e: React.FormEvent) => {
    e.preventDefault();
    setAppliedFilters({
      caseId: caseIdFilter,
      judgeId: judgeIdFilter,
      startDate: startDateFilter,
      endDate: endDateFilter,
    });
    setPage(1);
  };

  const handleResetFilters = () => {
    setCaseIdFilter('');
    setJudgeIdFilter('');
    setStartDateFilter('');
    setEndDateFilter('');
    setAppliedFilters({
      caseId: '',
      judgeId: '',
      startDate: '',
      endDate: '',
    });
    setPage(1);
  };

  const handleCreateHearing = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setConflictWarning(null);
    setDstError(null);

    if (!newCaseId.trim() || !newJudgeId.trim() || !newStartTime || !newEndTime) {
      setCreateError('Case ID, Judge ID, start time, and end time are required.');
      return;
    }

    try {
      setIsSubmittingCreate(true);
      await createHearing({
        case_id: newCaseId.trim(),
        judge_id: newJudgeId.trim(),
        start_time: newStartTime,
        end_time: newEndTime,
      });

      setSuccessMessage('Court hearing session successfully scheduled.');
      setIsCreateOpen(false);
      setNewCaseId('');
      setNewJudgeId('');
      setNewStartTime('');
      setNewEndTime('');
      setReloadKey((k) => k + 1);
    } catch (err) {
      if (err instanceof ApiClientError) {
        const msg = err.message.toLowerCase();
        if (err.status === 409 || msg.includes('overlap') || msg.includes('conflict') || msg.includes('schedule')) {
          setConflictWarning(
            err.message || 'The designated presiding judge already has a scheduled hearing session conflicting with this time range.'
          );
        } else if (msg.includes('daylight') || msg.includes('dst') || msg.includes('timezone') || msg.includes('transition')) {
          setDstError(err.message || 'Hearing time falls in an invalid daylight-saving transition boundary.');
        } else {
          setCreateError(err.message);
        }
      } else {
        setCreateError('Failed to schedule hearing session.');
      }
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Alert Messages */}
      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-emerald-800 text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="text-xs font-semibold text-emerald-700 hover:text-emerald-900"
          >
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between text-rose-800 text-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="text-xs font-semibold text-rose-700 hover:text-rose-900 flex items-center gap-1"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </button>
        </div>
      )}

      {/* Control Bar: Filters & Schedule Button */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <form onSubmit={handleApplyFilters} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Case UUID
            </label>
            <input
              type="text"
              data-testid="admin-hearing-filter-case-id"
              value={caseIdFilter}
              onChange={(e) => setCaseIdFilter(e.target.value)}
              placeholder="Case UUID..."
              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Judge ID
            </label>
            <input
              type="text"
              data-testid="admin-hearing-filter-judge-id"
              value={judgeIdFilter}
              onChange={(e) => setJudgeIdFilter(e.target.value)}
              placeholder="e.g. J-VANCE-01"
              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              From Date
            </label>
            <input
              type="date"
              data-testid="admin-hearing-filter-start-date"
              value={startDateFilter}
              onChange={(e) => setStartDateFilter(e.target.value)}
              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              To Date
            </label>
            <input
              type="date"
              data-testid="admin-hearing-filter-end-date"
              value={endDateFilter}
              onChange={(e) => setEndDateFilter(e.target.value)}
              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-end gap-2">
            <button
              type="submit"
              data-testid="admin-apply-hearing-filters"
              className="flex-1 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer"
            >
              <Filter className="h-3.5 w-3.5" />
              Filter
            </button>
            <button
              type="button"
              onClick={handleResetFilters}
              className="px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              Reset
            </button>
          </div>
        </form>

        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
          <div className="text-xs text-slate-500">
            System hearings query: <span className="font-semibold text-slate-700">{pagination.total_records}</span> proceedings
          </div>
          <button
            type="button"
            data-testid="admin-schedule-hearing-btn"
            onClick={() => {
              setNewCaseId('');
              setNewJudgeId('');
              setNewStartTime('');
              setNewEndTime('');
              setCreateError(null);
              setConflictWarning(null);
              setDstError(null);
              setIsCreateOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Schedule Hearing
          </button>
        </div>
      </div>

      {/* Hearings Calendar Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 flex flex-col items-center justify-center space-y-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
            <p className="text-sm text-slate-500">Querying court calendar proceedings...</p>
          </div>
        ) : hearings.length === 0 ? (
          <EmptyState
            icon={Calendar}
            title="No Scheduled Hearings Found"
            description="No hearing proceedings match the applied judge or date criteria."
            actionLabel="Schedule New Hearing"
            onAction={() => setIsCreateOpen(true)}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm" data-testid="admin-hearings-table">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-3.5">Hearing Date & Time</th>
                    <th className="px-6 py-3.5">Presiding Judge ID</th>
                    <th className="px-6 py-3.5">Case Reference UUID</th>
                    <th className="px-6 py-3.5">System UUID</th>
                    <th className="px-6 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {hearings.map((h) => (
                    <tr
                      key={h.hearing_id}
                      className="hover:bg-slate-50/80 transition-colors"
                      data-testid={`hearing-row-${h.hearing_id}`}
                    >
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-900">
                          {formatDateSafe(h.start_time)}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
                          <Clock className="h-3 w-3 text-slate-400" />
                          <span>
                            {formatTimeSafe(h.start_time)} – {formatTimeSafe(h.end_time)}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5 font-mono text-xs text-slate-700 bg-slate-100 px-2 py-0.5 rounded w-fit">
                          <User className="h-3 w-3 text-slate-500" />
                          {h.judge_id}
                        </div>
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-slate-500">
                        {h.case_id}
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-slate-400">
                        {h.hearing_id}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedHearingId(h.hearing_id)}
                          data-testid={`inspect-hearing-${h.hearing_id}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors cursor-pointer"
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

            <div className="p-4 border-t border-slate-200">
              <PaginationControls
                pagination={pagination}
                onPageChange={(p) => setPage(p)}
                disabled={isLoading}
              />
            </div>
          </>
        )}
      </div>

      {/* Hearing Detail Modal */}
      {selectedHearingId && (
        <Modal
          isOpen={true}
          onClose={() => {
            setSelectedHearingId(null);
            setHearingDetail(null);
          }}
          title="Court Hearing Session Inspection"
        >
          {isLoadingDetail ? (
            <div className="p-8 flex flex-col items-center justify-center space-y-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
              <p className="text-sm text-slate-500">Loading hearing record...</p>
            </div>
          ) : detailError ? (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>{detailError}</span>
            </div>
          ) : hearingDetail ? (
            <div className="space-y-4" data-testid="admin-hearing-detail-modal">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-slate-400">Hearing ID: {hearingDetail.hearing_id}</span>
                  <span className="text-xs px-2 py-0.5 rounded font-mono font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                    Judge: {hearingDetail.judge_id}
                  </span>
                </div>
                <div className="font-bold text-lg text-slate-900">
                  {formatDateSafe(hearingDetail.start_time)}
                </div>
                <div className="text-xs text-slate-600 flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 text-slate-500" />
                  <span>
                    {formatTimeSafe(hearingDetail.start_time)} – {formatTimeSafe(hearingDetail.end_time)}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 text-xs">
                <span className="text-slate-500 block">Associated Case UUID</span>
                <span className="font-mono text-slate-800 font-semibold">{hearingDetail.case_id}</span>
              </div>

              {/* Hearing Immutability Notice */}
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900 flex items-start gap-2">
                <Info className="h-4 w-4 text-blue-700 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">Court Hearing Immutability Standard:</span> Hearing session records cannot be directly altered or deleted once scheduled. In the event of a postponement, an adjournment must be filed against this proceeding, or a replacement hearing scheduled.
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedHearingId(null);
                    setHearingDetail(null);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          ) : null}
        </Modal>
      )}

      {/* Schedule Hearing Modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Schedule Judicial Hearing Session"
      >
        <form onSubmit={handleCreateHearing} className="space-y-4" data-testid="admin-schedule-hearing-form">
          {createError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>{createError}</span>
            </div>
          )}

          {conflictWarning && (
            <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg text-amber-900 text-xs flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
              <div>
                <span className="font-bold">Judge Scheduling Conflict:</span> {conflictWarning}
              </div>
            </div>
          )}

          {dstError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
              <div>
                <span className="font-bold">Daylight Saving / Timezone Transition Error:</span> {dstError}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Case UUID *
            </label>
            <input
              type="text"
              required
              data-testid="schedule-hearing-case-id-input"
              value={newCaseId}
              onChange={(e) => setNewCaseId(e.target.value)}
              placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Presiding Judge ID *
            </label>
            <input
              type="text"
              required
              data-testid="schedule-hearing-judge-id-input"
              value={newJudgeId}
              onChange={(e) => setNewJudgeId(e.target.value)}
              placeholder="e.g. J-VANCE-01"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Start Time (ISO / Local) *
              </label>
              <input
                type="datetime-local"
                required
                data-testid="schedule-hearing-start-input"
                value={newStartTime}
                onChange={(e) => setNewStartTime(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                End Time (ISO / Local) *
              </label>
              <input
                type="datetime-local"
                required
                data-testid="schedule-hearing-end-input"
                value={newEndTime}
                onChange={(e) => setNewEndTime(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setIsCreateOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmittingCreate}
              data-testid="submit-schedule-hearing-btn"
              className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
            >
              {isSubmittingCreate && <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />}
              Schedule Hearing Session
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
