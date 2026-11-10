/**
 * Court Case Management System - Dashboard Navigation Domain Logic
 * Defines role-scoped navigation item configurations, portal titles, safe tab resolution,
 * query parameter preservation, and resilient formatting helpers.
 */

import {
  LayoutDashboard,
  Users,
  FolderOpen,
  Gavel,
  UserCheck,
  Calendar,
  ScrollText,
  FileText,
  CalendarCheck,
  Briefcase,
  BookOpen,
  CalendarClock,
} from 'lucide-react';
import type { UserRole, RecentFiling } from '../types';

export interface NavItemConfig {
  id: string;
  label: string;
  tabKey: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string | number;
}

// ---------------------------------------------------------------------------
// Role-Scoped Tab Keys
// ---------------------------------------------------------------------------

export const ADMIN_TAB_KEYS = [
  'overview',
  'users',
  'cases',
  'judges',
  'parties',
  'hearings',
  'audit-logs',
] as const;

export const CLERK_TAB_KEYS = [
  'overview',
  'cases',
  'parties',
  'hearings',
  'filings',
  'adjournments',
] as const;

export const JUDGE_TAB_KEYS = [
  'overview',
  'hearings',
  'cases',
  'details',
] as const;

export type AdminTab = typeof ADMIN_TAB_KEYS[number];
export type ClerkTab = typeof CLERK_TAB_KEYS[number];
export type JudgeTab = typeof JUDGE_TAB_KEYS[number];

// ---------------------------------------------------------------------------
// Navigation Configurations
// ---------------------------------------------------------------------------

export const ADMIN_NAV_ITEMS: NavItemConfig[] = [
  { id: 'overview', label: 'Overview & Metrics', tabKey: 'overview', icon: LayoutDashboard },
  { id: 'users', label: 'User Directory', tabKey: 'users', icon: Users },
  { id: 'cases', label: 'Case Management', tabKey: 'cases', icon: FolderOpen },
  { id: 'judges', label: 'Judicial Roster', tabKey: 'judges', icon: Gavel },
  { id: 'parties', label: 'Litigants & Parties', tabKey: 'parties', icon: UserCheck },
  { id: 'hearings', label: 'Court Hearings', tabKey: 'hearings', icon: Calendar },
  { id: 'audit-logs', label: 'Audit Trail', tabKey: 'audit-logs', icon: ScrollText },
];

export const CLERK_NAV_ITEMS: NavItemConfig[] = [
  { id: 'overview', label: 'Operations Overview', tabKey: 'overview', icon: LayoutDashboard },
  { id: 'cases', label: 'Case Docket', tabKey: 'cases', icon: FolderOpen },
  { id: 'parties', label: 'Parties & Litigants', tabKey: 'parties', icon: Users },
  { id: 'hearings', label: 'Hearing Calendar', tabKey: 'hearings', icon: Calendar },
  { id: 'filings', label: 'Document Filings', tabKey: 'filings', icon: FileText },
  { id: 'adjournments', label: 'Hearing Adjournments', tabKey: 'adjournments', icon: CalendarClock },
];

export const JUDGE_NAV_ITEMS: NavItemConfig[] = [
  { id: 'overview', label: 'Judicial Overview', tabKey: 'overview', icon: LayoutDashboard },
  { id: 'hearings', label: 'My Hearing Docket', tabKey: 'hearings', icon: CalendarCheck },
  { id: 'cases', label: 'Assigned Cases', tabKey: 'cases', icon: Briefcase },
  { id: 'details', label: 'Case File & Bench Notes', tabKey: 'details', icon: BookOpen },
];

export function getNavItemsForRole(role: UserRole | string | undefined): NavItemConfig[] {
  switch (role) {
    case 'admin':
      return ADMIN_NAV_ITEMS;
    case 'clerk':
      return CLERK_NAV_ITEMS;
    case 'judge':
      return JUDGE_NAV_ITEMS;
    default:
      return [];
  }
}

export function getPortalTitleForRole(role: UserRole | string | undefined): { title: string; subtitle: string } {
  switch (role) {
    case 'admin':
      return { title: 'Executive Judicial Admin', subtitle: 'System Oversight & Governance' };
    case 'clerk':
      return { title: 'Office of the Court Clerk', subtitle: 'Docket Intake & Registry' };
    case 'judge':
      return { title: 'Judicial Chambers', subtitle: 'Presiding Docket & Case Review' };
    default:
      return { title: 'Court Information System', subtitle: 'Judicial Portal' };
  }
}

// ---------------------------------------------------------------------------
// Tab Validation & Query Parameter Preservation Helpers
// ---------------------------------------------------------------------------

export function isValidTabForRole(role: UserRole | string | undefined, tab: string | null | undefined): boolean {
  if (!tab || !role) return false;
  switch (role) {
    case 'admin':
      return (ADMIN_TAB_KEYS as readonly string[]).includes(tab);
    case 'clerk':
      return (CLERK_TAB_KEYS as readonly string[]).includes(tab);
    case 'judge':
      return (JUDGE_TAB_KEYS as readonly string[]).includes(tab);
    default:
      return false;
  }
}

export function resolveActiveTab(role: UserRole | string | undefined, tabFromUrl: string | null | undefined): string {
  if (isValidTabForRole(role, tabFromUrl)) {
    return tabFromUrl!;
  }
  return 'overview';
}

export function buildPreservedTabSearchParams(
  currentParams: URLSearchParams | string,
  newTab: string
): URLSearchParams {
  const next = new URLSearchParams(currentParams);
  next.set('tab', newTab);
  return next;
}

// ---------------------------------------------------------------------------
// Safe Date and Time Formatting Helpers
// ---------------------------------------------------------------------------

export function formatDateSafe(val: string | null | undefined): string {
  if (!val) return '—';
  const d = new Date(val);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

export function formatTimeSafe(val: string | null | undefined): string {
  if (!val) return '';
  const d = new Date(val);
  return isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatDateTimeSafe(val: string | null | undefined): string {
  if (!val) return '—';
  const d = new Date(val);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

/**
 * Safely format filing status for live or registry records.
 * The backend filings table does not project a status column.
 * Live filings without an explicit status property must display 'Status Unavailable'.
 */
export function getLiveFilingStatus(filing: RecentFiling | null | undefined): string {
  if (!filing) return 'Status Unavailable';
  const candidate = (filing as { status?: unknown }).status;
  if (typeof candidate === 'string' && candidate.trim().length > 0) {
    return candidate.trim();
  }
  return 'Status Unavailable';
}
