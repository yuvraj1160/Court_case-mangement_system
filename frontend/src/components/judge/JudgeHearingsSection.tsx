/**
 * Court Case Management System - Judge Hearings Section
 * Displays assigned hearings for the authenticated judge with date filtering,
 * upcoming vs past distinction, and hearing detail modal.
 * Strictly read-only: Zero scheduling, edit, or cancellation actions.
 */

import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Clock,
  Filter,
  RefreshCw,
  AlertCircle,
  FolderOpen,
} from 'lucide-react';
import { listHearings, getHearing, ApiClientError } from '../../api';
import type { HearingListItem, HearingDetail, PaginationInfo } from '../../types';
import { EmptyState, Modal, PaginationControls } from '../index';
import { formatDateSafe, formatTimeSafe } from '../../layouts/dashboardNavigation';

export interface JudgeHearingsSectionProps {
  onInspectCase: (caseId: string) => void;
}

export const JudgeHearingsSection: React.FC<JudgeHearingsSectionProps> = ({ onInspectCase }) => {
  const [hearings, setHearings] = useState<HearingListItem[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 10,
    total_records: 0,
    total_pages: 1,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  const [timingScope, setTimingScope] = useState<'all' | 'upcoming' | 'past'>('all');
  const [appliedFilters, setAppliedFilters] = useState({
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

  useEffect(() => {
    let isCurrent = true;
    const run = async () => {
      try {
        const res = await listHearings({
          page,
          limit: 10,
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
            setError('Failed to retrieve judicial hearing calendar.');
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
      startDate: startDateFilter,
      endDate: endDateFilter,
    });
    setPage(1);
  };

  const handleClearFilters = () => {
    setStartDateFilter('');
    setEndDateFilter('');
    setAppliedFilters({ startDate: '', endDate: '' });
    setTimingScope('all');
    setPage(1);
    setIsLoading(true);
  };

  const handleRefresh = () => {
    setIsLoading(true);
    setReloadKey((k) => k + 1);
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

  // Filter by timing scope (upcoming vs past)
  const [currentTimestamp] = useState(() => Date.now());
  const displayedHearings = hearings.filter((h) => {
    if (timingScope === 'all') return true;
    if (!h.start_time) return true;
    const hTime = new Date(h.start_time).getTime();
    if (isNaN(hTime)) return true;
    if (timingScope === 'upcoming') return hTime >= currentTimestamp;
    if (timingScope === 'past') return hTime < currentTimestamp;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Error Message Banner */}
      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between shadow-2xs">
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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-amber-600" />
              <span>Assigned Judicial Hearing Calendar</span>
            </h2>
            <p className="text-xs text-slate-500">
              Proceedings scheduled before your bench &bull; Filter by date range or timing status
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            {/* Timing Scope Toggle */}
            <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50 text-xs">
              <button
                type="button"
                onClick={() => setTimingScope('all')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                  timingScope === 'all'
                    ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setTimingScope('upcoming')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                  timingScope === 'upcoming'
                    ? 'bg-amber-600 text-white shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Upcoming
              </button>
              <button
                type="button"
                onClick={() => setTimingScope('past')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                  timingScope === 'past'
                    ? 'bg-slate-700 text-white shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Concluded / Past
              </button>
            </div>

            <button
              type="button"
              onClick={handleRefresh}
              disabled={isLoading}
              className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer"
              title="Refresh calendar"
              aria-label="Refresh calendar"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Date Filter Form */}
        <form onSubmit={handleFilterSubmit} className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">From:</span>
            <input
              type="date"
              value={startDateFilter}
              onChange={(e) => setStartDateFilter(e.target.value)}
              aria-label="Filter from date"
              className="px-2.5 py-1 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">To:</span>
            <input
              type="date"
              value={endDateFilter}
              onChange={(e) => setEndDateFilter(e.target.value)}
              aria-label="Filter to date"
              className="px-2.5 py-1 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
            />
          </div>

          <button
            type="submit"
            className="px-3.5 py-1 rounded-lg text-xs font-semibold bg-slate-800 text-white hover:bg-slate-700 transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <Filter className="h-3 w-3" />
            <span>Apply Dates</span>
          </button>

          {(appliedFilters.startDate || appliedFilters.endDate || timingScope !== 'all') && (
            <button
              type="button"
              onClick={handleClearFilters}
              className="px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors border border-slate-200 cursor-pointer"
            >
              Clear
            </button>
          )}
        </form>
      </div>

      {/* Hearings Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-5 py-3">Case Docket</th>
                <th className="px-5 py-3">Scheduled Date & Time</th>
                <th className="px-5 py-3">Timing Status</th>
                <th className="px-5 py-3">Duration</th>
                <th className="px-5 py-3 text-right">Judicial Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-600 border-t-transparent" />
                      <span>Loading hearing records...</span>
                    </div>
                  </td>
                </tr>
              ) : displayedHearings.length > 0 ? (
                displayedHearings.map((h) => {
                  const startTimeStr = formatDateSafe(h.start_time);
                  const isUpcoming = h.start_time ? new Date(h.start_time).getTime() >= currentTimestamp : true;
                  const durationMins =
                    h.start_time && h.end_time
                      ? Math.round(
                          (new Date(h.end_time).getTime() - new Date(h.start_time).getTime()) / 60000
                        )
                      : null;

                  return (
                    <tr key={h.hearing_id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <FolderOpen className="h-3.5 w-3.5 text-slate-400" />
                          <span className="font-mono font-bold text-slate-900">
                            {h.case_number || 'Unnamed Case'}
                          </span>
                        </div>
                        <span className="font-mono text-slate-400 text-[10px] block mt-0.5">
                          Hearing: {h.hearing_id.slice(0, 13)}...
                        </span>
                      </td>

                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                          <Calendar className="h-3.5 w-3.5 text-slate-400" />
                          <span>{startTimeStr}</span>
                        </div>
                        <span className="text-slate-500 text-[11px] block mt-0.5">
                          {formatTimeSafe(h.start_time)} – {formatTimeSafe(h.end_time || h.start_time)}
                        </span>
                      </td>

                      <td className="px-5 py-3">
                        {isUpcoming ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-800 border border-amber-200">
                            <Clock className="h-3 w-3 text-amber-600" />
                            <span>Upcoming</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                            <span>Concluded / Past</span>
                          </span>
                        )}
                      </td>

                      <td className="px-5 py-3 font-mono text-slate-600">
                        {durationMins !== null && durationMins > 0 ? `${durationMins} mins` : '—'}
                      </td>

                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-2.5">
                          <button
                            type="button"
                            onClick={() => openDetailModal(h.hearing_id)}
                            className="text-slate-600 hover:text-slate-900 font-medium cursor-pointer"
                          >
                            Details
                          </button>
                          <button
                            type="button"
                            onClick={() => onInspectCase(h.case_id)}
                            className="text-amber-700 hover:text-amber-900 font-semibold cursor-pointer"
                          >
                            Inspect Docket &rarr;
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="p-8">
                    <EmptyState
                      title="No Hearings Found"
                      description="No hearing proceedings match your specified filter criteria."
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

      {/* HEARING DETAIL MODAL */}
      <Modal
        isOpen={Boolean(selectedHearingId)}
        onClose={() => setSelectedHearingId(null)}
        title="Hearing Proceeding Record"
        subtitle={hearingDetail ? `Case Docket: ${hearingDetail.case_number}` : undefined}
      >
        {isLoadingDetail ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-500 text-xs">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-600 border-t-transparent" />
            <span>Retrieving hearing record...</span>
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
              className="font-semibold underline cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : hearingDetail ? (
          <div className="space-y-4 text-xs">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-slate-400 block text-[10px] font-semibold uppercase">Hearing UUID</span>
                  <span className="font-mono text-slate-700 text-xs break-all">{hearingDetail.hearing_id}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] font-semibold uppercase">Parent Case Docket</span>
                  <span className="font-mono font-bold text-slate-900 text-xs block">{hearingDetail.case_number}</span>
                  <span className="font-mono text-slate-400 text-[10px]">ID: {hearingDetail.case_id}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200">
                <div>
                  <span className="text-slate-400 block text-[10px] font-semibold uppercase">Presiding Judicial Officer</span>
                  <span className="font-semibold text-slate-900">{hearingDetail.judge_name || 'Presiding Judge'}</span>
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

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-slate-600 text-[11px] space-y-1">
              <p>
                <strong>Hearing Record Immutability:</strong> Hearing records cannot be directly edited or deleted under the backend API contract.
              </p>
              <p className="text-slate-500">
                Postponements and adjournment entries are recorded in the official adjournment ledger by the clerk's office.
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => {
                  const targetCase = hearingDetail.case_id;
                  setSelectedHearingId(null);
                  onInspectCase(targetCase);
                }}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white transition-colors cursor-pointer"
              >
                Inspect Full Case File &rarr;
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
};

