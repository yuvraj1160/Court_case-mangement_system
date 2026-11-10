import React, { useState, useEffect } from 'react';
import {
  CalendarClock,
  Search,
  Plus,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  FolderOpen,
  User,
} from 'lucide-react';
import {
  listAdjournments,
  getAdjournment,
  createAdjournment,
  ApiClientError,
} from '../../api';
import type {
  AdjournmentListItem,
  AdjournmentDetail,
  PaginationInfo,
} from '../../types';
import {
  EmptyState,
  Modal,
  PaginationControls,
} from '../index';

const STANDARD_REASON_CODES = [
  'Witness Unavailable',
  'Counsel Unwell',
  'Settlement Discussions',
  'Court Calendar Congestion',
  'Case File Transfer',
  'Outstanding Discovery',
  'Other',
];

export const AdjournmentsSection: React.FC = () => {
  const [adjournments, setAdjournments] = useState<AdjournmentListItem[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 10,
    total_records: 0,
    total_pages: 1,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filter
  const [hearingIdFilter, setHearingIdFilter] = useState('');
  const [appliedHearingId, setAppliedHearingId] = useState('');
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);

  // Detail Modal State
  const [selectedAdjId, setSelectedAdjId] = useState<string | null>(null);
  const [adjDetail, setAdjDetail] = useState<AdjournmentDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Create Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newHearingId, setNewHearingId] = useState('');
  const [newReasonCode, setNewReasonCode] = useState('Witness Unavailable');
  const [customReason, setCustomReason] = useState('');
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;
    const run = async () => {
      try {
        const res = await listAdjournments({
          page,
          limit: 10,
          hearing_id: appliedHearingId.trim() || undefined,
        });
        if (isCurrent) {
          setAdjournments(res.data);
          setPagination(res.pagination);
          setError(null);
        }
      } catch (err) {
        if (isCurrent) {
          if (err instanceof ApiClientError) {
            setError(err.message);
          } else {
            setError('Failed to retrieve hearing adjournments ledger.');
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
  }, [page, appliedHearingId, reloadKey]);

  const handleFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setAppliedHearingId(hearingIdFilter);
    setPage(1);
  };

  const handleFilterReset = () => {
    setHearingIdFilter('');
    setAppliedHearingId('');
    setIsLoading(true);
    setPage(1);
  };

  const handleRefresh = () => {
    setIsLoading(true);
    setReloadKey((k) => k + 1);
  };

  const openDetailModal = async (adjId: string) => {
    setSelectedAdjId(adjId);
    setAdjDetail(null);
    setIsLoadingDetail(true);
    setDetailError(null);
    try {
      const res = await getAdjournment(adjId);
      setAdjDetail(res.data);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setDetailError(err.message);
      } else {
        setDetailError('Failed to load adjournment details.');
      }
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleCreateAdjournment = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    if (!newHearingId.trim()) {
      setCreateError('Hearing UUID is required.');
      return;
    }

    const effectiveReason = newReasonCode === 'Other' ? customReason.trim() : newReasonCode.trim();
    if (!effectiveReason) {
      setCreateError('Adjournment reason is required.');
      return;
    }

    setIsSubmittingCreate(true);
    try {
      await createAdjournment({
        hearing_id: newHearingId.trim(),
        reason_code: effectiveReason,
      });
      setIsCreateOpen(false);
      setNewHearingId('');
      setNewReasonCode('Witness Unavailable');
      setCustomReason('');
      setSuccessMessage('Hearing postponement recorded in the official adjournment ledger.');
      setIsLoading(true);
      setPage(1);
      setReloadKey((k) => k + 1);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setCreateError(err.message);
      } else {
        setCreateError('Failed to record adjournment.');
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
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <form onSubmit={handleFilterSubmit} className="flex flex-1 flex-wrap sm:flex-nowrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Filter by parent Hearing UUID..."
              value={hearingIdFilter}
              onChange={(e) => setHearingIdFilter(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
            />
          </div>

          <button
            type="submit"
            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-white hover:bg-slate-700 transition-colors cursor-pointer"
          >
            Filter
          </button>
          {hearingIdFilter && (
            <button
              type="button"
              onClick={handleFilterReset}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors border border-slate-200 cursor-pointer"
            >
              Clear
            </button>
          )}
        </form>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isLoading}
            className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer"
            title="Refresh ledger"
            aria-label="Refresh adjournments list"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => {
              setNewHearingId('');
              setNewReasonCode('Witness Unavailable');
              setCustomReason('');
              setCreateError(null);
              setIsCreateOpen(true);
            }}
            className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Record Adjournment</span>
          </button>
        </div>
      </div>

      {/* Adjournments Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-5 py-3">Adjournment Reason</th>
                <th className="px-5 py-3">Parent Case Docket</th>
                <th className="px-5 py-3">Presiding Judicial Officer</th>
                <th className="px-5 py-3">Hearing UUID</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
                      <span>Loading adjournments ledger...</span>
                    </div>
                  </td>
                </tr>
              ) : adjournments.length > 0 ? (
                adjournments.map((a) => (
                  <tr key={a.adj_id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-5 py-3">
                      <span className="font-semibold text-slate-900 block">{a.reason_code}</span>
                      <span className="font-mono text-slate-400 text-[10px]">Entry ID: {a.adj_id}</span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1.5">
                        <FolderOpen className="h-3.5 w-3.5 text-slate-400" />
                        <span className="font-mono font-bold text-emerald-700">
                          {a.case_number || 'Case Unnamed'}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1.5 font-mono text-slate-700 text-[11px]">
                        <User className="h-3.5 w-3.5 text-slate-400" />
                        <span title={a.judge_id}>
                          {a.judge_id.length > 12 ? `${a.judge_id.slice(0, 8)}...` : a.judge_id}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3 font-mono text-slate-500 text-[11px]">{a.hearing_id}</td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => openDetailModal(a.adj_id)}
                        className="text-emerald-600 hover:text-emerald-800 font-medium cursor-pointer"
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="p-8">
                    <EmptyState
                      title="No adjournments recorded"
                      description="No hearing postponements match your search filter."
                      icon={CalendarClock}
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <PaginationControls
          pagination={pagination}
          onPageChange={(newPage) => setPage(newPage)}
          disabled={isLoading}
        />
      </div>

      {/* RECORD ADJOURNMENT MODAL */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Record Hearing Adjournment"
        subtitle="Log an official postponement event in the append-only ledger"
      >
        <form onSubmit={handleCreateAdjournment} className="space-y-4">
          {createError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{createError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Parent Hearing UUID <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. 3c73c5f5-0481-69cc-1c4e-9e2628309441"
              value={newHearingId}
              onChange={(e) => setNewHearingId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Find the scheduled Hearing UUID in the Hearing Calendar tab.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Procedural Reason Code <span className="text-rose-500">*</span>
            </label>
            <select
              value={newReasonCode}
              onChange={(e) => setNewReasonCode(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
            >
              {STANDARD_REASON_CODES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>

          {newReasonCode === 'Other' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Custom Postponement Reason <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Specify procedural reason..."
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          )}

          <div className="text-[11px] text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1.5">
            <p>
              <strong>Append-Only Postponement Ledger:</strong> Existing hearing records cannot be directly edited or deleted. Submitting this form records the postponement in the official adjournment ledger.
            </p>
            <p className="text-slate-500">
              <em>Important:</em> Recording an adjournment does not automatically schedule a replacement hearing. When required, a replacement proceeding must be scheduled as a separate operation in the Court Calendar.
            </p>
          </div>

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
              <span>Record Adjournment</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* ADJOURNMENT DETAIL MODAL */}
      <Modal
        isOpen={Boolean(selectedAdjId)}
        onClose={() => setSelectedAdjId(null)}
        title="Adjournment Ledger Record"
        subtitle={adjDetail ? `Entry UUID: ${adjDetail.adj_id}` : undefined}
      >
        {isLoadingDetail ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-500 text-xs">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
            <span>Retrieving adjournment details...</span>
          </div>
        ) : detailError ? (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-rose-600" />
              <span>{detailError}</span>
            </div>
            <button
              type="button"
              onClick={() => selectedAdjId && openDetailModal(selectedAdjId)}
              className="font-semibold underline"
            >
              Retry
            </button>
          </div>
        ) : adjDetail ? (
          <div className="space-y-4 text-xs">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
              <div>
                <span className="text-slate-400 block text-[10px] font-semibold uppercase">Postponement Reason</span>
                <span className="font-bold text-slate-900 text-sm block mt-0.5">{adjDetail.reason_code}</span>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200">
                <div>
                  <span className="text-slate-400 block text-[10px] font-semibold uppercase">Parent Case Docket</span>
                  <span className="font-mono font-bold text-emerald-700 text-xs block">
                    {adjDetail.case_number || 'Case Unnamed'}
                  </span>
                  <span className="font-mono text-slate-400 text-[10px]">Case ID: {adjDetail.case_id}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] font-semibold uppercase">Presiding Judicial Officer</span>
                  <span className="font-mono text-slate-900 text-xs block">{adjDetail.judge_id}</span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200">
                <span className="text-slate-400 block text-[10px] font-semibold uppercase">Target Hearing UUID</span>
                <span className="font-mono text-slate-700 text-xs">{adjDetail.hearing_id}</span>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
};
