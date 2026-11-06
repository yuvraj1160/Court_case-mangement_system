import React from 'react';
import type { CaseStatus } from '../../types';

interface StatusBadgeProps {
  status: CaseStatus | string | null | undefined;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  const normalized = status ? status.trim() : 'Unknown';

  let colorClasses = 'bg-slate-100 text-slate-700 border-slate-200';
  let dotClasses = 'bg-slate-400';

  switch (normalized.toLowerCase()) {
    case 'active':
      colorClasses = 'bg-emerald-50 text-emerald-700 border-emerald-200';
      dotClasses = 'bg-emerald-500';
      break;
    case 'filed':
      colorClasses = 'bg-sky-50 text-sky-700 border-sky-200';
      dotClasses = 'bg-sky-500';
      break;
    case 'adjourned':
      colorClasses = 'bg-amber-50 text-amber-700 border-amber-200';
      dotClasses = 'bg-amber-500';
      break;
    case 'disposed':
      colorClasses = 'bg-purple-50 text-purple-700 border-purple-200';
      dotClasses = 'bg-purple-500';
      break;
    case 'closed':
      colorClasses = 'bg-slate-100 text-slate-600 border-slate-300';
      dotClasses = 'bg-slate-400';
      break;
    default:
      colorClasses = 'bg-slate-100 text-slate-700 border-slate-200';
      dotClasses = 'bg-slate-400';
  }

  const sizeClasses =
    size === 'sm'
      ? 'px-2 py-0.5 text-[11px]'
      : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium border ${colorClasses} ${sizeClasses}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dotClasses}`} aria-hidden="true" />
      <span>{normalized}</span>
    </span>
  );
};

