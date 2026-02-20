import React, { useState } from 'react';
import { LetterOfCredit, LCStatus, Buyer } from '../types';
import { CreditCard, Calendar, Landmark, AlertCircle, Plus, Search, Filter, CheckCircle, X } from 'lucide-react';
import { formatCurrency, formatDate, COMPANIES } from '../constants';
import { api } from '../api';

interface ExportLCTrackerProps {
  lcs: LetterOfCredit[];
  buyers: Buyer[];
  onUpdateItem: (updated: LetterOfCredit) => Promise<void>;
}

/** Export LC Tracker: LCs from which we have to get payment (buyer opened LC in our favor). */
const ExportLCTracker: React.FC<ExportLCTrackerProps> = ({ lcs, buyers, onUpdateItem }) => {
  const exportLcs = lcs.filter(lc => lc.buyerId);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | LCStatus>('ALL');
  const [showModal, setShowModal] = useState(false);
  const [editData, setEditData] = useState<Partial<LetterOfCredit> | null>(null);

  const getBuyerName = (id: string) => buyers.find(b => b.id === id)?.name || 'Unknown';

  const filtered = exportLcs.filter(lc => {
    const matchesSearch = (lc.lcNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          getBuyerName(lc.buyerId!).toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || lc.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const upcomingDues = exportLcs.filter(lc =>
    lc.status === LCStatus.OPEN &&
    new Date(lc.maturityDate).getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000
  ).length;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editData) return;

    if (editData.id) {
      await onUpdateItem(editData as LetterOfCredit);
    } else {
      const newLC: LetterOfCredit = {
        ...editData,
        id: Math.random().toString(36).substr(2, 9),
        status: LCStatus.OPEN,
        buyerId: editData.buyerId!
      } as LetterOfCredit;
      await api.lcs.create(newLC);
      window.location.reload();
    }
    setShowModal(false);
    setEditData(null);
  };

  const openCreateModal = () => {
    setEditData({
      company: 'GFPL',
      currency: 'USD',
      amount: 0,
      lcNumber: '',
      issuingBank: '',
      buyerId: '',
      issueDate: '',
      expiryDate: '',
      maturityDate: '',
      remarks: ''
    });
    setShowModal(true);
  };

  const openEditModal = (lc: LetterOfCredit) => {
    setEditData(lc);
    setShowModal(true);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Export LC Tracker</h1>
          <p className="text-slate-500 font-medium">LCs from which you have to get payment (buyer&apos;s LC in your favor).</p>
          <p className="text-xs text-slate-400 mt-1">Payment is received only when lodged in Shipments (Payment Ledger). This tracker shows how much has been received against each LC and the current status — an LC is settled only when total payment lodged in shipments against that LC and buyer reaches the LC amount.</p>
        </div>
        <button onClick={openCreateModal} className="w-full sm:w-auto bg-amber-600 text-white px-6 py-3 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-amber-700 transition-all shadow-lg shadow-amber-100 min-h-[44px] md:min-h-0">
          <Plus size={18} /> Add Export LC
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl"><CreditCard size={20} /></div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Open LCs (Awaiting Payment)</p>
          </div>
          <p className="text-2xl font-black text-slate-900">{exportLcs.filter(l => l.status === LCStatus.OPEN).length}</p>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm ring-2 ring-amber-100">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl"><AlertCircle size={20} /></div>
            <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Maturity Next 30 Days</p>
          </div>
          <p className="text-2xl font-black text-slate-900">{upcomingDues}</p>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl"><CheckCircle size={20} /></div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Payment Received</p>
          </div>
          <p className="text-2xl font-black text-emerald-600">{exportLcs.filter(l => l.status === LCStatus.PAID).length}</p>
        </div>
      </div>

      <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 flex flex-wrap items-center gap-4">
        <div className="flex-1 min-w-[240px] relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search LC number or Buyer..."
            className="w-full pl-12 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-amber-500 transition-all text-sm font-medium"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-2xl border border-slate-200 w-full sm:w-auto">
          <Filter size={14} className="text-slate-400" />
          <select
            className="bg-transparent text-xs font-bold text-slate-600 outline-none w-full"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
          >
            <option value="ALL">All Status</option>
            {Object.values(LCStatus).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="md:hidden p-3 space-y-3">
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center text-xs font-semibold text-slate-500">
              No export LCs found.
            </div>
          ) : (
            filtered.map((lc) => {
              const isDueSoon = lc.status === LCStatus.OPEN && new Date(lc.maturityDate).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000;
              return (
                <article key={lc.id} className="rounded-2xl border border-slate-200 bg-white p-3 space-y-3 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-black text-slate-900 truncate">{lc.lcNumber}</p>
                      <p className="text-[11px] text-slate-500 truncate">{getBuyerName(lc.buyerId!)}</p>
                    </div>
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wide bg-amber-100 text-amber-800">
                      {lc.company}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-slate-50 border border-slate-100 p-2">
                      <p className="text-[9px] font-black uppercase text-slate-400">LC Amount</p>
                      <p className="text-[11px] font-black text-amber-700">{formatCurrency(lc.amount, lc.currency)}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 border border-slate-100 p-2">
                      <p className="text-[9px] font-black uppercase text-slate-400">Maturity</p>
                      <p className={`text-[11px] font-bold ${isDueSoon ? 'text-red-600' : 'text-slate-700'}`}>{formatDate(lc.maturityDate)}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 border border-slate-100 p-2 col-span-2">
                      <p className="text-[9px] font-black uppercase text-slate-400">Status</p>
                      <span className={`inline-flex text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase ${
                        lc.status === LCStatus.OPEN ? 'bg-amber-100 text-amber-700' : lc.status === LCStatus.PAID ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {lc.status}
                      </span>
                    </div>
                  </div>
                  <button type="button" onClick={() => openEditModal(lc)} className="w-full px-3 py-2 rounded-xl border border-amber-200 text-[12px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-100">
                    Manage LC
                  </button>
                </article>
              );
            })
          )}
        </div>

        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">LC Details</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Issuing Bank</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Buyer (Applicant)</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Value</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Maturity Date</th>
                <th className="px-6 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(lc => {
                const isDueSoon = lc.status === LCStatus.OPEN && new Date(lc.maturityDate).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000;
                return (
                  <tr key={lc.id} className="hover:bg-slate-50/50 transition-colors cursor-pointer" onClick={() => openEditModal(lc)}>
                    <td className="px-6 py-5">
                      <p className="font-bold text-slate-900 text-sm">{lc.lcNumber}</p>
                      <span className="text-[9px] font-black text-slate-400 bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded uppercase">{lc.company}</span>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-2">
                        <Landmark size={14} className="text-slate-400" />
                        <span className="text-xs font-bold text-slate-600">{lc.issuingBank}</span>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <p className="text-sm font-bold text-slate-700">{getBuyerName(lc.buyerId!)}</p>
                    </td>
                    <td className="px-6 py-5">
                      <p className="font-black text-amber-600 text-sm">{formatCurrency(lc.amount, lc.currency)}</p>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex flex-col gap-1">
                        <p className={`text-xs font-bold flex items-center gap-1.5 ${isDueSoon ? 'text-red-500 animate-pulse' : 'text-slate-700'}`}>
                          <Calendar size={14} /> {formatDate(lc.maturityDate)}
                        </p>
                        {isDueSoon && <span className="text-[8px] font-black text-red-400 uppercase mt-1">MATURING SOON</span>}
                      </div>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase border ${
                        lc.status === LCStatus.OPEN ? 'bg-amber-50 border-amber-100 text-amber-700' :
                        lc.status === LCStatus.PAID ? 'bg-emerald-50 border-emerald-100 text-emerald-700' :
                        'bg-slate-50 border-slate-100 text-slate-400'
                      }`}>
                        {lc.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center">
                    <p className="text-slate-400 font-medium italic">No export LCs found. Add an LC from which you expect payment.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && editData && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl p-8 relative">
            <button onClick={() => setShowModal(false)} className="absolute top-8 right-8 text-slate-400 hover:text-slate-600"><X size={24} /></button>
            <h2 className="text-2xl font-black text-slate-900 mb-6">{editData.id ? 'Edit Export LC' : 'Add Export LC (Payment to Receive)'}</h2>

            <form onSubmit={handleSave} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Company Entity</label>
                  <select className="w-full px-4 py-2 rounded-xl border font-bold" value={editData.company} onChange={e => setEditData({ ...editData, company: e.target.value as any })}>
                    {COMPANIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">LC Number</label>
                  <input required className="w-full px-4 py-2 rounded-xl border font-bold" value={editData.lcNumber} onChange={e => setEditData({ ...editData, lcNumber: e.target.value })} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Buyer (Applicant – from whom you get payment)</label>
                  <select required className="w-full px-4 py-2 rounded-xl border font-bold" value={editData.buyerId} onChange={e => setEditData({ ...editData, buyerId: e.target.value })}>
                    <option value="">-- Select Buyer --</option>
                    {buyers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Issuing Bank</label>
                  <input required className="w-full px-4 py-2 rounded-xl border font-bold" value={editData.issuingBank} onChange={e => setEditData({ ...editData, issuingBank: e.target.value })} />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-1">
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Currency</label>
                  <select className="w-full px-4 py-2 rounded-xl border font-bold" value={editData.currency} onChange={e => setEditData({ ...editData, currency: e.target.value })}>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">LC Amount</label>
                  <input required type="number" className="w-full px-4 py-2 rounded-xl border font-bold" value={editData.amount} onChange={e => setEditData({ ...editData, amount: parseFloat(e.target.value) })} />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Issue Date</label>
                  <input required type="date" className="w-full px-4 py-2 rounded-xl border font-bold" value={editData.issueDate} onChange={e => setEditData({ ...editData, issueDate: e.target.value })} />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Expiry Date</label>
                  <input required type="date" className="w-full px-4 py-2 rounded-xl border font-bold" value={editData.expiryDate} onChange={e => setEditData({ ...editData, expiryDate: e.target.value })} />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Maturity Date</label>
                  <input required type="date" className="w-full px-4 py-2 rounded-xl border font-bold" value={editData.maturityDate} onChange={e => setEditData({ ...editData, maturityDate: e.target.value })} />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Remarks</label>
                <input className="w-full px-4 py-2 rounded-xl border font-bold" value={editData.remarks || ''} onChange={e => setEditData({ ...editData, remarks: e.target.value })} placeholder="Optional" />
              </div>

              {editData.id && (
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Status</label>
                  <select className="w-full px-4 py-2 rounded-xl border font-bold" value={editData.status} onChange={e => setEditData({ ...editData, status: e.target.value as LCStatus })}>
                    {Object.values(LCStatus).map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}

              <button type="submit" className="w-full py-4 bg-amber-600 text-white font-black uppercase rounded-xl hover:bg-amber-700 transition-all shadow-lg shadow-amber-100">
                {editData.id ? 'Save Changes' : 'Add Export LC'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExportLCTracker;
