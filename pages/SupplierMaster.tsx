import React, { useState } from 'react';
import { Supplier, SupplierStatus, User, UserRole, Product, ProductType } from '../types';
import { 
  Search, 
  CheckCircle, 
  XCircle, 
  Edit3, 
  X,
  CheckSquare,
  Square,
  Plus,
  Trash2,
  Globe,
  Landmark,
  PackagePlus
} from 'lucide-react';
import { formatDate } from '../constants';
import SupplierRequest from './SupplierRequest';

interface SupplierMasterProps {
  suppliers: Supplier[];
  user: User;
  onUpdateItem: (updated: Supplier) => Promise<void>;
  onAddItem: (item: Supplier) => Promise<void>;
}

const SupplierMaster: React.FC<SupplierMasterProps> = ({ suppliers, user, onUpdateItem, onAddItem }) => {
  const [filterStatus, setFilterStatus] = useState<SupplierStatus | 'ALL'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const canApprove = user.role === UserRole.MANAGEMENT || user.role === UserRole.CHECKER;
  const canEdit = user.role === UserRole.MANAGEMENT || user.role === UserRole.CHECKER;

  const handleBulkAction = async (newStatus: SupplierStatus) => {
    if (!selectedIds.length) return;
    const itemsToUpdate = suppliers.filter(s => selectedIds.includes(s.id));
    for (const item of itemsToUpdate) {
      await onUpdateItem({ ...item, status: newStatus });
    }
    setSelectedIds([]);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const filtered = suppliers.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          s.country.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'ALL' || s.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-24">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Supplier Repository</h1>
          <p className="text-slate-500 font-medium">Bulk management and partner compliance verification.</p>
        </div>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setShowAddForm(true)}
            className="px-6 py-3 bg-indigo-600 text-white rounded-2xl font-bold flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
          >
            <Plus size={18} /> New Supplier
          </button>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Search..." 
              className="pl-12 pr-6 py-3 bg-white border border-slate-200 rounded-2xl w-64 outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </header>

      {selectedIds.length > 0 && canApprove && (
        <div className="bg-indigo-600 p-4 rounded-2xl flex items-center justify-between text-white shadow-xl animate-in slide-in-from-top-4">
          <div className="flex items-center gap-4">
            <span className="text-sm font-black uppercase tracking-widest">{selectedIds.length} Suppliers Selected</span>
            <button onClick={() => setSelectedIds([])} className="text-white/60 hover:text-white"><X size={18} /></button>
          </div>
          <div className="flex gap-2">
            <button onClick={() => handleBulkAction(SupplierStatus.APPROVED)} className="px-6 py-2 bg-emerald-500 hover:bg-emerald-600 rounded-xl font-bold flex items-center gap-2 transition-all">
              <CheckCircle size={16} /> Approve Selected
            </button>
            <button onClick={() => handleBulkAction(SupplierStatus.REJECTED)} className="px-6 py-2 bg-red-500 hover:bg-red-600 rounded-xl font-bold flex items-center gap-2 transition-all">
              <XCircle size={16} /> Reject Selected
            </button>
          </div>
        </div>
      )}

      {showAddForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-slate-50 w-full max-w-5xl h-[90vh] rounded-[2.5rem] shadow-2xl overflow-y-auto p-8 relative">
            <button onClick={() => setShowAddForm(false)} className="absolute top-8 right-8 p-2 hover:bg-slate-200 rounded-full transition-all">
              <X size={24} className="text-slate-500" />
            </button>
            <SupplierRequest 
              user={user} 
              onSubmit={async (s) => { await onAddItem(s); setShowAddForm(false); }} 
            />
          </div>
        </div>
      )}

      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="w-12 px-6 py-5">
                   <button onClick={() => setSelectedIds(selectedIds.length === filtered.length ? [] : filtered.map(f => f.id))}>
                     {selectedIds.length === filtered.length && filtered.length > 0 ? <CheckSquare className="text-indigo-600" size={18} /> : <Square className="text-slate-300" size={18} />}
                   </button>
                </th>
                <th className="px-6 py-5 text-left text-xs font-black text-slate-400 uppercase tracking-widest">Supplier</th>
                <th className="px-6 py-5 text-left text-xs font-black text-slate-400 uppercase tracking-widest">Region</th>
                <th className="px-6 py-5 text-left text-xs font-black text-slate-400 uppercase tracking-widest">Status</th>
                <th className="px-6 py-5 text-right text-xs font-black text-slate-400 uppercase tracking-widest">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((s) => (
                <tr key={s.id} className={`hover:bg-slate-50/50 transition-colors ${selectedIds.includes(s.id) ? 'bg-indigo-50/30' : ''}`}>
                  <td className="px-6 py-5">
                    <button onClick={() => toggleSelect(s.id)}>
                      {selectedIds.includes(s.id) ? <CheckSquare className="text-indigo-600" size={18} /> : <Square className="text-slate-300" size={18} />}
                    </button>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center rounded-xl">{s.name.charAt(0)}</div>
                      <p className="font-bold text-slate-900 leading-tight">{s.name}</p>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <span className="text-sm font-semibold text-slate-600">{s.country}</span>
                  </td>
                  <td className="px-6 py-5">
                    <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase ${
                      s.status === SupplierStatus.APPROVED ? 'bg-emerald-100 text-emerald-700' :
                      s.status === SupplierStatus.PENDING ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {s.status === SupplierStatus.APPROVED && <CheckCircle size={12} />}
                      {s.status}
                    </div>
                  </td>
                  <td className="px-6 py-5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {canEdit && (
                        <button onClick={() => setEditingSupplier({...s})} className="p-2 text-slate-400 hover:text-indigo-600 rounded-lg transition-all"><Edit3 size={18} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editingSupplier && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl">
            <div className="p-8 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">Edit Profile</h2>
              <button onClick={() => setEditingSupplier(null)}><X size={24} /></button>
            </div>
            <div className="p-8 space-y-4">
               <label className="block text-xs font-bold text-slate-500 uppercase">Legal Name</label>
               <input className="w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-indigo-500" value={editingSupplier.name} onChange={e => setEditingSupplier({...editingSupplier, name: e.target.value})} placeholder="Name" />
               <button onClick={async () => { await onUpdateItem(editingSupplier); setEditingSupplier(null); }} className="w-full bg-indigo-600 text-white font-bold py-4 rounded-xl mt-4">Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupplierMaster;