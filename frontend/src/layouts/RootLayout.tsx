import React from 'react';
import { Outlet, Link } from 'react-router-dom';
import { Scale, LogOut, LogIn, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context';

const CURRENT_YEAR = 2026;

export const RootLayout: React.FC = () => {
  const { user, loading, logout } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      <header className="bg-white border-b border-slate-200 shadow-xs sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center space-x-3 text-slate-900 hover:text-indigo-600 transition-colors"
          >
            <div className="bg-indigo-600 p-2 rounded-xl text-white shadow-xs">
              <Scale className="h-5 w-5" />
            </div>
            <div>
              <span className="font-bold text-base sm:text-lg tracking-tight">
                Court Case Management
              </span>
              <span className="hidden md:inline-block ml-2 text-xs font-medium bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full border border-indigo-200">
                Phase 6 Frontend
              </span>
            </div>
          </Link>

          <div className="flex items-center space-x-4">
            {!loading && user ? (
              <div className="flex items-center space-x-3">
                <div className="hidden sm:flex flex-col text-right">
                  <span className="text-xs font-semibold text-slate-900 leading-tight">
                    {user.username}
                  </span>
                  <span className="text-[11px] text-slate-500 capitalize leading-tight">
                    {user.role}
                  </span>
                </div>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200 uppercase tracking-wider text-[10px]">
                  {user.role}
                </span>
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  className="inline-flex items-center px-3 py-1.5 border border-slate-200 text-xs font-medium rounded-lg text-slate-700 bg-white hover:bg-slate-50 hover:text-rose-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-rose-500 transition-colors shadow-xs cursor-pointer"
                  title="Sign out"
                >
                  <LogOut className="h-3.5 w-3.5 sm:mr-1.5" />
                  <span className="hidden sm:inline">Sign Out</span>
                </button>
              </div>
            ) : !loading ? (
              <Link
                to="/login"
                className="inline-flex items-center px-3 py-1.5 border border-indigo-600 text-xs font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-xs"
              >
                <LogIn className="h-3.5 w-3.5 mr-1.5" />
                <span>Sign In</span>
              </Link>
            ) : (
              <div className="flex items-center space-x-2 text-xs text-slate-400">
                <ShieldCheck className="h-4 w-4 text-slate-400 animate-pulse" />
                <span>Connecting...</span>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>

      <footer className="bg-white border-t border-slate-200 py-4 text-center text-xs text-slate-500">
        Court Case Management System &copy; {CURRENT_YEAR} &bull; Phase 6 Frontend Integration
      </footer>
    </div>
  );
};
