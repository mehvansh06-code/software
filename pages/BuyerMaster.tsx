import React, { useState, useRef } from 'react';
import { Buyer, User, UserRole, SupplierStatus, Consignee } from '../types';
import { Search, CheckCircle, XCircle, Clock, CheckSquare, Square, Plus, X, Eye, Edit3, Upload, FileDown } from 'lucide-react';
import BuyerRequest from './BuyerRequest';
import { api } from '../api';
import * as XLSX from 'xlsx';

interface BuyerMasterProps {
  buyers: Buyer[];
  user: User;
  onUpdateItem: (updated: Buyer) => Promise<void>;
  onAddItem: (item: Buyer) => Promise<void>;
  onRefreshData?: () => Promise<void>;
}

const BuyerMaster: React.FC<BuyerMasterProps> = ({ buyers, user, onUpdateItem, onAddItem, onRefreshData }) => {
  const [filterStatus, setFilterStatus] = useState<SupplierStatus | 'ALL'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [viewingBuyer, setViewingBuyer] = useState<Buyer | null>(null);
  const [editingBuyer, setEditingBuyer] = useState<Buyer | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canApprove = user.role === UserRole.MANAGEMENT || user.role === UserRole.CHECKER;
  const canEdit = user.role === UserRole.MANAGEMENT || user.role === UserRole.CHECKER;

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

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(ws) as any[];
      const rows = json.map((r) => {
        const name = r.Name ?? r.name ?? r['Legal Name'] ?? r['Buyer Name'] ?? '';
        const address = r.Address ?? r.address ?? r['Billing Address'] ?? '';
        const country = r.Country ?? r.country ?? '';
        const bankName = r['Bank Name'] ?? r.bankName ?? r.Bank ?? '';
        const accountHolder = r['Account Holder'] ?? r['A/C Holder'] ?? r.accountHolderName ?? r.AccountHolder ?? '';
        const accountNumber = r['Account Number'] ?? r.accountNumber ?? r.account_number ?? '';
        const swift = r.SWIFT ?? r.Swift ?? r.swiftCode ?? r['SWIFT Code'] ?? '';
        const bankAddress = r['Bank Address'] ?? r.bankAddress ?? '';
        const contactPerson = r['Contact Person'] ?? r.contactPerson ?? r['Contact Name'] ?? '';
        const contactNumber = r['Contact Number'] ?? r['Phone'] ?? r.contactNumber ?? r.Mobile ?? '';
        const contactEmail = r['Contact Email'] ?? r.Email ?? r.contactEmail ?? '';
        const contactDetails = [contactNumber, contactEmail].filter(Boolean).join(' / ') || undefined;
        const salesName = r['Sales Person Name'] ?? r.salesPersonName ?? r['Sales Person'] ?? '';
        const salesContact = r['Sales Person Contact'] ?? r['Sales Contact'] ?? r.salesPersonContact ?? r.salesPersonMobile ?? '';
        const consigneeName = r['Consignee Name'] ?? r.consigneeName ?? '';
        const consigneeAddr = r['Consignee Address'] ?? r.consigneeAddress ?? r['Shipping Address'] ?? '';
        const consignees: Consignee[] = consigneeName || consigneeAddr ? [{ id: 'c_' + Math.random().toString(36).slice(2, 11), name: consigneeName || 'Consignee', address: consigneeAddr || '' }] : [];
        return {
          id: 'b_' + Math.random().toString(36).slice(2, 11),
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
          contactNumber,
          contactEmail,
          salesPersonName: salesName,
          salesPersonContact: salesContact,
          hasConsignee: consignees.length > 0,
          status: 'APPROVED',
          requestedBy: 'Import',
          createdAt: new Date().toISOString(),
          consignees,
        };
      }).filter((r) => r.name && r.country);
      if (rows.length === 0) {
        alert('No rows with Name and Country found. Use the Download template for the correct column format.');
        return;
      }
      const result = await api.buyers.import(rows);
      const count = (result as any)?.imported ?? rows.length;
      if (onRefreshData) {
        await onRefreshData();
        setFilterStatus('ALL');
        setSearchTerm('');
        alert(`Imported ${count} buyer(s). List updated.`);
      } else {
        alert(`Imported ${count} buyer(s). Refreshing the list.`);
        window.location.reload();
      }
    } catch (err: any) {
      alert(err?.message || 'Import failed.');
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  const downloadBuyerTemplate = () => {
    const headers = ['Name', 'Address', 'Country', 'Bank Name', 'Account Holder', 'Account Number', 'SWIFT Code', 'Bank Address', 'Contact Person', 'Contact Number', 'Contact Email', 'Sales Person Name', 'Sales Person Contact', 'Consignee Name', 'Consignee Address'];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, ['London Fashion Hub', '22 Savile Row, London', 'United Kingdom', 'Barclays Bank', 'London Fashion Hub PLC', '12345678', 'BARCGB22XXX', 'Canary Wharf, London', 'James Miller', '+44 20 7123 4567', 'james@londonfashion.co.uk', 'Rahul Sharma', '9876543210', '', '']]);
    XLSX.utils.book_append_sheet(wb, ws, 'Buyers');
    XLSX.writeFile(wb, 'buyers_import_template.xlsx');
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-24">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Global Buyer Network</h1>
          <p className="text-slate-500 font-medium">Manage and audit your international clientele.</p>
        </div>
        
        <div className="flex items-center gap-4">
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportExcel} />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-sm hover:bg-slate-200 flex items-center gap-2 disabled:opacity-50 transition-all"
          >
            <Upload size={16} /> {importing ? 'Importing...' : 'Import from Excel'}
          </button>
          <button type="button" onClick={downloadBuyerTemplate} className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-600 font-bold text-sm hover:bg-slate-200 flex items-center gap-2" title="Download template">
            <FileDown size={16} /> Download template
          </button>
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
              <th className="px-6 py-5 text-right text-xs font-black text-slate-400 uppercase tracking-widest">Actions</th>
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
                <td className="px-6 py-5 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => setViewingBuyer(b)} className="p-2 text-slate-400 hover:text-amber-600 rounded-lg transition-all" title="View details"><Eye size={18} /></button>
                    {canEdit && (
                      <button onClick={() => setEditingBuyer({ ...b })} className="p-2 text-slate-400 hover:text-amber-600 rounded-lg transition-all" title="Edit"><Edit3 size={18} /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {viewingBuyer && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-8 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-xl font-black text-slate-900">Buyer Details</h2>
              <button onClick={() => setViewingBuyer(null)} className="p-2 hover:bg-slate-100 rounded-full"><X size={22} /></button>
            </div>
            <div className="p-8 space-y-6">
              <div className="pb-4 border-b border-slate-100">
                <span className="text-xs font-bold text-slate-400 uppercase">Buyer ID</span>
                <p className="text-slate-900 font-mono text-sm mt-1">{viewingBuyer.id}</p>
                <p className="text-slate-500 text-xs mt-1">Use this in shipment Excel import (Buyer ID column), or use the name below (Buyer Name).</p>
              </div>
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase">Legal Name</span>
                <p className="text-slate-900 font-semibold mt-1">{viewingBuyer.name}</p>
              </div>
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase">Country</span>
                <p className="text-slate-900 font-semibold mt-1">{viewingBuyer.country}</p>
              </div>
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase">Address</span>
                <p className="text-slate-700 mt-1 whitespace-pre-wrap">{viewingBuyer.address}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase">Contact Person</span>
                  <p className="text-slate-900 font-semibold mt-1">{viewingBuyer.contactPerson}</p>
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase">Contact Number</span>
                  <p className="text-slate-700 mt-1">{viewingBuyer.contactNumber || '—'}</p>
                </div>
              </div>
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase">Contact Email</span>
                <p className="text-slate-700 mt-1">{viewingBuyer.contactEmail || '—'}</p>
              </div>
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase">Bank Name / SWIFT</span>
                <p className="text-slate-700 mt-1">{viewingBuyer.bankName} — {viewingBuyer.swiftCode}</p>
              </div>
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase">Account Holder</span>
                <p className="text-slate-700 mt-1">{viewingBuyer.accountHolderName}</p>
              </div>
              {viewingBuyer.accountNumber && (
                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase">Account Number</span>
                  <p className="text-slate-700 mt-1 font-mono">{viewingBuyer.accountNumber}</p>
                </div>
              )}
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase">Bank Address</span>
                <p className="text-slate-700 mt-1 whitespace-pre-wrap">{viewingBuyer.bankAddress}</p>
              </div>
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase">Sales Person</span>
                <p className="text-slate-700 mt-1">{viewingBuyer.salesPersonName} — {viewingBuyer.salesPersonContact}</p>
              </div>
              {viewingBuyer.consignees?.length > 0 && (
                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase">Consignees</span>
                  <ul className="mt-2 space-y-2">
                    {viewingBuyer.consignees.map(c => (
                      <li key={c.id} className="p-3 bg-slate-50 rounded-xl text-sm">
                        <span className="font-semibold">{c.name}</span>
                        <p className="text-slate-600 mt-1">{c.address}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase">Status</span>
                <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase mt-1 ${
                  viewingBuyer.status === SupplierStatus.APPROVED ? 'bg-emerald-100 text-emerald-700' :
                  viewingBuyer.status === SupplierStatus.PENDING ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                }`}>
                  {viewingBuyer.status}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {editingBuyer && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-slate-50 w-full max-w-5xl max-h-[90vh] rounded-[2.5rem] shadow-2xl overflow-y-auto p-8 relative">
            <button onClick={() => setEditingBuyer(null)} className="absolute top-8 right-8 p-2 hover:bg-slate-200 rounded-full transition-all">
              <X size={24} className="text-slate-500" />
            </button>
            <BuyerRequest
              user={user}
              initialBuyer={editingBuyer}
              onCancel={() => setEditingBuyer(null)}
              onSubmit={async (b) => { await onUpdateItem(b); setEditingBuyer(null); }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default BuyerMaster;