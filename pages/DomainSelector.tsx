import React from 'react';
import { AppDomain, UserRole } from '../types';
import { Package, Ship, TrendingUp, LogOut, ArrowRight, Grid, ShieldCheck, Award, FileText } from 'lucide-react';

interface DomainSelectorProps {
  onSelect: (domain: AppDomain) => void;
  userName: string;
  role: UserRole;
  onLogout: () => void;
}

const DomainSelector: React.FC<DomainSelectorProps> = ({ onSelect, userName, role, onLogout }) => {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      {/* Dynamic Background Elements */}
      <div className="absolute top-0 left-0 w-full h-full opacity-20 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-200 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-amber-200 rounded-full blur-[120px]" />
      </div>

      <div className="max-w-4xl w-full relative z-10">
        <header className="text-center mb-8 sm:mb-12">
          <div className="inline-flex items-center gap-3 mb-3 sm:mb-4 bg-white px-3 py-2 sm:px-4 rounded-2xl shadow-sm border border-slate-100">
            <Grid className="text-indigo-600 shrink-0" size={18} />
            <span className="text-xs sm:text-sm font-black text-slate-800 uppercase tracking-widest">Management Hub Selection</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-black text-slate-900 mb-2">Welcome back, {userName.split(' ')[0]}</h1>
          <div className="flex items-center justify-center gap-2 text-slate-500 font-medium">
             <ShieldCheck size={16} className="text-emerald-500" />
             <span>Logged in as <span className="text-slate-900 font-black">{role}</span></span>
          </div>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {/* Import Card */}
          <button 
            onClick={() => onSelect(AppDomain.IMPORT)}
            className="group relative bg-white p-5 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] shadow-xl shadow-indigo-100 border border-indigo-50 text-left transition-all hover:-translate-y-1 sm:hover:-translate-y-2 hover:shadow-2xl hover:border-indigo-200 min-h-[120px] active:scale-[0.99]"
          >
            <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-500">
              <Ship size={28} />
            </div>
            <h2 className="text-xl font-black text-slate-900 mb-3 tracking-tight">Import</h2>
            <p className="text-slate-500 font-medium text-sm leading-relaxed mb-6">
              Supply chain, supplier audits, shipment logistics, and customs documentation.
            </p>
            <div className="flex items-center gap-2 text-indigo-600 font-black text-xs uppercase tracking-widest">
              Enter <ArrowRight size={16} className="group-hover:translate-x-2 transition-transform" />
            </div>
            <div className="absolute top-4 right-4 opacity-5 group-hover:opacity-10 transition-opacity">
              <Package size={60} />
            </div>
          </button>

          {/* Export Card */}
          <button 
            onClick={() => onSelect(AppDomain.EXPORT)}
            className="group relative bg-white p-5 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] shadow-xl shadow-amber-100 border border-amber-50 text-left transition-all hover:-translate-y-1 sm:hover:-translate-y-2 hover:shadow-2xl hover:border-amber-200 min-h-[120px] active:scale-[0.99]"
          >
            <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-amber-600 group-hover:text-white transition-all duration-500">
              <TrendingUp size={28} />
            </div>
            <h2 className="text-xl font-black text-slate-900 mb-3 tracking-tight">Export</h2>
            <p className="text-slate-500 font-medium text-sm leading-relaxed mb-6">
              Buyer onboarding, export shipments, bank realizations, and compliance.
            </p>
            <div className="flex items-center gap-2 text-amber-600 font-black text-xs uppercase tracking-widest">
              Enter <ArrowRight size={16} className="group-hover:translate-x-2 transition-transform" />
            </div>
            <div className="absolute top-4 right-4 opacity-5 group-hover:opacity-10 transition-opacity">
              <TrendingUp size={60} />
            </div>
          </button>

          {/* Licence Card */}
          <button 
            onClick={() => onSelect(AppDomain.LICENCE)}
            className="group relative bg-white p-5 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] shadow-xl shadow-emerald-100 border border-emerald-50 text-left transition-all hover:-translate-y-1 sm:hover:-translate-y-2 hover:shadow-2xl hover:border-emerald-200 min-h-[120px] active:scale-[0.99]"
          >
            <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-emerald-600 group-hover:text-white transition-all duration-500">
              <Award size={28} />
            </div>
            <h2 className="text-xl font-black text-slate-900 mb-3 tracking-tight">Licence</h2>
            <p className="text-slate-500 font-medium text-sm leading-relaxed mb-6">
              Advance & EPCG licences, export obligations, and import utilization.
            </p>
            <div className="flex items-center gap-2 text-emerald-600 font-black text-xs uppercase tracking-widest">
              Enter <ArrowRight size={16} className="group-hover:translate-x-2 transition-transform" />
            </div>
            <div className="absolute top-4 right-4 opacity-5 group-hover:opacity-10 transition-opacity">
              <Award size={60} />
            </div>
          </button>

          {/* Sales Indent Card */}
          <button 
            onClick={() => onSelect(AppDomain.SALES_INDENT)}
            className="group relative bg-white p-5 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] shadow-xl shadow-rose-100 border border-rose-50 text-left transition-all hover:-translate-y-1 sm:hover:-translate-y-2 hover:shadow-2xl hover:border-rose-200 min-h-[120px] active:scale-[0.99]"
          >
            <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-rose-600 group-hover:text-white transition-all duration-500">
              <FileText size={28} />
            </div>
            <h2 className="text-xl font-black text-slate-900 mb-3 tracking-tight">Sales Indent</h2>
            <p className="text-slate-500 font-medium text-sm leading-relaxed mb-6">
              Proforma indents, domestic & export buyers, and document generation.
            </p>
            <div className="flex items-center gap-2 text-rose-600 font-black text-xs uppercase tracking-widest">
              Enter <ArrowRight size={16} className="group-hover:translate-x-2 transition-transform" />
            </div>
            <div className="absolute top-4 right-4 opacity-5 group-hover:opacity-10 transition-opacity">
              <FileText size={60} />
            </div>
          </button>
        </div>

        <footer className="mt-10 sm:mt-16 text-center">
          <button 
            onClick={onLogout}
            className="inline-flex items-center gap-2 text-slate-400 font-bold hover:text-red-500 transition-colors min-h-[44px] items-center justify-center px-4"
          >
            <LogOut size={18} /> Exit Secure Session
          </button>
        </footer>
      </div>
    </div>
  );
};

export default DomainSelector;