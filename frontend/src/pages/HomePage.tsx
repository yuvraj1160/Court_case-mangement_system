import React from 'react';
import { CheckCircle2, Shield, Layers, Route as RouteIcon, Code2, Cpu } from 'lucide-react';

export const HomePage: React.FC = () => {
  const stackItems = [
    { name: 'Vite 8', icon: Cpu, desc: 'Ultra-fast build tooling and HMR dev server' },
    { name: 'React 19', icon: Code2, desc: 'Modern component-driven declarative UI' },
    { name: 'TypeScript', icon: CheckCircle2, desc: 'Strict type safety across the application' },
    { name: 'Tailwind CSS v4', icon: Layers, desc: 'Utility-first modern styling system' },
    { name: 'React Router v7', icon: RouteIcon, desc: 'Client-side routing and protected navigations' },
    { name: 'Lucide Icons', icon: Shield, desc: 'Consistent accessible UI iconography' },
  ];

  return (
    <div className="space-y-8">
      <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm">
        <div className="inline-flex items-center space-x-2 bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-4 border border-emerald-200">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <span>Step 1 Complete</span>
        </div>
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
          Frontend Project Scaffolding
        </h1>
        <p className="mt-2 text-base text-slate-600 max-w-2xl">
          The Court Case Management System frontend application is successfully scaffolded, typed, styled, and ready for API integration.
        </p>

        <div className="mt-6 pt-6 border-t border-slate-100 flex flex-wrap gap-4 text-sm text-slate-600">
          <div className="bg-slate-50 px-3 py-1.5 rounded-md border border-slate-200">
            Proxy: <span className="font-mono text-indigo-600">/auth &rarr; http://127.0.0.1:5000</span>
          </div>
          <div className="bg-slate-50 px-3 py-1.5 rounded-md border border-slate-200">
            Proxy: <span className="font-mono text-indigo-600">/api &rarr; http://127.0.0.1:5000</span>
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Configured Technology Stack</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {stackItems.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.name}
                className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm hover:border-indigo-300 transition-colors flex items-start space-x-4"
              >
                <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-lg shrink-0">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-medium text-slate-900">{item.name}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">{item.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

