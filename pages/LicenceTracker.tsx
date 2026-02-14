import React, { useState } from 'react';
import { Licence, LicenceType, Shipment, User, UserRole } from '../types';
import { Award, ShieldAlert, Calendar, FileCheck, TrendingUp, Plus, Briefcase, Settings, X, Save, ArrowDownLeft, ArrowUpRight, Pencil } from 'lucide-react';
import { formatINR, formatDate, formatCurrency } from '../constants';
import { COMPANY_OPTIONS } from '../constants';

interface LicenceTrackerProps {
  licences: Licence[];
  shipments: Shipment[];
  user?: User | null;
  onAddItem?: (licence: Licence) => Promise<void>;
  onUpdateItem: (updated: Licence) => Promise<void>;
  onUpdateShipment: (updated: Shipment) => Promise<void>;
}

const canEditLicence = (user?: User | null) =>
  user?.role === UserRole.MANAGEMENT || user?.role === UserRole.CHECKER;

/** Export obligation fulfilled (INR) = sum of linked export shipments' invoice value in INR (linked via linkedLicenceId, epcgLicenceId, or advLicenceId) */
function getFulfilledForLicence(licenceId: string, allShipments: Shipment[]): number {
  const id = String(licenceId);
  return allShipments
    .filter(s => !!s.buyerId && (
      (s?.linkedLicenceId != null && s.linkedLicenceId !== '' && String(s.linkedLicenceId) === id) ||
      (s?.epcgLicenceId != null && s.epcgLicenceId !== '' && String(s.epcgLicenceId) === id) ||
      (s?.advLicenceId != null && s.advLicenceId !== '' && String(s.advLicenceId) === id)
    ))
    .reduce((sum, s) => sum + (s.invoiceValueINR || 0), 0);
}

/** Import utilization (INR) = sum of linked import shipments' obligation amount, or invoice value if not set */
function getUtilizationForLicence(licenceId: string, allShipments: Shipment[]): number {
  const id = String(licenceId);
  return allShipments
    .filter(s => s?.linkedLicenceId != null && s.linkedLicenceId !== '' && String(s.linkedLicenceId) === id && !!s.supplierId)
    .reduce((sum, s) => sum + (s.licenceObligationAmount ?? s.invoiceValueINR ?? 0), 0);
}

const LicenceTracker: React.FC<LicenceTrackerProps> = ({ licences, shipments, user, onAddItem, onUpdateItem, onUpdateShipment }) => {
  const [selectedLicence, setSelectedLicence] = useState<Licence | null>(null);
  const [showAddLicence, setShowAddLicence] = useState(false);
  const [showEditLicence, setShowEditLicence] = useState(false);
  const [editLicenceForm, setEditLicenceForm] = useState<Partial<Licence>>({});
  const [importShipments, setImportShipments] = useState<Shipment[]>([]);
  const [exportShipments, setExportShipments] = useState<Shipment[]>([]);
  const [newLicence, setNewLicence] = useState<Partial<Licence>>({
    type: LicenceType.ADVANCE,
    company: 'GFPL',
    issueDate: '',
    importValidityDate: '',
    expiryDate: '',
    dutySaved: 0,
    eoRequired: 0,
    eoFulfilled: 0,
    status: 'ACTIVE',
    number: '',
  });
  
  const epcgLicences = licences.filter(l => l.type === LicenceType.EPCG);
  const advanceLicences = licences.filter(l => l.type === LicenceType.ADVANCE);

  const stats = {
    totalDutySaved: licences.reduce((acc, l) => acc + (l.dutySaved || 0), 0),
    totalFulfilled: licences.reduce((acc, l) => acc + getFulfilledForLicence(l.id, shipments), 0),
    totalRequired: licences.reduce((acc, l) => acc + (l.eoRequired || 0), 0),
  };

  const handleManage = (licence: Licence) => {
    const licenceId = licence?.id != null ? String(licence.id) : '';
    const linked = shipments.filter(s => {
      const lid = s?.linkedLicenceId != null && s.linkedLicenceId !== '' ? String(s.linkedLicenceId) : null;
      const epcg = s?.epcgLicenceId != null && s.epcgLicenceId !== '' ? String(s.epcgLicenceId) : null;
      const adv = s?.advLicenceId != null && s.advLicenceId !== '' ? String(s.advLicenceId) : null;
      return lid === licenceId || epcg === licenceId || adv === licenceId;
    });
    setImportShipments(linked.filter(s => !!s.supplierId)); // Has Supplier = Import
    setExportShipments(linked.filter(s => !!s.buyerId)); // Has Buyer = Export
    setSelectedLicence(licence);
  };

  const handleObligationChange = (shipmentId: string, value: string) => {
    setImportShipments(prev => prev.map(s => s.id === shipmentId ? { ...s, licenceObligationAmount: parseFloat(value) || 0 } : s));
  };

  const saveObligations = async () => {
    if (!selectedLicence) return;
    
    // 1. Update import shipments with utilization amount (use invoice value as default if not set)
    for (const sh of importShipments) {
      const obligationAmount = sh.licenceObligationAmount ?? sh.invoiceValueINR ?? 0;
      await onUpdateShipment({ ...sh, licenceObligationAmount: obligationAmount });
    }
    
    // 2. Sync licence.eoFulfilled from linked export shipments (source of truth)
    const totalFulfilled = exportShipments.reduce((sum, s) => sum + (s.invoiceValueINR || 0), 0);
    await onUpdateItem({ ...selectedLicence, eoFulfilled: totalFulfilled });
    setSelectedLicence(null);
  };

  // Total import utilization: sum of obligation amount (or invoice value if not set) for linked imports
  const totalImportUtilization = importShipments.reduce((sum, s) => sum + (s.licenceObligationAmount ?? s.invoiceValueINR ?? 0), 0);
  const isOverImportLimit = selectedLicence != null && totalImportUtilization > (selectedLicence.dutySaved || 0);
  const fulfilledFromExports = selectedLicence != null ? exportShipments.reduce((s, x) => s + (x.invoiceValueINR || 0), 0) : 0;

  const LicenceTable = ({ title, data, icon: Icon, colorClass }: { title: string, data: Licence[], icon: React.ElementType, colorClass: string }) => (
    <section className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden mb-8">
      <div className="p-8 border-b border-slate-50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-2xl ${colorClass}`}>
            <Icon size={24} />
          </div>
          <div>
             <h2 className="text-lg font-black text-slate-900 tracking-tight">{title}</h2>
             <p className="text-xs text-slate-400 font-medium">Duty-free import limit vs used; export obligation vs fulfilled by date</p>
          </div>
        </div>
        <span className="px-4 py-2 bg-slate-50 text-slate-400 text-[10px] font-black uppercase rounded-xl border border-slate-100">
          {data.length} Registered
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50/50 text-left">
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Licence</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Company</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Duty-free import limit</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Used by imports</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Export obligation</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Fulfilled (by exports)</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Obligation due by</th>
              <th className="px-8 py-5 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.map(lic => {
              const fulfilled = getFulfilledForLicence(lic.id, shipments);
              const utilized = getUtilizationForLicence(lic.id, shipments);
              const progress = lic.eoRequired > 0 ? (fulfilled / lic.eoRequired) * 100 : 0;
              const isNearingExpiry = new Date(lic.expiryDate).getTime() - Date.now() < 120 * 24 * 60 * 60 * 1000;
              const isOverLimit = utilized > (lic.dutySaved || 0);

              return (
                <tr key={lic.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-8 py-6">
                    <p className="font-black text-slate-900 text-sm tracking-tight">{lic.number}</p>
                    <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">{lic.type}</p>
                  </td>
                  <td className="px-8 py-6">
                    <span className="text-[10px] font-black text-slate-400 bg-white border border-slate-100 px-2 py-1 rounded-lg uppercase tracking-widest">{lic.company}</span>
                  </td>
                  <td className="px-8 py-6">
                    <p className="font-black text-amber-600 text-sm">{formatINR(lic.dutySaved)}</p>
                    <p className="text-[9px] text-slate-500">Fixed limit</p>
                  </td>
                  <td className="px-8 py-6">
                    <p className={`font-black text-sm ${isOverLimit ? 'text-red-600' : 'text-slate-700'}`}>{formatINR(utilized)}</p>
                    {isOverLimit && <p className="text-[9px] text-red-500 font-bold">Over limit</p>}
                  </td>
                  <td className="px-8 py-6">
                    <p className="font-black text-indigo-600 text-sm">{formatINR(lic.eoRequired)}</p>
                    <p className="text-[9px] text-slate-500">Must export</p>
                  </td>
                  <td className="px-8 py-6">
                    <div className="w-44">
                      <div className="flex justify-between items-center mb-2">
                         <span className={`text-[10px] font-black ${progress >= 100 ? 'text-emerald-500' : progress > 80 ? 'text-indigo-600' : 'text-slate-500'} uppercase tracking-tight`}>
                           {Math.round(progress)}%
                         </span>
                         <span className="text-[9px] font-black text-slate-300 uppercase tracking-tighter">{formatINR(fulfilled)}</span>
                      </div>
                      <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-1000 ease-out shadow-sm ${progress >= 100 ? 'bg-emerald-500' : 'bg-indigo-600'}`} 
                          style={{ width: `${Math.min(progress, 100)}%` }} 
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <p className={`text-xs font-bold ${isNearingExpiry ? 'text-amber-600' : 'text-slate-600'}`}>{formatDate(lic.expiryDate)}</p>
                    {isNearingExpiry && <p className="text-[9px] text-amber-500">Nearing due</p>}
                  </td>
                  <td className="px-8 py-6 text-right">
                     <button onClick={() => handleManage(lic)} className="bg-white border border-slate-200 text-slate-600 hover:border-indigo-200 hover:text-indigo-600 px-4 py-2 rounded-xl font-bold text-[10px] uppercase flex items-center gap-2 ml-auto transition-all shadow-sm">
                        <Settings size={14} /> Manage
                     </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight uppercase">Licence Audit Control</h1>
          <p className="text-slate-500 font-medium">Duty-free import limits and export obligations: track utilization and fulfillment by due date.</p>
        </div>
        <button
          onClick={() => setShowAddLicence(true)}
          className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 flex items-center gap-2"
        >
          <Plus size={18} /> Add Licence
        </button>
      </header>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl"><Briefcase size={20} /></div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Duty-free limit</p>
          </div>
          <p className="text-xl font-black text-slate-900">{formatINR(stats.totalDutySaved)}</p>
          <p className="text-[9px] text-slate-500 mt-1">Total import limit (fixed)</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl"><TrendingUp size={20} /></div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Export obligation</p>
          </div>
          <p className="text-xl font-black text-slate-900">{formatINR(stats.totalRequired)}</p>
          <p className="text-[9px] text-slate-500 mt-1">Must export by due dates</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl"><FileCheck size={20} /></div>
            <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Fulfilled</p>
          </div>
          <p className="text-xl font-black text-emerald-600">{formatINR(stats.totalFulfilled)}</p>
          <p className="text-[9px] text-slate-500 mt-1">From linked exports</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-rose-50 text-rose-600 rounded-xl"><ShieldAlert size={20} /></div>
            <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest">Pending</p>
          </div>
          <p className="text-xl font-black text-slate-900">{formatINR(Math.max(0, stats.totalRequired - stats.totalFulfilled))}</p>
          <p className="text-[9px] text-slate-500 mt-1">Obligation remaining</p>
        </div>
      </div>

      {/* Divided Sections */}
      <div className="space-y-12">
        <LicenceTable 
            title="EPCG Licence Repository (Capital Assets)" 
            data={epcgLicences} 
            icon={Award} 
            colorClass="bg-indigo-50 text-indigo-600"
        />
        
        <LicenceTable 
            title="Advance Licence Repository (Raw Materials)" 
            data={advanceLicences} 
            icon={Briefcase} 
            colorClass="bg-amber-50 text-amber-600"
        />
      </div>

      {selectedLicence && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
           <div className="bg-white w-full max-w-6xl h-[90vh] rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col relative">
              <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                 <div>
                    <h2 className="text-xl font-black text-slate-900 uppercase">Manage Obligations</h2>
                    <p className="text-xs font-bold text-slate-500 mt-1">Licence: <span className="text-indigo-600">{selectedLicence.number}</span></p>
                 </div>
                 <div className="flex items-center gap-2">
                   {canEditLicence(user) && (
                     <button
                       type="button"
                       onClick={() => { setEditLicenceForm({ ...selectedLicence }); setShowEditLicence(true); }}
                       className="px-4 py-2 rounded-xl font-bold text-indigo-600 hover:bg-indigo-50 flex items-center gap-2 text-xs uppercase tracking-widest"
                     >
                       <Pencil size={14} /> Edit licence details
                     </button>
                   )}
                   <button onClick={() => { setSelectedLicence(null); setShowEditLicence(false); }} className="p-2 hover:bg-slate-200 rounded-full transition-all text-slate-400"><X size={20} /></button>
                 </div>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-8">
                 {showEditLicence && canEditLicence(user) && (
                   <div className="bg-slate-50 rounded-2xl border border-slate-200 p-6 space-y-6">
                     <h3 className="text-sm font-black text-slate-800 uppercase">Edit licence details</h3>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                       <div>
                         <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Licence Type</label>
                         <select
                           className="w-full px-3 py-2 rounded-lg border border-slate-200 font-bold bg-white text-sm"
                           value={editLicenceForm.type ?? LicenceType.ADVANCE}
                           onChange={e => setEditLicenceForm(prev => ({ ...prev, type: e.target.value as LicenceType }))}
                         >
                           <option value={LicenceType.ADVANCE}>Advance Licence</option>
                           <option value={LicenceType.EPCG}>EPCG</option>
                         </select>
                       </div>
                       <div>
                         <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Licence Number</label>
                         <input
                           type="text"
                           className="w-full px-3 py-2 rounded-lg border border-slate-200 font-bold text-sm"
                           value={editLicenceForm.number ?? ''}
                           onChange={e => setEditLicenceForm(prev => ({ ...prev, number: e.target.value }))}
                           placeholder="e.g. 0310224567"
                         />
                       </div>
                       <div>
                         <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Company</label>
                         <select
                           className="w-full px-3 py-2 rounded-lg border border-slate-200 font-bold bg-white text-sm"
                           value={editLicenceForm.company ?? 'GFPL'}
                           onChange={e => setEditLicenceForm(prev => ({ ...prev, company: e.target.value as 'GFPL' | 'GTEX' }))}
                         >
                           {COMPANY_OPTIONS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                         </select>
                       </div>
                       <div>
                         <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Status</label>
                         <select
                           className="w-full px-3 py-2 rounded-lg border border-slate-200 font-bold bg-white text-sm"
                           value={editLicenceForm.status ?? 'ACTIVE'}
                           onChange={e => setEditLicenceForm(prev => ({ ...prev, status: e.target.value as 'ACTIVE' | 'CLOSED' | 'EXPIRED' }))}
                         >
                           <option value="ACTIVE">ACTIVE</option>
                           <option value="CLOSED">CLOSED</option>
                           <option value="EXPIRED">EXPIRED</option>
                         </select>
                       </div>
                     </div>
                     <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                       <div>
                         <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Opening Date</label>
                         <input
                           type="date"
                           className="w-full px-3 py-2 rounded-lg border border-slate-200 font-bold text-sm"
                           value={editLicenceForm.issueDate ?? ''}
                           onChange={e => setEditLicenceForm(prev => ({ ...prev, issueDate: e.target.value }))}
                         />
                       </div>
                       <div>
                         <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Import Validity Date</label>
                         <input
                           type="date"
                           className="w-full px-3 py-2 rounded-lg border border-slate-200 font-bold text-sm"
                           value={editLicenceForm.importValidityDate ?? ''}
                           onChange={e => setEditLicenceForm(prev => ({ ...prev, importValidityDate: e.target.value }))}
                         />
                       </div>
                       <div>
                         <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Obligation due by</label>
                         <input
                           type="date"
                           className="w-full px-3 py-2 rounded-lg border border-slate-200 font-bold text-sm"
                           value={editLicenceForm.expiryDate ?? ''}
                           onChange={e => setEditLicenceForm(prev => ({ ...prev, expiryDate: e.target.value }))}
                         />
                       </div>
                     </div>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                       <div>
                         <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Duty-free import limit (INR)</label>
                         <input
                           type="number"
                           step="any"
                           min="0"
                           className="w-full px-3 py-2 rounded-lg border border-slate-200 font-bold text-sm"
                           value={editLicenceForm.dutySaved ?? ''}
                           onChange={e => setEditLicenceForm(prev => ({ ...prev, dutySaved: parseFloat(e.target.value) || 0 }))}
                           placeholder="0"
                         />
                       </div>
                       <div>
                         <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Export obligation (INR)</label>
                         <input
                           type="number"
                           step="any"
                           min="0"
                           className="w-full px-3 py-2 rounded-lg border border-slate-200 font-bold text-sm"
                           value={editLicenceForm.eoRequired ?? ''}
                           onChange={e => setEditLicenceForm(prev => ({ ...prev, eoRequired: parseFloat(e.target.value) || 0 }))}
                           placeholder="0"
                         />
                       </div>
                     </div>
                     <div className="flex justify-end gap-3">
                       <button type="button" onClick={() => setShowEditLicence(false)} className="px-4 py-2 rounded-lg font-bold text-slate-500 hover:text-slate-700 text-xs uppercase">Cancel</button>
                       <button
                         type="button"
                         onClick={async () => {
                           if (!selectedLicence?.id || !editLicenceForm.number?.trim()) { alert('Licence number is required.'); return; }
                           const updated: Licence = {
                             ...selectedLicence,
                             type: editLicenceForm.type ?? selectedLicence.type,
                             number: editLicenceForm.number,
                             company: (editLicenceForm.company as 'GFPL' | 'GTEX') ?? selectedLicence.company,
                             issueDate: editLicenceForm.issueDate ?? selectedLicence.issueDate,
                             importValidityDate: editLicenceForm.importValidityDate ?? selectedLicence.importValidityDate,
                             expiryDate: editLicenceForm.expiryDate ?? selectedLicence.expiryDate,
                             dutySaved: Number(editLicenceForm.dutySaved) ?? selectedLicence.dutySaved,
                             eoRequired: Number(editLicenceForm.eoRequired) ?? selectedLicence.eoRequired,
                             eoFulfilled: selectedLicence.eoFulfilled,
                             status: (editLicenceForm.status as 'ACTIVE' | 'CLOSED' | 'EXPIRED') ?? selectedLicence.status,
                           };
                           await onUpdateItem(updated);
                           setSelectedLicence(updated);
                           setShowEditLicence(false);
                         }}
                         className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-bold text-xs uppercase flex items-center gap-2 hover:bg-indigo-700"
                       >
                         <Save size={14} /> Save
                       </button>
                     </div>
                   </div>
                 )}

                 {isOverImportLimit && (
                   <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-3">
                     <ShieldAlert className="text-red-500 shrink-0" size={24} />
                     <div>
                       <p className="text-sm font-bold text-red-800">Import utilization exceeds duty-free limit</p>
                       <p className="text-xs text-red-600 mt-0.5">Used {formatINR(totalImportUtilization)} against limit {formatINR(selectedLicence.dutySaved)}. Adjust amounts below or link fewer imports to this licence.</p>
                     </div>
                   </div>
                 )}

                 <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="bg-amber-50 p-6 rounded-2xl border border-amber-100">
                       <p className="text-[10px] font-black uppercase text-amber-600">Duty-free import limit</p>
                       <p className="text-2xl font-black text-slate-900 mt-2">{formatINR(selectedLicence.dutySaved)}</p>
                       <p className="text-[9px] text-slate-500 mt-1">Fixed: max you can import without duty/GST</p>
                    </div>
                    <div className="bg-orange-50 p-6 rounded-2xl border border-orange-100">
                       <p className="text-[10px] font-black uppercase text-orange-600">Used by imports</p>
                       <p className={`text-2xl font-black mt-2 ${isOverImportLimit ? 'text-red-600' : 'text-slate-900'}`}>{formatINR(totalImportUtilization)}</p>
                       <p className="text-[9px] text-slate-500 mt-1">From linked import invoices (editable below)</p>
                    </div>
                    <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-100">
                       <p className="text-[10px] font-black uppercase text-emerald-600">Export obligation</p>
                       <p className="text-2xl font-black text-slate-900 mt-2">{formatINR(selectedLicence.eoRequired)}</p>
                       <p className="text-[9px] text-slate-500 mt-1">Must export by {formatDate(selectedLicence.expiryDate)}</p>
                    </div>
                    <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100">
                       <p className="text-[10px] font-black uppercase text-blue-600">Fulfilled by exports</p>
                       <p className="text-2xl font-black text-slate-900 mt-2">{formatINR(fulfilledFromExports)}</p>
                       <p className="text-[9px] text-slate-500 mt-1">Sum of linked export invoice value (INR)</p>
                    </div>
                 </div>

                 <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* IMPORTS: UTILIZATION */}
                    <div className="space-y-4">
                       <h3 className="text-xs font-black uppercase text-slate-900 flex items-center gap-2">
                         <ArrowDownLeft size={16} className="text-amber-500" /> Duty-free utilization (imports)
                       </h3>
                       <p className="text-[10px] text-slate-500">Amount of this licence’s limit consumed by each import. Defaults to invoice value (INR); edit if you allocate a different value.</p>
                       <div className="bg-slate-50 rounded-2xl border border-slate-100 overflow-hidden">
                          {importShipments.length > 0 ? (
                            <table className="w-full">
                               <thead>
                                  <tr className="text-left text-[9px] font-black uppercase text-slate-400 border-b">
                                     <th className="pb-3 pt-3 pl-3">Invoice</th>
                                     <th className="pb-3 pt-3">Invoice value (INR)</th>
                                     <th className="pb-3 pt-3">Amount utilized (against limit)</th>
                                  </tr>
                               </thead>
                               <tbody className="divide-y divide-slate-100">
                                  {importShipments.map(sh => (
                                     <tr key={sh.id}>
                                        <td className="py-3 pl-3">
                                           <p className="text-xs font-bold text-slate-900">{sh.invoiceNumber}</p>
                                           <p className="text-[9px] text-slate-400">{formatDate(sh.createdAt)}</p>
                                        </td>
                                        <td className="py-3">
                                           <p className="text-xs font-bold text-slate-700">{formatINR(sh.invoiceValueINR ?? 0)}</p>
                                        </td>
                                        <td className="py-3">
                                           <input 
                                              type="number" 
                                              className="w-full max-w-[140px] px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold focus:ring-2 focus:ring-amber-500 outline-none"
                                              value={sh.licenceObligationAmount ?? sh.invoiceValueINR ?? 0}
                                              onChange={(e) => handleObligationChange(sh.id, e.target.value)}
                                           />
                                        </td>
                                     </tr>
                                  ))}
                               </tbody>
                            </table>
                          ) : <p className="p-6 text-center text-xs text-slate-400 italic">No import shipments linked to this licence. Link imports in Shipment Master or Shipment Details.</p>}
                       </div>
                    </div>

                    {/* EXPORTS: FULFILLMENT */}
                    <div className="space-y-4">
                       <h3 className="text-xs font-black uppercase text-slate-900 flex items-center gap-2">
                         <ArrowUpRight size={16} className="text-emerald-500" /> Export obligation fulfillment
                       </h3>
                       <p className="text-[10px] text-slate-500">Exports linked to this licence count toward your obligation. Fulfilled = sum of these invoices’ value in INR.</p>
                       <div className="bg-slate-50 rounded-2xl border border-slate-100 overflow-hidden">
                          {exportShipments.length > 0 ? (
                            <table className="w-full">
                               <thead>
                                  <tr className="text-left text-[9px] font-black uppercase text-slate-400 border-b">
                                     <th className="pb-3 pt-3 pl-3">Invoice</th>
                                     <th className="pb-3 pt-3">FOB Value (Credit)</th>
                                  </tr>
                               </thead>
                               <tbody className="divide-y divide-slate-100">
                                  {exportShipments.map(sh => (
                                     <tr key={sh.id}>
                                        <td className="py-3 pl-3">
                                           <p className="text-xs font-bold text-slate-900">{sh.invoiceNumber}</p>
                                           <p className="text-[9px] text-slate-400">{formatDate(sh.createdAt)}</p>
                                        </td>
                                        <td className="py-3">
                                           <p className="text-xs font-black text-emerald-600">{formatINR(sh.invoiceValueINR)}</p>
                                        </td>
                                     </tr>
                                  ))}
                               </tbody>
                            </table>
                          ) : <p className="p-6 text-center text-xs text-slate-400 italic">No export shipments fulfilling this licence.</p>}
                       </div>
                    </div>
                 </div>
              </div>

              <div className="p-6 border-t border-slate-100 bg-white flex justify-end gap-4">
                 <button onClick={() => setSelectedLicence(null)} className="px-8 py-3 rounded-xl font-bold text-slate-400 hover:text-slate-600 uppercase text-xs tracking-widest">Cancel</button>
                 <button onClick={saveObligations} className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-black uppercase text-xs tracking-widest shadow-lg shadow-indigo-100 hover:bg-indigo-700 flex items-center gap-2">
                    <Save size={16} /> Save Obligation Ledger
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* Add New Licence Modal */}
      {showAddLicence && onAddItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-2xl rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h2 className="text-lg font-black text-slate-900">Add New Licence</h2>
              <button type="button" onClick={() => setShowAddLicence(false)} className="p-2 hover:bg-slate-200 rounded-full transition-all"><X size={20} className="text-slate-500" /></button>
            </div>
            <form
              className="p-8 overflow-y-auto space-y-6"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!newLicence.issueDate || !newLicence.expiryDate || !newLicence.number || !newLicence.company) {
                  alert('Please fill Licence type, Licence number, Company, Opening date, and Obligation due by date.');
                  return;
                }
                const id = 'lic' + Date.now();
                const licence: Licence = {
                  id,
                  number: newLicence.number,
                  type: newLicence.type ?? LicenceType.ADVANCE,
                  issueDate: newLicence.issueDate,
                  importValidityDate: newLicence.importValidityDate || undefined,
                  expiryDate: newLicence.expiryDate,
                  dutySaved: Number(newLicence.dutySaved) || 0,
                  eoRequired: Number(newLicence.eoRequired) || 0,
                  eoFulfilled: 0,
                  company: newLicence.company as 'GFPL' | 'GTEX',
                  status: 'ACTIVE',
                };
                await onAddItem(licence);
                setShowAddLicence(false);
                setNewLicence({ type: LicenceType.ADVANCE, company: 'GFPL', issueDate: '', importValidityDate: '', expiryDate: '', dutySaved: 0, eoRequired: 0, eoFulfilled: 0, status: 'ACTIVE', number: '' });
              }}
            >
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Licence Type</label>
                <select
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 font-bold bg-white"
                  value={newLicence.type ?? LicenceType.ADVANCE}
                  onChange={e => setNewLicence(prev => ({ ...prev, type: e.target.value as LicenceType }))}
                >
                  <option value={LicenceType.ADVANCE}>Advance Licence</option>
                  <option value={LicenceType.EPCG}>EPCG</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Licence Number</label>
                <input
                  type="text"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 font-bold"
                  value={newLicence.number ?? ''}
                  onChange={e => setNewLicence(prev => ({ ...prev, number: e.target.value }))}
                  placeholder="e.g. 0310224567"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Company</label>
                <select
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 font-bold bg-white"
                  value={newLicence.company ?? 'GFPL'}
                  onChange={e => setNewLicence(prev => ({ ...prev, company: e.target.value as 'GFPL' | 'GTEX' }))}
                >
                  {COMPANY_OPTIONS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <p className="text-xs text-slate-500 bg-slate-50 rounded-xl p-3 border border-slate-100">
                You get a duty-free import limit (raw/capital goods). In return you promise to export finished goods and bring in foreign exchange by the obligation due date.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Opening date</label>
                  <input
                    type="date"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 font-bold"
                    value={newLicence.issueDate ?? ''}
                    onChange={e => setNewLicence(prev => ({ ...prev, issueDate: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Import validity (optional)</label>
                  <p className="text-[9px] text-slate-500 mb-1">Until when imports under this licence can be cleared</p>
                  <input
                    type="date"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 font-bold"
                    value={newLicence.importValidityDate ?? ''}
                    onChange={e => setNewLicence(prev => ({ ...prev, importValidityDate: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Obligation due by</label>
                  <p className="text-[9px] text-slate-500 mb-1">Export obligation must be fulfilled by this date</p>
                  <input
                    type="date"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 font-bold"
                    value={newLicence.expiryDate ?? ''}
                    onChange={e => setNewLicence(prev => ({ ...prev, expiryDate: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Duty-free import limit (INR)</label>
                  <p className="text-[9px] text-slate-500 mb-1">Fixed: max value of goods you can import without duty/GST under this licence</p>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 font-bold"
                    value={newLicence.dutySaved ?? ''}
                    onChange={e => setNewLicence(prev => ({ ...prev, dutySaved: parseFloat(e.target.value) || 0 }))}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Export obligation (INR)</label>
                  <p className="text-[9px] text-slate-500 mb-1">Amount you must export (finished goods, forex) by the due date to fulfill your promise</p>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 font-bold"
                    value={newLicence.eoRequired ?? ''}
                    onChange={e => setNewLicence(prev => ({ ...prev, eoRequired: parseFloat(e.target.value) || 0 }))}
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-4 pt-4">
                <button type="button" onClick={() => setShowAddLicence(false)} className="px-6 py-3 rounded-xl font-bold text-slate-500 hover:text-slate-700 uppercase text-xs">Cancel</button>
                <button type="submit" className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-black uppercase text-xs shadow-lg shadow-indigo-100 hover:bg-indigo-700 flex items-center gap-2">
                  <Save size={16} /> Add Licence
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default LicenceTracker;