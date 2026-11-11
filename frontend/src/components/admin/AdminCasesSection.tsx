/**
 * Court Case Management System - Admin Cases Section
 * Full administrative oversight of court cases:
 * - Live paginated case registry
 * - Search by case number and filter by status
 * - Case details inspection (parties, hearings, orders, filings)
 * - Case creation and metadata updating
 * - Litigant association (linking & unlinking parties)
 * - Exclusive administrative case deletion (DELETE /api/cases/:id)
 */

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
  Trash2,
  Edit2,
} from 'lucide-react';
import {
  listCases,
  getCase,
  createCase,
  updateCase,
  deleteCase,
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

export interface AdminCasesSectionProps {
  initialCaseId?: string | null;
  onClearInitialCaseId?: () => void;
}

export const AdminCasesSection: React.FC<AdminCasesSectionProps> = ({
  initialCaseId,
  onClearInitialCaseId,
}) => {
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

  // Filters & Search
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);

  // Detail Modal State
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const effectiveCaseId = selectedCaseId ?? initialCaseId ?? null;
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

  // Delete Case State (Admin Exclusive)
  const [caseToDelete, setCaseToDelete] = useState<CaseListItem | null>(null);
  const [isSubmittingDelete, setIsSubmittingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Link Party Modal State
  const [isLinkPartyOpen, setIsLinkPartyOpen] = useState(false);
  const [linkPartyId, setLinkPartyId] = useState('');
  const [linkRoleType, setLinkRoleType] = useState('Applicant');
  const [isSubmittingLink, setIsSubmittingLink] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  // Unlink Party State
  const [partyToUnlink, setPartyToUnlink] = useState<{ party_id: string; name: string } | null>(null);
  const [isSubmittingUnlink, setIsSubmittingUnlink] = useState(false);

  // Fetch Cases on Filter/Page Change
  useEffect(() => {
    let isCurrent = true;
    const run = async () => {
      try {
        setIsLoading(true);
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
            setError('Failed to retrieve case management docket.');
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
  }, [page, appliedSearch, statusFilter, reloadKey]);

  // Fetch Case Details when an effective case is selected
  useEffect(() => {
    if (!effectiveCaseId) {
      return;
    }

    let isCurrent = true;
    const loadDetail = async () => {
      try {
        setIsLoadingDetail(true);
        setDetailError(null);
        const res = await getCase(effectiveCaseId);
        if (isCurrent) {
          setCaseDetail(res.data);
        }
      } catch (err) {
        if (isCurrent) {
          if (err instanceof ApiClientError) {
            setDetailError(err.message);
          } else {
            setDetailError('Unable to load case record details.');
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
  }, [effectiveCaseId, reloadKey]);

  const handleCloseDetail = () => {
    setSelectedCaseId(null);
    setCaseDetail(null);
    if (onClearInitialCaseId) {
      onClearInitialCaseId();
    }
  };

  // Search Submission
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAppliedSearch(search);
    setPage(1);
  };

  // Create Case Handler
  const handleCreateCase = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    if (!newCaseNumber.trim()) {
      setCreateError('Case number is required.');
      return;
    }

    try {
      setIsSubmittingCreate(true);
      await createCase({
        case_number: newCaseNumber.trim(),
        status: newStatus,
        filing_date: newFilingDate || undefined,
      });

      setSuccessMessage(`Case ${newCaseNumber.trim()} created successfully.`);
      setIsCreateOpen(false);
      setNewCaseNumber('');
      setNewStatus('Filed');
      setNewFilingDate('');
      setReloadKey((k) => k + 1);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setCreateError(err.message);
      } else {
        setCreateError('Failed to register court case.');
      }
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  // Open Edit Modal
  const openEditModal = (c: CaseListItem) => {
    setEditCaseId(c.case_id);
    setEditCaseNumber(c.case_number);
    setEditStatus(c.status);
    setEditError(null);
    setIsEditOpen(true);
  };

  // Update Case Handler
  const handleUpdateCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editCaseId) return;
    setEditError(null);

    try {
      setIsSubmittingEdit(true);
      await updateCase(editCaseId, {
        case_number: editCaseNumber.trim() || undefined,
        status: editStatus || undefined,
      });

      setSuccessMessage(`Case ${editCaseNumber} updated successfully.`);
      setIsEditOpen(false);
      setReloadKey((k) => k + 1);
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

  // Delete Case Handler (Admin Exclusive)
  const handleDeleteCase = async () => {
    if (!caseToDelete) return;
    setDeleteError(null);

    try {
      setIsSubmittingDelete(true);
      await deleteCase(caseToDelete.case_id);
      setSuccessMessage(`Case ${caseToDelete.case_number} has been permanently deleted.`);
      if (effectiveCaseId === caseToDelete.case_id) {
        handleCloseDetail();
      }
      setCaseToDelete(null);
      setReloadKey((k) => k + 1);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setDeleteError(err.message);
      } else {
        setDeleteError('Failed to delete court case.');
      }
    } finally {
      setIsSubmittingDelete(false);
    }
  };

  // Link Party Handler
  const handleLinkParty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveCaseId || !linkPartyId.trim()) {
      setLinkError('Party ID and Role Type are required.');
      return;
    }

    try {
      setIsSubmittingLink(true);
      setLinkError(null);
      await linkPartyToCase(effectiveCaseId, {
        party_id: linkPartyId.trim(),
        role_type: linkRoleType,
      });

      setSuccessMessage('Party successfully linked to case.');
      setIsLinkPartyOpen(false);
      setLinkPartyId('');
      setReloadKey((k) => k + 1);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setLinkError(err.message);
      } else {
        setLinkError('Failed to link party to case.');
      }
    } finally {
      setIsSubmittingLink(false);
    }
  };

  // Unlink Party Handler
  const handleUnlinkParty = async () => {
    if (!effectiveCaseId || !partyToUnlink) return;

    try {
      setIsSubmittingUnlink(true);
      await unlinkPartyFromCase(effectiveCaseId, partyToUnlink.party_id);
      setSuccessMessage(`Party ${partyToUnlink.name} unlinked from case.`);
      setPartyToUnlink(null);
      setReloadKey((k) => k + 1);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setDetailError(err.message);
      } else {
        setDetailError('Failed to unlink party.');
      }
    } finally {
      setIsSubmittingUnlink(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Alert Banners */}
      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-emerald-800 text-sm animate-fade-in">
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

      {deleteError && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between text-rose-800 text-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
            <span>{deleteError}</span>
          </div>
          <button
            type="button"
            onClick={() => setDeleteError(null)}
            className="text-xs font-semibold text-rose-700 hover:text-rose-900"
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

      {/* Control Bar: Search, Filters & Actions */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              data-testid="admin-case-search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search case number..."
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <button
            type="submit"
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-colors cursor-pointer"
          >
            Filter
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-400" />
            <select
              data-testid="admin-case-status-filter"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="all">All Case Statuses</option>
              <option value="Filed">Filed</option>
              <option value="Active">Active</option>
              <option value="Adjourned">Adjourned</option>
              <option value="Disposed">Disposed</option>
              <option value="Closed">Closed</option>
            </select>
          </div>

          <button
            type="button"
            data-testid="admin-create-case-btn"
            onClick={() => {
              setNewCaseNumber('');
              setNewStatus('Filed');
              setNewFilingDate('');
              setCreateError(null);
              setIsCreateOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            New Case
          </button>
        </div>
      </div>

      {/* Cases Registry Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 flex flex-col items-center justify-center space-y-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
            <p className="text-sm text-slate-500">Querying court docket registry...</p>
          </div>
        ) : cases.length === 0 ? (
          <EmptyState
            icon={FolderOpen}
            title="No Case Records Found"
            description="No court cases match the applied search terms or status criteria."
            actionLabel="Register First Case"
            onAction={() => setIsCreateOpen(true)}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm" data-testid="admin-cases-table">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-3.5">Case Number</th>
                    <th className="px-6 py-3.5">Docket Status</th>
                    <th className="px-6 py-3.5">Filing Date</th>
                    <th className="px-6 py-3.5">System UUID</th>
                    <th className="px-6 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {cases.map((c) => (
                    <tr
                      key={c.case_id}
                      className="hover:bg-slate-50/80 transition-colors"
                      data-testid={`case-row-${c.case_id}`}
                    >
                      <td className="px-6 py-4 font-semibold text-slate-900">
                        {c.case_number}
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={c.status} />
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {formatDateSafe(c.filing_date)}
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-slate-400">
                        {c.case_id}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedCaseId(c.case_id)}
                            data-testid={`view-case-${c.case_id}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors cursor-pointer"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Inspect
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(c)}
                            data-testid={`edit-case-${c.case_id}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-md transition-colors cursor-pointer"
                          >
                            <Edit2 className="h-3 w-3" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setCaseToDelete(c)}
                            data-testid={`delete-case-${c.case_id}`}
                            title="Hard delete case (Admin only)"
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-md transition-colors cursor-pointer"
                          >
                            <Trash2 className="h-3 w-3" />
                            Delete
                          </button>
                        </div>
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

      {/* Case Detail Inspection Modal */}
      {effectiveCaseId && (
        <Modal
          isOpen={true}
          onClose={handleCloseDetail}
          title={caseDetail ? `Case Record: ${caseDetail.case_number}` : 'Loading Case Details...'}
          maxWidth="max-w-4xl"
        >
          {isLoadingDetail ? (
            <div className="p-12 flex flex-col items-center justify-center space-y-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
              <p className="text-sm text-slate-500">Loading comprehensive case docket...</p>
            </div>
          ) : detailError ? (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>{detailError}</span>
            </div>
          ) : caseDetail ? (
            <div className="space-y-6" data-testid="admin-case-detail-modal">
              {/* Header Overview Banner */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-xs text-slate-400 font-mono">Docket ID: {caseDetail.case_id}</div>
                  <h3 className="text-xl font-bold text-slate-900 mt-0.5">{caseDetail.case_number}</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Filed on {formatDateSafe(caseDetail.filing_date)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={caseDetail.status} />
                  <button
                    type="button"
                    onClick={() => {
                      setIsLinkPartyOpen(true);
                      setLinkPartyId('');
                      setLinkError(null);
                    }}
                    data-testid="open-link-party-modal-btn"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 rounded-lg text-xs font-semibold transition-colors"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    Link Party
                  </button>
                </div>
              </div>

              {/* Linked Litigants Roster */}
              <div className="space-y-2">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <UserPlus className="h-4 w-4 text-indigo-600" />
                  Associated Litigants & Parties ({caseDetail.parties?.length ?? 0})
                </h4>
                {(!caseDetail.parties || caseDetail.parties.length === 0) ? (
                  <p className="text-xs text-slate-500 italic p-3 bg-slate-50 rounded-lg border border-slate-100">
                    No parties currently linked to this proceeding.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {caseDetail.parties.map((p) => (
                      <div
                        key={p.party_id}
                        className="p-3 bg-white border border-slate-200 rounded-lg flex items-center justify-between"
                        data-testid={`case-party-${p.party_id}`}
                      >
                        <div>
                          <div className="font-semibold text-sm text-slate-900">{p.name}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                              {p.role_type}
                            </span>
                            <span className="text-xs text-slate-500">
                              {p.party_type} {p.phone_numbers?.length ? `• ${p.phone_numbers.join(', ')}` : ''}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setPartyToUnlink({ party_id: p.party_id, name: p.name })}
                          data-testid={`unlink-party-${p.party_id}`}
                          title="Unlink party from case"
                          className="p-1.5 text-rose-600 hover:bg-rose-50 rounded transition-colors"
                        >
                          <UserMinus className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Scheduled Hearings */}
              <div className="space-y-2">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-indigo-600" />
                  Hearings History ({caseDetail.hearings?.length ?? 0})
                </h4>
                {(!caseDetail.hearings || caseDetail.hearings.length === 0) ? (
                  <p className="text-xs text-slate-500 italic p-3 bg-slate-50 rounded-lg border border-slate-100">
                    No hearing proceedings recorded for this case.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                    {caseDetail.hearings.map((h) => (
                      <div key={h.hearing_id} className="p-3 text-xs flex items-center justify-between bg-white">
                        <div>
                          <span className="font-semibold text-slate-800">
                            {formatDateSafe(h.start_time)}
                          </span>
                          <span className="text-slate-500 ml-2">
                            {h.start_time ? new Date(h.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''} - {h.end_time ? new Date(h.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                          </span>
                        </div>
                        <span className="font-mono text-slate-400">Judge ID: {h.judge_id}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Judicial Orders & Filings Summary */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Gavel className="h-4 w-4 text-indigo-600" />
                    Judicial Orders ({caseDetail.orders?.length ?? 0})
                  </h4>
                  {(!caseDetail.orders || caseDetail.orders.length === 0) ? (
                    <p className="text-xs text-slate-500 italic p-3 bg-slate-50 rounded-lg border border-slate-100">
                      No court orders issued.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                      {caseDetail.orders.map((o) => (
                        <div key={o.order_id} className="p-3 text-xs bg-white">
                          <div className="font-semibold text-slate-800">{o.details}</div>
                          <div className="text-slate-500 mt-0.5">{formatDateSafe(o.order_date)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <FileText className="h-4 w-4 text-indigo-600" />
                    Filings Docket ({caseDetail.filings?.length ?? 0})
                  </h4>
                  {(!caseDetail.filings || caseDetail.filings.length === 0) ? (
                    <p className="text-xs text-slate-500 italic p-3 bg-slate-50 rounded-lg border border-slate-100">
                      No filings submitted.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                      {caseDetail.filings.map((f) => (
                        <div key={f.filing_id} className="p-3 text-xs bg-white">
                          <div className="font-semibold text-slate-800">{f.filing_type}</div>
                          <div className="text-slate-500 mt-0.5">{formatDateSafe(f.filing_date)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Close Button */}
              <div className="pt-4 border-t border-slate-200 flex justify-end">
                <button
                  type="button"
                  onClick={handleCloseDetail}
                  className="px-4 py-2 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          ) : null}
        </Modal>
      )}

      {/* Create Case Modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Register New Court Case"
      >
        <form onSubmit={handleCreateCase} className="space-y-4" data-testid="admin-create-case-form">
          {createError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>{createError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Case Number *
            </label>
            <input
              type="text"
              required
              data-testid="create-case-number-input"
              value={newCaseNumber}
              onChange={(e) => setNewCaseNumber(e.target.value)}
              placeholder="e.g. CR-2026-0099"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Initial Case Status
            </label>
            <select
              value={newStatus}
              data-testid="create-case-status-select"
              onChange={(e) => setNewStatus(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="Filed">Filed</option>
              <option value="Active">Active</option>
              <option value="Adjourned">Adjourned</option>
              <option value="Disposed">Disposed</option>
              <option value="Closed">Closed</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Filing Date (Optional, defaults to now)
            </label>
            <input
              type="date"
              data-testid="create-case-filing-date-input"
              value={newFilingDate}
              onChange={(e) => setNewFilingDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
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
              data-testid="submit-create-case-btn"
              className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
            >
              {isSubmittingCreate && <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />}
              Create Case Record
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Case Modal */}
      <Modal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        title="Update Court Case Metadata"
      >
        <form onSubmit={handleUpdateCase} className="space-y-4" data-testid="admin-edit-case-form">
          {editError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>{editError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Case Number
            </label>
            <input
              type="text"
              value={editCaseNumber}
              data-testid="edit-case-number-input"
              onChange={(e) => setEditCaseNumber(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Docket Status
            </label>
            <select
              value={editStatus}
              data-testid="edit-case-status-select"
              onChange={(e) => setEditStatus(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="Filed">Filed</option>
              <option value="Active">Active</option>
              <option value="Adjourned">Adjourned</option>
              <option value="Disposed">Disposed</option>
              <option value="Closed">Closed</option>
            </select>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setIsEditOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmittingEdit}
              data-testid="submit-edit-case-btn"
              className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
            >
              {isSubmittingEdit && <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />}
              Save Changes
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Case Confirmation Dialog (Admin Exclusive) */}
      <ConfirmDialog
        isOpen={Boolean(caseToDelete)}
        title="Permanent Case Deletion"
        message={
          caseToDelete
            ? `Are you certain you want to permanently delete case record "${caseToDelete.case_number}" (UUID: ${caseToDelete.case_id})? This action is strictly restricted to Administrators and cannot be undone.`
            : ''
        }
        confirmLabel="Permanently Delete Case"
        confirmVariant="danger"
        isSubmitting={isSubmittingDelete}
        onConfirm={handleDeleteCase}
        onCancel={() => {
          setCaseToDelete(null);
          setDeleteError(null);
        }}
      />

      {/* Link Party Modal */}
      <Modal
        isOpen={isLinkPartyOpen}
        onClose={() => setIsLinkPartyOpen(false)}
        title="Associate Litigant Party to Case"
      >
        <form onSubmit={handleLinkParty} className="space-y-4">
          {linkError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>{linkError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Registered Party UUID *
            </label>
            <input
              type="text"
              required
              data-testid="link-party-id-input"
              value={linkPartyId}
              onChange={(e) => setLinkPartyId(e.target.value)}
              placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Litigant Role Type
            </label>
            <select
              value={linkRoleType}
              data-testid="link-party-role-select"
              onChange={(e) => setLinkRoleType(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="Petitioner">Petitioner</option>
              <option value="Respondent">Respondent</option>
              <option value="Applicant">Applicant</option>
              <option value="Defendant">Defendant</option>
              <option value="Counsel">Counsel</option>
              <option value="Witness">Witness</option>
            </select>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setIsLinkPartyOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmittingLink}
              data-testid="submit-link-party-btn"
              className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
            >
              {isSubmittingLink && <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />}
              Associate Party
            </button>
          </div>
        </form>
      </Modal>

      {/* Unlink Party Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(partyToUnlink)}
        title="Unlink Litigant from Case"
        message={
          partyToUnlink
            ? `Remove litigant association for "${partyToUnlink.name}" from this case?`
            : ''
        }
        confirmLabel="Unlink Litigant"
        confirmVariant="danger"
        isSubmitting={isSubmittingUnlink}
        onConfirm={handleUnlinkParty}
        onCancel={() => setPartyToUnlink(null)}
      />
    </div>
  );
};
