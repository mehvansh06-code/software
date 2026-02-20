import React, { useState, useEffect, useRef } from 'react';
import { IndentProduct } from '../types';
import { Search, Plus, X, Edit3, Trash2, Upload } from 'lucide-react';
import { api } from '../api';
import { readFirstSheetAsObjects } from '../utils/excel';

export const IndentProductsMaster: React.FC = () => {
  const [products, setProducts] = useState<IndentProduct[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<IndentProduct | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    try {
      const list = await api.indentProducts.list();
      setProducts(Array.isArray(list) ? list : []);
    } catch (e) {
      console.error(e);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = products.filter(
    (p) =>
      p.quality.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.designNo || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.shadeNo || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this product?')) return;
    try {
      await api.indentProducts.delete(id);
      await load();
      setEditing(null);
    } catch (err: any) {
      alert(err?.message || 'Failed to delete product.');
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const json = await readFirstSheetAsObjects(file) as any[];
      const rows = json.map((r) => {
        const quality = r.Quality ?? r.quality ?? '';
        const desc = r.Description ?? r.Desc ?? r.description ?? '';
        const design = r['Design No'] ?? r.designNo ?? r.Design ?? r.design ?? '';
        const shade = r['Shade No'] ?? r.shadeNo ?? r.Shade ?? r.shade ?? '';
        const hsn = r['HSN Code'] ?? r.hsnCode ?? r.HSN ?? r.hsn ?? '';
        const unit = r.Unit ?? r.unit ?? 'MTR';
        const rateInr = parseFloat(r['Base Rate'] ?? r['Rate INR'] ?? r.rateInr ?? r.INR ?? 0) || 0;
        const rateUsd = parseFloat(r['Rate USD'] ?? r.rateUsd ?? r.USD ?? 0) || 0;
        const rateGbp = parseFloat(r['Rate GBP'] ?? r.rateGbp ?? r.GBP ?? r.POUND ?? 0) || 0;
        return {
          id: 'ip_' + Math.random().toString(36).slice(2, 11),
          quality,
          description: desc,
          designNo: design,
          shadeNo: shade,
          hsnCode: hsn,
          unit,
          rateInr,
          rateUsd,
          rateGbp,
        };
      }).filter((r) => r.quality);
      if (rows.length === 0) {
        alert('No rows with Quality found. Use columns: Quality, Description, Design No, Shade No, HSN Code, Unit, Base Rate / Rate INR, Rate USD, Rate GBP.');
        return;
      }
      const result = await api.indentProducts.import(rows);
      const imported = Number((result as any)?.imported ?? rows.length);
      const skipped = Number((result as any)?.skipped || 0);
      alert(skipped > 0
        ? `Imported ${imported} product(s), skipped ${skipped} duplicate row(s).`
        : `Imported ${imported} product(s).`);
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
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Indent Products</h1>
          <p className="text-slate-500 font-medium">Product master for sales indent (quality, design, shade, rates).</p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full md:w-auto">
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="w-full sm:w-auto px-4 py-3 md:py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-sm hover:bg-slate-200 flex items-center justify-center gap-2 disabled:opacity-50 min-h-[44px] md:min-h-0"
          >
            <Upload size={16} /> {importing ? 'Importing...' : 'Import from Excel'}
          </button>
          <div className="relative w-full sm:w-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search quality, design, shade..."
              className="pl-10 pr-4 py-3 md:py-2.5 rounded-xl border border-slate-200 w-full sm:w-64 outline-none focus:ring-2 focus:ring-rose-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </header>

      {loading ? (
        <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 p-12 text-center text-slate-500">Loading...</div>
      ) : (
        <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto scroll-touch">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-3 text-left font-black text-slate-500 uppercase">Quality</th>
                <th className="px-4 py-3 text-left font-black text-slate-500 uppercase">Design</th>
                <th className="px-4 py-3 text-left font-black text-slate-500 uppercase">Shade</th>
                <th className="px-4 py-3 text-left font-black text-slate-500 uppercase">Description</th>
                <th className="px-4 py-3 text-right font-black text-slate-500 uppercase">Rate INR</th>
                <th className="px-4 py-3 text-right font-black text-slate-500 uppercase">Rate USD</th>
                <th className="px-4 py-3 text-right font-black text-slate-500 uppercase">Rate GBP</th>
                <th className="px-4 py-3 text-right font-black text-slate-500 uppercase">Unit</th>
                <th className="w-20"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-b border-slate-100 hover:bg-rose-50/20">
                  <td className="px-4 py-3 font-semibold">{p.quality}</td>
                  <td className="px-4 py-3 text-slate-600">{p.designNo || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{p.shadeNo || '—'}</td>
                  <td className="px-4 py-3 text-slate-600 max-w-xs truncate">{p.description}</td>
                  <td className="px-4 py-3 text-right">{p.rateInr}</td>
                  <td className="px-4 py-3 text-right">{p.rateUsd}</td>
                  <td className="px-4 py-3 text-right">{p.rateGbp}</td>
                  <td className="px-4 py-3 text-right">{p.unit}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => setEditing(p)} className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg"><Edit3 size={16} /></button>
                    <button onClick={() => handleDelete(p.id)} className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg"><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          {filtered.length === 0 && (
            <div className="p-12 text-center text-slate-500">No products. Import from Excel or add manually.</div>
          )}
        </div>
      )}

      {editing && (
        <EditProductModal
          product={editing}
          onSave={async (p) => {
            try {
              await api.indentProducts.update(p.id, p);
              await load();
              setEditing(null);
            } catch (err: any) {
              alert(err?.message || 'Failed to save product.');
            }
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
};

function EditProductModal({ product, onSave, onClose }: { product: IndentProduct; onSave: (p: IndentProduct) => Promise<void>; onClose: () => void }) {
  const [form, setForm] = useState({ ...product });
  const [saving, setSaving] = useState(false);
  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg rounded-[2rem] shadow-2xl p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-black text-slate-900">Edit Product</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full"><X size={22} /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Quality</label>
            <input className="w-full px-3 py-2 rounded-xl border border-slate-200" value={form.quality} onChange={(e) => setForm({ ...form, quality: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Design No</label>
              <input className="w-full px-3 py-2 rounded-xl border border-slate-200" value={form.designNo} onChange={(e) => setForm({ ...form, designNo: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Shade No</label>
              <input className="w-full px-3 py-2 rounded-xl border border-slate-200" value={form.shadeNo} onChange={(e) => setForm({ ...form, shadeNo: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Description</label>
            <input className="w-full px-3 py-2 rounded-xl border border-slate-200" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">HSN Code</label>
            <input className="w-full px-3 py-2 rounded-xl border border-slate-200" value={form.hsnCode} onChange={(e) => setForm({ ...form, hsnCode: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Unit</label>
            <input className="w-full px-3 py-2 rounded-xl border border-slate-200" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Rate INR</label>
              <input type="number" step={0.01} className="w-full px-3 py-2 rounded-xl border border-slate-200" value={form.rateInr} onChange={(e) => setForm({ ...form, rateInr: parseFloat(e.target.value) || 0 })} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Rate USD</label>
              <input type="number" step={0.01} className="w-full px-3 py-2 rounded-xl border border-slate-200" value={form.rateUsd} onChange={(e) => setForm({ ...form, rateUsd: parseFloat(e.target.value) || 0 })} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Rate GBP</label>
              <input type="number" step={0.01} className="w-full px-3 py-2 rounded-xl border border-slate-200" value={form.rateGbp} onChange={(e) => setForm({ ...form, rateGbp: parseFloat(e.target.value) || 0 })} />
            </div>
          </div>
        </div>
        <div className="mt-8 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-6 py-2.5 rounded-xl font-bold text-slate-500 hover:bg-slate-100">Cancel</button>
          <button
            type="button"
            onClick={async () => {
              setSaving(true);
              await onSave(form);
              setSaving(false);
            }}
            disabled={saving}
            className="px-6 py-2.5 rounded-xl font-bold bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default IndentProductsMaster;
