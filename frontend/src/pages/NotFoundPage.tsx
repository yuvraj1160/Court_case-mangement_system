/**
 * Court Case Management System - 404 Not Found Page
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { FileQuestion, ArrowLeft } from 'lucide-react';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="max-w-md mx-auto my-16 text-center">
      <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-xs">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 mb-6 border border-slate-200">
          <FileQuestion className="h-7 w-7" />
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-slate-900 mb-2">
          Page Not Found
        </h1>
        <p className="text-sm text-slate-500 mb-6">
          The requested route does not exist or may have moved.
        </p>

        <Link
          to="/"
          className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-xl text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-xs"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
};

