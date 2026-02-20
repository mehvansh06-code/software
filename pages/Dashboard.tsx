
import React, { useMemo, useState, useEffect } from 'react';
import { Shipment, Supplier, ShipmentStatus, Licence, LetterOfCredit, LCStatus } from '../types';
import { 
  ArrowRight,
  Award,
  CreditCard,
  Package,
  ArrowUpCircle,
  ArrowDownCircle,
  CheckCircle,
  Database,
  RefreshCw,
  Wifi,
  WifiOff,
  HardDrive,
  ShieldAlert,
  BellRing,
  Calendar
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatCurrency, formatDate, getShipmentStatusLabel } from '../constants';
import { api } from '../api';

interface DashboardProps {
  shipments: Shipment[];
  suppliers: Supplier[];
  licences: Licence[];
  lcs: LetterOfCredit[];
}

interface CashFlowItem {
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
}

const Dashboard: React.FC<DashboardProps> = ({ shipments, suppliers, licences, lcs }) => {
  const [sysStats, setSysStats] = useState<any>({ lastSync: 'Never', mode: 'INITIALIZING', isDirty: false });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [cashFlowView, setCashFlowView] = useState<'outgoing' | 'incoming'>('outgoing');
  const [upcomingPayables, setUpcomingPayables] = useState<{ items: CashFlowItem[]; summary: { count: number; totalInr: number } }>({ items: [], summary: { count: 0, totalInr: 0 } });
  const [upcomingReceivables, setUpcomingReceivables] = useState<{ items: CashFlowItem[]; summary: { count: number; totalInr: number } }>({ items: [], summary: { count: 0, totalInr: 0 } });
  const [isCashFlowLoading, setIsCashFlowLoading] = useState(false);

  useEffect(() => {
    refreshStats();
    refreshCashFlow();
  }, [shipments, suppliers]);

  const refreshStats = async () => {
    setIsRefreshing(true);
    try {
      const stats = await api.system.getStats();
      setSysStats(stats);
    } catch (e) {
      console.error("Stats refresh failed");
    } finally {
      setIsRefreshing(false);
    }
  };

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
      console.error('Cash flow refresh failed');
      setUpcomingPayables({ items: [], summary: { count: 0, totalInr: 0 } });
      setUpcomingReceivables({ items: [], summary: { count: 0, totalInr: 0 } });
    } finally {
      setIsCashFlowLoading(false);
    }
  };

  // Critical action items: only LC payment to be made in the following week (import LCs with maturity in next 7 days)
  const redFlags = useMemo(() => {
    const alerts: { title: string; desc: string; type: 'LC'; severity: 'HIGH' }[] = [];
    const now = new Date();
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() + 7);
    lcs
      .filter(l => l.status === LCStatus.OPEN && l.supplierId)
      .forEach(l => {
        const maturity = new Date(l.maturityDate);
        if (maturity >= now && maturity <= weekEnd) {
          alerts.push({
            title: `LC payment to be made this week: ${l.lcNumber}`,
            desc: `Maturity date ${formatDate(l.maturityDate)}. ${formatCurrency(l.amount, l.currency)} to be paid.`,
            type: 'LC',
            severity: 'HIGH'
          });
        }
      });
    return alerts;
  }, [lcs]);

  const activeShipmentsCount = useMemo(() => shipments.filter(s => !!s.supplierId && s.status !== ShipmentStatus.REACHED_PLANT).length, [shipments]);
  const cashFlowRows = cashFlowView === 'outgoing' ? upcomingPayables.items : upcomingReceivables.items;

  return (
    <div className="space-y-8 animate-in fade-in pb-20">
      <header className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight italic uppercase">Management Control</h1>
          <div className="flex items-center gap-3 mt-1">
             <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${
              sysStats.mode === 'BROWSER_PERSISTENT' ? 'bg-amber-50 border-amber-100 text-amber-600' : 'bg-emerald-50 border-emerald-100 text-emerald-500'
            }`}>
              {sysStats.mode === 'BROWSER_PERSISTENT' ? <WifiOff size={10} /> : <Wifi size={10} />}
              {sysStats.mode === 'BROWSER_PERSISTENT' ? 'Offline Persistence' : 'SQL Mainframe Connected'}
            </div>
          </div>
        </div>
        <button onClick={refreshStats} className={`p-2.5 rounded-xl border bg-white hover:bg-slate-50 transition-all min-h-[44px] min-w-[44px] flex items-center justify-center sm:ml-auto ${isRefreshing ? 'animate-spin' : ''}`}>
          <RefreshCw size={18} className="text-slate-400" />
        </button>
      </header>

      {redFlags.length > 0 && (
        <section className="bg-red-50 p-6 rounded-[2rem] border border-red-100 animate-in slide-in-from-top-4">
          <div className="flex items-center gap-2 mb-4">
             <BellRing className="text-red-600 animate-bounce" size={20} />
             <h2 className="text-sm font-black text-red-900 uppercase tracking-widest">Critical Action Items</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {redFlags.map((alert, i) => (
              <div key={i} className="bg-white p-4 rounded-2xl shadow-sm border border-red-100 flex gap-4">
                 <div className="p-3 rounded-xl h-fit bg-red-600 text-white">
                    <CreditCard size={18} />
                 </div>
                 <div>
                    <h3 className="text-xs font-black text-slate-900 uppercase">{alert.title}</h3>
                    <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">{alert.desc}</p>
                 </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-6">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex items-center gap-4">
           <div className="bg-blue-50 text-blue-600 p-3 rounded-2xl"><Package size={24} /></div>
           <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Live Cargo</p><p className="text-xl font-black">{activeShipmentsCount}</p></div>
        </div>
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex items-center gap-4">
           <div className="bg-emerald-50 text-emerald-600 p-3 rounded-2xl"><CheckCircle size={24} /></div>
           <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Vendors</p><p className="text-xl font-black">{suppliers.length}</p></div>
        </div>
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex items-center gap-4">
           <div className="bg-indigo-50 text-indigo-600 p-3 rounded-2xl"><Award size={24} /></div>
           <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Licences</p><p className="text-xl font-black">{licences.length}</p></div>
        </div>
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex items-center gap-4">
           <div className="bg-amber-50 text-amber-600 p-3 rounded-2xl"><CreditCard size={24} /></div>
           <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active LCs</p><p className="text-xl font-black">{lcs.filter(l => l.status === LCStatus.OPEN).length}</p></div>
        </div>
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex items-center gap-4">
           <div className="bg-red-50 text-red-600 p-3 rounded-2xl"><ArrowUpCircle size={24} /></div>
           <div>
             <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Upcoming Payables</p>
             <p className="text-lg font-black">{formatCurrency(upcomingPayables.summary.totalInr || 0, 'INR')}</p>
             <p className="text-[10px] text-slate-500">{upcomingPayables.summary.count} due in 30 days</p>
           </div>
        </div>
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex items-center gap-4">
           <div className="bg-emerald-50 text-emerald-600 p-3 rounded-2xl"><ArrowDownCircle size={24} /></div>
           <div>
             <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Upcoming Receivables</p>
             <p className="text-lg font-black">{formatCurrency(upcomingReceivables.summary.totalInr || 0, 'INR')}</p>
             <p className="text-[10px] text-slate-500">{upcomingReceivables.summary.count} due in 30 days</p>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black text-slate-900 uppercase flex items-center gap-2">
                <Calendar size={16} className="text-indigo-500" /> Expected Arrivals
            </h2>
            <Link to="/shipments" className="text-indigo-600 text-xs font-bold flex items-center gap-1">View Ledger <ArrowRight size={14}/></Link>
          </div>

          {(() => {
            const withEta = shipments.filter(s => !!s.supplierId && s.expectedArrivalDate);
            const gfplList = withEta.filter(s => s.company === 'GFPL').sort((a, b) => new Date(a.expectedArrivalDate!).getTime() - new Date(b.expectedArrivalDate!).getTime());
            const gtexList = withEta.filter(s => s.company === 'GTEX').sort((a, b) => new Date(a.expectedArrivalDate!).getTime() - new Date(b.expectedArrivalDate!).getTime());
            const TableCard = ({ list, heading }: { list: typeof withEta; heading: string }) => (
              <section className="bg-white p-8 rounded-[2.5rem] border border-slate-100">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-6 border-b border-slate-100 pb-3">{heading}</h3>
                <div className="md:hidden space-y-3">
                  {list.slice(0, 8).map(sh => (
                    <article key={sh.id} className="rounded-2xl border border-slate-200 bg-white p-3 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-xs font-black text-slate-900 truncate">#{sh.invoiceNumber}</p>
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wide bg-slate-100 text-slate-700">
                          {getShipmentStatusLabel(sh.status)}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 truncate">{suppliers.find(s => s.id === sh.supplierId)?.name || '—'}</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-xl bg-slate-50 border border-slate-100 p-2">
                          <p className="text-[9px] font-black uppercase text-slate-400">Arrival</p>
                          <p className="text-[11px] font-bold text-slate-700">{formatDate(sh.expectedArrivalDate)}</p>
                        </div>
                        <div className="rounded-xl bg-slate-50 border border-slate-100 p-2">
                          <p className="text-[9px] font-black uppercase text-slate-400">Value</p>
                          <p className="text-[11px] font-black text-indigo-700">{formatCurrency(sh.amount, sh.currency)}</p>
                        </div>
                      </div>
                    </article>
                  ))}
                  {list.length === 0 && (
                    <p className="py-6 text-center text-slate-400 text-xs italic">No expected arrivals.</p>
                  )}
                </div>
                <div className="hidden md:block overflow-x-auto scroll-touch">
                  <table className="w-full text-sm min-w-[760px]">
                    <thead>
                      <tr className="text-left text-[9px] font-black text-slate-400 uppercase border-b">
                        <th className="pb-3 pr-4">Expected Arrival</th>
                        <th className="pb-3 pr-4">Invoice #</th>
                        <th className="pb-3 pr-4">Supplier</th>
                        <th className="pb-3 pr-4">Product</th>
                        <th className="pb-3 pr-4">Lifecycle</th>
                        <th className="pb-3 text-right">Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {list.slice(0, 8).map(sh => (
                        <tr key={sh.id}>
                          <td className="py-3 pr-4 font-mono text-xs text-slate-700">{formatDate(sh.expectedArrivalDate)}</td>
                          <td className="py-3 pr-4 font-bold text-slate-900">{sh.invoiceNumber}</td>
                          <td className="py-3 pr-4 text-slate-700">{suppliers.find(s => s.id === sh.supplierId)?.name || '—'}</td>
                          <td className="py-3 pr-4 text-slate-600">{(sh.items && sh.items[0]) ? sh.items[0].productName : '—'}</td>
                          <td className="py-3 pr-4">
                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wide bg-slate-100 text-slate-700">
                              {getShipmentStatusLabel(sh.status)}
                            </span>
                          </td>
                          <td className="py-3 text-right font-bold text-indigo-600">{formatCurrency(sh.amount, sh.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {list.length === 0 && (
                    <p className="py-6 text-center text-slate-400 text-xs italic">No expected arrivals.</p>
                  )}
                </div>
              </section>
            );
            return (
              <>
                <TableCard list={gfplList} heading="Gujarat Flotex Private Limited" />
                <TableCard list={gtexList} heading="GTEX Fabrics and Private Limited" />
                <section className="bg-white p-8 rounded-[2.5rem] border border-slate-100">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">30-Day Cash Flow</h3>
                    <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                      <button
                        type="button"
                        onClick={() => setCashFlowView('outgoing')}
                        className={`px-3 py-2 text-[10px] font-black uppercase rounded-lg ${cashFlowView === 'outgoing' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}
                      >
                        Supplier Payments
                      </button>
                      <button
                        type="button"
                        onClick={() => setCashFlowView('incoming')}
                        className={`px-3 py-2 text-[10px] font-black uppercase rounded-lg ${cashFlowView === 'incoming' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}
                      >
                        Customer Receipts
                      </button>
                    </div>
                  </div>

                  <div className="md:hidden space-y-3">
                    {cashFlowRows.map((row) => (
                      <article key={`${cashFlowView}-${row.shipmentId}`} className="rounded-2xl border border-slate-200 bg-white p-3 space-y-2">
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
                            <p className="text-[11px] font-black text-indigo-700">{formatCurrency(row.amount, row.currency)}</p>
                          </div>
                          <div className="rounded-xl bg-slate-50 border border-slate-100 p-2">
                            <p className="text-[9px] font-black uppercase text-slate-400">Due Date</p>
                            <p className="text-[11px] font-bold text-slate-700">{formatDate(row.dueDate)}</p>
                          </div>
                        </div>
                      </article>
                    ))}
                    {!isCashFlowLoading && cashFlowRows.length === 0 && (
                      <p className="py-6 text-center text-slate-400 text-xs italic">No records due in next 30 days.</p>
                    )}
                    {isCashFlowLoading && (
                      <p className="py-6 text-center text-slate-400 text-xs italic">Loading cash flow...</p>
                    )}
                  </div>

                  <div className="hidden md:block overflow-x-auto scroll-touch">
                    <table className="w-full text-sm min-w-[760px]">
                      <thead>
                        <tr className="text-left text-[9px] font-black text-slate-400 uppercase border-b">
                          <th className="pb-3 pr-4">{cashFlowView === 'outgoing' ? 'Supplier' : 'Customer'}</th>
                          <th className="pb-3 pr-4">Invoice #</th>
                          <th className="pb-3 pr-4">Amount</th>
                          <th className="pb-3 pr-4">Due Date</th>
                          <th className="pb-3 pr-4">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {cashFlowRows.map((row) => (
                          <tr key={`${cashFlowView}-${row.shipmentId}`}>
                            <td className="py-3 pr-4 font-bold text-slate-900">{row.entityName}</td>
                            <td className="py-3 pr-4 text-slate-700">{row.invoiceNumber}</td>
                            <td className="py-3 pr-4 font-black text-indigo-600">{formatCurrency(row.amount, row.currency)}</td>
                            <td className="py-3 pr-4 text-slate-700">{formatDate(row.dueDate)}</td>
                            <td className="py-3 pr-4">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${
                                row.daysUntil <= 3 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'
                              }`}>
                                {row.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!isCashFlowLoading && cashFlowRows.length === 0 && (
                      <p className="py-6 text-center text-slate-400 text-xs italic">No records due in next 30 days.</p>
                    )}
                    {isCashFlowLoading && (
                      <p className="py-6 text-center text-slate-400 text-xs italic">Loading cash flow...</p>
                    )}
                  </div>
                </section>
              </>
            );
          })()}
        </div>

        <section className="bg-white p-8 rounded-[2.5rem] border border-slate-100 flex flex-col justify-between">
          <h2 className="text-sm font-black text-slate-900 uppercase mb-6">Database Health</h2>
          <div className="space-y-4">
             <div className="flex justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
               <div className="flex items-center gap-3"><HardDrive size={18} className="text-amber-400" /><span className="text-[10px] font-black uppercase text-slate-400">Browser Cache</span></div>
               <span className="text-sm font-black">{suppliers.length + shipments.length}</span>
             </div>
             <div className="flex justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
               <div className="flex items-center gap-3"><Database size={18} className="text-indigo-400" /><span className="text-[10px] font-black uppercase text-slate-400">SQL Mainframe</span></div>
               <span className="text-sm font-black">{sysStats.suppliers + sysStats.shipments || '---'}</span>
             </div>
          </div>
          <div className="mt-8 space-y-3">
             <p className="text-[10px] text-slate-500">Clear data stored only in this browser so the app uses the same data as the server (e.g. when opening via local IP).</p>
             <button onClick={() => api.system.reset()} className="w-full py-3 bg-red-50 text-red-600 rounded-xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-2">
                <ShieldAlert size={14} /> Clear browser data &amp; use server
             </button>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Dashboard;
