import React, { useMemo } from 'react';
import { Shipment, Buyer, ShipmentStatus, Licence, LicenceType, LetterOfCredit, LCStatus, User, UserRole } from '../types';
import { 
  TrendingUp, 
  ArrowRight,
  Ship,
  ShieldAlert,
  AlertCircle,
  CreditCard
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatINR, formatCurrency, formatDate, getCompanyName } from '../constants';

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

    const getExportPaymentStatus = (sh: Shipment): { status: 'pending' | 'partial' | 'received'; receivedFC: number; pendingFC: number } => {
      const toFC = (p: { amount: number; currency: string }) =>
        p.currency === sh.currency ? p.amount : (p.currency === 'INR' ? p.amount / (sh.exchangeRate || 1) : 0);
      const receivedFC = (sh.payments || []).filter(p => p.received === true).reduce((sum, p) => sum + toFC(p), 0);
      const dueFC = sh.amount || 0;
      const pendingFC = Math.max(0, dueFC - receivedFC);
      if (dueFC <= 0) return { status: receivedFC > 0 ? 'received' : 'pending', receivedFC, pendingFC: 0 };
      if (receivedFC >= dueFC) return { status: 'received', receivedFC, pendingFC: 0 };
      if (receivedFC > 0) return { status: 'partial', receivedFC, pendingFC };
      return { status: 'pending', receivedFC, pendingFC };
    };

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

        <div className={`grid grid-cols-1 gap-6 ${user?.role === UserRole.EXECUTIONER ? 'md:grid-cols-1' : 'md:grid-cols-2'}`}>
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
        </div>

        <section className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
             <div className="flex items-center justify-between mb-6">
                <h2 className="text-base font-black text-slate-900 uppercase tracking-wide">Latest Exports</h2>
                <Link to="/export-shipments" className="text-amber-600 text-sm font-semibold flex items-center gap-1.5 hover:text-amber-700 transition-colors">View all <ArrowRight size={16}/></Link>
             </div>
             <div className="overflow-x-auto rounded-2xl border border-slate-100">
               <table className="w-full text-left min-w-[640px]">
                 <thead>
                   <tr className="bg-slate-50/80 border-b border-slate-200 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                     <th className="py-4 px-5 text-left">Invoice #</th>
                     <th className="py-4 px-5 text-left">Company</th>
                     <th className="py-4 px-5 text-left">Buyer</th>
                     <th className="py-4 px-5 text-right w-28">Value (FC)</th>
                     <th className="py-4 px-5 text-left w-28">Payment Due Date</th>
                     <th className="py-4 px-5 text-right w-28">Received</th>
                     <th className="py-4 px-5 text-right w-28">Pending</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100">
                   {exportShipments.length > 0 ? (
                     exportShipments.slice(-5).reverse().map(sh => {
                       const { receivedFC, pendingFC } = getExportPaymentStatus(sh);
                       return (
                         <tr key={sh.id} className="hover:bg-slate-50/50 transition-colors">
                           <td className="py-5 px-5 text-sm font-bold text-slate-900">#{sh.invoiceNumber || '—'}</td>
                           <td className="py-5 px-5 text-sm font-medium text-slate-700">{getCompanyName(sh.company)}</td>
                           <td className="py-5 px-5 text-sm font-medium text-slate-700">{safeBuyers.find(b => b.id === sh.buyerId)?.name || 'Buyer'}</td>
                           <td className="py-5 px-5 text-right text-sm font-bold text-emerald-600 tabular-nums">{formatCurrency(sh.amount, sh.currency)}</td>
                           <td className="py-5 px-5 text-sm font-medium text-slate-600">{sh.paymentDueDate ? formatDate(sh.paymentDueDate) : '—'}</td>
                           <td className="py-5 px-5 text-right text-sm font-semibold text-emerald-700 tabular-nums">{formatCurrency(receivedFC, sh.currency)}</td>
                           <td className="py-5 px-5 text-right text-sm font-semibold text-slate-600 tabular-nums">{formatCurrency(pendingFC, sh.currency)}</td>
                         </tr>
                       );
                     })
                   ) : (
                     <tr>
                       <td colSpan={7} className="py-16 text-center text-slate-400 text-sm">No ledger entries yet.</td>
                     </tr>
                   )}
                 </tbody>
               </table>
             </div>
          </section>
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