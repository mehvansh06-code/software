import React, { useState } from 'react';
import { LetterOfCredit, LCStatus, Supplier, User } from '../types';
import { CreditCard, Calendar, Landmark, AlertCircle, Plus, Search, Filter, CheckCircle, X, Trash2, Settings } from 'lucide-react';
import { formatCurrency, formatDate, COMPANIES } from '../constants';
import { api } from '../api';
import { usePermissions } from '../hooks/usePermissions';

interface LCTrackerProps {
  lcs: LetterOfCredit[];
  suppliers: Supplier[];
  user: User;
  onUpdateItem: (updated: LetterOfCredit) => Promise<void>;
  onDeleteItem?: (id: string) => Promise<void>;
}

const LCTracker: React.FC<LCTrackerProps> = ({ lcs, suppliers, user, onUpdateItem, onDeleteItem }) => {
  const importLcs = lcs.filter(lc => lc.supplierId);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | LCStatus>('ALL');
  const [showModal, setShowModal] = useState(false);
  const [editData, setEditData] = useState<Partial<LetterOfCredit> | null>(null);
  const [manageLc, setManageLc] = useState<LetterOfCredit | null>(null);
  const { hasPermission } = usePermissions(user);
  const canDeleteLC = hasPermission('lc.delete');

  const getSupplierName = (id: string) => suppliers.find(s => s.id === id)?.name || 'Unknown';

  const handleDelete = async (e: React.MouseEvent, lc: LetterOfCredit) => {
    e.stopPropagation();
    if (!onDeleteItem || !window.confirm(`Delete LC ${lc.lcNumber}? This will also remove its payment history. This cannot be undone.`)) return;
    try {
      await onDeleteItem(lc.id);
      setShowModal(false);
      setEditData(null);
    } catch (err: any) {
      alert(err?.message || 'Failed to delete LC.');
    }
  };

  const filtered = importLcs.filter(lc => {
    const matchesSearch = lc.lcNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          getSupplierName(lc.supplierId).toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || lc.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const upcomingDues = importLcs.filter(lc => 
    lc.status === LCStatus.OPEN && 
    new Date(lc.maturityDate).getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000
  ).length;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editData) return;
    
    if (editData.id) {
       // Update
       await onUpdateItem(editData as LetterOfCredit);
    } else {
       // Create
       const newLC: LetterOfCredit = {
          ...editData,
          id: Math.random().toString(36).substr(2, 9),
          status: LCStatus.OPEN
       } as LetterOfCredit;
       await api.lcs.create(newLC);
       window.location.reload(); // Simple reload to refresh list as prop
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
      supplierId: '',
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
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">LC Management Hub</h1>
          <p className="text-slate-500 font-medium">Tracking Letters of Credit, Bank Guarantees & Payment Dues.</p>
          <p className="text-xs text-slate-400 mt-1">Payment against an LC is made only from Shipments (Payment Ledger). This tracker shows how much you have paid and the current status — an LC is honoured only when total payment lodged in shipments against that LC reaches the LC amount.</p>
        </div>
        <button onClick={openCreateModal} className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100">
          <Plus size={18} /> Open New LC
        </button>
      </header>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl"><CreditCard size={20} /></div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Letters of Credit</p>
          </div>
          <p className="text-2xl font-black text-slate-900">{importLcs.filter(l => l.status === LCStatus.OPEN).length}</p>
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
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Settled LCs</p>
          </div>
          <p className="text-2xl font-black text-emerald-600">{importLcs.filter(l => l.status === LCStatus.PAID).length}</p>
        </div>
      </div>

      {/* Control Bar */}
      <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 flex flex-wrap items-center gap-4">
        <div className="flex-1 min-w-[240px] relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Search LC number or Beneficiary..." 
            className="w-full pl-12 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm font-medium"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-2xl border border-slate-200">
          <Filter size={14} className="text-slate-400" />
          <select 
            className="bg-transparent text-xs font-bold text-slate-600 outline-none"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
          >
            <option value="ALL">All Status</option>
            {Object.values(LCStatus).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">LC Details</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Issuing Bank</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Beneficiary</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Value</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Balance</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Maturity Date</th>
                <th className="px-6 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(lc => {
                const isDueSoon = lc.status === LCStatus.OPEN && new Date(lc.maturityDate).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000;
                const payments = lc.paymentSummary || [];
                const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
                return (
                  <React.Fragment key={lc.id}>
                    <tr className="hover:bg-slate-50/50 transition-colors cursor-pointer" onClick={() => openEditModal(lc)}>
                      <td className="px-6 py-5">
                        <p className="font-bold text-slate-900 text-sm">{lc.lcNumber}</p>
                        <span className="text-[9px] font-black text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded uppercase">{lc.company}</span>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-2">
                          <Landmark size={14} className="text-slate-400" />
                          <span className="text-xs font-bold text-slate-600">{lc.issuingBank}</span>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <p className="text-sm font-bold text-slate-700">{getSupplierName(lc.supplierId)}</p>
                      </td>
                      <td className="px-6 py-5">
                        <p className="font-black text-indigo-600 text-sm">{formatCurrency(lc.amount, lc.currency)}</p>
                      </td>
                      <td className="px-6 py-5">
                        <p className="text-sm font-bold text-slate-700">{formatCurrency(lc.balanceAmount ?? lc.amount ?? 0, lc.currency)}</p>
                        {(lc.shipments?.length ?? 0) > 0 && (
                          <p className="text-[9px] text-slate-500 mt-0.5">{lc.shipments.length} shipment(s)</p>
                        )}
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
                           lc.status === LCStatus.OPEN ? 'bg-blue-50 border-blue-100 text-blue-700' :
                           lc.status === LCStatus.PAID ? 'bg-emerald-50 border-emerald-100 text-emerald-700' :
                           'bg-slate-50 border-slate-100 text-slate-400'
                         }`}>
                           {lc.status}
                         </span>
                      </td>
                      <td className="px-6 py-5 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button type="button" onClick={(e) => { e.stopPropagation(); setManageLc(lc); }} className="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 hover:border-indigo-200 hover:text-indigo-600 text-[10px] font-bold uppercase flex items-center gap-1.5 transition-colors" title="Manage">
                            <Settings size={14} /> Manage
                          </button>
                          {canDeleteLC && (
                            <button type="button" onClick={(e) => handleDelete(e, lc)} className="p-2 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors" title="Delete LC">
                              <Trash2 size={18} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {payments.length > 0 && (
                      <tr className="bg-slate-50/50">
                        <td colSpan={8} className="px-6 py-4">
                          <div className="pl-4 border-l-2 border-indigo-200">
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Payments made against this LC</p>
                            <p className="text-xs font-bold text-slate-700 mb-2">Total paid: {formatCurrency(totalPaid, lc.currency)}</p>
                            <ul className="space-y-1.5">
                              {payments.map((p) => (
                                <li key={p.id} className="text-xs font-medium text-slate-600 flex items-center gap-2 flex-wrap">
                                  <span className="font-mono text-slate-500">Invoice {p.invoiceNumber || '—'}</span>
                                  <span className="font-bold text-indigo-600">{formatCurrency(p.amount, p.currency)}</span>
                                  <span className="text-slate-400">{formatDate(p.date)}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-20 text-center">
                    <p className="text-slate-400 font-medium italic">No Letters of Credit found.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manage LC modal: all details + payment track */}
      {manageLc && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-3xl max-h-[90vh] rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h2 className="text-xl font-black text-slate-900 flex items-center gap-2"><CreditCard size={22} /> LC Details — {manageLc.lcNumber}</h2>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => { setManageLc(null); openEditModal(manageLc); }} className="px-4 py-2 rounded-xl font-bold text-indigo-600 hover:bg-indigo-50 text-xs uppercase">Edit</button>
                <button type="button" onClick={() => setManageLc(null)} className="p-2 hover:bg-slate-200 rounded-full text-slate-400"><X size={20} /></button>
              </div>
            </div>
            <div className="p-8 overflow-y-auto space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div><span className="block text-[9px] font-black text-slate-400 uppercase mb-1">LC Number</span><p className="font-bold text-slate-800">{manageLc.lcNumber}</p></div>
                <div><span className="block text-[9px] font-black text-slate-400 uppercase mb-1">Issuing Bank</span><p className="font-bold text-slate-800">{manageLc.issuingBank}</p></div>
                <div><span className="block text-[9px] font-black text-slate-400 uppercase mb-1">Beneficiary (Supplier)</span><p className="font-bold text-slate-800">{getSupplierName(manageLc.supplierId!)}</p></div>
                <div><span className="block text-[9px] font-black text-slate-400 uppercase mb-1">Company</span><p className="font-bold text-slate-800">{manageLc.company}</p></div>
                <div><span className="block text-[9px] font-black text-slate-400 uppercase mb-1">LC Amount</span><p className="font-bold text-indigo-600">{formatCurrency(manageLc.amount, manageLc.currency)}</p></div>
                <div><span className="block text-[9px] font-black text-slate-400 uppercase mb-1">Balance</span><p className="font-bold text-slate-700">{formatCurrency(manageLc.balanceAmount ?? manageLc.amount ?? 0, manageLc.currency)}</p></div>
                <div><span className="block text-[9px] font-black text-slate-400 uppercase mb-1">Issue Date</span><p className="font-bold text-slate-800">{formatDate(manageLc.issueDate)}</p></div>
                <div><span className="block text-[9px] font-black text-slate-400 uppercase mb-1">Expiry Date</span><p className="font-bold text-slate-800">{formatDate(manageLc.expiryDate)}</p></div>
                <div><span className="block text-[9px] font-black text-slate-400 uppercase mb-1">Maturity Date</span><p className="font-bold text-slate-800">{formatDate(manageLc.maturityDate)}</p></div>
                <div><span className="block text-[9px] font-black text-slate-400 uppercase mb-1">Status</span><p className="font-bold"><span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${manageLc.status === LCStatus.OPEN ? 'bg-blue-50 text-blue-700' : manageLc.status === LCStatus.PAID ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{manageLc.status}</span></p></div>
              </div>
              {manageLc.remarks && <div><span className="block text-[9px] font-black text-slate-400 uppercase mb-1">Remarks</span><p className="font-bold text-slate-800">{manageLc.remarks}</p></div>}
              <div>
                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">Payment track</h3>
                <p className="text-xs text-slate-500 mb-3">Payments are lodged only from Shipments. Below are payments recorded against this LC from the shipment Payment Ledger. Status is updated when total paid reaches the LC amount.</p>
                {(manageLc.paymentSummary && manageLc.paymentSummary.length > 0) ? (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 text-left text-[9px] font-black text-slate-500 uppercase">
                          <th className="p-3">Invoice number</th>
                          <th className="p-3">Payment reference</th>
                          <th className="p-3">Payment date</th>
                          <th className="p-3 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {manageLc.paymentSummary.map((p) => (
                          <tr key={p.id}>
                            <td className="p-3 font-medium text-slate-800">{p.invoiceNumber || '—'}</td>
                            <td className="p-3 font-medium text-slate-700">{p.reference || '—'}</td>
                            <td className="p-3 font-medium text-slate-700">{formatDate(p.date)}</td>
                            <td className="p-3 text-right font-bold text-indigo-600">{formatCurrency(p.amount, p.currency)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="p-3 border-t border-slate-100 bg-slate-50 text-[10px] font-black text-slate-600">
                      Total paid: {formatCurrency(manageLc.paymentSummary.reduce((s, p) => s + (p.amount || 0), 0), manageLc.currency)}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 italic py-4">No payments recorded against this LC yet.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showModal && editData && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
           <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl p-8 relative">
              <button onClick={() => setShowModal(false)} className="absolute top-8 right-8 text-slate-400 hover:text-slate-600"><X size={24} /></button>
              <h2 className="text-2xl font-black text-slate-900 mb-6">{editData.id ? 'Edit LC Record' : 'Open New LC'}</h2>
              
              <form onSubmit={handleSave} className="space-y-6">
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                       <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Company Entity</label>
                       <select className="w-full px-4 py-2 rounded-xl border font-bold" value={editData.company} onChange={e => setEditData({...editData, company: e.target.value as any})}>
                          {COMPANIES.map(c => <option key={c} value={c}>{c}</option>)}
                       </select>
                    </div>
                    <div>
                       <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">LC Number</label>
                       <input required className="w-full px-4 py-2 rounded-xl border font-bold" value={editData.lcNumber} onChange={e => setEditData({...editData, lcNumber: e.target.value})} />
                    </div>
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                    <div>
                       <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Beneficiary (Supplier)</label>
                       <select required className="w-full px-4 py-2 rounded-xl border font-bold" value={editData.supplierId || ''} onChange={e => setEditData({...editData, supplierId: e.target.value})}>
                          <option value="">-- Select --</option>
                          {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                       </select>
                    </div>
                    <div>
                       <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Issuing Bank</label>
                       <input required className="w-full px-4 py-2 rounded-xl border font-bold" value={editData.issuingBank} onChange={e => setEditData({...editData, issuingBank: e.target.value})} />
                    </div>
                 </div>

                 <div className="grid grid-cols-3 gap-4">
                    <div className="col-span-1">
                       <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Currency</label>
                       <select className="w-full px-4 py-2 rounded-xl border font-bold" value={editData.currency} onChange={e => setEditData({...editData, currency: e.target.value})}>
                          <option value="USD">USD</option>
                          <option value="EUR">EUR</option>
                          <option value="INR">INR</option>
                       </select>
                    </div>
                    <div className="col-span-2">
                       <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">LC Amount</label>
                       <input required type="number" className="w-full px-4 py-2 rounded-xl border font-bold" value={editData.amount} onChange={e => setEditData({...editData, amount: parseFloat(e.target.value)})} />
                    </div>
                 </div>

                 <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Tracking timeline</h3>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                         <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Issue Date</label>
                         <input required type="date" className="w-full px-4 py-2 rounded-xl border font-bold" value={editData.issueDate} onChange={e => setEditData({...editData, issueDate: e.target.value})} />
                      </div>
                      <div>
                         <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Expiry Date</label>
                         <input required type="date" className="w-full px-4 py-2 rounded-xl border font-bold" value={editData.expiryDate} onChange={e => setEditData({...editData, expiryDate: e.target.value})} />
                      </div>
                      <div>
                         <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Maturity Date</label>
                         <input required type="date" className="w-full px-4 py-2 rounded-xl border font-bold" value={editData.maturityDate} onChange={e => setEditData({...editData, maturityDate: e.target.value})} />
                      </div>
                    </div>
                 </div>

                 {editData.id && (
                   <div>
                     <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Status</label>
                     <select className="w-full px-4 py-2 rounded-xl border font-bold" value={editData.status} onChange={e => setEditData({...editData, status: e.target.value as LCStatus})}>
                       {Object.values(LCStatus).map(s => <option key={s} value={s}>{s}</option>)}
                     </select>
                     <p className="text-[10px] text-slate-400 mt-1">Status is derived from payments lodged in Shipments; an LC shows as PAID when total payment against it reaches the LC amount.</p>
                   </div>
                 )}

                 <div className="flex gap-3">
                   {editData.id && canDeleteLC && onDeleteItem && (
                     <button type="button" onClick={(e) => { e.preventDefault(); handleDelete(e as any, editData as LetterOfCredit); }} className="px-6 py-4 border-2 border-red-200 text-red-600 font-black uppercase rounded-xl hover:bg-red-50 transition-all">
                       Delete LC
                     </button>
                   )}
                   <button type="submit" className="flex-1 py-4 bg-indigo-600 text-white font-black uppercase rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100">
                      {editData.id ? 'Save Changes' : 'Open Letter of Credit'}
                   </button>
                 </div>
              </form>
           </div>
        </div>
      )}
    </div>
  );
};

export default LCTracker;