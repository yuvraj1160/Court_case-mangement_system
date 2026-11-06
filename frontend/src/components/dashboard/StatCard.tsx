import React from 'react';

export type StatCardAccent = 'indigo' | 'emerald' | 'amber' | 'sky' | 'purple' | 'slate';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: StatCardAccent;
  badge?: string;
}

const ACCENT_STYLES: Record<
  StatCardAccent,
  {
    iconBg: string;
    iconText: string;
    border: string;
    badgeBg: string;
    badgeText: string;
  }
> = {
  indigo: {
    iconBg: 'bg-indigo-50',
    iconText: 'text-indigo-600',
    border: 'border-slate-200 hover:border-indigo-300',
    badgeBg: 'bg-indigo-50',
    badgeText: 'text-indigo-700',
  },
  emerald: {
    iconBg: 'bg-emerald-50',
    iconText: 'text-emerald-600',
    border: 'border-slate-200 hover:border-emerald-300',
    badgeBg: 'bg-emerald-50',
    badgeText: 'text-emerald-700',
  },
  amber: {
    iconBg: 'bg-amber-50',
    iconText: 'text-amber-600',
    border: 'border-slate-200 hover:border-amber-300',
    badgeBg: 'bg-amber-50',
    badgeText: 'text-amber-700',
  },
  sky: {
    iconBg: 'bg-sky-50',
    iconText: 'text-sky-600',
    border: 'border-slate-200 hover:border-sky-300',
    badgeBg: 'bg-sky-50',
    badgeText: 'text-sky-700',
  },
  purple: {
    iconBg: 'bg-purple-50',
    iconText: 'text-purple-600',
    border: 'border-slate-200 hover:border-purple-300',
    badgeBg: 'bg-purple-50',
    badgeText: 'text-purple-700',
  },
  slate: {
    iconBg: 'bg-slate-100',
    iconText: 'text-slate-700',
    border: 'border-slate-200 hover:border-slate-300',
    badgeBg: 'bg-slate-100',
    badgeText: 'text-slate-700',
  },
};

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon: Icon,
  accent = 'slate',
  badge,
}) => {
  const styles = ACCENT_STYLES[accent] || ACCENT_STYLES.slate;

  return (
    <div
      className={`bg-white rounded-xl border p-5 shadow-xs transition-all duration-200 hover:shadow-md ${styles.border}`}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 truncate">
          {title}
        </p>
        <div className={`p-2.5 rounded-lg ${styles.iconBg} ${styles.iconText}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-2">
        <p className="text-2xl font-bold tracking-tight text-slate-900">{value}</p>
        {badge && (
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${styles.badgeBg} ${styles.badgeText}`}
          >
            {badge}
          </span>
        )}
      </div>

      {subtitle && (
        <p className="mt-1.5 text-xs text-slate-500 truncate">{subtitle}</p>
      )}
    </div>
  );
};

