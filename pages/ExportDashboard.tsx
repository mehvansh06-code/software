import React, { useMemo, useState, useEffect } from 'react';
import { Shipment, Buyer, ShipmentStatus, Licence, LicenceType, LetterOfCredit, LCStatus, User, UserRole } from '../types';
import { 
  TrendingUp, 
  ArrowRight,
  Ship,
  ArrowUpCircle,
  ArrowDownCircle,
  ShieldAlert,
  AlertCircle,
  CreditCard
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatINR, formatCurrency, formatDate, getCompanyName, getShipmentStatusLabel } from '../constants';
import { api } from '../api';

interface ExportDashboardProps {
  shipments?: Shipment[];
  buyers?: Buyer[];
  licences?: Licence[];
  user?: User;
}

interface CashFlowItem {
  rowType?: 'INSTALLMENT' | 'LC';
  installmentId?: string | null;
  lcId?: string | null;
  shipmentId: string;
  entityName: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  dueDate: string;
  daysUntil: number;
  status: string;
  direction: 'outgoing' | 'incoming';
  amountInr: number;
  pendingAmount?: number;
  company?: 'GFPL' | 'GTEX' | null;
}

const ExportDashboard: React.FC<ExportDashboardProps> = ({ 
  shipments = [], 
  buyers = [], 
  licences = [],
  user
}) => {
  try {
    const [cashFlowView, setCashFlowView] = useState<'outgoing' | 'incoming'>('incoming');
    const [cashFlowCompany, setCashFlowCompany] = useState<'ALL' | 'GFPL' | 'GTEX'>('ALL');
    const [upcomingPayables, setUpcomingPayables] = useState<{ items: CashFlowItem[]; summary: { count: number; totalInr: number } }>({ items: [], summary: { count: 0, totalInr: 0 } });
    const [upcomingReceivables, setUpcomingReceivables] = useState<{ items: CashFlowItem[]; summary: { count: number; totalInr: number } }>({ items: [], summary: { count: 0, totalInr: 0 } });
    const [isCashFlowLoading, setIsCashFlowLoading] = useState(false);

    const safeShipments = Array.isArray(shipments) ? shipments : [];
    const safeBuyers = Array.isArray(buyers) ? buyers : [];
    const safeLicences = Array.isArray(licences) ? licences : [];

    const exportShipments = useMemo(() => {
      return safeShipments.filter((s) => {
        if (!s.buyerId) return false;
        const toFC = (p: { amount: number; currency: string }) =>
          p.currency === s.currency ? p.amount : (p.currency === 'INR' ? p.amount / (s.exchangeRate || 1) : 0);
        const receivedFC = (s.payments || []).filter((p) => p.received === true).reduce((sum, p) => sum + toFC(p), 0);
        const dueFC = s.amount || 0;
        return receivedFC < dueFC;
      });
    }, [safeShipments]);

    useEffect(() => {
      const refreshCashFlow = async () => {
        setIsCashFlowLoading(true);
        try {
          const [outgoing, incoming] = await Promise.all([
            api.payments.outgoing(30),
            api.payments.incoming(30),
          ]);
          setUpcomingPayables({ items: Array.isArray(outgoing?.items) ? outgoing.items : [], summary: outgoing?.summary || { count: 0, totalInr: 0 } });
          setUpcomingReceivables({ items: Array.isArray(incoming?.items) ? incoming.items : [], summary: incoming?.summary || { count: 0, totalInr: 0 } });
        } catch (e) {
          console.error('Export cash flow refresh failed');
          setUpcomingPayables({ items: [], summary: { count: 0, totalInr: 0 } });
          setUpcomingReceivables({ items: [], summary: { count: 0, totalInr: 0 } });
        } finally {
          setIsCashFlowLoading(false);
        }
      };
      void refreshCashFlow();
    }, [safeShipments.length]);

    const totalRevenue = useMemo(() => {
      return exportShipments.reduce((sum, s) => sum + (Number(s.invoiceValueINR) || 0), 0);
    }, [exportShipments]);

    const activeShipmentsCount = useMemo(() => {
      return exportShipments.filter(s => s.status && s.status !== ShipmentStatus.REACHED_DESTINATION && s.status !== ShipmentStatus.REACHED_PLANT).length;
    }, [exportShipments]);

    const redFlags = useMemo(() => {
      const licenceAlerts = safeLicences.filter(l => {
        if (!l.eoRequired || Number(l.eoRequired) === 0) return false;
        const progress = (Number(l.eoFulfilled || 0) / Number(l.eoRequired)) * 100;
        return progress < 25; 
      }).map(l => ({
        id: l.id,
        title: `Low Realization: ${l.number || 'Unnamed'}`,
        desc: `${Math.round((Number(l.eoFulfilled || 0) / (Number(l.eoRequired) || 1)) * 100)}% Realized.`,
      }));

      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const lodgementAlerts = safeShipments
        .filter((s) => !!s.buyerId)
        .filter((s) => {
          const due = s.paymentDueDate ? new Date(`${s.paymentDueDate}T00:00:00`) : null;
          if (!due || Number.isNaN(due.getTime())) return false;
          const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays < 0 || diffDays > 3) return false;

          const toFC = (p: { amount: number; currency: string }) =>
            p.currency === s.currency ? p.amount : (p.currency === 'INR' ? p.amount / (s.exchangeRate || 1) : 0);
          const receivedFC = (s.payments || []).filter((p) => p.received === true).reduce((sum, p) => sum + toFC(p), 0);
          const dueFC = s.amount || 0;
          if (receivedFC >= dueFC) return false;

          const lodgementNo = ((s as any).lodgement || '').toString().trim();
          return lodgementNo.length === 0;
        })
        .map((s) => {
          const due = new Date(`${s.paymentDueDate}T00:00:00`);
          const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          const dueLabel = diffDays === 0 ? 'today' : `in ${diffDays} day${diffDays === 1 ? '' : 's'}`;
          return {
            id: `lodgement-${s.id}`,
            title: `Lodgement Pending: ${s.invoiceNumber || s.id}`,
            desc: `Payment is due ${dueLabel}. File bank lodgement for ${safeBuyers.find(b => b.id === s.buyerId)?.name || 'this buyer'}.`,
          };
        });

      return [...lodgementAlerts, ...licenceAlerts];
    }, [safeLicences, safeShipments, safeBuyers]);

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

    const shipmentCompanyById = useMemo(() => {
      const map = new Map<string, 'GFPL' | 'GTEX'>();
      safeShipments.forEach((s) => {
        if (s?.id && (s.company === 'GFPL' || s.company === 'GTEX')) map.set(String(s.id), s.company);
      });
      return map;
    }, [safeShipments]);
  const cashFlowRows = useMemo(() => {
    const rows = cashFlowView === 'outgoing' ? upcomingPayables.items : upcomingReceivables.items;
    if (cashFlowCompany === 'ALL') return rows;
    return rows.filter((r) => (shipmentCompanyById.get(String(r.shipmentId)) || r.company) === cashFlowCompany);
  }, [cashFlowView, upcomingPayables.items, upcomingReceivables.items, cashFlowCompany, shipmentCompanyById]);
    const cashFlowSummary = useMemo(() => ({
      count: cashFlowRows.length,
      totalInr: cashFlowRows.reduce((sum, r) => sum + (Number(r.amountInr) || 0), 0),
    }), [cashFlowRows]);

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
             <div className="bg-red-50 text-red-600 p-3 rounded-2xl"><ArrowUpCircle size={24} /></div>
             <div>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Upcoming Payables</p>
               <p className="text-lg font-black">{formatCurrency(upcomingPayables.summary.totalInr || 0, 'INR')}</p>
               <p className="text-[10px] text-slate-500">{upcomingPayables.summary.count} due in 30 days</p>
             </div>
          </div>
          <div className="bg-white p-6 rounded-3xl border border-slate-100 flex items-center gap-4 shadow-sm">
             <div className="bg-emerald-50 text-emerald-600 p-3 rounded-2xl"><ArrowDownCircle size={24} /></div>
             <div>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Upcoming Receivables</p>
               <p className="text-lg font-black">{formatCurrency(upcomingReceivables.summary.totalInr || 0, 'INR')}</p>
               <p className="text-[10px] text-slate-500">{upcomingReceivables.summary.count} due in 30 days</p>
             </div>
          </div>
        </div>

        <section className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
             <div className="flex items-center justify-between mb-6">
                <h2 className="text-base font-black text-slate-900 uppercase tracking-wide">Latest Exports</h2>
                <Link to="/export-shipments" className="text-amber-600 text-sm font-semibold flex items-center gap-1.5 hover:text-amber-700 transition-colors">View all <ArrowRight size={16}/></Link>
             </div>
             <div className="md:hidden space-y-3">
               {exportShipments.length > 0 ? (
                 exportShipments.slice(-5).reverse().map(sh => {
                   const { receivedFC, pendingFC } = getExportPaymentStatus(sh);
                   return (
                     <article key={sh.id} className="rounded-2xl border border-slate-200 bg-white p-3 space-y-2">
                       <div className="flex items-start justify-between gap-3">
                         <p className="text-xs font-black text-slate-900 truncate">#{sh.invoiceNumber || '—'}</p>
                         <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wide bg-slate-100 text-slate-700">
                           {getShipmentStatusLabel(sh.status)}
                         </span>
                       </div>
                       <p className="text-[11px] text-slate-600 truncate">{safeBuyers.find(b => b.id === sh.buyerId)?.name || 'Buyer'}</p>
                       <div className="grid grid-cols-2 gap-2">
                         <div className="rounded-xl bg-slate-50 border border-slate-100 p-2">
                           <p className="text-[9px] font-black uppercase text-slate-400">Value</p>
                           <p className="text-[11px] font-black text-emerald-700">{formatCurrency(sh.amount, sh.currency)}</p>
                         </div>
                         <div className="rounded-xl bg-slate-50 border border-slate-100 p-2">
                           <p className="text-[9px] font-black uppercase text-slate-400">Due</p>
                           <p className="text-[11px] font-bold text-slate-700">{sh.paymentDueDate ? formatDate(sh.paymentDueDate) : '—'}</p>
                         </div>
                         <div className="rounded-xl bg-slate-50 border border-slate-100 p-2">
                           <p className="text-[9px] font-black uppercase text-slate-400">Received</p>
                           <p className="text-[11px] font-bold text-emerald-700">{formatCurrency(receivedFC, sh.currency)}</p>
                         </div>
                         <div className="rounded-xl bg-slate-50 border border-slate-100 p-2">
                           <p className="text-[9px] font-black uppercase text-slate-400">Pending</p>
                           <p className="text-[11px] font-bold text-slate-700">{formatCurrency(pendingFC, sh.currency)}</p>
                         </div>
                       </div>
                     </article>
                   );
                 })
               ) : (
                 <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center text-xs font-semibold text-slate-500">No ledger entries yet.</div>
               )}
             </div>
             <div className="hidden md:block overflow-x-auto rounded-2xl border border-slate-100">
               <table className="w-full text-left min-w-[760px]">
                 <thead>
                   <tr className="bg-slate-50/80 border-b border-slate-200 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                     <th className="py-4 px-5 text-left">Invoice #</th>
                      <th className="py-4 px-5 text-left">Company</th>
                      <th className="py-4 px-5 text-left">Buyer</th>
                      <th className="py-4 px-5 text-left w-32">Lifecycle</th>
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
                            <td className="py-5 px-5 text-sm">
                              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wide bg-slate-100 text-slate-700">
                                {getShipmentStatusLabel(sh.status)}
                              </span>
                            </td>
                            <td className="py-5 px-5 text-right text-sm font-bold text-emerald-600 tabular-nums">{formatCurrency(sh.amount, sh.currency)}</td>
                           <td className="py-5 px-5 text-sm font-medium text-slate-600">{sh.paymentDueDate ? formatDate(sh.paymentDueDate) : '—'}</td>
                           <td className="py-5 px-5 text-right text-sm font-semibold text-emerald-700 tabular-nums">{formatCurrency(receivedFC, sh.currency)}</td>
                           <td className="py-5 px-5 text-right text-sm font-semibold text-slate-600 tabular-nums">{formatCurrency(pendingFC, sh.currency)}</td>
                         </tr>
                       );
                     })
                   ) : (
                     <tr>
                        <td colSpan={8} className="py-16 text-center text-slate-400 text-sm">No ledger entries yet.</td>
                     </tr>
                   )}
                 </tbody>
               </table>
             </div>
          </section>

        <section className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
            <h2 className="text-base font-black text-slate-900 uppercase tracking-wide">30-Day Cash Flow</h2>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                <button
                  type="button"
                  onClick={() => setCashFlowView('outgoing')}
                  className={`px-3 py-2 text-[10px] font-black uppercase rounded-lg ${cashFlowView === 'outgoing' ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-500'}`}
                >
                  Supplier Payments
                </button>
                <button
                  type="button"
                  onClick={() => setCashFlowView('incoming')}
                  className={`px-3 py-2 text-[10px] font-black uppercase rounded-lg ${cashFlowView === 'incoming' ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-500'}`}
                >
                  Customer Receipts
                </button>
              </div>
              <select
                value={cashFlowCompany}
                onChange={(e) => setCashFlowCompany(e.target.value as 'ALL' | 'GFPL' | 'GTEX')}
                className="px-3 py-2 text-[10px] font-black uppercase rounded-xl border border-slate-200 bg-white text-slate-700"
                title="Filter cash flow by company"
              >
                <option value="ALL">All Companies</option>
                <option value="GFPL">GFPL</option>
                <option value="GTEX">GTEX</option>
              </select>
            </div>
          </div>
          <div className="mb-4 text-[10px] font-black uppercase tracking-widest text-slate-500">
            {cashFlowCompany === 'ALL' ? 'Showing: GFPL + GTEX' : `Showing: ${cashFlowCompany}`} • {cashFlowSummary.count} record(s) • {formatCurrency(cashFlowSummary.totalInr, 'INR')}
          </div>

          <div className="md:hidden space-y-3">
            {cashFlowRows.map((row, idx) => (
              <article key={`${cashFlowView}-${row.shipmentId}-${row.installmentId || row.dueDate || idx}`} className="rounded-2xl border border-slate-200 bg-white p-3 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs font-black text-slate-900 truncate">{row.entityName}</p>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${
                    row.daysUntil <= 3 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'
                  }`}>
                    {row.status}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600">Invoice #{row.invoiceNumber}</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-slate-50 border border-slate-100 p-2">
                    <p className="text-[9px] font-black uppercase text-slate-400">Amount</p>
                    <p className="text-[11px] font-black text-emerald-700">{formatCurrency((row.pendingAmount ?? row.amount), row.currency)}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 border border-slate-100 p-2">
                    <p className="text-[9px] font-black uppercase text-slate-400">Due Date</p>
                    <p className="text-[11px] font-bold text-slate-700">{formatDate(row.dueDate)}</p>
                  </div>
                </div>
              </article>
            ))}
            {!isCashFlowLoading && cashFlowRows.length === 0 && (
              <p className="py-6 text-center text-slate-400 text-xs italic">No installment-based records due in next 30 days.</p>
            )}
            {isCashFlowLoading && (
              <p className="py-6 text-center text-slate-400 text-xs italic">Loading cash flow...</p>
            )}
          </div>

          <div className="hidden md:block overflow-x-auto rounded-2xl border border-slate-100">
            <table className="w-full text-left min-w-[760px]">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  <th className="py-4 px-5 text-left">{cashFlowView === 'outgoing' ? 'Supplier' : 'Customer'}</th>
                  <th className="py-4 px-5 text-left">Invoice #</th>
                  <th className="py-4 px-5 text-left">Pending Amount</th>
                  <th className="py-4 px-5 text-left">Due Date</th>
                  <th className="py-4 px-5 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cashFlowRows.map((row, idx) => (
                  <tr key={`${cashFlowView}-${row.shipmentId}-${row.installmentId || row.dueDate || idx}`} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-5 px-5 text-sm font-medium text-slate-700">{row.entityName}</td>
                    <td className="py-5 px-5 text-sm font-medium text-slate-700">#{row.invoiceNumber}</td>
                    <td className="py-5 px-5 text-sm font-bold text-emerald-700 tabular-nums">{formatCurrency((row.pendingAmount ?? row.amount), row.currency)}</td>
                    <td className="py-5 px-5 text-sm font-medium text-slate-600">{formatDate(row.dueDate)}</td>
                    <td className="py-5 px-5 text-sm">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${
                        row.daysUntil <= 3 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {!isCashFlowLoading && cashFlowRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-16 text-center text-slate-400 text-sm">No installment-based records due in next 30 days.</td>
                  </tr>
                )}
                {isCashFlowLoading && (
                  <tr>
                    <td colSpan={5} className="py-16 text-center text-slate-400 text-sm">Loading cash flow...</td>
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
