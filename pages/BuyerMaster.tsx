import React, { useState } from 'react';
import { Buyer, User, UserRole, SupplierStatus } from '../types';
import { Search, CheckCircle, XCircle, Clock, CheckSquare, Square, Plus, X } from 'lucide-react';
import BuyerRequest from './BuyerRequest';

interface BuyerMasterProps {
  buyers: Buyer[];
  user: User;
  onUpdateItem: (updated: Buyer) => Promise<void>;
  onAddItem: (item: Buyer) => Promise<void>;
}

const BuyerMaster: React.FC<BuyerMasterProps> = ({ buyers, user, onUpdateItem, onAddItem }) => {
  const [filterStatus, setFilterStatus] = useState<SupplierStatus | 'ALL'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const canApprove = user.role === UserRole.MANAGEMENT || user.role === UserRole.CHECKER;

  const handleBulkAction = async (newStatus: SupplierStatus) => {
    if (!selectedIds.length) return;
    const itemsToUpdate = buyers.filter(b => selectedIds.includes(b.id));
    for (const item of itemsToUpdate) {
      await onUpdateItem({ ...item, status: newStatus });
    }
    setSelectedIds([]);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const filtered = buyers.filter(b => {
    const matchesSearch = b.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          b.country.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'ALL' || b.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-24">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Global Buyer Network</h1>
          <p className="text-slate-500 font-medium">Manage and audit your international clientele.</p>
        </div>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setShowAddForm(true)}
            className="px-6 py-3 bg-amber-600 text-white rounded-2xl font-bold flex items-center gap-2 hover:bg-amber-700 transition-all shadow-lg shadow-amber-100"
          >
            <Plus size={18} /> New Buyer
          </button>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Search..." 
              className="pl-12 pr-6 py-3 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-amber-500 shadow-sm"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </header>

      {showAddForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-slate-50 w-full max-w-5xl h-[90vh] rounded-[2.5rem] shadow-2xl overflow-y-auto p-8 relative">
            <button onClick={() => setShowAddForm(false)} className="absolute top-8 right-8 p-2 hover:bg-slate-200 rounded-full transition-all">
              <X size={24} className="text-slate-500" />
            </button>
            <BuyerRequest 
              user={user} 
              onSubmit={async (b) => { await onAddItem(b); setShowAddForm(false); }} 
            />
          </div>
        </div>
      )}

      {selectedIds.length > 0 && canApprove && (
        <div className="bg-amber-600 p-4 rounded-2xl flex items-center justify-between text-white shadow-xl">
          <div className="flex items-center gap-4">
            <span className="text-sm font-black uppercase tracking-widest">{selectedIds.length} Buyers Selected</span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => handleBulkAction(SupplierStatus.APPROVED)} className="px-6 py-2 bg-emerald-500 rounded-xl font-bold flex items-center gap-2 shadow-sm"><CheckCircle size={16} /> Approve</button>
            <button onClick={() => handleBulkAction(SupplierStatus.REJECTED)} className="px-6 py-2 bg-red-500 rounded-xl font-bold flex items-center gap-2 shadow-sm"><XCircle size={16} /> Reject</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="w-12 px-6 py-5">
                <button onClick={() => setSelectedIds(selectedIds.length === filtered.length ? [] : filtered.map(f => f.id))}>
                  {selectedIds.length === filtered.length && filtered.length > 0 ? <CheckSquare className="text-amber-600" size={18} /> : <Square className="text-slate-300" size={18} />}
                </button>
              </th>
              <th className="px-6 py-5 text-left text-xs font-black text-slate-400 uppercase tracking-widest">Buyer Details</th>
              <th className="px-6 py-5 text-left text-xs font-black text-slate-400 uppercase tracking-widest">Region</th>
              <th className="px-6 py-5 text-left text-xs font-black text-slate-400 uppercase tracking-widest">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((b) => (
              <tr key={b.id} className={`hover:bg-amber-50/20 transition-colors ${selectedIds.includes(b.id) ? 'bg-amber-50/50' : ''}`}>
                <td className="px-6 py-5">
                  <button onClick={() => toggleSelect(b.id)}>
                    {selectedIds.includes(b.id) ? <CheckSquare className="text-amber-600" size={18} /> : <Square className="text-slate-300" size={18} />}
                  </button>
                </td>
                <td className="px-6 py-5">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-amber-100 text-amber-700 font-bold flex items-center justify-center rounded-xl">{b.name.charAt(0)}</div>
                    <p className="font-bold text-slate-900 leading-tight">{b.name}</p>
                  </div>
                </td>
                <td className="px-6 py-5"><span className="text-sm font-semibold text-slate-600">{b.country}</span></td>
                <td className="px-6 py-5">
                   <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase ${
                    b.status === SupplierStatus.APPROVED ? 'bg-emerald-100 text-emerald-700' :
                    b.status === SupplierStatus.PENDING ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {b.status === SupplierStatus.APPROVED ? <CheckCircle size={12} /> : <Clock size={12} />}
                    {b.status}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default BuyerMaster;