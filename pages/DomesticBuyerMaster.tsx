import React, { useState, useEffect, useRef } from 'react';
import { DomesticBuyer, User } from '../types';
import { Search, Plus, X, Eye, Edit3, Trash2, Upload } from 'lucide-react';
import { api } from '../api';
import DomesticBuyerForm from './DomesticBuyerForm';
import { readFirstSheetAsObjects } from '../utils/excel';

interface DomesticBuyerMasterProps {
  user: User;
}

const DomesticBuyerMaster: React.FC<DomesticBuyerMasterProps> = () => {
  const [buyers, setBuyers] = useState<DomesticBuyer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [viewing, setViewing] = useState<DomesticBuyer | null>(null);
  const [editing, setEditing] = useState<DomesticBuyer | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    try {
      const list = await api.domesticBuyers.list();
      setBuyers(Array.isArray(list) ? list : []);
    } catch (e) {
      console.error(e);
      setBuyers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = buyers.filter(
    (b) =>
      b.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (b.state || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (b.gstNo || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAdd = async (b: DomesticBuyer) => {
    try {
      await api.domesticBuyers.create(b);
      await load();
      setShowAddForm(false);
    } catch (e: any) {
      alert(e?.message || 'Failed to create domestic buyer.');
    }
  };
  const handleUpdate = async (b: DomesticBuyer) => {
    try {
      await api.domesticBuyers.update(b.id, b);
      await load();
      setEditing(null);
    } catch (e: any) {
      alert(e?.message || 'Failed to update domestic buyer.');
    }
  };
  const handleDelete = async (id: string) => {
    if (!confirm('Delete this domestic buyer?')) return;
    try {
      await api.domesticBuyers.delete(id);
      await load();
      setViewing(null);
      setEditing(null);
    } catch (e: any) {
      alert(e?.message || 'Failed to delete domestic buyer.');
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const json = await readFirstSheetAsObjects(file) as any[];
      const rows = json.map((r) => {
        const name = r['Customer Name'] ?? r.name ?? r['CustomerName'] ?? '';
        const billingAddress = r['Billing Address'] ?? r.billingAddress ?? r['BillingAddress'] ?? '';
        const state = r.State ?? r.state ?? '';
        const gstNo = r['GST No'] ?? r.gstNo ?? r.GST ?? r.gst ?? '';
        const mobile = r.Mobile ?? r.mobile ?? r.Phone ?? r.phone ?? '';
        const salesPersonName = r['Sales Person Name'] ?? r.salesPersonName ?? '';
        const salesPersonMobile = r['Sales Person Mobile'] ?? r.salesPersonMobile ?? '';
        const salesPersonEmail = r['Sales Person Email'] ?? r.salesPersonEmail ?? '';
        const paymentTerms = r['Payment Terms'] ?? r.paymentTerms ?? r['PaymentTerm'] ?? '';
        const siteName = r['Ship Site Name'] ?? r['Consignee Name'] ?? r.siteName ?? r['ShipSiteName'] ?? '';
        const shippingAddress = r['Shipping Address'] ?? r['Consignee Address'] ?? r.shippingAddress ?? '';
        return {
          id: 'db_' + Math.random().toString(36).slice(2, 11),
          name,
          billingAddress,
          state,
          gstNo,
          mobile,
          salesPersonName,
          salesPersonMobile,
          salesPersonEmail,
          paymentTerms,
          sites: siteName || shippingAddress ? [{ id: 's_' + Math.random().toString(36).slice(2, 11), siteName, shippingAddress }] : [],
        };
      });
      if (rows.length === 0) {
        alert('No data rows found in the sheet. Use columns: Customer Name, Billing Address, State, GST No, Mobile, Sales Person Name/Mobile/Email, Payment Terms, Ship Site Name, Shipping Address.');
        return;
      }
      const result = await api.domesticBuyers.import(rows);
      const imported = Number((result as any)?.imported ?? rows.length);
      const skipped = Number((result as any)?.skipped || 0);
      alert(skipped > 0
        ? `Imported ${imported} domestic buyer(s), skipped ${skipped} duplicate row(s).`
        : `Imported ${imported} domestic buyer(s).`);
      await load();
    } catch (err: any) {
      alert(err?.message || 'Import failed.');
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-24">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Domestic Buyers</h1>
          <p className="text-slate-500 font-medium">Manage India-based customers for sales indent.</p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full md:w-auto">
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
          <button onClick={() => fileInputRef.current?.click()} disabled={importing} className="w-full sm:w-auto px-4 py-3 md:py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-sm hover:bg-slate-200 flex items-center justify-center gap-2 disabled:opacity-50 min-h-[44px] md:min-h-0">
            <Upload size={16} /> {importing ? 'Importing...' : 'Import from Excel'}
          </button>
          <button
            onClick={() => setShowAddForm(true)}
            className="w-full sm:w-auto px-6 py-3 bg-rose-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-rose-700 transition-all shadow-lg shadow-rose-100 min-h-[44px] md:min-h-0"
          >
            <Plus size={18} /> New Domestic Buyer
          </button>
          <div className="relative w-full sm:w-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search..."
              className="pl-12 pr-6 py-3 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-rose-500 shadow-sm w-full sm:w-64"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </header>

      {showAddForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-slate-50 w-full max-w-3xl max-h-[90vh] rounded-[2.5rem] shadow-2xl overflow-y-auto p-8 relative">
            <button onClick={() => setShowAddForm(false)} className="absolute top-8 right-8 p-2 hover:bg-slate-200 rounded-full"><X size={24} className="text-slate-500" /></button>
            <DomesticBuyerForm onSubmit={handleAdd} onCancel={() => setShowAddForm(false)} />
          </div>
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 p-12 text-center text-slate-500">Loading...</div>
      ) : (
        <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto scroll-touch">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-6 py-5 text-left text-xs font-black text-slate-400 uppercase tracking-widest">Buyer</th>
                <th className="px-6 py-5 text-left text-xs font-black text-slate-400 uppercase tracking-widest">State / GST</th>
                <th className="px-6 py-5 text-left text-xs font-black text-slate-400 uppercase tracking-widest">Contact</th>
                <th className="px-6 py-5 text-right text-xs font-black text-slate-400 uppercase tracking-widest">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((b) => (
                <tr key={b.id} className="hover:bg-rose-50/20 transition-colors">
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-rose-100 text-rose-700 font-bold flex items-center justify-center rounded-xl">{b.name.charAt(0)}</div>
                      <div>
                        <p className="font-bold text-slate-900">{b.name}</p>
                        <p className="text-xs text-slate-500 line-clamp-1 max-w-xs">{b.billingAddress}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <span className="text-sm font-semibold text-slate-600">{b.state || '—'}</span>
                    {b.gstNo && <span className="block text-xs text-slate-400">{b.gstNo}</span>}
                  </td>
                  <td className="px-6 py-5 text-sm text-slate-600">{b.mobile || '—'}</td>
                  <td className="px-6 py-5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => setViewing(b)} className="p-2 text-slate-400 hover:text-rose-600 rounded-lg" title="View"><Eye size={18} /></button>
                      <button onClick={() => setEditing(b)} className="p-2 text-slate-400 hover:text-rose-600 rounded-lg" title="Edit"><Edit3 size={18} /></button>
                      <button onClick={() => handleDelete(b.id)} className="p-2 text-slate-400 hover:text-red-500 rounded-lg" title="Delete"><Trash2 size={18} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          {filtered.length === 0 && (
            <div className="p-12 text-center text-slate-500">No domestic buyers found. Add one to use in Sales Indent.</div>
          )}
        </div>
      )}

      {viewing && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-8 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-xl font-black text-slate-900">Domestic Buyer</h2>
              <button onClick={() => setViewing(null)} className="p-2 hover:bg-slate-100 rounded-full"><X size={22} /></button>
            </div>
            <div className="p-8 space-y-6">
              <div><span className="text-xs font-bold text-slate-400 uppercase">Name</span><p className="text-slate-900 font-semibold mt-1">{viewing.name}</p></div>
              <div><span className="text-xs font-bold text-slate-400 uppercase">Billing Address</span><p className="text-slate-700 mt-1 whitespace-pre-wrap">{viewing.billingAddress || '—'}</p></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><span className="text-xs font-bold text-slate-400 uppercase">State</span><p className="text-slate-700 mt-1">{viewing.state || '—'}</p></div>
                <div><span className="text-xs font-bold text-slate-400 uppercase">GST No</span><p className="text-slate-700 mt-1">{viewing.gstNo || '—'}</p></div>
              </div>
              <div><span className="text-xs font-bold text-slate-400 uppercase">Mobile</span><p className="text-slate-700 mt-1">{viewing.mobile || '—'}</p></div>
              <div><span className="text-xs font-bold text-slate-400 uppercase">Sales Person</span><p className="text-slate-700 mt-1">{viewing.salesPersonName || '—'} {viewing.salesPersonMobile && ` · ${viewing.salesPersonMobile}`}</p></div>
              <div><span className="text-xs font-bold text-slate-400 uppercase">Payment Terms</span><p className="text-slate-700 mt-1">{viewing.paymentTerms || '—'}</p></div>
              {viewing.sites?.length ? (
                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase">Consignee Sites</span>
                  <ul className="mt-2 space-y-2">
                    {viewing.sites.map((s) => (
                      <li key={s.id} className="p-3 bg-slate-50 rounded-xl text-sm"><span className="font-semibold">{s.siteName || '—'}</span><p className="text-slate-600 mt-1">{s.shippingAddress}</p></li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-slate-50 w-full max-w-3xl max-h-[90vh] rounded-[2.5rem] shadow-2xl overflow-y-auto p-8 relative">
            <button onClick={() => setEditing(null)} className="absolute top-8 right-8 p-2 hover:bg-slate-200 rounded-full"><X size={24} className="text-slate-500" /></button>
            <DomesticBuyerForm initialBuyer={editing} onSubmit={handleUpdate} onCancel={() => setEditing(null)} />
          </div>
        </div>
      )}
    </div>
  );
};

export default DomesticBuyerMaster;
