import React, { useState, useEffect, useRef } from 'react';
import { Material } from '../types';
import { Search, Plus, Edit3, Trash2, Upload, FileDown } from 'lucide-react';
import { api } from '../api';
import { usePermissions } from '../hooks/usePermissions';
import { STANDARDISED_UNITS } from '../types';
import { downloadAoaAsXlsx, readFirstSheetAsObjects } from '../utils/excel';

const MaterialsMaster: React.FC = () => {
  const { hasPermission } = usePermissions();
  const canDelete = hasPermission('materials.delete');
  const [materials, setMaterials] = useState<Material[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Material | null>(null);
  const [form, setForm] = useState({ name: '', description: '', hsnCode: '', unit: 'KGS', type: 'RAW_MATERIAL' });
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const list = await api.materials.list();
    setMaterials(Array.isArray(list) ? list : []);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = materials.filter(m =>
    m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (m.hsnCode || '').includes(searchTerm)
  );

  const handleSave = async () => {
    if (!form.name.trim()) return;
    try {
      if (editing) {
        const response = await api.materials.update(editing.id, { ...editing, ...form, version: editing.version });
        const nextVersion = response && typeof response.version === 'number' ? response.version : editing.version;
        setMaterials(prev => prev.map(m => m.id === editing.id ? { ...m, ...form, version: nextVersion } : m));
      } else {
        const newMat: Material = {
          id: Math.random().toString(36).substr(2, 9),
          ...form,
          unit: form.unit || 'KGS',
        };
        const response = await api.materials.create(newMat);
        const createdVersion = response && typeof response.version === 'number' ? response.version : 1;
        setMaterials(prev => [...prev, { ...newMat, version: createdVersion }]);
      }
      setShowForm(false);
      setEditing(null);
      setForm({ name: '', description: '', hsnCode: '', unit: 'KGS', type: 'RAW_MATERIAL' });
    } catch (err: any) {
      alert(err?.message || 'Failed to save material.');
    }
  };

  const openEdit = (m: Material) => {
    setEditing(m);
    setForm({
      name: m.name,
      description: m.description || '',
      hsnCode: m.hsnCode || '',
      unit: m.unit || 'KGS',
      type: m.type || 'RAW_MATERIAL',
    });
    setShowForm(true);
  };

  const handleDelete = async (m: Material) => {
    if (!window.confirm(`Delete material "${m.name}"? This cannot be undone.`)) return;
    try {
      await api.materials.delete(m.id);
      setMaterials(prev => prev.filter(x => x.id !== m.id));
    } catch (err: any) {
      alert(err?.message || 'Failed to delete material.');
    }
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const json = await readFirstSheetAsObjects(file) as any[];
      const rows = json.map((r) => ({
        name: r.Name ?? r.name ?? r['Material Name'] ?? '',
        description: r.Description ?? r.description ?? '',
        hsnCode: r['HSN Code'] ?? r.hsnCode ?? r.HSN ?? '',
        unit: r.Unit ?? r.unit ?? 'KGS',
        type: r.Type ?? r.type ?? 'RAW_MATERIAL',
      }));
      if (rows.length === 0) {
        alert('No data rows found in the sheet. Use the Download template for the correct column format.');
        return;
      }
      const result = await api.materials.import(rows);
      const count = (result as any)?.imported ?? rows.length;
      const skipped = Number((result as any)?.skipped || 0);
      alert(skipped > 0
        ? `Imported ${count} material(s), skipped ${skipped} duplicate row(s).`
        : `Imported ${count} material(s).`);
      await load();
    } catch (err: any) {
      alert(err?.message || 'Import failed.');
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  const downloadMaterialsTemplate = async () => {
    const headers = ['Name', 'Description', 'HSN Code', 'Unit', 'Type'];
    await downloadAoaAsXlsx('materials_import_template.xlsx', 'Materials', [
      headers,
      ['Cotton Yarn 40s', 'Combed cotton', '5205', 'KGS', 'RAW_MATERIAL'],
    ]);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-24">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Materials Master</h1>
          <p className="text-slate-500 font-medium">Materials we import — select these when creating a shipment.</p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full md:w-auto">
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportExcel} />
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={importing} className="w-full sm:w-auto px-4 py-3 md:py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-sm hover:bg-slate-200 flex items-center justify-center gap-2 disabled:opacity-50 transition-all min-h-[44px] md:min-h-0">
            <Upload size={16} /> {importing ? 'Importing...' : 'Import from Excel'}
          </button>
          <button type="button" onClick={downloadMaterialsTemplate} className="w-full sm:w-auto px-4 py-3 md:py-2.5 rounded-xl bg-slate-100 text-slate-600 font-bold text-sm hover:bg-slate-200 flex items-center justify-center gap-2 min-h-[44px] md:min-h-0" title="Download template">
            <FileDown size={16} /> Download template
          </button>
          <button
            onClick={() => { setEditing(null); setForm({ name: '', description: '', hsnCode: '', unit: 'KGS', type: 'RAW_MATERIAL' }); setShowForm(true); }}
            className="w-full sm:w-auto px-6 py-3 bg-indigo-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 min-h-[44px] md:min-h-0"
          >
            <Plus size={18} /> New Material
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

      {showForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl p-8">
            <h2 className="text-xl font-black text-slate-900 mb-6">{editing ? 'Edit Material' : 'Add Material'}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Name</label>
                <input required className="w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-indigo-500" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Cotton Yarn" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Description (optional)</label>
                <input className="w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-indigo-500" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Short description" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">HSN Code</label>
                  <input className="w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-indigo-500" value={form.hsnCode} onChange={e => setForm({ ...form, hsnCode: e.target.value })} placeholder="e.g. 5205" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Unit</label>
                  <select className="w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-indigo-500" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}>
                    {STANDARDISED_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Type</label>
                <select className="w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-indigo-500" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                  <option value="RAW_MATERIAL">Raw Material</option>
                  <option value="CAPITAL_GOOD">Capital Good</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-8">
              <button type="button" onClick={() => { setShowForm(false); setEditing(null); }} className="flex-1 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100">Cancel</button>
              <button onClick={handleSave} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700">Save</button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
        <div className="md:hidden p-3 space-y-3">
          {filtered.map((m) => (
            <article key={m.id} className="rounded-2xl border border-slate-200 bg-white p-3 space-y-2 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-black text-slate-900 truncate">{m.name}</p>
                  {m.description && <p className="text-[11px] text-slate-500 truncate">{m.description}</p>}
                </div>
                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wide bg-slate-100 text-slate-700">
                  {m.type || '—'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-slate-50 border border-slate-100 p-2">
                  <p className="text-[9px] font-black uppercase text-slate-400">HSN</p>
                  <p className="text-[11px] font-bold text-slate-700">{m.hsnCode || '—'}</p>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-100 p-2">
                  <p className="text-[9px] font-black uppercase text-slate-400">Unit</p>
                  <p className="text-[11px] font-bold text-slate-700">{m.unit}</p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button onClick={() => openEdit(m)} className="px-3 py-2 rounded-xl border border-slate-200 text-[12px] font-bold text-slate-700 bg-white hover:bg-slate-50">Edit</button>
                {canDelete && (
                  <button onClick={() => handleDelete(m)} className="px-3 py-2 rounded-xl border border-red-200 text-[12px] font-bold text-red-600 bg-red-50 hover:bg-red-100">Delete</button>
                )}
              </div>
            </article>
          ))}
        </div>
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-6 py-5 text-left text-xs font-black text-slate-400 uppercase tracking-widest">Material</th>
                <th className="px-6 py-5 text-left text-xs font-black text-slate-400 uppercase tracking-widest">HSN</th>
                <th className="px-6 py-5 text-left text-xs font-black text-slate-400 uppercase tracking-widest">Unit</th>
                <th className="px-6 py-5 text-left text-xs font-black text-slate-400 uppercase tracking-widest">Type</th>
                <th className="px-6 py-5 text-right text-xs font-black text-slate-400 uppercase tracking-widest">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-5">
                    <p className="font-bold text-slate-900">{m.name}</p>
                    {m.description && <p className="text-xs text-slate-500 mt-0.5">{m.description}</p>}
                  </td>
                  <td className="px-6 py-5 font-mono text-sm text-slate-600">{m.hsnCode || '—'}</td>
                  <td className="px-6 py-5 text-sm font-bold text-slate-700">{m.unit}</td>
                  <td className="px-6 py-5">
                    <span className="text-[10px] font-black px-2 py-0.5 rounded uppercase bg-slate-100 text-slate-600">{m.type || '—'}</span>
                  </td>
                  <td className="px-6 py-5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(m)} className="p-2 text-slate-400 hover:text-indigo-600 rounded-lg transition-all" title="Edit"><Edit3 size={18} /></button>
                      {canDelete && (
                        <button onClick={() => handleDelete(m)} className="p-2 text-slate-400 hover:text-red-600 rounded-lg transition-all" title="Delete"><Trash2 size={18} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="p-12 text-center text-slate-500 font-medium">No materials yet. Add materials you import so they can be selected when creating a shipment.</div>
        )}
      </div>
    </div>
  );
};

export default MaterialsMaster;
