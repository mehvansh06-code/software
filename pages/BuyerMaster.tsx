import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Buyer, User, UserRole, SupplierStatus, Consignee } from '../types';
import { Search, CheckCircle, XCircle, Clock, CheckSquare, Square, Plus, X, Eye, Edit3, Upload, FileDown } from 'lucide-react';
import BuyerRequest from './BuyerRequest';
import { api } from '../api';
import { downloadAoaAsXlsx, readFirstSheetAsObjects } from '../utils/excel';

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
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
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

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterStatus, buyers.length]);

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
      });
      if (rows.length === 0) {
        alert('No data rows found in the sheet. Use the Download template for the correct column format.');
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

  const downloadBuyerTemplate = async () => {
    const headers = ['Name', 'Address', 'Country', 'Bank Name', 'Account Holder', 'Account Number', 'SWIFT Code', 'Bank Address', 'Contact Person', 'Contact Number', 'Contact Email', 'Sales Person Name', 'Sales Person Contact', 'Consignee Name', 'Consignee Address'];
    await downloadAoaAsXlsx('buyers_import_template.xlsx', 'Buyers', [
      headers,
      ['London Fashion Hub', '22 Savile Row, London', 'United Kingdom', 'Barclays Bank', 'London Fashion Hub PLC', '12345678', 'BARCGB22XXX', 'Canary Wharf, London', 'James Miller', '+44 20 7123 4567', 'james@londonfashion.co.uk', 'Rahul Sharma', '9876543210', '', ''],
    ]);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-24">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Global Buyer Network</h1>
          <p className="text-slate-500 font-medium">Manage and audit your international clientele.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 w-full md:w-auto">
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportExcel} />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="w-full sm:w-auto px-4 py-3 md:py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-sm hover:bg-slate-200 flex items-center justify-center gap-2 disabled:opacity-50 transition-all min-h-[44px] md:min-h-0"
          >
            <Upload size={16} /> {importing ? 'Importing...' : 'Import from Excel'}
          </button>
          <button type="button" onClick={downloadBuyerTemplate} className="w-full sm:w-auto px-4 py-3 md:py-2.5 rounded-xl bg-slate-100 text-slate-600 font-bold text-sm hover:bg-slate-200 flex items-center justify-center gap-2 min-h-[44px] md:min-h-0" title="Download template">
            <FileDown size={16} /> Download template
          </button>
          <button 
            onClick={() => setShowAddForm(true)}
            className="w-full sm:w-auto px-6 py-3 bg-amber-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-amber-700 transition-all shadow-lg shadow-amber-100 min-h-[44px] md:min-h-0"
          >
            <Plus size={18} /> New Buyer
          </button>
          <div className="relative w-full sm:w-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Search..." 
              className="pl-12 pr-6 py-3 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-amber-500 shadow-sm w-full sm:w-64"
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
        <div className="bg-amber-600 p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3 text-white shadow-xl">
          <div className="flex items-center gap-4">
            <span className="text-sm font-black uppercase tracking-widest">{selectedIds.length} Buyers Selected</span>
          </div>
          <div className="flex flex-col sm:flex-row flex-wrap gap-2 w-full md:w-auto">
            <button onClick={() => handleBulkAction(SupplierStatus.APPROVED)} className="w-full sm:w-auto px-6 py-3 md:py-2 bg-emerald-500 rounded-xl font-bold flex items-center justify-center gap-2 shadow-sm min-h-[44px] md:min-h-0"><CheckCircle size={16} /> Approve</button>
            <button onClick={() => handleBulkAction(SupplierStatus.REJECTED)} className="w-full sm:w-auto px-6 py-3 md:py-2 bg-red-500 rounded-xl font-bold flex items-center justify-center gap-2 shadow-sm min-h-[44px] md:min-h-0"><XCircle size={16} /> Reject</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-6 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold text-slate-600">
            Showing {startRow}-{endRow} of {totalRows} buyers
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
              No buyers found.
            </div>
          ) : (
            pagedFiltered.map((b) => (
              <article key={b.id} className={`rounded-2xl border p-3 space-y-3 shadow-sm ${selectedIds.includes(b.id) ? 'border-amber-300 bg-amber-50/30' : 'border-slate-200 bg-white'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-slate-900 truncate">{b.name}</p>
                    <p className="text-[11px] text-slate-500 truncate">{b.country}</p>
                  </div>
                  <button onClick={() => toggleSelect(b.id)} className="p-2 rounded-lg border border-slate-200 bg-white shrink-0" title="Select">
                    {selectedIds.includes(b.id) ? <CheckSquare className="text-amber-600" size={18} /> : <Square className="text-slate-300" size={18} />}
                  </button>
                </div>
                <div>
                  <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-black uppercase ${
                    b.status === SupplierStatus.APPROVED ? 'bg-emerald-100 text-emerald-700' :
                    b.status === SupplierStatus.PENDING ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {b.status === SupplierStatus.APPROVED ? <CheckCircle size={12} /> : <Clock size={12} />}
                    {b.status}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setViewingBuyer(b)} className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-[12px] font-bold text-slate-700 bg-white hover:bg-slate-50">View</button>
                  {canEdit && (
                    <button onClick={() => setEditingBuyer({ ...b })} className="flex-1 px-3 py-2 rounded-xl border border-amber-200 text-[12px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-100">Edit</button>
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
            {pagedFiltered.map((b) => (
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

