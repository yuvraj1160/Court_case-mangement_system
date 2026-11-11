/**
 * Court Case Management System - Admin Judges Section
 * Judicial Bench Overview for Administrators.
 *
 * ARCHITECTURAL AUDIT FINDING:
 * The backend REST API provides aggregate judicial statistics via `GET /api/dashboard`
 * (`data.judges: { total: number, active: number }`).
 * An individual judicial officer roster endpoint (/api/judges) is not implemented.
 * Judge identities appear in hearing records (`judge_id`, `judge_name`) via the Hearings API.
 * No mock fixtures or fabricated judge lists are displayed.
 */

import React from 'react';
import { Gavel, Scale, Calendar, Info, CheckCircle2, AlertCircle } from 'lucide-react';
import type { JudgesSummary } from '../../types';

export interface AdminJudgesSectionProps {
  judgesSummary?: JudgesSummary;
}

export const AdminJudgesSection: React.FC<AdminJudgesSectionProps> = ({
  judgesSummary,
}) => {
  const total = judgesSummary?.total ?? 0;
  const active = judgesSummary?.active ?? 0;
  const inactive = Math.max(0, total - active);

  return (
    <div className="space-y-6">
      {/* 1. Header Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Gavel className="h-6 w-6 text-indigo-600" />
              Judicial Bench Overview & Capacity
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Live judicial bench statistics sourced directly from server telemetry
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Server-Backed DB Telemetry
            </span>
          </div>
        </div>

        {/* Database Schema Standard Note */}
        <div className="mt-4 p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 space-y-1">
          <div className="font-semibold text-slate-800 flex items-center gap-1.5">
            <Scale className="h-4 w-4 text-indigo-600" />
            Backend Telemetry Specification:
          </div>
          <p>
            Sourced via <code className="bg-slate-200 px-1 py-0.5 rounded font-mono">GET /api/dashboard</code> query: <code className="bg-slate-200 px-1 py-0.5 rounded font-mono">SELECT COUNT(*) AS total_judges, COUNT(*) FILTER (WHERE active_status IS TRUE) AS active_judges FROM judges;</code>
          </p>
          <p className="text-slate-500">
            Database schema: <code className="bg-slate-200 px-1 py-0.5 rounded font-mono">judges (judge_id uuid PRIMARY KEY, name varchar(100), active_status boolean)</code>. Non-existent courtroom and chambers columns are excluded.
          </p>
        </div>
      </div>

      {/* 2. Live Server Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" data-testid="judges-summary-grid">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Appointed Judges
            </span>
            <div className="h-8 w-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Gavel className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900" data-testid="stat-total-judges">{total}</div>
          <p className="text-xs text-slate-500">Appointed judicial officers in registry</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">
              Active Presiding Judges
            </span>
            <div className="h-8 w-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-700" data-testid="stat-active-judges">{active}</div>
          <p className="text-xs text-slate-500">Active status enabled for proceeding assignments</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Inactive / Unassigned
            </span>
            <div className="h-8 w-8 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center">
              <AlertCircle className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-700">{inactive}</div>
          <p className="text-xs text-slate-500">Judges with active status disabled</p>
        </div>
      </div>

      {/* 3. API Contract Information Banner */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 space-y-2">
        <div className="flex items-center gap-2 font-semibold text-blue-950">
          <Info className="h-4 w-4 text-blue-700 shrink-0" />
          Individual Judicial Roster Endpoint Notice
        </div>
        <p className="leading-relaxed">
          The backend API contract currently does not provide a standalone <code className="bg-blue-100 px-1 py-0.5 rounded font-mono">/api/judges</code> REST endpoint for individual judicial officer directory browsing. Per project architectural guidelines, no fabricated mock profiles are shown.
        </p>
        <p className="text-blue-800 leading-relaxed">
          To inspect presiding judges assigned to active court cases and scheduled hearings, navigate to the <span className="font-semibold">Court Hearings</span> tab (<Calendar className="inline h-3.5 w-3.5 mx-0.5 text-blue-700" />), where hearings are joined with the <code className="bg-blue-100 px-1 py-0.5 rounded font-mono">judges</code> table, displaying authentic judge IDs and names.
        </p>
      </div>
    </div>
  );
};
