/**
 * Court Case Management System - Judge Cases Section
 * Displays cases assigned to the authenticated judge's chambers.
 * Strictly read-only: No case creation, updates, party linking, or deletion controls.
 */

import React, { useState, useEffect } from 'react';
import {
  Briefcase,
  Search,
  Filter,
  RefreshCw,
  AlertCircle,
  Users,
  Scale,
  Calendar,
  X,
} from 'lucide-react';
import { listCases, ApiClientError } from '../../api/index.ts';
import type { CaseListItem, PaginationInfo } from '../../types/index.ts';
import { StatusBadge, EmptyState, PaginationControls } from '../index.ts';
import { formatDateSafe } from '../../layouts/dashboardNavigation.ts';

export interface JudgeCasesSectionProps {
  onInspectCase: (caseId: string) => void;
}

export const JudgeCasesSection: React.FC<JudgeCasesSectionProps> = ({ onInspectCase }) => {
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 10,
    total_records: 0,
    total_pages: 1,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter inputs
  const [searchInput, setSearchInput] = useState('');
  const [statusInput, setStatusInput] = useState('all');

  // Applied filters (triggers fetch)
  const [appliedFilters, setAppliedFilters] = useState({
    search: '',
    status: 'all',
  });
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let isCurrent = true;

    const fetchJudgeCases = async () => {
      setIsLoading(true);
      try {
        const res = await listCases({
          page,
          limit: 10,
          search: appliedFilters.search.trim() || undefined,
          status: appliedFilters.status !== 'all' ? appliedFilters.status : undefined,
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
            setError('Failed to retrieve cases assigned to your bench.');
          }
        }
      } finally {
        if (isCurrent) {
          setIsLoading(false);
        }
      }
    };

    void fetchJudgeCases();

    return () => {
      isCurrent = false;
    };
  }, [page, appliedFilters, reloadKey]);

  const handleFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setAppliedFilters({
      search: searchInput,
      status: statusInput,
    });
  };

  const handleClearFilters = () => {
    setSearchInput('');
    setStatusInput('all');
    setPage(1);
    setAppliedFilters({
      search: '',
      status: 'all',
    });
  };

  const isFiltered = appliedFilters.search !== '' || appliedFilters.status !== 'all';

  return (
    <div className="space-y-4">
      {/* Section Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">Cases Assigned to Your Bench</h2>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-amber-50 text-amber-800 border border-amber-200">
                Judicial Scoped
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Matters where you are the presiding judicial officer with scheduled proceedings or entered orders
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              disabled={isLoading}
              className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors cursor-pointer disabled:opacity-50"
              title="Refresh Cases"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Filter Toolbar */}
        <form onSubmit={handleFilterSubmit} className="mt-4 pt-4 border-t border-slate-100 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by case number..."
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="sm:w-48">
            <select
              value={statusInput}
              onChange={(e) => setStatusInput(e.target.value)}
              className="w-full py-2 px-3 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
            >
              <option value="all">All Case Statuses</option>
              <option value="Filed">Filed</option>
              <option value="Active">Active</option>
              <option value="Adjourned">Adjourned</option>
              <option value="Disposed">Disposed</option>
              <option value="Closed">Closed</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Filter className="h-3.5 w-3.5" />
              <span>Apply Filters</span>
            </button>

            {isFiltered && (
              <button
                type="button"
                onClick={handleClearFilters}
                className="px-3 py-2 rounded-lg text-xs font-medium border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors cursor-pointer flex items-center gap-1"
              >
                <X className="h-3.5 w-3.5" />
                <span>Clear</span>
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="font-semibold underline hover:no-underline ml-4"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading Skeleton / Spinner */}
      {isLoading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-xs">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600 mx-auto" />
          <p className="text-xs text-slate-500 mt-3 font-medium">Loading assigned judicial cases...</p>
        </div>
      ) : cases.length > 0 ? (
        /* Cases Table */
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
                  <th className="px-5 py-3 text-right">Bench Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cases.map((c) => (
                  <tr key={c.case_id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-5 py-3 font-mono font-bold text-slate-900">
                      {c.case_number}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={c.status} size="sm" />
                    </td>
                    <td className="px-5 py-3 text-slate-500">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-slate-400" />
                        <span>{formatDateSafe(c.filing_date)}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-center">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono bg-slate-100 text-slate-700">
                        <Users className="h-3 w-3 text-slate-400" />
                        {c.parties_count}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-center">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono bg-amber-50 text-amber-800 border border-amber-100">
                        <Scale className="h-3 w-3 text-amber-600" />
                        {c.hearings_count}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => onInspectCase(c.case_id)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-amber-700 hover:text-amber-900 hover:bg-amber-50 transition-colors cursor-pointer"
                      >
                        Inspect Docket &rarr;
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {pagination.total_pages > 1 && (
            <div className="p-4 border-t border-slate-200">
              <PaginationControls
                pagination={pagination}
                onPageChange={(p) => setPage(p)}
                disabled={isLoading}
              />
            </div>
          )}
        </div>
      ) : (
        /* Empty State */
        <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-xs">
          <EmptyState
            title={isFiltered ? 'No Matching Cases Found' : 'No Assigned Cases'}
            description={
              isFiltered
                ? 'No cases on your judicial docket matched the selected filters.'
                : 'There are currently no cases assigned to your judicial bench docket.'
            }
            icon={Briefcase}
            actionLabel={isFiltered ? 'Clear Filters' : undefined}
            onAction={isFiltered ? handleClearFilters : undefined}
          />
        </div>
      )}
    </div>
  );
};
