import React, { useState, useEffect } from 'react';
import {
  FolderOpen,
  Search,
  Filter,
  Plus,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  UserPlus,
  UserMinus,
  Calendar,
  FileText,
  Gavel,
} from 'lucide-react';
import {
  listCases,
  getCase,
  createCase,
  updateCase,
  linkPartyToCase,
  unlinkPartyFromCase,
  ApiClientError,
} from '../../api';
import type {
  CaseListItem,
  CaseDetail,
  PaginationInfo,
} from '../../types';
import {
  StatusBadge,
  EmptyState,
  Modal,
  ConfirmDialog,
  PaginationControls,
} from '../index';
import { formatDateSafe } from '../../layouts/dashboardNavigation';

export const CasesSection: React.FC = () => {
  const [cases, setCases] = useState<CaseListItem[]>([]);
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
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);

  // Detail Modal State
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [caseDetail, setCaseDetail] = useState<CaseDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Create Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newCaseNumber, setNewCaseNumber] = useState('');
  const [newStatus, setNewStatus] = useState('Filed');
  const [newFilingDate, setNewFilingDate] = useState('');
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Edit Modal State
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editCaseId, setEditCaseId] = useState<string | null>(null);
  const [editCaseNumber, setEditCaseNumber] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Link Party Modal State
  const [isLinkPartyOpen, setIsLinkPartyOpen] = useState(false);
  const [linkPartyId, setLinkPartyId] = useState('');
  const [linkRoleType, setLinkRoleType] = useState('Applicant');
  const [isSubmittingLink, setIsSubmittingLink] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  // Unlink Party State
  const [partyToUnlink, setPartyToUnlink] = useState<{ party_id: string; name: string } | null>(null);
  const [isSubmittingUnlink, setIsSubmittingUnlink] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let isCurrent = true;
    const run = async () => {
      try {
        const res = await listCases({
          page,
          limit: 10,
          search: appliedSearch.trim() || undefined,
          status: statusFilter !== 'all' ? statusFilter : undefined,
        });
        if (isCurrent) {
          setCases(res.data.cases);
          setPagination(res.data.pagination);
          setError(null);
        }
      } catch (err) {
        if (isCurrent) {
          if (err instanceof ApiClientError) {
            setError(err.message);
          } else {
            setError('Failed to retrieve case docket records. Please try again.');
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
  }, [page, statusFilter, appliedSearch, reloadKey]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setAppliedSearch(search);
    setPage(1);
  };

  const handleRefresh = () => {
    setIsLoading(true);
    setReloadKey((k) => k + 1);
  };

  const openDetailModal = async (caseId: string) => {
    setSelectedCaseId(caseId);
    setCaseDetail(null);
    setIsLoadingDetail(true);
    setDetailError(null);
    try {
      const res = await getCase(caseId);
      setCaseDetail(res.data);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setDetailError(err.message);
      } else {
        setDetailError('Failed to load full case details.');
      }
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleCreateCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCaseNumber.trim()) {
      setCreateError('Case number is required.');
      return;
    }
    setIsSubmittingCreate(true);
    setCreateError(null);
    try {
      await createCase({
        case_number: newCaseNumber.trim(),
        status: newStatus,
        filing_date: newFilingDate || undefined,
      });
      setIsCreateOpen(false);
      setNewCaseNumber('');
      setNewStatus('Filed');
      setNewFilingDate('');
      setSuccessMessage('Court case created successfully.');
      setPage(1);
      handleRefresh();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setCreateError(err.message);
      } else {
        setCreateError('Failed to create case. Please verify the case number.');
      }
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  const openEditModal = (c: CaseListItem) => {
    setEditCaseId(c.case_id);
    setEditCaseNumber(c.case_number);
    setEditStatus(c.status);
    setEditError(null);
    setIsEditOpen(true);
  };

  const handleUpdateCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editCaseId) return;
    setIsSubmittingEdit(true);
    setEditError(null);
    try {
      await updateCase(editCaseId, {
        case_number: editCaseNumber.trim() || undefined,
        status: editStatus || undefined,
      });
      setIsEditOpen(false);
      setSuccessMessage('Case details updated successfully.');
      handleRefresh();
      if (selectedCaseId === editCaseId) {
        openDetailModal(editCaseId);
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        setEditError(err.message);
      } else {
        setEditError('Failed to update case record.');
      }
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const handleLinkParty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCaseId) return;
    if (!linkPartyId.trim()) {
      setLinkError('Party UUID is required.');
      return;
    }
    setIsSubmittingLink(true);
    setLinkError(null);
    try {
      await linkPartyToCase(selectedCaseId, {
        party_id: linkPartyId.trim(),
        role_type: linkRoleType,
      });
      setIsLinkPartyOpen(false);
      setLinkPartyId('');
      setLinkRoleType('Applicant');
      setSuccessMessage('Party successfully associated with case.');
      openDetailModal(selectedCaseId);
      handleRefresh();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setLinkError(err.message);
      } else {
        setLinkError('Failed to associate party with case.');
      }
    } finally {
      setIsSubmittingLink(false);
    }
  };

  const handleUnlinkParty = async () => {
    if (!selectedCaseId || !partyToUnlink) return;
    setIsSubmittingUnlink(true);
    try {
      await unlinkPartyFromCase(selectedCaseId, partyToUnlink.party_id);
      setPartyToUnlink(null);
      setSuccessMessage(`Party '${partyToUnlink.name}' unlinked from case.`);
      openDetailModal(selectedCaseId);
      handleRefresh();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setDetailError(err.message);
      } else {
        setDetailError('Failed to unlink party from case.');
      }
      setPartyToUnlink(null);
    } finally {
      setIsSubmittingUnlink(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Notifications */}
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

      {/* Action and Filter Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <form onSubmit={handleSearchSubmit} className="flex flex-1 flex-wrap sm:flex-nowrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by case number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by case status"
              className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
            >
              <option value="all">All Statuses</option>
              <option value="Filed">Filed</option>
              <option value="Active">Active</option>
              <option value="Adjourned">Adjourned</option>
              <option value="Disposed">Disposed</option>
              <option value="Closed">Closed</option>
            </select>
          </div>

          <button
            type="submit"
            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-white hover:bg-slate-700 transition-colors cursor-pointer"
          >
            Filter
          </button>
        </form>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isLoading}
            className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer"
            title="Refresh docket"
            aria-label="Refresh docket list"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => {
              setNewCaseNumber('');
              setNewStatus('Filed');
              setNewFilingDate('');
              setCreateError(null);
              setIsCreateOpen(true);
            }}
            className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>New Case</span>
          </button>
        </div>
      </div>

      {/* Case Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-5 py-3">Case Number</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Filing Date</th>
                <th className="px-5 py-3 text-center">Parties</th>
                <th className="px-5 py-3 text-center">Hearings</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
                      <span>Loading case registry...</span>
                    </div>
                  </td>
                </tr>
              ) : cases.length > 0 ? (
                cases.map((c) => (
                  <tr key={c.case_id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-5 py-3">
                      <button
                        type="button"
                        onClick={() => openDetailModal(c.case_id)}
                        className="font-mono font-bold text-emerald-700 hover:text-emerald-900 hover:underline cursor-pointer flex items-center gap-1"
                      >
                        <span>{c.case_number}</span>
                        <ExternalLink className="h-3 w-3 opacity-60" />
                      </button>
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={c.status} size="sm" />
                    </td>
                    <td className="px-5 py-3 text-slate-600">{formatDateSafe(c.filing_date)}</td>
                    <td className="px-5 py-3 text-center">
                      <span className="inline-block px-2 py-0.5 rounded-full font-mono text-[11px] bg-slate-100 text-slate-700 font-medium">
                        {c.parties_count}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-center">
                      <span className="inline-block px-2 py-0.5 rounded-full font-mono text-[11px] bg-slate-100 text-slate-700 font-medium">
                        {c.hearings_count}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => openDetailModal(c.case_id)}
                        className="text-emerald-600 hover:text-emerald-800 font-medium cursor-pointer"
                      >
                        Details
                      </button>
                      <span className="text-slate-300">&bull;</span>
                      <button
                        type="button"
                        onClick={() => openEditModal(c)}
                        className="text-slate-600 hover:text-slate-900 font-medium cursor-pointer"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="p-8">
                    <EmptyState
                      title="No cases found"
                      description="No court cases match the active search or status criteria."
                      icon={FolderOpen}
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

      {/* CREATE CASE MODAL */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Register New Court Case"
        subtitle="Intake docket record into the court case registry"
      >
        <form onSubmit={handleCreateCase} className="space-y-4">
          {createError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{createError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Case Docket Number <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. CC-2026-00123"
              value={newCaseNumber}
              onChange={(e) => setNewCaseNumber(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Initial Procedural Status</label>
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
            >
              <option value="Filed">Filed</option>
              <option value="Active">Active</option>
              <option value="Adjourned">Adjourned</option>
              <option value="Disposed">Disposed</option>
              <option value="Closed">Closed</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Filing Date (Optional)</label>
            <input
              type="date"
              value={newFilingDate}
              onChange={(e) => setNewFilingDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
            />
            <p className="text-[11px] text-slate-400 mt-1">Leave empty to default to current date.</p>
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
              <span>Register Case</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* EDIT CASE MODAL */}
      <Modal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        title="Update Case Docket Record"
        subtitle="Modify case number or procedural status"
      >
        <form onSubmit={handleUpdateCase} className="space-y-4">
          {editError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{editError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Case Number</label>
            <input
              type="text"
              value={editCaseNumber}
              onChange={(e) => setEditCaseNumber(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Procedural Status</label>
            <select
              value={editStatus}
              onChange={(e) => setEditStatus(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
            >
              <option value="Filed">Filed</option>
              <option value="Active">Active</option>
              <option value="Adjourned">Adjourned</option>
              <option value="Disposed">Disposed</option>
              <option value="Closed">Closed</option>
            </select>
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
              <span>Save Changes</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* CASE DETAIL MODAL */}
      <Modal
        isOpen={Boolean(selectedCaseId)}
        onClose={() => setSelectedCaseId(null)}
        title={caseDetail ? `Case Docket: ${caseDetail.case_number}` : 'Loading Case Details...'}
        subtitle={caseDetail ? `Case UUID: ${caseDetail.case_id}` : undefined}
        maxWidth="max-w-3xl"
      >
        {isLoadingDetail ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-500 text-xs">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
            <span>Retrieving comprehensive case docket...</span>
          </div>
        ) : detailError ? (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-rose-600" />
              <span>{detailError}</span>
            </div>
            <button
              type="button"
              onClick={() => selectedCaseId && openDetailModal(selectedCaseId)}
              className="font-semibold underline"
            >
              Retry
            </button>
          </div>
        ) : caseDetail ? (
          <div className="space-y-6">
            {/* Header Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px] font-semibold uppercase">Status</span>
                <StatusBadge status={caseDetail.status} size="sm" />
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] font-semibold uppercase">Filing Date</span>
                <span className="font-semibold text-slate-900">{formatDateSafe(caseDetail.filing_date)}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] font-semibold uppercase">Parties Count</span>
                <span className="font-semibold text-slate-900">{caseDetail.parties.length}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] font-semibold uppercase">Hearings Count</span>
                <span className="font-semibold text-slate-900">{caseDetail.hearings.length}</span>
              </div>
            </div>

            {/* Parties Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <UserPlus className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Associated Legal Parties</span>
                </h4>
                <button
                  type="button"
                  onClick={() => {
                    setLinkPartyId('');
                    setLinkRoleType('Applicant');
                    setLinkError(null);
                    setIsLinkPartyOpen(true);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors border border-emerald-200 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Link Party</span>
                </button>
              </div>

              {caseDetail.parties.length > 0 ? (
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="px-3.5 py-2">Litigant Name</th>
                        <th className="px-3.5 py-2">Role Type</th>
                        <th className="px-3.5 py-2">Category</th>
                        <th className="px-3.5 py-2">Phone Numbers</th>
                        <th className="px-3.5 py-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {caseDetail.parties.map((p) => (
                        <tr key={p.party_id} className="hover:bg-slate-50/50">
                          <td className="px-3.5 py-2 font-semibold text-slate-900">{p.name}</td>
                          <td className="px-3.5 py-2">
                            <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                              {p.role_type}
                            </span>
                          </td>
                          <td className="px-3.5 py-2 text-slate-600">{p.party_type}</td>
                          <td className="px-3.5 py-2 text-slate-500 font-mono text-[11px]">
                            {p.phone_numbers && p.phone_numbers.length > 0
                              ? p.phone_numbers.join(', ')
                              : 'None'}
                          </td>
                          <td className="px-3.5 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => setPartyToUnlink({ party_id: p.party_id, name: p.name })}
                              className="text-rose-600 hover:text-rose-800 font-medium inline-flex items-center gap-1 cursor-pointer"
                              title="Unlink party from case"
                            >
                              <UserMinus className="h-3 w-3" />
                              <span>Unlink</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic p-3 bg-slate-50 rounded-lg border border-slate-200">
                  No parties currently linked to this case docket.
                </p>
              )}
            </div>

            {/* Hearings List */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-slate-500" />
                <span>Scheduled Hearings</span>
              </h4>
              {caseDetail.hearings.length > 0 ? (
                <div className="space-y-1.5">
                  {caseDetail.hearings.map((h) => (
                    <div
                      key={h.hearing_id}
                      className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/50 flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-semibold text-slate-900">
                          {formatDateSafe(h.start_time)}
                        </span>
                        <span className="ml-2 text-slate-500">
                          {h.start_time ? new Date(h.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''} - {h.end_time ? new Date(h.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                      </div>
                      <span className="font-medium text-slate-700">
                        Presiding: {h.judge_name || 'Unassigned'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                  No hearings scheduled.
                </p>
              )}
            </div>

            {/* Filings List */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-slate-500" />
                <span>Court Filings</span>
              </h4>
              {caseDetail.filings.length > 0 ? (
                <div className="space-y-1.5">
                  {caseDetail.filings.map((f) => (
                    <div
                      key={f.filing_id}
                      className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/50 flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-semibold text-slate-900">{f.filing_type}</span>
                        <span className="text-slate-500 ml-2">by {f.party_name || 'Unknown'}</span>
                      </div>
                      <span className="text-slate-500">{formatDateSafe(f.filing_date)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                  No filings recorded on this docket.
                </p>
              )}
            </div>

            {/* Orders List */}
            {caseDetail.orders.length > 0 && (
              <div className="space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <Gavel className="h-3.5 w-3.5 text-slate-500" />
                    <span>Judicial Orders</span>
                  </h4>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200 w-fit">
                    Sample Judicial Order — Demonstration Data
                  </span>
                </div>
                <div className="space-y-1.5">
                  {caseDetail.orders.map((o) => (
                    <div
                      key={o.order_id}
                      className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/50 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between font-medium">
                        <span className="text-slate-900 font-semibold">Order by {o.judge_name || 'Court'}</span>
                        <span className="text-slate-500">{formatDateSafe(o.order_date)}</span>
                      </div>
                      <p className="text-slate-600 leading-relaxed font-normal">{o.details || 'No description recorded.'}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Disposition Details */}
            {caseDetail.disposition && (
              <div className="p-3.5 rounded-xl border border-purple-200 bg-purple-50/50 text-xs space-y-1">
                <h4 className="font-bold text-purple-900 uppercase text-[10px] tracking-wider">Final Disposition</h4>
                <p className="text-purple-800 font-medium">{caseDetail.disposition.final_judgment}</p>
                <p className="text-purple-600 text-[11px]">
                  Date: {formatDateSafe(caseDetail.disposition.disposition_date)}
                </p>
              </div>
            )}
          </div>
        ) : null}
      </Modal>

      {/* LINK PARTY MODAL */}
      <Modal
        isOpen={isLinkPartyOpen}
        onClose={() => setIsLinkPartyOpen(false)}
        title="Associate Legal Party with Case"
        subtitle="Designate a verified litigant or counsel role on this docket"
      >
        <form onSubmit={handleLinkParty} className="space-y-4">
          {linkError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{linkError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Party UUID <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. 1c51a3f3-e269-47aa-9a2c-7c0406187229"
              value={linkPartyId}
              onChange={(e) => setLinkPartyId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Find the Party UUID in the Parties & Litigants tab.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Role Type</label>
            <select
              value={linkRoleType}
              onChange={(e) => setLinkRoleType(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
            >
              <option value="Applicant">Applicant</option>
              <option value="Defendant">Defendant</option>
              <option value="Lead Counsel">Lead Counsel</option>
            </select>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsLinkPartyOpen(false)}
              disabled={isSubmittingLink}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmittingLink}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              {isSubmittingLink && <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />}
              <span>Link Party</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* CONFIRM UNLINK PARTY */}
      <ConfirmDialog
        isOpen={Boolean(partyToUnlink)}
        title="Unlink Party from Case"
        message={`Are you sure you want to remove party '${partyToUnlink?.name}' from this case docket? This action will remove their role association.`}
        confirmLabel="Unlink Party"
        confirmVariant="danger"
        isSubmitting={isSubmittingUnlink}
        onConfirm={handleUnlinkParty}
        onCancel={() => setPartyToUnlink(null)}
      />
    </div>
  );
};
