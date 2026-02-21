import React, { useEffect, useMemo, useState } from 'react';
import { InsurancePolicy, InsuranceCoverageLine, InsuranceType, User } from '../types';
import { api } from '../api';
import { usePermissions } from '../hooks/usePermissions';
import { AlertTriangle, Download, Plus, Shield, Trash2, Upload } from 'lucide-react';

const COMPANY_OPTIONS = ['Western Flotex', 'Gujarat Flotex', 'GTEX Fabrics', 'V&J Furnishings'] as const;
const INSURANCE_TYPES: InsuranceType[] = ['FIRE', 'MARINE', 'EMPLOYEE', 'BURGLARY'];
const LOCATION_OPTIONS = [
  'GFPL Factory',
  'Head Office',
  'GFPL at GTEX',
  'GTEX Factory',
  'V&J Warehouse Panipat',
  'V&J Warehouse Ahmedabad',
  'V&J Warehouse Bangalore',
  'Western Flock Factory',
] as const;

const COVERAGE_TEMPLATE: InsuranceCoverageLine[] = [
  { particulars: 'Stock', sumAssured: 0 },
  { particulars: 'Plant & Machinery', sumAssured: 0 },
  { particulars: 'Furniture & Fixtures', sumAssured: 0 },
  { particulars: 'Electric Instalaion', sumAssured: 0 },
  { particulars: 'Building & Construction', sumAssured: 0 },
  { particulars: 'Others', sumAssured: 0 },
];

function toIsoDate(v: string): string {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function addOneYearIso(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

function daysTo(dateIso: string): number | null {
  if (!dateIso) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const d = new Date(`${dateIso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

interface InsurancePoliciesProps {
  user: User;
}

const InsurancePolicies: React.FC<InsurancePoliciesProps> = ({ user }) => {
  const { hasPermission } = usePermissions(user);
  const canView = hasPermission('insurance.view');
  const canCreate = hasPermission('insurance.create');
  const canDelete = hasPermission('insurance.delete');
  const canEdit = hasPermission('insurance.edit');

  const [policies, setPolicies] = useState<InsurancePolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [policyFile, setPolicyFile] = useState<File | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [managingPolicy, setManagingPolicy] = useState<InsurancePolicy | null>(null);
  const [manageData, setManageData] = useState<InsurancePolicy | null>(null);
  const [manageSaving, setManageSaving] = useState(false);

  const [form, setForm] = useState({
    company: COMPANY_OPTIONS[1],
    brokerName: '',
    brokerContactNumber: '',
    brokerEmail: '',
    insuranceProvider: '',
    policyNumber: '',
    dateOfOpening: '',
    dateOfRenewal: '',
    insuranceType: INSURANCE_TYPES[0],
    location: LOCATION_OPTIONS[0],
    coverage: COVERAGE_TEMPLATE.map((l) => ({ ...l })),
  });

  const load = async () => {
    if (!canView) return;
    setLoading(true);
    try {
      const list = await api.insurance.list();
      const next = Array.isArray(list) ? list : [];
      setPolicies(next);
      setManageData((prev) => {
        if (!prev) return prev;
        const found = next.find((p) => p.id === prev.id);
        if (!found) return null;
        return {
          ...found,
          coverage: Array.isArray(found.coverage) && found.coverage.length > 0 ? found.coverage.map((c) => ({ ...c })) : COVERAGE_TEMPLATE.map((c) => ({ ...c })),
        };
      });
      setManagingPolicy((prev) => {
        if (!prev) return prev;
        const found = next.find((p) => p.id === prev.id);
        return found || null;
      });
    } catch (e: any) {
      alert(e?.message || 'Failed to load insurance policies.');
      setPolicies([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [canView]);

  useEffect(() => {
    if (!form.dateOfOpening) return;
    const open = toIsoDate(form.dateOfOpening);
    setForm((prev) => ({ ...prev, dateOfOpening: open, dateOfRenewal: addOneYearIso(open) }));
  }, [form.dateOfOpening]);

  const totalSumAssured = useMemo(
    () => form.coverage.reduce((sum, row) => sum + (Number(row.sumAssured || 0) || 0), 0),
    [form.coverage]
  );

  const expiringSoon = useMemo(
    () => policies.filter((p) => {
      const d = daysTo(p.dateOfRenewal);
      return d != null && d >= 0 && d <= 30;
    }),
    [policies]
  );
  const overdue = useMemo(
    () => policies.filter((p) => {
      const d = daysTo(p.dateOfRenewal);
      return d != null && d < 0;
    }),
    [policies]
  );

  const updateCoverage = (index: number, value: number) => {
    setForm((prev) => ({
      ...prev,
      coverage: prev.coverage.map((row, i) => (i === index ? { ...row, sumAssured: Number(value) || 0 } : row)),
    }));
  };

  const resetForm = () => {
    setPolicyFile(null);
    setShowAddForm(false);
    setForm({
      company: COMPANY_OPTIONS[1],
      brokerName: '',
      brokerContactNumber: '',
      brokerEmail: '',
      insuranceProvider: '',
      policyNumber: '',
      dateOfOpening: '',
      dateOfRenewal: '',
      insuranceType: INSURANCE_TYPES[0],
      location: LOCATION_OPTIONS[0],
      coverage: COVERAGE_TEMPLATE.map((l) => ({ ...l })),
    });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreate) return;
    if (!form.policyNumber.trim()) return alert('Policy Number is required.');
    if (!form.dateOfOpening) return alert('Date of Opening is required.');
    setSaving(true);
    try {
      const payload = {
        ...form,
        amount: totalSumAssured,
        dateOfOpening: toIsoDate(form.dateOfOpening),
        dateOfRenewal: addOneYearIso(toIsoDate(form.dateOfOpening)),
        coverage: form.coverage,
      };
      const created = await api.insurance.create(payload);
      const id = created?.id as string | undefined;
      if (id && policyFile && canEdit) {
        const uploadResult = await api.insurance.uploadFile(id, policyFile);
        if (!uploadResult.success) throw new Error(uploadResult.error || 'Failed to upload policy copy.');
      }
      await load();
      resetForm();
      alert('Insurance policy saved.');
    } catch (err: any) {
      alert(err?.message || 'Failed to save policy.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (p: InsurancePolicy) => {
    if (!canDelete) return;
    if (!window.confirm(`Delete policy "${p.policyNumber}"? This cannot be undone.`)) return;
    try {
      await api.insurance.delete(p.id);
      if (managingPolicy?.id === p.id) closeManage();
      await load();
    } catch (err: any) {
      alert(err?.message || 'Failed to delete policy.');
    }
  };

  const downloadFile = async (p: InsurancePolicy) => {
    if (!p.policyCopyFilename) return;
    try {
      const blob = await api.insurance.downloadFile(p.id, p.policyCopyFilename);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = p.policyCopyFilename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err?.message || 'Download failed.');
    }
  };

  const uploadForExisting = async (policyId: string, file: File | null) => {
    if (!file || !canEdit) return;
    setUploadingId(policyId);
    try {
      const r = await api.insurance.uploadFile(policyId, file);
      if (!r.success) throw new Error(r.error || 'Upload failed');
      await load();
    } catch (e: any) {
      alert(e?.message || 'Failed to upload file.');
    } finally {
      setUploadingId(null);
    }
  };

  const deleteFile = async (p: InsurancePolicy) => {
    if (!canEdit || !p.policyCopyFilename) return;
    if (!window.confirm('Delete policy copy file?')) return;
    try {
      await api.insurance.deleteFile(p.id, p.policyCopyFilename);
      await load();
    } catch (e: any) {
      alert(e?.message || 'Failed to delete file.');
    }
  };

  const openManage = (p: InsurancePolicy) => {
    setManagingPolicy(p);
    setManageData({
      ...p,
      coverage: Array.isArray(p.coverage) && p.coverage.length > 0 ? p.coverage.map((c) => ({ ...c })) : COVERAGE_TEMPLATE.map((c) => ({ ...c })),
    });
  };

  const closeManage = () => {
    setManagingPolicy(null);
    setManageData(null);
  };

  const updateManageCoverage = (index: number, value: number) => {
    setManageData((prev) => {
      if (!prev) return prev;
      const coverage = prev.coverage.map((row, i) => (i === index ? { ...row, sumAssured: Number(value) || 0 } : row));
      const total = coverage.reduce((sum, row) => sum + (Number(row.sumAssured || 0) || 0), 0);
      return { ...prev, coverage, totalSumAssured: total };
    });
  };

  const saveManage = async () => {
    if (!manageData) return;
    if (!canEdit) return;
    if (!manageData.policyNumber?.trim()) return alert('Policy Number is required.');
    if (!manageData.dateOfOpening) return alert('Date of Opening is required.');
    setManageSaving(true);
    try {
      const payload = {
        ...manageData,
        amount: Number(manageData.totalSumAssured || 0) || 0,
        dateOfOpening: toIsoDate(manageData.dateOfOpening),
        dateOfRenewal: addOneYearIso(toIsoDate(manageData.dateOfOpening)),
      };
      await api.insurance.update(manageData.id, payload);
      await load();
      closeManage();
      alert('Policy updated.');
    } catch (e: any) {
      alert(e?.message || 'Failed to update policy.');
    } finally {
      setManageSaving(false);
    }
  };

  if (!canView) {
    return <div className="p-10 text-center text-slate-500 font-semibold">You do not have permission to view insurance policies.</div>;
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-24">
      <header>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Insurance Policies</h1>
        <p className="text-slate-500 font-medium">Track policy details, coverage and renewal reminders.</p>
      </header>

      {canCreate && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            className="px-5 py-3 rounded-xl bg-cyan-700 text-white font-bold hover:bg-cyan-800 flex items-center gap-2 min-h-[44px]"
          >
            <Plus size={16} /> New Policy
          </button>
        </div>
      )}

      {(overdue.length > 0 || expiringSoon.length > 0) && (
        <div className="space-y-3">
          {overdue.length > 0 && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 font-semibold flex items-center gap-2">
              <AlertTriangle size={16} /> {overdue.length} policy(s) overdue for renewal.
            </div>
          )}
          {expiringSoon.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 font-semibold flex items-center gap-2">
              <AlertTriangle size={16} /> {expiringSoon.length} policy(s) expiring in next 30 days.
            </div>
          )}
        </div>
      )}

      {canCreate && showAddForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <form onSubmit={handleCreate} className="bg-white rounded-[2rem] shadow-2xl border border-slate-100 p-6 space-y-6 w-full max-w-5xl max-h-[90vh] overflow-y-auto">
          <div className="flex items-center gap-2 text-cyan-700 font-black uppercase tracking-wider text-xs">
            <Shield size={16} /> Add Insurance Policy
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Company</label>
              <select className="w-full px-3 py-2 rounded-xl border border-slate-200" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })}>
                {COMPANY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Policy Number</label>
              <input className="w-full px-3 py-2 rounded-xl border border-slate-200" value={form.policyNumber} onChange={(e) => setForm({ ...form, policyNumber: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Broker Name</label>
              <input className="w-full px-3 py-2 rounded-xl border border-slate-200" value={form.brokerName} onChange={(e) => setForm({ ...form, brokerName: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Contact Number</label>
                <input className="w-full px-3 py-2 rounded-xl border border-slate-200" value={form.brokerContactNumber} onChange={(e) => setForm({ ...form, brokerContactNumber: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Broker Email</label>
                <input type="email" className="w-full px-3 py-2 rounded-xl border border-slate-200" value={form.brokerEmail} onChange={(e) => setForm({ ...form, brokerEmail: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Insurance Provider</label>
              <input className="w-full px-3 py-2 rounded-xl border border-slate-200" value={form.insuranceProvider} onChange={(e) => setForm({ ...form, insuranceProvider: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Insurance Type</label>
              <select className="w-full px-3 py-2 rounded-xl border border-slate-200" value={form.insuranceType} onChange={(e) => setForm({ ...form, insuranceType: e.target.value as InsuranceType })}>
                {INSURANCE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Date of Opening</label>
              <input type="date" className="w-full px-3 py-2 rounded-xl border border-slate-200" value={form.dateOfOpening} onChange={(e) => setForm({ ...form, dateOfOpening: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Date of Renewal</label>
              <input type="date" className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50" value={form.dateOfRenewal} readOnly />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Location</label>
              <select className="w-full px-3 py-2 rounded-xl border border-slate-200" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}>
                {LOCATION_OPTIONS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Policy Copy</label>
              <input type="file" className="w-full px-3 py-2 rounded-xl border border-slate-200" onChange={(e) => setPolicyFile(e.target.files?.[0] || null)} />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50">
                  <th className="px-4 py-2 text-left text-xs font-black text-slate-500 uppercase">Particulars</th>
                  <th className="px-4 py-2 text-left text-xs font-black text-slate-500 uppercase">Sum Assured</th>
                </tr>
              </thead>
              <tbody>
                {form.coverage.map((row, idx) => (
                  <tr key={row.particulars} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-semibold text-slate-700">{row.particulars}</td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        min={0}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200"
                        value={row.sumAssured}
                        onChange={(e) => updateCoverage(idx, Number(e.target.value))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50">
                  <td className="px-4 py-2 text-xs font-black uppercase text-slate-600">Total</td>
                  <td className="px-4 py-2 text-sm font-black text-slate-900">{totalSumAssured.toLocaleString('en-IN')}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="flex items-center justify-end gap-3">
            <button type="button" onClick={resetForm} className="px-5 py-3 rounded-xl border border-slate-200 text-slate-700 font-bold hover:bg-slate-50 min-h-[44px]">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="px-5 py-3 rounded-xl bg-cyan-700 text-white font-bold hover:bg-cyan-800 disabled:opacity-50 flex items-center gap-2 min-h-[44px]">
              <Plus size={16} /> {saving ? 'Saving...' : 'Save Policy'}
            </button>
          </div>
          </form>
        </div>
      )}

      <section className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-black text-slate-900">Policies</h2>
          <span className="text-xs font-semibold text-slate-500">{policies.length} total</span>
        </div>
        {loading ? (
          <div className="p-8 text-slate-500">Loading...</div>
        ) : policies.length === 0 ? (
          <div className="p-8 text-slate-500">No policies added yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-4 py-3 text-left text-xs font-black uppercase text-slate-500">Company</th>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase text-slate-500">Location</th>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase text-slate-500">Insurance Provider</th>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase text-slate-500">Insurance Type</th>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase text-slate-500">Policy No.</th>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase text-slate-500">Date of Opening</th>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase text-slate-500">Date of Renewal</th>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase text-slate-500">Total Sum Assured</th>
                  <th className="px-4 py-3 text-right text-xs font-black uppercase text-slate-500">Manage</th>
                </tr>
              </thead>
              <tbody>
                {policies.map((p) => {
                  const d = daysTo(p.dateOfRenewal);
                  const isUrgent = d != null && d <= 30;
                  return (
                    <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-semibold text-slate-800">{p.company}</td>
                      <td className="px-4 py-3 text-slate-700">{p.location || '-'}</td>
                      <td className="px-4 py-3 text-slate-700">{p.insuranceProvider || '-'}</td>
                      <td className="px-4 py-3 text-slate-700">{p.insuranceType || '-'}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{p.policyNumber || '-'}</td>
                      <td className="px-4 py-3 text-slate-700">{p.dateOfOpening || '-'}</td>
                      <td className="px-4 py-3">
                        <p className={`font-semibold ${isUrgent ? 'text-red-600' : 'text-slate-700'}`}>{p.dateOfRenewal || '-'}</p>
                        {d != null && <p className={`text-xs ${d < 0 ? 'text-red-600' : d <= 30 ? 'text-amber-600' : 'text-slate-500'}`}>{d < 0 ? `${Math.abs(d)} day(s) overdue` : `${d} day(s) left`}</p>}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-800">{Number(p.totalSumAssured || 0).toLocaleString('en-IN')}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end">
                          <button onClick={() => openManage(p)} className="px-3 py-2 rounded-lg bg-cyan-50 text-cyan-700 font-bold hover:bg-cyan-100 text-xs">
                            Manage
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {managingPolicy && manageData && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[120] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] shadow-2xl border border-slate-100 p-6 space-y-6 w-full max-w-5xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-black text-slate-900">Manage Policy: {manageData.policyNumber || managingPolicy.id}</h3>
              <button type="button" onClick={closeManage} className="px-3 py-2 rounded-lg border border-slate-200 text-slate-700 font-bold hover:bg-slate-50">Close</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Company</label>
                <select className="w-full px-3 py-2 rounded-xl border border-slate-200" value={manageData.company} onChange={(e) => setManageData({ ...manageData, company: e.target.value })}>
                  {COMPANY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Policy Number</label>
                <input className="w-full px-3 py-2 rounded-xl border border-slate-200" value={manageData.policyNumber} onChange={(e) => setManageData({ ...manageData, policyNumber: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Broker Name</label>
                <input className="w-full px-3 py-2 rounded-xl border border-slate-200" value={manageData.brokerName} onChange={(e) => setManageData({ ...manageData, brokerName: e.target.value })} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Contact Number</label>
                  <input className="w-full px-3 py-2 rounded-xl border border-slate-200" value={manageData.brokerContactNumber} onChange={(e) => setManageData({ ...manageData, brokerContactNumber: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Broker Email</label>
                  <input type="email" className="w-full px-3 py-2 rounded-xl border border-slate-200" value={manageData.brokerEmail} onChange={(e) => setManageData({ ...manageData, brokerEmail: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Insurance Provider</label>
                <input className="w-full px-3 py-2 rounded-xl border border-slate-200" value={manageData.insuranceProvider} onChange={(e) => setManageData({ ...manageData, insuranceProvider: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Insurance Type</label>
                <select className="w-full px-3 py-2 rounded-xl border border-slate-200" value={manageData.insuranceType} onChange={(e) => setManageData({ ...manageData, insuranceType: e.target.value as InsuranceType })}>
                  {INSURANCE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Date of Opening</label>
                <input type="date" className="w-full px-3 py-2 rounded-xl border border-slate-200" value={manageData.dateOfOpening || ''} onChange={(e) => setManageData({ ...manageData, dateOfOpening: e.target.value, dateOfRenewal: addOneYearIso(toIsoDate(e.target.value)) })} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Date of Renewal</label>
                <input type="date" className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50" value={manageData.dateOfRenewal || ''} readOnly />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Location</label>
                <select className="w-full px-3 py-2 rounded-xl border border-slate-200" value={manageData.location} onChange={(e) => setManageData({ ...manageData, location: e.target.value })}>
                  {LOCATION_OPTIONS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="px-4 py-2 text-left text-xs font-black text-slate-500 uppercase">Particulars</th>
                    <th className="px-4 py-2 text-left text-xs font-black text-slate-500 uppercase">Sum Assured</th>
                  </tr>
                </thead>
                <tbody>
                  {manageData.coverage.map((row, idx) => (
                    <tr key={`${row.particulars}-${idx}`} className="border-t border-slate-100">
                      <td className="px-4 py-2 font-semibold text-slate-700">{row.particulars}</td>
                      <td className="px-4 py-2">
                        <input type="number" min={0} className="w-full px-3 py-2 rounded-xl border border-slate-200" value={row.sumAssured} onChange={(e) => updateManageCoverage(idx, Number(e.target.value))} />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-200 bg-slate-50">
                    <td className="px-4 py-2 text-xs font-black uppercase text-slate-600">Total Sum Assured</td>
                    <td className="px-4 py-2 text-sm font-black text-slate-900">{Number(manageData.totalSumAssured || 0).toLocaleString('en-IN')}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {manageData.policyCopyFilename && (
                <button onClick={() => void downloadFile(manageData)} className="px-3 py-2 rounded-lg border border-slate-200 text-slate-700 font-bold hover:bg-slate-50 flex items-center gap-2">
                  <Download size={14} /> Download Policy Copy
                </button>
              )}
              {canEdit && (
                <label className="px-3 py-2 rounded-lg border border-slate-200 text-slate-700 font-bold hover:bg-slate-50 flex items-center gap-2 cursor-pointer">
                  <Upload size={14} /> Upload / Replace Policy Copy
                  <input type="file" className="hidden" onChange={(e) => void uploadForExisting(manageData.id, e.target.files?.[0] || null)} />
                </label>
              )}
              {uploadingId === manageData.id && <span className="text-xs text-slate-500">Uploading...</span>}
              {canEdit && manageData.policyCopyFilename && (
                <button onClick={() => void deleteFile(manageData)} className="px-3 py-2 rounded-lg border border-red-200 text-red-700 font-bold hover:bg-red-50">
                  Delete Policy Copy
                </button>
              )}
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                {canDelete && (
                  <button onClick={() => void handleDelete(manageData)} className="px-4 py-3 rounded-xl bg-red-600 text-white font-bold hover:bg-red-700 flex items-center gap-2">
                    <Trash2 size={14} /> Delete Policy
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button type="button" onClick={closeManage} className="px-4 py-3 rounded-xl border border-slate-200 text-slate-700 font-bold hover:bg-slate-50">Close</button>
                {canEdit && (
                  <button type="button" onClick={() => void saveManage()} disabled={manageSaving} className="px-4 py-3 rounded-xl bg-cyan-700 text-white font-bold hover:bg-cyan-800 disabled:opacity-50">
                    {manageSaving ? 'Saving...' : 'Save Changes'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InsurancePolicies;
