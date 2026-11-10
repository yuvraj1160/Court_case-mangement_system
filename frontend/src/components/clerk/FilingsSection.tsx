import React, { useState, useEffect } from 'react';
import {
  FileText,
  Plus,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Edit2,
  FolderOpen,
  User,
} from 'lucide-react';
import {
  listFilings,
  getFiling,
  createFiling,
  updateFiling,
  ApiClientError,
} from '../../api';
import type {
  FilingListItem,
  FilingDetail,
  PaginationInfo,
} from '../../types';
import {
  EmptyState,
  Modal,
  PaginationControls,
} from '../index';
import { formatDateTimeSafe } from '../../layouts/dashboardNavigation';

export const FilingsSection: React.FC = () => {
  const [filings, setFilings] = useState<FilingListItem[]>([]);
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
  const [partyIdFilter, setPartyIdFilter] = useState('');
  const [filingTypeFilter, setFilingTypeFilter] = useState('');
  const [appliedFilters, setAppliedFilters] = useState({
    caseId: '',
    partyId: '',
    filingType: '',
  });
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);

  // Detail Modal State
  const [selectedFilingId, setSelectedFilingId] = useState<string | null>(null);
  const [filingDetail, setFilingDetail] = useState<FilingDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Create Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newCaseId, setNewCaseId] = useState('');
  const [newPartyId, setNewPartyId] = useState('');
  const [newFilingType, setNewFilingType] = useState('Complaint');
  const [newFilingDate, setNewFilingDate] = useState('');
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Edit Filing Type Modal State (filing_type is the ONLY mutable field!)
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editFilingId, setEditFilingId] = useState<string | null>(null);
  const [editFilingType, setEditFilingType] = useState('');
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;
    const run = async () => {
      try {
        const res = await listFilings({
          page,
          limit: 10,
          case_id: appliedFilters.caseId.trim() || undefined,
          party_id: appliedFilters.partyId.trim() || undefined,
          filing_type: appliedFilters.filingType.trim() || undefined,
        });
        if (isCurrent) {
          setFilings(res.data);
          setPagination(res.pagination);
          setError(null);
        }
      } catch (err) {
        if (isCurrent) {
          if (err instanceof ApiClientError) {
            setError(err.message);
          } else {
            setError('Failed to retrieve document filings intake records.');
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
      partyId: partyIdFilter,
      filingType: filingTypeFilter,
    });
    setPage(1);
  };

  const handleRefresh = () => {
    setIsLoading(true);
    setReloadKey((k) => k + 1);
  };

  const handleClearFilters = () => {
    setCaseIdFilter('');
    setPartyIdFilter('');
    setFilingTypeFilter('');
    setAppliedFilters({
      caseId: '',
      partyId: '',
      filingType: '',
    });
    setPage(1);
    setIsLoading(true);
  };

  const openDetailModal = async (filingId: string) => {
    setSelectedFilingId(filingId);
    setFilingDetail(null);
    setIsLoadingDetail(true);
    setDetailError(null);
    try {
      const res = await getFiling(filingId);
      setFilingDetail(res.data);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setDetailError(err.message);
      } else {
        setDetailError('Failed to load filing details.');
      }
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleCreateFiling = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    if (!newCaseId.trim()) {
      setCreateError('Case UUID is required.');
      return;
    }
    if (!newPartyId.trim()) {
      setCreateError('Submitting Party UUID is required.');
      return;
    }
    if (!newFilingType.trim()) {
      setCreateError('Filing type is required.');
      return;
    }

    setIsSubmittingCreate(true);
    try {
      await createFiling({
        case_id: newCaseId.trim(),
        party_id: newPartyId.trim(),
        filing_type: newFilingType.trim(),
        filing_date: newFilingDate || undefined,
      });
      setIsCreateOpen(false);
      setNewCaseId('');
      setNewPartyId('');
      setNewFilingType('Complaint');
      setNewFilingDate('');
      setSuccessMessage('Court document filing recorded successfully.');
      setPage(1);
      handleRefresh();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setCreateError(err.message);
      } else {
        setCreateError('Failed to record document filing.');
      }
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  const openEditModal = (f: FilingListItem) => {
    setEditFilingId(f.filing_id);
    setEditFilingType(f.filing_type);
    setEditError(null);
    setIsEditOpen(true);
  };

  const handleUpdateFiling = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editFilingId) return;
    if (!editFilingType.trim()) {
      setEditError('Filing type cannot be empty.');
      return;
    }

    setIsSubmittingEdit(true);
    setEditError(null);
    try {
      await updateFiling(editFilingId, {
        filing_type: editFilingType.trim(),
      });
      setIsEditOpen(false);
      setSuccessMessage('Filing document classification updated successfully.');
      handleRefresh();
      if (selectedFilingId === editFilingId) {
        openDetailModal(editFilingId);
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        setEditError(err.message);
      } else {
        setEditError('Failed to update filing type.');
      }
    } finally {
      setIsSubmittingEdit(false);
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
            <FileText className="h-4 w-4 text-emerald-600" />
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Document Intake Registry Filters
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isLoading}
              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer"
              title="Refresh filings"
              aria-label="Refresh filings"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => {
                setNewCaseId('');
                setNewPartyId('');
                setNewFilingType('Complaint');
                setNewFilingDate('');
                setCreateError(null);
                setIsCreateOpen(true);
              }}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>Record Filing</span>
            </button>
          </div>
        </div>

        <form onSubmit={handleFilterSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1">
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
            <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-0.5">Party UUID</label>
            <input
              type="text"
              placeholder="Filter by Party UUID..."
              value={partyIdFilter}
              onChange={(e) => setPartyIdFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
            />
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-0.5">Document Classification</label>
            <input
              type="text"
              placeholder="e.g. Complaint, Motion..."
              value={filingTypeFilter}
              onChange={(e) => setFilingTypeFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
            />
          </div>

          <div className="flex items-end gap-1.5">
            <button
              type="submit"
              className="flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-white hover:bg-slate-700 transition-colors cursor-pointer"
            >
              Apply Filter
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

      {/* Filings Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-5 py-3">Document Title / Motion</th>
                <th className="px-5 py-3">Case Docket</th>
                <th className="px-5 py-3">Submitting Party</th>
                <th className="px-5 py-3">Intake Timestamp</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
                      <span>Loading filings intake queue...</span>
                    </div>
                  </td>
                </tr>
              ) : filings.length > 0 ? (
                filings.map((f) => (
                  <tr key={f.filing_id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-5 py-3">
                      <span className="font-bold text-slate-900 block">{f.filing_type}</span>
                      <span className="font-mono text-slate-400 text-[10px]">ID: {f.filing_id}</span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1.5">
                        <FolderOpen className="h-3.5 w-3.5 text-slate-400" />
                        <span className="font-mono font-bold text-emerald-700">{f.case_number}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 text-slate-400" />
                        <span className="font-medium text-slate-800">{f.party_name || 'Anonymous Party'}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{formatDateTimeSafe(f.filing_date)}</td>
                    <td className="px-5 py-3 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => openDetailModal(f.filing_id)}
                        className="text-emerald-600 hover:text-emerald-800 font-medium cursor-pointer"
                      >
                        Details
                      </button>
                      <span className="text-slate-300">&bull;</span>
                      <button
                        type="button"
                        onClick={() => openEditModal(f)}
                        className="text-slate-600 hover:text-slate-900 font-medium cursor-pointer"
                      >
                        Edit Type
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="p-8">
                    <EmptyState
                      title="No filings found"
                      description="No document filings match your query criteria."
                      icon={FileText}
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

      {/* RECORD FILING MODAL */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Record New Court Filing"
        subtitle="Log an incoming pleading, affidavit, or motion on docket"
      >
        <form onSubmit={handleCreateFiling} className="space-y-4">
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
              Submitting Party UUID <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. 2b62b4e4-f370-58bb-0b3d-8d1517298330"
              value={newPartyId}
              onChange={(e) => setNewPartyId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Party must be currently linked to the specified case in the case docket.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Document Classification / Motion Title <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Complaint, Motion to Dismiss, Brief, Affidavit"
              value={newFilingType}
              onChange={(e) => setNewFilingType(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Intake Timestamp (Optional)</label>
            <input
              type="datetime-local"
              value={newFilingDate}
              onChange={(e) => setNewFilingDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
            />
            <p className="text-[11px] text-slate-400 mt-1">Defaults to present server timestamp if omitted.</p>
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
              <span>Record Filing</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* EDIT FILING TYPE MODAL */}
      <Modal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        title="Update Document Classification"
        subtitle="Modify the filing_type under the backend API schema contract"
      >
        <form onSubmit={handleUpdateFiling} className="space-y-4">
          {editError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{editError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Filing Document Type <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={editFilingType}
              onChange={(e) => setEditFilingType(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Under the current backend API and schema contract, only filing_type is mutable. Associated case, party identity, and filing dates cannot be modified.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsEditOpen(false)}
              disabled={isSubmittingEdit}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmittingEdit}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              {isSubmittingEdit && <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />}
              <span>Update Filing Type</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* FILING DETAIL MODAL */}
      <Modal
        isOpen={Boolean(selectedFilingId)}
        onClose={() => setSelectedFilingId(null)}
        title="Filing Intake Record Details"
        subtitle={filingDetail ? `Filing UUID: ${filingDetail.filing_id}` : undefined}
      >
        {isLoadingDetail ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-500 text-xs">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
            <span>Retrieving filing record...</span>
          </div>
        ) : detailError ? (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-rose-600" />
              <span>{detailError}</span>
            </div>
            <button
              type="button"
              onClick={() => selectedFilingId && openDetailModal(selectedFilingId)}
              className="font-semibold underline"
            >
              Retry
            </button>
          </div>
        ) : filingDetail ? (
          <div className="space-y-4 text-xs">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
              <div>
                <span className="text-slate-400 block text-[10px] font-semibold uppercase">Document Classification</span>
                <span className="font-bold text-slate-900 text-sm block mt-0.5">{filingDetail.filing_type}</span>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200">
                <div>
                  <span className="text-slate-400 block text-[10px] font-semibold uppercase">Case Docket</span>
                  <span className="font-mono font-bold text-emerald-700 text-xs block">{filingDetail.case_number}</span>
                  <span className="font-mono text-slate-400 text-[10px]">ID: {filingDetail.case_id}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] font-semibold uppercase">Submitting Litigant</span>
                  <span className="font-semibold text-slate-900 block">{filingDetail.party_name || 'Anonymous'}</span>
                  <span className="font-mono text-slate-400 text-[10px]">Party ID: {filingDetail.party_id}</span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200">
                <span className="text-slate-400 block text-[10px] font-semibold uppercase">Intake Timestamp</span>
                <span className="font-semibold text-slate-800">{formatDateTimeSafe(filingDetail.filing_date)}</span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedFilingId(null);
                  openEditModal(filingDetail);
                }}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Edit2 className="h-3.5 w-3.5" />
                <span>Modify Document Classification</span>
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
};
