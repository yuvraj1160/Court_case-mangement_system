/**
 * Court Case Management System - Judge Case Detail & Bench Notes Section
 * Displays complete docket review for an authorized case file:
 * - Case info header and status
 * - Litigants roster and legal counsel with verified phone records
 * - Scheduled hearing history and time slots
 * - Document filings on record
 * - Judicial orders entered and formal final disposition
 * - Session-only Judicial Bench Notes (unencrypted browser session draft)
 * Strictly read-only: Zero record creation, alteration, or deletion controls.
 */

import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  ArrowLeft,
  Calendar,
  Clock,
  Users,
  FileText,
  Gavel,
  ShieldAlert,
  AlertCircle,
  Save,
  CheckCircle2,
  RefreshCw,
  Phone,
  Scale,
} from 'lucide-react';
import { getCase, ApiClientError } from '../../api/index.ts';
import type { CaseDetail, CaseListItem } from '../../types/index.ts';
import { StatusBadge, EmptyState } from '../index.ts';
import {
  formatDateSafe,
  formatTimeSafe,
} from '../../layouts/dashboardNavigation.ts';
import {
  getInitialBenchNote,
  saveBenchNote,
} from '../../data/mockDashboardData.ts';

// ---------------------------------------------------------------------------
// Bench Notes Draft Subcomponent (Local Browser Session Only)
// ---------------------------------------------------------------------------

interface BenchNotesDraftProps {
  judgeId: string;
  caseId: string;
}

export const BenchNotesDraft: React.FC<BenchNotesDraftProps> = ({ judgeId, caseId }) => {
  const [benchNote, setBenchNote] = useState<string>(() => getInitialBenchNote(judgeId, caseId));
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

  const handleSaveLocalDraft = () => {
    if (!caseId) return;
    const success = saveBenchNote(judgeId, caseId, benchNote);
    if (success) {
      setSaveFeedback(
        'Draft observation saved to local browser session (temporary, unencrypted, not sent to server).'
      );
    } else {
      setSaveFeedback('Unable to save draft note in browser session.');
    }
  };

  return (
    <div className="mt-8 pt-6 border-t border-slate-200 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Scale className="h-4 w-4 text-amber-600" />
            Judicial Bench Notes (Local Session Draft)
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Observations are stored strictly in your browser session for this case. They are not
            confidential, encrypted, or persisted to the server database.
          </p>
        </div>
        <span className="text-[11px] font-mono text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 self-start sm:self-auto">
          Local Session Draft
        </span>
      </div>

      {saveFeedback && (
        <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
          <span>{saveFeedback}</span>
        </div>
      )}

      {/* Privacy & Security Warning Banner */}
      <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
        <div className="flex items-center gap-2 font-semibold">
          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
          <span>Security & Privacy Notice: Unencrypted Session Storage</span>
        </div>
        <p className="text-[11px] text-amber-800 leading-relaxed pl-6">
          Browser sessionStorage is not encrypted or secure storage. Draft observations are stored locally in your browser memory for the current session only and are never transmitted to the server or database. <strong>Do not enter confidential, sensitive, or classified case information here.</strong>
        </p>
      </div>

      <textarea
        value={benchNote}
        onChange={(e) => {
          setBenchNote(e.target.value);
          setSaveFeedback(null);
        }}
        rows={4}
        className="w-full p-3 border border-slate-200 rounded-xl text-xs font-sans text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-amber-50/20"
        placeholder="Record draft bench observations, question notes, or procedural reminders for this browser session..."
      />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <span className="text-[11px] text-slate-400">
          Temporary &bull; Unencrypted &bull; Scoped to active browser session
        </span>
        <button
          type="button"
          onClick={handleSaveLocalDraft}
          className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white transition-colors cursor-pointer flex items-center gap-1.5 self-end sm:self-auto shadow-xs"
        >
          <Save className="h-3.5 w-3.5" />
          <span>Save Bench Draft</span>
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Judge Case Detail Section Component
// ---------------------------------------------------------------------------

export interface JudgeCaseDetailSectionProps {
  judgeId: string;
  caseId: string | null;
  assignedCases?: CaseListItem[];
  onSelectCaseId: (caseId: string) => void;
  onReturnToCases: () => void;
}

export const JudgeCaseDetailSection: React.FC<JudgeCaseDetailSectionProps> = ({
  judgeId,
  caseId,
  assignedCases = [],
  onSelectCaseId,
  onReturnToCases,
}) => {
  const [caseDetail, setCaseDetail] = useState<CaseDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isForbidden, setIsForbidden] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!caseId) return;

    let isCurrent = true;

    const fetchDetail = async () => {
      setIsLoading(true);
      setError(null);
      setIsForbidden(false);
      try {
        const res = await getCase(caseId);
        if (isCurrent) {
          setCaseDetail(res.data);
          setError(null);
          setIsForbidden(false);
        }
      } catch (err) {
        if (isCurrent) {
          setCaseDetail(null);
          if (err instanceof ApiClientError) {
            if (err.status === 403) {
              setIsForbidden(true);
              setError(
                err.message ||
                  'Access forbidden: This case record is not assigned to your judicial bench.'
              );
            } else if (err.status === 404) {
              setError('Case record not found.');
            } else {
              setError(err.message);
            }
          } else {
            setError('Failed to load judicial case docket.');
          }
        }
      } finally {
        if (isCurrent) {
          setIsLoading(false);
        }
      }
    };

    void fetchDetail();

    return () => {
      isCurrent = false;
    };
  }, [caseId, reloadKey]);

  return (
    <div className="space-y-6">
      {/* Navigation and Case Switcher Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onReturnToCases}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Assigned Cases</span>
          </button>

          {assignedCases.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-medium hidden md:inline">
                Inspect Case:
              </span>
              <select
                value={caseId || ''}
                onChange={(e) => onSelectCaseId(e.target.value)}
                className="py-1 px-2.5 border border-slate-200 rounded-lg text-xs font-mono text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="" disabled>
                  Select assigned case...
                </option>
                {assignedCases.map((c) => (
                  <option key={c.case_id} value={c.case_id}>
                    {c.case_number} ({c.status})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
            Judicial Docket Review &bull; Read-Only
          </span>
          {caseId && (
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              disabled={isLoading}
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors cursor-pointer disabled:opacity-50"
              title="Reload Docket Records"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {/* State 1: No Case Selected */}
      {!caseId && (
        <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-xs">
          <EmptyState
            title="No Case Selected for Review"
            description="Please select a case from your assigned cases roster or hearing docket to inspect its official court records."
            icon={BookOpen}
            actionLabel="View Assigned Cases"
            onAction={onReturnToCases}
          />
        </div>
      )}

      {/* State 2: Loading */}
      {isLoading && caseId && (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-xs">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600 mx-auto" />
          <p className="text-xs text-slate-500 mt-3 font-medium">
            Retrieving case docket, parties, and proceedings...
          </p>
        </div>
      )}

      {/* State 3: Access Forbidden (403 Isolation Boundary) */}
      {!isLoading && isForbidden && (
        <div className="bg-white rounded-xl border border-rose-200 p-6 shadow-xs space-y-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="h-6 w-6 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-rose-900">
                  Judicial Access Restricted (HTTP 403 Forbidden)
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-100 text-rose-800">
                  Role Boundary Enforced
                </span>
              </div>
              <p className="text-xs text-rose-700 leading-relaxed">
                {error ||
                  'You are not authorized to access this case. Under judicial isolation policy, judges can only review case files for matters where they preside.'}
              </p>
              <p className="text-[11px] font-mono text-slate-500 pt-1">
                Requested Case ID: {caseId} &bull; Authenticated Judge ID: {judgeId}
              </p>
            </div>
          </div>

          <div className="pt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={onReturnToCases}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white transition-colors cursor-pointer"
            >
              Return to Assigned Cases
            </button>
          </div>
        </div>
      )}

      {/* State 4: Generic Error */}
      {!isLoading && error && !isForbidden && (
        <div className="bg-white rounded-xl border border-rose-200 p-6 shadow-xs space-y-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-6 w-6 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-rose-900">Error Loading Case Docket</h3>
              <p className="text-xs text-rose-700">{error}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white transition-colors cursor-pointer"
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* State 5: Case Detail Presentation */}
      {!isLoading && !error && caseDetail && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-6">
          {/* Header Banner */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-5 border-b border-slate-200">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-lg font-bold text-slate-900">
                  {caseDetail.case_number}
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  (ID: {caseDetail.case_id})
                </span>
                <StatusBadge status={caseDetail.status} size="md" />
              </div>
              <p className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                <span>Filing Date: {formatDateSafe(caseDetail.filing_date)}</span>
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                Official Case Docket
              </span>
            </div>
          </div>

          {/* Litigants & Legal Counsel Roster */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
              <Users className="h-4 w-4 text-slate-400" />
              <span>Parties & Legal Counsel ({caseDetail.parties.length})</span>
            </h3>

            {caseDetail.parties.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {caseDetail.parties.map((p) => (
                  <div
                    key={p.party_id}
                    className="p-4 rounded-xl border border-slate-100 bg-slate-50 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-200 text-slate-700">
                        {p.role_type}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">{p.party_type}</span>
                    </div>
                    <p className="text-sm font-bold text-slate-900">{p.name}</p>

                    <div className="pt-1 border-t border-slate-200/60 space-y-1">
                      {p.phone_numbers && p.phone_numbers.length > 0 ? (
                        <div className="flex items-center gap-1.5 text-xs text-slate-600">
                          <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span className="font-mono text-[11px]">
                            {p.phone_numbers.join(', ')}
                          </span>
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-400 italic">No phone numbers listed</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic p-3 bg-slate-50 rounded-lg">
                No parties currently associated with this case file.
              </p>
            )}
          </div>

          {/* Hearing History */}
          <div className="pt-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-slate-400" />
              <span>Hearing History & Scheduled Sessions ({caseDetail.hearings.length})</span>
            </h3>

            {caseDetail.hearings.length > 0 ? (
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2.5">Hearing ID</th>
                      <th className="px-4 py-2.5">Presiding Bench</th>
                      <th className="px-4 py-2.5">Date & Time Range</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {caseDetail.hearings.map((h) => (
                      <tr key={h.hearing_id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-2.5 font-mono text-slate-500">{h.hearing_id}</td>
                        <td className="px-4 py-2.5 font-medium text-slate-800">
                          {h.judge_name || (h.judge_id ? `Judge #${h.judge_id.slice(0, 8)}` : 'Unassigned')}
                        </td>
                        <td className="px-4 py-2.5 text-slate-700">
                          <div className="flex items-center gap-2">
                            <Clock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <span>
                              {formatDateSafe(h.start_time)} &bull; {formatTimeSafe(h.start_time)} -{' '}
                              {formatTimeSafe(h.end_time || h.start_time)}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic p-3 bg-slate-50 rounded-lg">
                No hearings recorded for this case.
              </p>
            )}
          </div>

          {/* Document Filings on Record */}
          <div className="pt-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
              <FileText className="h-4 w-4 text-slate-400" />
              <span>Document Filings on Record ({caseDetail.filings.length})</span>
            </h3>

            {caseDetail.filings.length > 0 ? (
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2.5">Filing ID</th>
                      <th className="px-4 py-2.5">Filing Type</th>
                      <th className="px-4 py-2.5">Filed By Party</th>
                      <th className="px-4 py-2.5">Filing Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {caseDetail.filings.map((f) => (
                      <tr key={f.filing_id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-2.5 font-mono text-slate-500">{f.filing_id}</td>
                        <td className="px-4 py-2.5 font-semibold text-slate-900">{f.filing_type}</td>
                        <td className="px-4 py-2.5 text-slate-600">
                          {f.party_name || 'Official Court Intake'}
                        </td>
                        <td className="px-4 py-2.5 text-slate-500">
                          {formatDateSafe(f.filing_date)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic p-3 bg-slate-50 rounded-lg">
                No filings on record for this case.
              </p>
            )}
          </div>

          {/* Judicial Orders on Record */}
          <div className="pt-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
              <Gavel className="h-4 w-4 text-slate-400" />
              <span>Judicial Orders on Record ({caseDetail.orders.length})</span>
            </h3>

            {caseDetail.orders.length > 0 ? (
              <div className="space-y-2">
                {caseDetail.orders.map((o) => (
                  <div
                    key={o.order_id}
                    className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-1.5 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-amber-600 shrink-0" />
                        <span className="font-semibold text-slate-900">
                          {o.judge_name ? `Issued by ${o.judge_name}` : 'Judicial Order'}
                        </span>
                        <span className="text-slate-400">&bull;</span>
                        <span className="text-slate-500">{formatDateSafe(o.order_date)}</span>
                      </div>
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                        <span>Entered on Record</span>
                      </span>
                    </div>
                    <p className="text-slate-700 pl-6 leading-relaxed">{o.details}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic p-3 bg-slate-50 rounded-lg">
                No judicial orders currently on record.
              </p>
            )}
          </div>

          {/* Final Disposition Record */}
          {caseDetail.disposition && (
            <div className="pt-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>Final Case Disposition & Judgment</span>
              </h3>
              <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/40 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-emerald-950">
                    Disposition ID: {caseDetail.disposition.disp_id}
                  </span>
                  <span className="text-emerald-800">
                    Disposed: {formatDateSafe(caseDetail.disposition.disposition_date)}
                  </span>
                </div>
                <p className="text-slate-800 leading-relaxed font-medium">
                  {caseDetail.disposition.final_judgment}
                </p>
              </div>
            </div>
          )}

          {/* Judicial Bench Notes (Local Session Storage Only) */}
          <BenchNotesDraft
            key={`${judgeId}:${caseDetail.case_id}`}
            judgeId={judgeId}
            caseId={caseDetail.case_id}
          />
        </div>
      )}
    </div>
  );
};
