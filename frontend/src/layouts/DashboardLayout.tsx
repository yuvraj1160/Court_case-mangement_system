/**
 * Court Case Management System - Shared Dashboard Layout
 *
 * Professional judicial enterprise layout featuring:
 * - Responsive collapsible desktop sidebar
 * - Mobile slide-over navigation drawer with backdrop
 * - Top administrative header with judicial branding and user session details
 * - Role-scoped navigation links with safe tab validation
 * - Tab/view navigation preserving existing URL search parameters
 * - AuthContext logout integration
 */

import React, { useState } from 'react';
import { Outlet, useSearchParams, useNavigate } from 'react-router-dom';
import {
  Scale,
  LogOut,
  Menu,
  X,
  ShieldCheck,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '../context';
import {
  getNavItemsForRole,
  getPortalTitleForRole,
  resolveActiveTab,
  buildPreservedTabSearchParams,
} from './dashboardNavigation';

const CURRENT_YEAR = 2026;

interface DashboardLayoutProps {
  children?: React.ReactNode;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  const { user, logout } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const role = user?.role;
  const activeTab = resolveActiveTab(role, searchParams.get('tab'));
  const navItems = getNavItemsForRole(role);
  const portalInfo = getPortalTitleForRole(role);

  const handleTabClick = (tabKey: string) => {
    if (!role) return;
    setSearchParams((prev) => buildPreservedTabSearchParams(prev, tabKey));
    setMobileMenuOpen(false);
  };

  const handleLogout = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await logout();
      navigate('/login', { replace: true });
    } catch (err) {
      console.error('Logout failed:', err);
      setIsSigningOut(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 flex flex-col font-sans">
      {/* Top Judicial Banner / Header */}
      <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-40 shadow-sm">
        <div className="px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {/* Mobile menu button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>

            {/* Judicial Emblem & Application Title */}
            <div className="flex items-center space-x-3">
              <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center text-slate-950 shadow-md">
                <Scale className="h-5 w-5 font-bold" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm sm:text-base tracking-tight text-white">
                    Court Case Management
                  </span>
                  <span className="hidden sm:inline-block text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded bg-amber-400/20 text-amber-300 border border-amber-400/30">
                    Official Judicial System
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 hidden sm:block">
                  {portalInfo.title} &bull; {portalInfo.subtitle}
                </p>
              </div>
            </div>
          </div>

          {/* User Session & Actions */}
          <div className="flex items-center space-x-3 sm:space-x-4">
            <div className="hidden md:flex flex-col text-right">
              <span className="text-xs font-semibold text-white leading-tight">
                {user?.username}
              </span>
              <span className="text-[11px] text-amber-400/90 capitalize leading-tight">
                {role === 'judge' && user?.judge_id ? 'Presiding Judge' : role}
              </span>
            </div>

            <div className="h-8 w-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-xs text-amber-400">
              {user?.username?.charAt(0).toUpperCase() || 'U'}
            </div>

            <button
              type="button"
              onClick={() => void handleLogout()}
              disabled={isSigningOut}
              className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium text-slate-200 bg-slate-800 hover:bg-rose-900/60 hover:text-white border border-slate-700 hover:border-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
              title="Sign out of court session"
            >
              <LogOut className="h-3.5 w-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">
                {isSigningOut ? 'Signing Out...' : 'Sign Out'}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace Body with Sidebar & Content */}
      <div className="flex-1 flex w-full relative">
        {/* Mobile Navigation Drawer Backdrop */}
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-xs lg:hidden"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Sidebar Navigation */}
        <aside
          className={`
            fixed lg:sticky top-16 z-40 h-[calc(100vh-4rem)] w-64 bg-slate-900 border-r border-slate-800 text-slate-300 flex flex-col justify-between transition-transform duration-200 ease-in-out shrink-0
            ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          `}
          aria-label="Sidebar Navigation"
        >
          {/* Navigation Links */}
          <div className="p-4 space-y-1 overflow-y-auto">
            <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {role?.toUpperCase()} NAVIGATION
            </div>

            <nav className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isSelected = activeTab === item.tabKey;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleTabClick(item.tabKey)}
                    className={`
                      w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-colors text-left cursor-pointer
                      ${
                        isSelected
                          ? 'bg-amber-500/15 text-amber-300 border-l-3 border-amber-400 shadow-xs'
                          : 'text-slate-300 hover:bg-slate-800 hover:text-white border-l-3 border-transparent'
                      }
                    `}
                  >
                    <div className="flex items-center space-x-3 truncate">
                      <Icon
                        className={`h-4 w-4 shrink-0 ${isSelected ? 'text-amber-400' : 'text-slate-400'}`}
                      />
                      <span className="truncate">{item.label}</span>
                    </div>
                    {item.badge !== undefined ? (
                      <span className="ml-2 px-1.5 py-0.5 text-[10px] rounded-full bg-slate-800 text-slate-300 font-mono">
                        {item.badge}
                      </span>
                    ) : (
                      isSelected && <ChevronRight className="h-3.5 w-3.5 text-amber-400" />
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Sidebar Footer / Official Use Notice */}
          <div className="p-4 border-t border-slate-800 text-[11px] text-slate-400 space-y-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              <span className="truncate font-medium text-slate-300">
                Authorized Court Access
              </span>
            </div>
            <p className="text-[10px] text-slate-400 leading-tight">
              Authorized court personnel access only. System activity and case modifications are logged.
            </p>
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          {children ?? <Outlet />}
        </main>
      </div>

      {/* System Footer */}
      <footer className="bg-white border-t border-slate-200 py-3 px-4 sm:px-6 lg:px-8 text-center sm:flex sm:items-center sm:justify-between text-xs text-slate-500">
        <p>
          Court Case Management System &copy; {CURRENT_YEAR} &bull; Judicial Public Records &amp; Administration
        </p>
        <p className="mt-1 sm:mt-0 text-[11px]">
          Phase 6 Role-Based Interface &bull; Official Court System
        </p>
      </footer>
    </div>
  );
};
