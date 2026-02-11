import React, { useMemo } from 'react';
import { Shipment, Buyer, ShipmentStatus, Licence, LicenceType, LetterOfCredit, LCStatus, User, UserRole } from '../types';
import { 
  TrendingUp, 
  ArrowRight,
  Ship,
  Award,
  Package,
  ShieldAlert,
  AlertCircle,
  CreditCard
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatINR, formatCurrency, getCompanyName } from '../constants';

interface ExportDashboardProps {
  shipments?: Shipment[];
  buyers?: Buyer[];
  licences?: Licence[];
  user?: User;
}

const ExportDashboard: React.FC<ExportDashboardProps> = ({ 
  shipments = [], 
  buyers = [], 
  licences = [],
  user
}) => {
  try {
    const safeShipments = Array.isArray(shipments) ? shipments : [];
    const safeBuyers = Array.isArray(buyers) ? buyers : [];
    const safeLicences = Array.isArray(licences) ? licences : [];

    const exportShipments = useMemo(() => {
      return safeShipments.filter(s => !!s.buyerId);
    }, [safeShipments]);

    const totalRevenue = useMemo(() => {
      return exportShipments.reduce((sum, s) => sum + (Number(s.invoiceValueINR) || 0), 0);
    }, [exportShipments]);

    const activeShipmentsCount = useMemo(() => {
      return exportShipments.filter(s => s.status && s.status !== ShipmentStatus.REACHED_DESTINATION && s.status !== ShipmentStatus.REACHED_PLANT).length;
    }, [exportShipments]);

    const redFlags = useMemo(() => {
      return safeLicences.filter(l => {
        if (!l.eoRequired || Number(l.eoRequired) === 0) return false;
        const progress = (Number(l.eoFulfilled || 0) / Number(l.eoRequired)) * 100;
        return progress < 25; 
      }).map(l => ({
        id: l.id,
        title: `Low Realization: ${l.number || 'Unnamed'}`,
        desc: `${Math.round((Number(l.eoFulfilled || 0) / (Number(l.eoRequired) || 1)) * 100)}% Realized.`,
      }));
    }, [safeLicences]);

    return (
      <div className="space-y-8 animate-in fade-in pb-20">
        <header>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight italic uppercase text-amber-600">Export Control</h1>
          <p className="text-slate-500 font-medium italic">Monitoring global outbound flow and license realizations.</p>
        </header>

        {redFlags.length > 0 && (
          <section className="bg-red-50 p-6 rounded-[2.5rem] border border-red-100 shadow-sm animate-in slide-in-from-top-2">
            <div className="flex items-center gap-2 mb-4">
               <ShieldAlert className="text-red-600 animate-pulse" size={20} />
               <h2 className="text-sm font-black text-red-900 uppercase tracking-widest">Urgent Alerts</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {redFlags.map((alert) => (
                <div key={alert.id} className="bg-white p-4 rounded-2xl shadow-sm border border-red-100 flex gap-4">
                   <div className="p-3 bg-red-600 text-white rounded-xl h-fit">
                      <AlertCircle size={18} />
                   </div>
                   <div>
                      <h3 className="text-[10px] font-black text-slate-900 uppercase">{alert.title}</h3>
                      <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">{alert.desc}</p>
                   </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className={`grid grid-cols-1 gap-6 ${user?.role === UserRole.EXECUTIONER ? 'md:grid-cols-3' : 'md:grid-cols-4'}`}>
          {user?.role !== UserRole.EXECUTIONER && (
          <div className="bg-white p-6 rounded-3xl border border-slate-100 flex items-center gap-4 shadow-sm">
             <div className="bg-emerald-50 text-emerald-600 p-3 rounded-2xl"><TrendingUp size={24} /></div>
             <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Turnover (INR)</p><p className="text-lg font-black">{formatINR(totalRevenue)}</p></div>
          </div>
          )}
          <div className="bg-white p-6 rounded-3xl border border-slate-100 flex items-center gap-4 shadow-sm">
             <div className="bg-amber-50 text-amber-600 p-3 rounded-2xl"><Ship size={24} /></div>
             <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Sails</p><p className="text-xl font-black">{activeShipmentsCount}</p></div>
          </div>
          <div className="bg-white p-6 rounded-3xl border border-slate-100 flex items-center gap-4 shadow-sm">
             <div className="bg-indigo-50 text-indigo-600 p-3 rounded-2xl"><Award size={24} /></div>
             <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Adv Licences</p><p className="text-xl font-black">{safeLicences.length}</p></div>
          </div>
          <div className="bg-white p-6 rounded-3xl border border-slate-100 flex items-center gap-4 shadow-sm">
             <div className="bg-blue-50 text-blue-600 p-3 rounded-2xl"><Package size={24} /></div>
             <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Global Buyers</p><p className="text-xl font-black">{safeBuyers.length}</p></div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <section className="bg-white p-8 rounded-[2.5rem] border border-slate-100 lg:col-span-2 shadow-sm">
             <div className="flex items-center justify-between mb-8">
                <h2 className="text-sm font-black text-slate-900 uppercase">Latest Exports</h2>
                <Link to="/export-shipments" className="text-amber-600 text-xs font-bold flex items-center gap-1">View All <ArrowRight size={14}/></Link>
             </div>
             <div className="overflow-x-auto">
               <table className="w-full text-left">
                 <thead>
                   <tr className="border-b border-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                     <th className="pb-4">Invoice #</th>
                     <th className="pb-4">Company</th>
                     <th className="pb-4">Buyer</th>
                     <th className="pb-4 text-right">Value (FC)</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-50">
                   {exportShipments.length > 0 ? (
                     exportShipments.slice(-5).reverse().map(sh => (
                       <tr key={sh.id} className="hover:bg-slate-50/50 transition-colors">
                         <td className="py-4 text-xs font-bold text-slate-900">#{sh.invoiceNumber || '---'}</td>
                         <td className="py-4 text-xs font-medium text-slate-600">{getCompanyName(sh.company)}</td>
                         <td className="py-4 text-xs font-medium text-slate-600">{safeBuyers.find(b => b.id === sh.buyerId)?.name || 'Buyer'}</td>
                         <td className="py-4 text-right text-xs font-black text-emerald-600">{formatCurrency(sh.amount, sh.currency)}</td>
                       </tr>
                     ))
                   ) : (
                     <tr>
                       <td colSpan={4} className="py-12 text-center text-slate-300 italic text-sm">No ledger entries yet.</td>
                     </tr>
                   )}
                 </tbody>
               </table>
             </div>
          </section>

          <section className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
             <h2 className="text-sm font-black text-slate-900 uppercase mb-8">Fulfillment Progress</h2>
             <div className="space-y-6">
                {safeLicences.filter(l => l.type === LicenceType.ADVANCE).slice(0, 4).map(l => {
                  const rawProg = (Number(l.eoFulfilled || 0) / (Number(l.eoRequired) || 1)) * 100;
                  const progress = isFinite(rawProg) ? Math.min(100, rawProg) : 0;
                  return (
                    <div key={l.id}>
                      <div className="flex justify-between text-[9px] font-black uppercase text-slate-500 mb-1">
                         <span className="truncate w-32">{l.number}</span>
                         <span>{Math.round(progress)}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                         <div 
                           className="h-full bg-amber-500 transition-all duration-700" 
                           style={{ width: `${progress}%` }} 
                         />
                      </div>
                    </div>
                  );
                })}
             </div>
          </section>
        </div>
      </div>
    );
  } catch (err) {
    console.error("Export Dashboard Exception:", err);
    return (
      <div className="p-20 text-center bg-white rounded-3xl border border-red-100">
        <ShieldAlert size={48} className="mx-auto text-red-500 mb-4" />
        <h2 className="text-xl font-black text-slate-900 uppercase">Dashboard Sync Error</h2>
        <p className="text-slate-500 mt-2">Standardization is now complete. Please refresh the browser.</p>
      </div>
    );
  }
};

export default ExportDashboard;