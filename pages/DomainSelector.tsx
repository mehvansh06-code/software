import React from 'react';
import { AppDomain, UserRole } from '../types';
import { Package, Ship, TrendingUp, LogOut, ArrowRight, Grid, ShieldCheck } from 'lucide-react';

interface DomainSelectorProps {
  onSelect: (domain: AppDomain) => void;
  userName: string;
  role: UserRole;
  onLogout: () => void;
}

const DomainSelector: React.FC<DomainSelectorProps> = ({ onSelect, userName, role, onLogout }) => {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 relative overflow-hidden">
      {/* Dynamic Background Elements */}
      <div className="absolute top-0 left-0 w-full h-full opacity-20 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-200 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-amber-200 rounded-full blur-[120px]" />
      </div>

      <div className="max-w-4xl w-full relative z-10">
        <header className="text-center mb-12">
          <div className="inline-flex items-center gap-3 mb-4 bg-white px-4 py-2 rounded-2xl shadow-sm border border-slate-100">
            <Grid className="text-indigo-600" size={20} />
            <span className="text-sm font-black text-slate-800 uppercase tracking-widest">Management Hub Selection</span>
          </div>
          <h1 className="text-4xl font-black text-slate-900 mb-2">Welcome back, {userName.split(' ')[0]}</h1>
          <div className="flex items-center justify-center gap-2 text-slate-500 font-medium">
             <ShieldCheck size={16} className="text-emerald-500" />
             <span>Logged in as <span className="text-slate-900 font-black">{role}</span></span>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Import Card */}
          <button 
            onClick={() => onSelect(AppDomain.IMPORT)}
            className="group relative bg-white p-10 rounded-[2.5rem] shadow-xl shadow-indigo-100 border border-indigo-50 text-left transition-all hover:-translate-y-2 hover:shadow-2xl hover:border-indigo-200"
          >
            <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-8 group-hover:scale-110 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-500">
              <Ship size={32} />
            </div>
            <h2 className="text-2xl font-black text-slate-900 mb-4 tracking-tight">Import Operations</h2>
            <p className="text-slate-500 font-medium leading-relaxed mb-8">
              Manage global supply chain, supplier audits, shipment logistics, and customs documentation for Gujarat Flotex.
            </p>
            <div className="flex items-center gap-2 text-indigo-600 font-black text-sm uppercase tracking-widest">
              Enter Dashboard <ArrowRight size={18} className="group-hover:translate-x-2 transition-transform" />
            </div>
            <div className="absolute top-6 right-6 opacity-5 group-hover:opacity-10 transition-opacity">
              <Package size={80} />
            </div>
          </button>

          {/* Export Card */}
          <button 
            onClick={() => onSelect(AppDomain.EXPORT)}
            className="group relative bg-white p-10 rounded-[2.5rem] shadow-xl shadow-amber-100 border border-amber-50 text-left transition-all hover:-translate-y-2 hover:shadow-2xl hover:border-amber-200"
          >
            <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mb-8 group-hover:scale-110 group-hover:bg-amber-600 group-hover:text-white transition-all duration-500">
              <TrendingUp size={32} />
            </div>
            <h2 className="text-2xl font-black text-slate-900 mb-4 tracking-tight">Export Operations</h2>
            <p className="text-slate-500 font-medium leading-relaxed mb-8">
              Streamline buyer onboarding, export shipment tracking, bank realizations, and international compliance.
            </p>
            <div className="flex items-center gap-2 text-amber-600 font-black text-sm uppercase tracking-widest">
              Enter Dashboard <ArrowRight size={18} className="group-hover:translate-x-2 transition-transform" />
            </div>
            <div className="absolute top-6 right-6 opacity-5 group-hover:opacity-10 transition-opacity">
              <TrendingUp size={80} />
            </div>
          </button>
        </div>

        <footer className="mt-16 text-center">
          <button 
            onClick={onLogout}
            className="inline-flex items-center gap-2 text-slate-400 font-bold hover:text-red-500 transition-colors"
          >
            <LogOut size={18} /> Exit Secure Session
          </button>
        </footer>
      </div>
    </div>
  );
};

export default DomainSelector;