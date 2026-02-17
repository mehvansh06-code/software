import React from 'react';
import { AppDomain, UserRole } from '../types';
import { Package, Ship, TrendingUp, LogOut, ArrowRight, Grid, ShieldCheck, Award, FileText } from 'lucide-react';

const ALL_DOMAINS: { domain: AppDomain; label: string }[] = [
  { domain: AppDomain.IMPORT, label: 'Import' },
  { domain: AppDomain.EXPORT, label: 'Export' },
  { domain: AppDomain.LICENCE, label: 'Licence' },
  { domain: AppDomain.SALES_INDENT, label: 'Sales Indent' },
];

interface DomainSelectorProps {
  onSelect: (domain: AppDomain) => void;
  userName: string;
  role: UserRole;
  /** If set, only these domains are shown. If empty/undefined, all domains are shown. */
  allowedDomains?: AppDomain[] | null;
  onLogout: () => void;
}

const DomainSelector: React.FC<DomainSelectorProps> = ({ onSelect, userName = '', role, allowedDomains, onLogout }) => {
  const safeName = typeof userName === 'string' ? userName : 'User';
  const safeRole = (role ?? 'VIEWER') as UserRole;
  const domainsToShow =
    Array.isArray(allowedDomains) && allowedDomains.length > 0
      ? ALL_DOMAINS.filter((d) => allowedDomains.includes(d.domain))
      : ALL_DOMAINS;

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
          <h1 className="text-2xl sm:text-4xl font-black text-slate-900 mb-2">Welcome back, {safeName.split(' ')[0] || 'User'}</h1>
          <div className="flex items-center justify-center gap-2 text-slate-500 font-medium">
             <ShieldCheck size={16} className="text-emerald-500" />
             <span>Logged in as <span className="text-slate-900 font-black">{safeRole}</span></span>
          </div>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {domainsToShow.map(({ domain, label }) => {
            const isImport = domain === AppDomain.IMPORT;
            const isExport = domain === AppDomain.EXPORT;
            const isLicence = domain === AppDomain.LICENCE;
            const isSalesIndent = domain === AppDomain.SALES_INDENT;
            const cardClass = isImport
              ? 'bg-white shadow-indigo-100 border-indigo-50 hover:border-indigo-200 text-indigo-600'
              : isExport
              ? 'bg-white shadow-amber-100 border-amber-50 hover:border-amber-200 text-amber-600'
              : isLicence
              ? 'bg-white shadow-emerald-100 border-emerald-50 hover:border-emerald-200 text-emerald-600'
              : 'bg-white shadow-rose-100 border-rose-50 hover:border-rose-200 text-rose-600';
            const iconBg = isImport ? 'bg-indigo-50 group-hover:bg-indigo-600' : isExport ? 'bg-amber-50 group-hover:bg-amber-600' : isLicence ? 'bg-emerald-50 group-hover:bg-emerald-600' : 'bg-rose-50 group-hover:bg-rose-600';
            const Icon = isImport ? Ship : isExport ? TrendingUp : isLicence ? Award : FileText;
            const desc = isImport
              ? 'Supply chain, supplier audits, shipment logistics, and customs documentation.'
              : isExport
              ? 'Buyer onboarding, export shipments, bank realizations, and compliance.'
              : isLicence
              ? 'Advance & EPCG licences, export obligations, and import utilization.'
              : 'Proforma indents, domestic & export buyers, and document generation.';
            return (
              <button
                key={domain}
                onClick={() => onSelect(domain)}
                className={`group relative p-5 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] shadow-xl border text-left transition-all hover:-translate-y-1 sm:hover:-translate-y-2 hover:shadow-2xl min-h-[120px] active:scale-[0.99] ${cardClass}`}
              >
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 group-hover:text-white transition-all duration-500 ${iconBg}`}>
                  <Icon size={28} />
                </div>
                <h2 className="text-xl font-black text-slate-900 mb-3 tracking-tight">{label}</h2>
                <p className="text-slate-500 font-medium text-sm leading-relaxed mb-6">{desc}</p>
                <div className={`flex items-center gap-2 font-black text-xs uppercase tracking-widest ${isImport ? 'text-indigo-600' : isExport ? 'text-amber-600' : isLicence ? 'text-emerald-600' : 'text-rose-600'}`}>
                  Enter <ArrowRight size={16} className="group-hover:translate-x-2 transition-transform" />
                </div>
                <div className="absolute top-4 right-4 opacity-5 group-hover:opacity-10 transition-opacity">
                  <Icon size={60} />
                </div>
              </button>
            );
          })}
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