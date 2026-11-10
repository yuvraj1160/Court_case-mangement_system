import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  Filter,
  Plus,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Phone,
  PhoneCall,
  Trash2,
  Briefcase,
} from 'lucide-react';
import {
  listParties,
  getParty,
  createParty,
  updateParty,
  addPartyPhone,
  deletePartyPhone,
  ApiClientError,
} from '../../api';
import type {
  PartyListItem,
  PartyDetail,
  PaginationInfo,
} from '../../types';
import {
  EmptyState,
  Modal,
  ConfirmDialog,
  PaginationControls,
  StatusBadge,
} from '../index';
import { formatDateSafe } from '../../layouts/dashboardNavigation';

export const PartiesSection: React.FC = () => {
  const [parties, setParties] = useState<PartyListItem[]>([]);
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
  const [partyTypeFilter, setPartyTypeFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);

  // Detail Modal State
  const [selectedPartyId, setSelectedPartyId] = useState<string | null>(null);
  const [partyDetail, setPartyDetail] = useState<PartyDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Add Phone State inside Detail Modal
  const [newPhone, setNewPhone] = useState('');
  const [isAddingPhone, setIsAddingPhone] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [phoneToDelete, setPhoneToDelete] = useState<string | null>(null);
  const [isDeletingPhone, setIsDeletingPhone] = useState(false);

  // Create Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPartyType, setNewPartyType] = useState('Individual');
  const [initialPhone, setInitialPhone] = useState('');
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Edit Modal State
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editPartyId, setEditPartyId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPartyType, setEditPartyType] = useState('Individual');
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;
    const run = async () => {
      try {
        const res = await listParties({
          page,
          limit: 10,
          search: appliedSearch.trim() || undefined,
          party_type: partyTypeFilter !== 'all' ? partyTypeFilter : undefined,
        });
        if (isCurrent) {
          setParties(res.data.parties);
          setPagination(res.data.pagination);
          setError(null);
        }
      } catch (err) {
        if (isCurrent) {
          if (err instanceof ApiClientError) {
            setError(err.message);
          } else {
            setError('Failed to retrieve legal parties directory.');
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
  }, [page, partyTypeFilter, appliedSearch, reloadKey]);

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

  const openDetailModal = async (partyId: string) => {
    setSelectedPartyId(partyId);
    setPartyDetail(null);
    setIsLoadingDetail(true);
    setDetailError(null);
    setPhoneError(null);
    try {
      const res = await getParty(partyId);
      setPartyDetail(res.data);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setDetailError(err.message);
      } else {
        setDetailError('Failed to load party details.');
      }
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleCreateParty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      setCreateError('Party name is required.');
      return;
    }
    setIsSubmittingCreate(true);
    setCreateError(null);
    try {
      await createParty({
        name: newName.trim(),
        party_type: newPartyType,
        phone_numbers: initialPhone.trim() ? [initialPhone.trim()] : undefined,
      });
      setIsCreateOpen(false);
      setNewName('');
      setNewPartyType('Individual');
      setInitialPhone('');
      setSuccessMessage('Legal party registered successfully.');
      setPage(1);
      handleRefresh();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setCreateError(err.message);
      } else {
        setCreateError('Failed to register party.');
      }
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  const openEditModal = (p: PartyListItem) => {
    setEditPartyId(p.party_id);
    setEditName(p.name);
    setEditPartyType(p.party_type);
    setEditError(null);
    setIsEditOpen(true);
  };

  const handleUpdateParty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editPartyId) return;
    if (!editName.trim()) {
      setEditError('Party name cannot be empty.');
      return;
    }
    setIsSubmittingEdit(true);
    setEditError(null);
    try {
      await updateParty(editPartyId, {
        name: editName.trim(),
        party_type: editPartyType,
      });
      setIsEditOpen(false);
      setSuccessMessage('Party record updated successfully.');
      handleRefresh();
      if (selectedPartyId === editPartyId) {
        openDetailModal(editPartyId);
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        setEditError(err.message);
      } else {
        setEditError('Failed to update party.');
      }
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const handleAddPhone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPartyId || !newPhone.trim()) return;
    setIsAddingPhone(true);
    setPhoneError(null);
    try {
      await addPartyPhone(selectedPartyId, { phone_number: newPhone.trim() });
      setNewPhone('');
      setSuccessMessage('Phone number added to party profile.');
      openDetailModal(selectedPartyId);
      handleRefresh();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setPhoneError(err.message);
      } else {
        setPhoneError('Failed to add phone number.');
      }
    } finally {
      setIsAddingPhone(false);
    }
  };

  const handleDeletePhone = async () => {
    if (!selectedPartyId || !phoneToDelete) return;
    setIsDeletingPhone(true);
    try {
      await deletePartyPhone(selectedPartyId, phoneToDelete);
      setPhoneToDelete(null);
      setSuccessMessage('Phone number removed.');
      openDetailModal(selectedPartyId);
      handleRefresh();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setPhoneError(err.message);
      } else {
        setPhoneError('Failed to delete phone number.');
      }
      setPhoneToDelete(null);
    } finally {
      setIsDeletingPhone(false);
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
        <form onSubmit={handleSearchSubmit} className="flex flex-1 flex-wrap sm:flex-nowrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search litigant or counsel by name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-slate-400" />
            <select
              value={partyTypeFilter}
              onChange={(e) => {
                setIsLoading(true);
                setPartyTypeFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by party category"
              className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
            >
              <option value="all">All Categories</option>
              <option value="Individual">Individual</option>
              <option value="Corporation">Corporation</option>
              <option value="Government Agency">Government Agency</option>
              <option value="Legal Representative">Legal Representative</option>
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
            title="Refresh directory"
            aria-label="Refresh parties list"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => {
              setNewName('');
              setNewPartyType('Individual');
              setInitialPhone('');
              setCreateError(null);
              setIsCreateOpen(true);
            }}
            className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>New Party</span>
          </button>
        </div>
      </div>

      {/* Parties Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-5 py-3">Party Name</th>
                <th className="px-5 py-3">Category</th>
                <th className="px-5 py-3">Phone Numbers</th>
                <th className="px-5 py-3 text-center">Active Cases</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
                      <span>Loading parties roster...</span>
                    </div>
                  </td>
                </tr>
              ) : parties.length > 0 ? (
                parties.map((p) => (
                  <tr key={p.party_id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-5 py-3">
                      <button
                        type="button"
                        onClick={() => openDetailModal(p.party_id)}
                        className="font-semibold text-slate-900 hover:text-emerald-700 hover:underline cursor-pointer flex items-center gap-1.5"
                      >
                        <span>{p.name}</span>
                        <ExternalLink className="h-3 w-3 opacity-50" />
                      </button>
                    </td>
                    <td className="px-5 py-3">
                      <span className="inline-block px-2.5 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                        {p.party_type}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-600 font-mono text-[11px]">
                      {p.phone_numbers && p.phone_numbers.length > 0
                        ? p.phone_numbers.join(', ')
                        : 'None'}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <span className="inline-block px-2.5 py-0.5 rounded-full font-mono text-[11px] bg-slate-100 text-slate-700 font-medium">
                        {p.case_count}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => openDetailModal(p.party_id)}
                        className="text-emerald-600 hover:text-emerald-800 font-medium cursor-pointer"
                      >
                        Details
                      </button>
                      <span className="text-slate-300">&bull;</span>
                      <button
                        type="button"
                        onClick={() => openEditModal(p)}
                        className="text-slate-600 hover:text-slate-900 font-medium cursor-pointer"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="p-8">
                    <EmptyState
                      title="No parties found"
                      description="No legal parties match your current search criteria."
                      icon={Users}
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

      {/* CREATE PARTY MODAL */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Register Legal Party"
        subtitle="Add a litigant, corporation, government agency, or counsel to directory"
      >
        <form onSubmit={handleCreateParty} className="space-y-4">
          {createError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{createError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Full Legal Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. John Doe, or Acme Corp LLC"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Party Category</label>
            <select
              value={newPartyType}
              onChange={(e) => setNewPartyType(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
            >
              <option value="Individual">Individual</option>
              <option value="Corporation">Corporation</option>
              <option value="Government Agency">Government Agency</option>
              <option value="Legal Representative">Legal Representative</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Initial Phone Number (Optional)</label>
            <input
              type="text"
              placeholder="e.g. +1-555-0123"
              value={initialPhone}
              onChange={(e) => setInitialPhone(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
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
              <span>Register Party</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* EDIT PARTY MODAL */}
      <Modal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        title="Update Party Record"
        subtitle="Edit name or category of existing legal party"
      >
        <form onSubmit={handleUpdateParty} className="space-y-4">
          {editError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{editError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Party Name</label>
            <input
              type="text"
              required
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Party Category</label>
            <select
              value={editPartyType}
              onChange={(e) => setEditPartyType(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
            >
              <option value="Individual">Individual</option>
              <option value="Corporation">Corporation</option>
              <option value="Government Agency">Government Agency</option>
              <option value="Legal Representative">Legal Representative</option>
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

      {/* PARTY DETAIL MODAL */}
      <Modal
        isOpen={Boolean(selectedPartyId)}
        onClose={() => setSelectedPartyId(null)}
        title={partyDetail ? `Party: ${partyDetail.name}` : 'Loading Party Details...'}
        subtitle={partyDetail ? `UUID: ${partyDetail.party_id}` : undefined}
        maxWidth="max-w-2xl"
      >
        {isLoadingDetail ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-500 text-xs">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
            <span>Retrieving party profile...</span>
          </div>
        ) : detailError ? (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-rose-600" />
              <span>{detailError}</span>
            </div>
            <button
              type="button"
              onClick={() => selectedPartyId && openDetailModal(selectedPartyId)}
              className="font-semibold underline"
            >
              Retry
            </button>
          </div>
        ) : partyDetail ? (
          <div className="space-y-6">
            {/* Header info */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
              <div>
                <span className="text-slate-400 block text-[10px] font-semibold uppercase">Category</span>
                <span className="font-semibold text-slate-900">{partyDetail.party_type}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] font-semibold uppercase">Cases Participated</span>
                <span className="font-semibold text-slate-900">{partyDetail.associated_cases.length}</span>
              </div>
            </div>

            {/* Phone numbers section */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 text-emerald-600" />
                <span>Contact Phone Numbers</span>
              </h4>

              {phoneError && (
                <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{phoneError}</span>
                </div>
              )}

              {/* Add phone inline form */}
              <form onSubmit={handleAddPhone} className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="e.g. +1-555-0199"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  type="submit"
                  disabled={isAddingPhone || !newPhone.trim()}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50 flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Phone</span>
                </button>
              </form>

              {/* Existing phone numbers */}
              {partyDetail.phone_numbers && partyDetail.phone_numbers.length > 0 ? (
                <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 overflow-hidden">
                  {partyDetail.phone_numbers.map((phone) => (
                    <div
                      key={phone}
                      className="px-3.5 py-2 flex items-center justify-between text-xs hover:bg-slate-50/50"
                    >
                      <div className="flex items-center gap-2 text-slate-800 font-mono">
                        <PhoneCall className="h-3.5 w-3.5 text-slate-400" />
                        <span>{phone}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPhoneToDelete(phone)}
                        className="text-rose-600 hover:text-rose-800 p-1 rounded hover:bg-rose-50 transition-colors cursor-pointer"
                        title="Delete phone number"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic p-3 bg-slate-50 rounded-lg border border-slate-200">
                  No telephone numbers on file for this party.
                </p>
              )}
            </div>

            {/* Associated Cases */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Briefcase className="h-3.5 w-3.5 text-slate-500" />
                <span>Associated Case Dockets</span>
              </h4>

              {partyDetail.associated_cases && partyDetail.associated_cases.length > 0 ? (
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="px-3.5 py-2">Case Number</th>
                        <th className="px-3.5 py-2">Assigned Role</th>
                        <th className="px-3.5 py-2">Status</th>
                        <th className="px-3.5 py-2">Filing Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {partyDetail.associated_cases.map((ac) => (
                        <tr key={ac.case_id} className="hover:bg-slate-50/50">
                          <td className="px-3.5 py-2 font-mono font-bold text-emerald-700">
                            {ac.case_number}
                          </td>
                          <td className="px-3.5 py-2">
                            <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                              {ac.role_type}
                            </span>
                          </td>
                          <td className="px-3.5 py-2">
                            <StatusBadge status={ac.status} size="sm" />
                          </td>
                          <td className="px-3.5 py-2 text-slate-500">{formatDateSafe(ac.filing_date)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic p-3 bg-slate-50 rounded-lg border border-slate-200">
                  This party is not currently linked to any active or historical cases.
                </p>
              )}
            </div>
          </div>
        ) : null}
      </Modal>

      {/* CONFIRM DELETE PHONE */}
      <ConfirmDialog
        isOpen={Boolean(phoneToDelete)}
        title="Remove Phone Number"
        message={`Are you sure you want to remove '${phoneToDelete}' from this party's contact details?`}
        confirmLabel="Remove Phone"
        confirmVariant="danger"
        isSubmitting={isDeletingPhone}
        onConfirm={handleDeletePhone}
        onCancel={() => setPhoneToDelete(null)}
      />
    </div>
  );
};
