import React from 'react';
import { Outlet, Link } from 'react-router-dom';
import { Scale, ShieldCheck } from 'lucide-react';

const CURRENT_YEAR = 2026;

export const RootLayout: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center space-x-3 text-slate-900 hover:text-indigo-600 transition-colors">
            <div className="bg-indigo-600 p-2 rounded-lg text-white">
              <Scale className="h-6 w-6" />
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight">Court Case Management System</span>
              <span className="hidden sm:inline-block ml-2 text-xs font-medium bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full border border-indigo-200">
                Phase 6 Scaffolding
              </span>
            </div>
          </Link>
          <div className="flex items-center space-x-2 text-sm text-slate-500">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <span className="font-medium">System Online</span>
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
