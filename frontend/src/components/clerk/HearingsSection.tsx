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
  FolderOpen,
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

export const HearingsSection: React.FC = () => {
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

  // Create Hearing Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newCaseId, setNewCaseId] = useState('');
  const [newJudgeId, setNewJudgeId] = useState('');
  const [newStartTime, setNewStartTime] = useState('');
  const [newEndTime, setNewEndTime] = useState('');
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const [dstError, setDstError] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;
    const run = async () => {
      try {
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
            setError('Failed to retrieve hearing calendar records.');
          }
        }
      } finally {
        if (isCurrent) {
          setIsLoading(false);
        }
      }
    };

    void run();

    return () => {
      isCurrent = false;
    };
  }, [page, appliedFilters, reloadKey]);

  const handleFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setAppliedFilters({
      caseId: caseIdFilter,
      judgeId: judgeIdFilter,
      startDate: startDateFilter,
      endDate: endDateFilter,
    });
    setPage(1);
  };

  const handleRefresh = () => {
    setIsLoading(true);
    setReloadKey((k) => k + 1);
  };

  const handleClearFilters = () => {
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
    setIsLoading(true);
  };

  const openDetailModal = async (hearingId: string) => {
    setSelectedHearingId(hearingId);
    setHearingDetail(null);
    setIsLoadingDetail(true);
    setDetailError(null);
    try {
      const res = await getHearing(hearingId);
      setHearingDetail(res.data);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setDetailError(err.message);
      } else {
        setDetailError('Failed to load hearing session details.');
      }
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleCreateHearing = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setConflictWarning(null);
    setDstError(null);

    if (!newCaseId.trim()) {
      setCreateError('Case UUID is required.');
      return;
    }
    if (!newJudgeId.trim()) {
      setCreateError('Judge UUID is required.');
      return;
    }
    if (!newStartTime) {
      setCreateError('Hearing start time is required.');
      return;
    }
    if (!newEndTime) {
      setCreateError('Hearing end time is required.');
      return;
    }

    const start = new Date(newStartTime);
    const end = new Date(newEndTime);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      setCreateError('Invalid date or time format.');
      return;
    }
    if (end <= start) {
      setCreateError('Hearing end time must be chronologically after the start time.');
      return;
    }

    setIsSubmittingCreate(true);
    try {
      await createHearing({
        case_id: newCaseId.trim(),
        judge_id: newJudgeId.trim(),
        start_time: newStartTime,
        end_time: newEndTime,
      });
      setIsCreateOpen(false);
      setNewCaseId('');
      setNewJudgeId('');
      setNewStartTime('');
      setNewEndTime('');
      setSuccessMessage('Court hearing docket slot scheduled successfully.');
      setPage(1);
      handleRefresh();
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.status === 409) {
          // Judge schedule overlap (PostgreSQL GiST exclusion constraint)
          setConflictWarning(
            err.message || 'Scheduling conflict: The assigned judge already has a hearing scheduled during this time window.'
          );
        } else if (
          err.status === 400 &&
          (err.message.toLowerCase().includes('daylight saving') || err.message.toLowerCase().includes('dst'))
        ) {
          // Daylight saving time transition or interval validation failure (HTTP 400)
          setDstError(err.message);
        } else {
          // General validation or input error (HTTP 400 / 500)
          setCreateError(err.message);
        }
      } else {
        setCreateError('Failed to schedule hearing.');
      }
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Feedback Messages */}
      {successMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between shadow-2xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-600 hover:text-emerald-900 font-semibold cursor-pointer text-[11px]"
          >
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between shadow-2xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            className="text-rose-700 hover:text-rose-900 font-semibold underline cursor-pointer text-[11px]"
          >
            Retry
          </button>
        </div>
      )}

      {/* Filter and Action Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-emerald-600" />
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Hearing Docket Filters
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isLoading}
              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer"
              title="Refresh calendar"
              aria-label="Refresh calendar"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
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
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>Schedule Hearing</span>
            </button>
          </div>
        </div>

        <form onSubmit={handleFilterSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 pt-1">
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-0.5">Case UUID</label>
            <input
              type="text"
              placeholder="Filter by Case UUID..."
              value={caseIdFilter}
              onChange={(e) => setCaseIdFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
            />
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-0.5">Judge UUID</label>
            <input
              type="text"
              placeholder="Filter by Judge UUID..."
              value={judgeIdFilter}
              onChange={(e) => setJudgeIdFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
            />
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-0.5">From Date</label>
            <input
              type="date"
              value={startDateFilter}
              onChange={(e) => setStartDateFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
            />
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-0.5">To Date</label>
            <input
              type="date"
              value={endDateFilter}
              onChange={(e) => setEndDateFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
            />
          </div>

          <div className="flex items-end gap-1.5">
            <button
              type="submit"
              className="flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-white hover:bg-slate-700 transition-colors cursor-pointer"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={handleClearFilters}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors border border-slate-200 cursor-pointer"
            >
              Reset
            </button>
          </div>
        </form>
      </div>

      {/* Hearings Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-5 py-3">Calendar Date & Time</th>
                <th className="px-5 py-3">Case Docket</th>
                <th className="px-5 py-3">Presiding Judicial Officer</th>
                <th className="px-5 py-3">Duration</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
                      <span>Loading hearing schedule...</span>
                    </div>
                  </td>
                </tr>
              ) : hearings.length > 0 ? (
                hearings.map((h) => {
                  const startTimeStr = formatTimeSafe(h.start_time);
                  const endTimeStr = formatTimeSafe(h.end_time);
                  return (
                    <tr key={h.hearing_id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                          <div>
                            <span className="font-bold text-slate-900 block">
                              {formatDateSafe(h.start_time)}
                            </span>
                            <span className="text-slate-500 text-[11px]">
                              {startTimeStr && endTimeStr ? `${startTimeStr} – ${endTimeStr}` : 'Time unscheduled'}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1.5">
                          <FolderOpen className="h-3.5 w-3.5 text-slate-400" />
                          <span className="font-mono font-bold text-emerald-700">
                            {h.case_number || 'Case Unnamed'}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5 text-slate-400" />
                          <span className="font-medium text-slate-800">
                            {h.judge_name || 'Unassigned Judge'}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-slate-500 font-mono text-[11px]">
                        {h.start_time && h.end_time ? (
                          <span className="inline-flex items-center gap-1 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                            <Clock className="h-3 w-3 text-slate-400" />
                            {Math.round(
                              (new Date(h.end_time).getTime() - new Date(h.start_time).getTime()) / 60000
                            )}{' '}
                            mins
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => openDetailModal(h.hearing_id)}
                          className="text-emerald-600 hover:text-emerald-800 font-medium cursor-pointer"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="p-8">
                    <EmptyState
                      title="No hearings found"
                      description="No hearing slots match your specified filter criteria."
                      icon={Calendar}
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <PaginationControls
          pagination={pagination}
          onPageChange={(newPage) => {
            setIsLoading(true);
            setPage(newPage);
          }}
          disabled={isLoading}
        />
      </div>

      {/* SCHEDULE HEARING MODAL */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Schedule Court Hearing"
        subtitle="Schedule a hearing session with an active presiding judge"
      >
        <form onSubmit={handleCreateHearing} className="space-y-4">
          {/* Judge Scheduling Conflict Alert Banner (HTTP 409) */}
          {conflictWarning && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-start gap-2.5 shadow-2xs">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="font-bold">Judge Scheduling Conflict (HTTP 409)</h4>
                <p className="leading-relaxed">{conflictWarning}</p>
                <p className="text-[11px] text-amber-700">
                  Please select an alternative time slot or reassign to another presiding judge.
                </p>
              </div>
            </div>
          )}

          {/* Daylight Saving Time Validation Failure (HTTP 400) */}
          {dstError && (
            <div className="p-3.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-950 text-xs flex items-start gap-2.5 shadow-2xs">
              <Clock className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="font-bold">Daylight Saving Time Validation Failure (HTTP 400)</h4>
                <p className="leading-relaxed">{dstError}</p>
                <p className="text-[11px] text-indigo-700">
                  Court proceedings cannot cross daylight saving time transition boundaries or fall into ambiguous or nonexistent local time windows.
                </p>
              </div>
            </div>
          )}

          {/* General Validation / Database Error */}
          {createError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{createError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Case UUID <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. 1c51a3f3-e269-47aa-9a2c-7c0406187229"
              value={newCaseId}
              onChange={(e) => setNewCaseId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Presiding Judge UUID <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. 00000000-0000-0000-0000-000000000001"
              value={newJudgeId}
              onChange={(e) => setNewJudgeId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Judge must be currently active in the judicial roster.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Hearing Start Time <span className="text-rose-500">*</span>
              </label>
              <input
                type="datetime-local"
                required
                value={newStartTime}
                onChange={(e) => setNewStartTime(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Hearing End Time <span className="text-rose-500">*</span>
              </label>
              <input
                type="datetime-local"
                required
                value={newEndTime}
                onChange={(e) => setNewEndTime(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              />
            </div>
          </div>

          <p className="text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
            <strong>Scheduling Rule:</strong> The court exclusion constraint prevents overlapping hearings for the same judge and automatically rejects interval timestamps spanning Daylight Saving Time (DST) offset boundaries.
          </p>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsCreateOpen(false)}
              disabled={isSubmittingCreate}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmittingCreate}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              {isSubmittingCreate && <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />}
              <span>Schedule Hearing</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* HEARING DETAIL MODAL */}
      <Modal
        isOpen={Boolean(selectedHearingId)}
        onClose={() => setSelectedHearingId(null)}
        title="Hearing Session Docket Details"
        subtitle={hearingDetail ? `Hearing UUID: ${hearingDetail.hearing_id}` : undefined}
      >
        {isLoadingDetail ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-500 text-xs">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
            <span>Retrieving hearing calendar slot...</span>
          </div>
        ) : detailError ? (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-rose-600" />
              <span>{detailError}</span>
            </div>
            <button
              type="button"
              onClick={() => selectedHearingId && openDetailModal(selectedHearingId)}
              className="font-semibold underline"
            >
              Retry
            </button>
          </div>
        ) : hearingDetail ? (
          <div className="space-y-4 text-xs">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <div>
                  <span className="text-slate-400 block text-[10px] font-semibold uppercase">Case Docket</span>
                  <span className="font-mono font-bold text-emerald-700 text-sm">
                    {hearingDetail.case_number || 'Case Unnamed'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] font-semibold uppercase text-right">Case ID</span>
                  <span className="font-mono text-slate-500">{hearingDetail.case_id}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <span className="text-slate-400 block text-[10px] font-semibold uppercase">Presiding Judicial Officer</span>
                  <span className="font-semibold text-slate-900">{hearingDetail.judge_name || 'Unassigned'}</span>
                  <span className="font-mono text-slate-400 block text-[11px] mt-0.5">Judge ID: {hearingDetail.judge_id}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] font-semibold uppercase">Scheduled Interval</span>
                  <span className="font-semibold text-slate-900 block">{formatDateSafe(hearingDetail.start_time)}</span>
                  <span className="text-slate-600 block text-[11px]">
                    {formatTimeSafe(hearingDetail.start_time)} – {formatTimeSafe(hearingDetail.end_time)}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-slate-600 text-[11px] space-y-1.5">
              <p>
                <strong>Hearing Record Immutability:</strong> Existing hearing records cannot be directly edited or deleted under the backend API contract.
              </p>
              <p>
                To postpone this proceeding, submit an official entry in the <strong>Adjournments</strong> tab referencing this hearing ID.
              </p>
              <p className="text-slate-500">
                <em>Important:</em> Recording an adjournment documents the postponement in the official ledger but does not automatically schedule a replacement hearing. When required, a replacement proceeding must be scheduled as a separate operation in the Court Calendar.
              </p>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
};
