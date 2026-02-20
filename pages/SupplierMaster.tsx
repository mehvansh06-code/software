import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  PackagePlus,
  Eye,
  Upload,
  FileDown
} from 'lucide-react';
import { formatDate } from '../constants';
import SupplierRequest from './SupplierRequest';
import { api } from '../api';
import { downloadAoaAsXlsx, readFirstSheetAsObjects } from '../utils/excel';

interface SupplierMasterProps {
  suppliers: Supplier[];
  user: User;
  onUpdateItem: (updated: Supplier) => Promise<void>;
  onAddItem: (item: Supplier) => Promise<void>;
  onRefreshData?: () => Promise<void>;
}

const SupplierMaster: React.FC<SupplierMasterProps> = ({ suppliers, user, onUpdateItem, onAddItem, onRefreshData }) => {
  const [filterStatus, setFilterStatus] = useState<SupplierStatus | 'ALL'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [viewingSupplier, setViewingSupplier] = useState<Supplier | null>(null);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterStatus, suppliers.length]);

  const totalRows = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pagedFiltered = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, safePage, pageSize]);
  const startRow = totalRows === 0 ? 0 : ((safePage - 1) * pageSize + 1);
  const endRow = Math.min(totalRows, safePage * pageSize);

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const json = await readFirstSheetAsObjects(file) as any[];
      const rows = json.map((r) => {
        const name = r.Name ?? r.name ?? r['Supplier Name'] ?? '';
        const address = r.Address ?? r.address ?? '';
        const country = r.Country ?? r.country ?? '';
        const bankName = r['Bank Name'] ?? r.bankName ?? r.Bank ?? '';
        const accountHolder = r['Account Holder'] ?? r['A/C Holder'] ?? r.accountHolderName ?? '';
        const accountNumber = r['Account Number'] ?? r.accountNumber ?? r.account_number ?? '';
        const swift = r.SWIFT ?? r.Swift ?? r.swiftCode ?? r['SWIFT Code'] ?? '';
        const bankAddress = r['Bank Address'] ?? r.bankAddress ?? '';
        const contactPerson = r['Contact Person'] ?? r.contactPerson ?? r['Contact Name'] ?? '';
        const contactNumber = r['Contact Number'] ?? r['Phone'] ?? r.contactNumber ?? r.Mobile ?? '';
        const contactEmail = r['Contact Email'] ?? r.Email ?? r.contactEmail ?? '';
        const contactDetails = [contactNumber, contactEmail].filter(Boolean).join(' / ') || undefined;
        return {
          name,
          address,
          country,
          bankName,
          accountHolderName: accountHolder,
          accountNumber: accountNumber || undefined,
          swiftCode: swift,
          bankAddress,
          contactPerson,
          contactDetails,
          status: 'APPROVED',
          requestedBy: 'Import',
          createdAt: new Date().toISOString(),
        };
      }).filter((r) => r.name && r.country);
      if (rows.length === 0) {
        alert('No rows with Name and Country found. Use the Download template for the correct column format.');
        return;
      }
      const result = await api.suppliers.import(rows);
      const count = (result as any)?.imported ?? rows.length;
      if (onRefreshData) {
        await onRefreshData();
        setFilterStatus('ALL');
        setSearchTerm('');
        alert(`Imported ${count} supplier(s). List updated.`);
      } else {
        alert(`Imported ${count} supplier(s). Refreshing the list.`);
        window.location.reload();
      }
    } catch (err: any) {
      alert(err?.message || 'Import failed.');
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  const downloadSupplierTemplate = async () => {
    const headers = ['Name', 'Address', 'Country', 'Bank Name', 'Account Holder', 'Account Number', 'SWIFT Code', 'Bank Address', 'Contact Person', 'Contact Number', 'Contact Email'];
    await downloadAoaAsXlsx('suppliers_import_template.xlsx', 'Suppliers', [
      headers,
      ['Example Supplier Ltd', '123 Trade St', 'China', 'Bank of China', 'Example Supplier Ltd', '1234567890', 'BKCHCNBJ', 'Beijing', 'Li Wei', '+86 123 456 7890', 'contact@example.com'],
    ]);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-24">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Supplier Repository</h1>
          <p className="text-slate-500 font-medium">Bulk management and partner compliance verification.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 w-full md:w-auto">
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportExcel} />
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={importing} className="w-full sm:w-auto px-4 py-3 md:py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-sm hover:bg-slate-200 flex items-center justify-center gap-2 disabled:opacity-50 transition-all min-h-[44px] md:min-h-0">
            <Upload size={16} /> {importing ? 'Importing...' : 'Import from Excel'}
          </button>
          <button type="button" onClick={downloadSupplierTemplate} className="w-full sm:w-auto px-4 py-3 md:py-2.5 rounded-xl bg-slate-100 text-slate-600 font-bold text-sm hover:bg-slate-200 flex items-center justify-center gap-2 min-h-[44px] md:min-h-0" title="Download template">
            <FileDown size={16} /> Download template
          </button>
          <button 
            onClick={() => setShowAddForm(true)}
            className="w-full sm:w-auto px-6 py-3 bg-indigo-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 min-h-[44px] md:min-h-0"
          >
            <Plus size={18} /> New Supplier
          </button>
          <div className="relative w-full sm:w-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Search..." 
              className="pl-12 pr-6 py-3 bg-white border border-slate-200 rounded-2xl w-full sm:w-64 outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </header>

      {selectedIds.length > 0 && canApprove && (
        <div className="bg-indigo-600 p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3 text-white shadow-xl animate-in slide-in-from-top-4">
          <div className="flex items-center gap-4">
            <span className="text-sm font-black uppercase tracking-widest">{selectedIds.length} Suppliers Selected</span>
            <button onClick={() => setSelectedIds([])} className="text-white/60 hover:text-white"><X size={18} /></button>
          </div>
          <div className="flex flex-col sm:flex-row flex-wrap gap-2 w-full md:w-auto">
            <button onClick={() => handleBulkAction(SupplierStatus.APPROVED)} className="w-full sm:w-auto px-6 py-3 md:py-2 bg-emerald-500 hover:bg-emerald-600 rounded-xl font-bold flex items-center justify-center gap-2 transition-all min-h-[44px] md:min-h-0">
              <CheckCircle size={16} /> Approve Selected
            </button>
            <button onClick={() => handleBulkAction(SupplierStatus.REJECTED)} className="w-full sm:w-auto px-6 py-3 md:py-2 bg-red-500 hover:bg-red-600 rounded-xl font-bold flex items-center justify-center gap-2 transition-all min-h-[44px] md:min-h-0">
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
        <div className="px-6 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold text-slate-600">
            Showing {startRow}-{endRow} of {totalRows} suppliers
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-semibold text-slate-500">Rows</label>
            <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value) || 50)} className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700">
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
            <button type="button" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 bg-white disabled:opacity-40">Prev</button>
            <span className="text-xs font-bold text-slate-600 min-w-[64px] text-center">{safePage} / {totalPages}</span>
            <button type="button" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 bg-white disabled:opacity-40">Next</button>
          </div>
        </div>

        <div className="md:hidden p-3 space-y-3">
          {pagedFiltered.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center text-xs font-semibold text-slate-500">
              No suppliers found.
            </div>
          ) : (
            pagedFiltered.map((s) => (
              <article key={s.id} className={`rounded-2xl border p-3 space-y-3 shadow-sm ${selectedIds.includes(s.id) ? 'border-indigo-300 bg-indigo-50/30' : 'border-slate-200 bg-white'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-slate-900 truncate">{s.name}</p>
                    <p className="text-[11px] text-slate-500 truncate">{s.country}</p>
                  </div>
                  <button onClick={() => toggleSelect(s.id)} className="p-2 rounded-lg border border-slate-200 bg-white shrink-0" title="Select">
                    {selectedIds.includes(s.id) ? <CheckSquare className="text-indigo-600" size={18} /> : <Square className="text-slate-300" size={18} />}
                  </button>
                </div>
                <div>
                  <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-black uppercase ${
                    s.status === SupplierStatus.APPROVED ? 'bg-emerald-100 text-emerald-700' :
                    s.status === SupplierStatus.PENDING ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {s.status === SupplierStatus.APPROVED && <CheckCircle size={12} />}
                    {s.status}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setViewingSupplier(s)} className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-[12px] font-bold text-slate-700 bg-white hover:bg-slate-50">View</button>
                  {canEdit && (
                    <button onClick={() => setEditingSupplier({ ...s })} className="flex-1 px-3 py-2 rounded-xl border border-indigo-200 text-[12px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100">Edit</button>
                  )}
                </div>
              </article>
            ))
          )}
        </div>

        <div className="hidden md:block overflow-x-auto">
          <table className="w-full min-w-[760px]">
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
              {pagedFiltered.map((s) => (
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
                      <button onClick={() => setViewingSupplier(s)} className="p-2 text-slate-400 hover:text-indigo-600 rounded-lg transition-all" title="View details"><Eye size={18} /></button>
                      {canEdit && (
                        <button onClick={() => setEditingSupplier({...s})} className="p-2 text-slate-400 hover:text-indigo-600 rounded-lg transition-all" title="Edit"><Edit3 size={18} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {viewingSupplier && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-8 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-xl font-black text-slate-900">Supplier Details</h2>
              <button onClick={() => setViewingSupplier(null)} className="p-2 hover:bg-slate-100 rounded-full"><X size={22} /></button>
            </div>
            <div className="p-8 space-y-6">
              <div className="pb-4 border-b border-slate-100">
                <span className="text-xs font-bold text-slate-400 uppercase">Supplier ID</span>
                <p className="text-slate-900 font-mono text-sm mt-1">{viewingSupplier.id}</p>
                <p className="text-slate-500 text-xs mt-1">Use this in shipment Excel import (Supplier ID column), or use the name below (Supplier Name).</p>
              </div>
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase">Legal Name</span>
                <p className="text-slate-900 font-semibold mt-1">{viewingSupplier.name}</p>
              </div>
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase">Country</span>
                <p className="text-slate-900 font-semibold mt-1">{viewingSupplier.country}</p>
              </div>
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase">Address</span>
                <p className="text-slate-700 mt-1 whitespace-pre-wrap">{viewingSupplier.address}</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase">Contact Person</span>
                  <p className="text-slate-900 font-semibold mt-1">{viewingSupplier.contactPerson}</p>
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase">Contact Number</span>
                  <p className="text-slate-700 mt-1">{viewingSupplier.contactNumber || '—'}</p>
                </div>
              </div>
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase">Contact Email</span>
                <p className="text-slate-700 mt-1">{viewingSupplier.contactEmail || '—'}</p>
              </div>
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase">Bank Name / SWIFT</span>
                <p className="text-slate-700 mt-1">{viewingSupplier.bankName} — {viewingSupplier.swiftCode}</p>
              </div>
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase">Account Holder</span>
                <p className="text-slate-700 mt-1">{viewingSupplier.accountHolderName}</p>
              </div>
              {viewingSupplier.accountNumber && (
                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase">Account Number</span>
                  <p className="text-slate-700 mt-1 font-mono">{viewingSupplier.accountNumber}</p>
                </div>
              )}
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase">Bank Address</span>
                <p className="text-slate-700 mt-1 whitespace-pre-wrap">{viewingSupplier.bankAddress}</p>
              </div>
              {viewingSupplier.hasIntermediaryBank && (
                <div className="pt-4 border-t border-slate-100">
                  <span className="text-xs font-bold text-slate-400 uppercase">Intermediary Bank</span>
                  <p className="text-slate-700 mt-1">{viewingSupplier.intermediaryBankName} — {viewingSupplier.intermediarySwiftCode}</p>
                  <p className="text-slate-600 text-sm mt-1">{viewingSupplier.intermediaryAccountHolderName}</p>
                  {viewingSupplier.intermediaryAccountNumber && <p className="text-slate-600 text-sm mt-1">A/C No. {viewingSupplier.intermediaryAccountNumber}</p>}
                  {viewingSupplier.intermediaryBankAddress && <p className="text-slate-600 text-sm mt-1 whitespace-pre-wrap">{viewingSupplier.intermediaryBankAddress}</p>}
                </div>
              )}
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase">Status</span>
                <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase mt-1 ${
                  viewingSupplier.status === SupplierStatus.APPROVED ? 'bg-emerald-100 text-emerald-700' :
                  viewingSupplier.status === SupplierStatus.PENDING ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                }`}>
                  {viewingSupplier.status}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {editingSupplier && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-8 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">Edit Supplier</h2>
              <button onClick={() => setEditingSupplier(null)}><X size={24} /></button>
            </div>
            <div className="p-8 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Legal Name</label>
                <input className="w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-indigo-500" value={editingSupplier.name} onChange={e => setEditingSupplier({...editingSupplier, name: e.target.value})} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Country</label>
                <input className="w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-indigo-500" value={editingSupplier.country} onChange={e => setEditingSupplier({...editingSupplier, country: e.target.value})} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Address</label>
                <textarea rows={3} className="w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-indigo-500" value={editingSupplier.address} onChange={e => setEditingSupplier({...editingSupplier, address: e.target.value})} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Contact Person</label>
                  <input className="w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-indigo-500" value={editingSupplier.contactPerson} onChange={e => setEditingSupplier({...editingSupplier, contactPerson: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Contact Number</label>
                  <input className="w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-indigo-500" value={editingSupplier.contactNumber ?? ''} onChange={e => setEditingSupplier({...editingSupplier, contactNumber: e.target.value})} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Contact Email</label>
                <input type="email" className="w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-indigo-500" value={editingSupplier.contactEmail ?? ''} onChange={e => setEditingSupplier({...editingSupplier, contactEmail: e.target.value})} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Bank Name</label>
                <input className="w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-indigo-500" value={editingSupplier.bankName} onChange={e => setEditingSupplier({...editingSupplier, bankName: e.target.value})} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Account Holder</label>
                <input className="w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-indigo-500" value={editingSupplier.accountHolderName} onChange={e => setEditingSupplier({...editingSupplier, accountHolderName: e.target.value})} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Account Number</label>
                <input className="w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-indigo-500" value={editingSupplier.accountNumber ?? ''} onChange={e => setEditingSupplier({...editingSupplier, accountNumber: e.target.value})} placeholder="e.g. 1234567890" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">SWIFT Code</label>
                <input className="w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-indigo-500" value={editingSupplier.swiftCode} onChange={e => setEditingSupplier({...editingSupplier, swiftCode: e.target.value})} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Bank Address</label>
                <textarea rows={2} className="w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-indigo-500" value={editingSupplier.bankAddress} onChange={e => setEditingSupplier({...editingSupplier, bankAddress: e.target.value})} />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="hasInter" className="w-4 h-4 rounded accent-indigo-600" checked={!!editingSupplier.hasIntermediaryBank} onChange={e => setEditingSupplier({...editingSupplier, hasIntermediaryBank: e.target.checked})} />
                <label htmlFor="hasInter" className="text-sm font-semibold text-slate-700">Intermediary bank</label>
              </div>
              {editingSupplier.hasIntermediaryBank && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Intermediary Bank Name</label>
                    <input className="w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-indigo-500" value={editingSupplier.intermediaryBankName ?? ''} onChange={e => setEditingSupplier({...editingSupplier, intermediaryBankName: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Intermediary Account Holder</label>
                    <input className="w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-indigo-500" value={editingSupplier.intermediaryAccountHolderName ?? ''} onChange={e => setEditingSupplier({...editingSupplier, intermediaryAccountHolderName: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Intermediary Bank Account Number</label>
                    <input className="w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-indigo-500" value={editingSupplier.intermediaryAccountNumber ?? ''} onChange={e => setEditingSupplier({...editingSupplier, intermediaryAccountNumber: e.target.value})} placeholder="e.g. 1234567890" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Intermediary SWIFT</label>
                    <input className="w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-indigo-500" value={editingSupplier.intermediarySwiftCode ?? ''} onChange={e => setEditingSupplier({...editingSupplier, intermediarySwiftCode: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Intermediary Bank Address</label>
                    <textarea rows={2} className="w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-indigo-500" value={editingSupplier.intermediaryBankAddress ?? ''} onChange={e => setEditingSupplier({...editingSupplier, intermediaryBankAddress: e.target.value})} />
                  </div>
                </>
              )}
              <button
                onClick={async () => {
                  try {
                    await onUpdateItem(editingSupplier);
                    setEditingSupplier(null);
                  } catch (err: any) {
                    alert(err?.message || 'Failed to save supplier.');
                  }
                }}
                className="w-full bg-indigo-600 text-white font-bold py-4 rounded-xl mt-4 hover:bg-indigo-700"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupplierMaster;

