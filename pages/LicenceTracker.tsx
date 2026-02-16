import React, { useState, useEffect } from 'react';
import { Licence, LicenceType, LicenceImportProduct, LicenceExportProduct, Shipment, User, UserRole, Material } from '../types';
import { Award, ShieldAlert, Calendar, FileCheck, TrendingUp, Plus, Briefcase, Settings, X, Save, ArrowDownLeft, ArrowUpRight, Pencil, Trash2 } from 'lucide-react';
import { formatINR, formatDate, formatCurrency } from '../constants';
import { COMPANY_OPTIONS } from '../constants';
import { api } from '../api';
import { STANDARDISED_UNITS } from '../types';
import { usePermissions } from '../hooks/usePermissions';

interface LicenceTrackerProps {
  licences: Licence[];
  shipments: Shipment[];
  user?: User | null;
  onAddItem?: (licence: Licence) => Promise<void>;
  onUpdateItem: (updated: Licence) => Promise<void>;
  onDeleteItem?: (id: string) => Promise<void>;
  onUpdateShipment: (updated: Shipment) => Promise<void>;
}

const canEditLicence = (user?: User | null) =>
  user?.role === UserRole.MANAGEMENT || user?.role === UserRole.CHECKER;

/** Export: fulfilled INR = sum of allocations for this licence (export shipments), or legacy licenceExportLines/invoiceValueINR. */
function getFulfilledForLicence(licenceId: string, allShipments: Shipment[]): number {
  const id = String(licenceId);
  let total = 0;
  for (const s of allShipments) {
    if (!s.buyerId) continue;
    const isLinked = (s?.linkedLicenceId != null && s.linkedLicenceId !== '' && String(s.linkedLicenceId) === id) ||
      (s?.epcgLicenceId != null && String(s.epcgLicenceId) === id) ||
      (s?.advLicenceId != null && String(s.advLicenceId) === id) ||
      (Array.isArray(s.licenceAllocations) && s.licenceAllocations.some((a: any) => String(a.licenceId) === id));
    if (!isLinked) continue;
    if (Array.isArray(s.licenceAllocations) && s.licenceAllocations.length > 0) {
      total += s.licenceAllocations.filter((a: any) => String(a.licenceId) === id).reduce((s2: number, a: any) => s2 + (a.allocatedAmountINR || 0), 0);
    } else if (Array.isArray(s.licenceExportLines) && s.licenceExportLines.length > 0) {
      total += s.licenceExportLines.reduce((s2, l) => s2 + (l.valueINR || 0), 0);
    } else {
      total += s.invoiceValueINR || 0;
    }
  }
  return total;
}

/** Export: fulfilled USD = sum of allocations for this licence (for progress: obligation met when USD target reached). */
function getFulfilledUSDForLicence(licenceId: string, allShipments: Shipment[]): number {
  const id = String(licenceId);
  let total = 0;
  for (const s of allShipments) {
    if (!s.buyerId) continue;
    if (!Array.isArray(s.licenceAllocations)) continue;
    total += s.licenceAllocations.filter((a: any) => String(a.licenceId) === id).reduce((s2: number, a: any) => s2 + (a.allocatedAmountUSD || 0), 0);
  }
  return total;
}

/** Import utilization (INR) = sum of allocations for this licence, or legacy licenceImportLines/obligation/invoice. */
function getUtilizationForLicence(licenceId: string, allShipments: Shipment[]): number {
  const id = String(licenceId);
  let total = 0;
  for (const s of allShipments) {
    if (!s.supplierId) continue;
    const isLinked = (s?.linkedLicenceId != null && s.linkedLicenceId !== '' && String(s.linkedLicenceId) === id) ||
      (Array.isArray(s.licenceAllocations) && s.licenceAllocations.some((a: any) => String(a.licenceId) === id));
    if (!isLinked) continue;
    if (Array.isArray(s.licenceAllocations) && s.licenceAllocations.length > 0) {
      total += s.licenceAllocations.filter((a: any) => String(a.licenceId) === id).reduce((s2: number, a: any) => s2 + (a.allocatedAmountINR || 0), 0);
    } else if (Array.isArray(s.licenceImportLines) && s.licenceImportLines.length > 0) {
      total += s.licenceImportLines.reduce((s2, l) => s2 + (l.valueINR || 0), 0);
    } else {
      total += (s.licenceObligationAmount ?? s.invoiceValueINR ?? 0);
    }
  }
  return total;
}

/** Per-product import utilization for a licence. Returns array of { materialId, limitQty, limitUSD, limitINR, utilizedQty (in licence UOM), utilizedUSD, utilizedINR, remainingQty, remainingUSD, remainingINR, isFullyUtilized }. */
function getPerProductUtilization(licence: Licence, allShipments: Shipment[]): Array<{ materialId: string; materialName?: string; unit?: string; limitQty: number; limitUSD: number; limitINR: number; utilizedQty: number; utilizedUSD: number; utilizedINR: number; remainingQty: number; remainingUSD: number; remainingINR: number; isFullyUtilized: boolean }> {
  const id = String(licence.id);
  const products = licence.importProducts || [];
  return products.map((prod: LicenceImportProduct) => {
    const limitQty = prod.quantityLimit || 0;
    const limitUSD = prod.amountUSDLimit || 0;
    const limitINR = prod.amountINR || 0;
    const factor = (prod.uomConversionFactor != null && prod.uomConversionFactor > 0) ? prod.uomConversionFactor : 1;
    let utilizedQty = 0;
    let utilizedUSD = 0;
    let utilizedINR = 0;
    for (const s of allShipments) {
      if (!s.supplierId || !Array.isArray(s.licenceAllocations)) continue;
      const allocs = s.licenceAllocations.filter((a: any) => String(a.licenceId) === id && (String(a.productId) === String(prod.materialId)));
      for (const a of allocs) {
        utilizedUSD += a.allocatedAmountUSD || 0;
        utilizedINR += a.allocatedAmountINR || 0;
        utilizedQty += (a.allocatedQuantity || 0) / factor;
      }
    }
    const remainingQty = Math.max(0, limitQty - utilizedQty);
    const remainingUSD = Math.max(0, limitUSD - utilizedUSD);
    const remainingINR = Math.max(0, limitINR - utilizedINR);
    const isFullyUtilized = (limitQty > 0 && utilizedQty >= limitQty) || (limitUSD > 0 && utilizedUSD >= limitUSD) || (limitINR > 0 && utilizedINR >= limitINR);
    return {
      materialId: prod.materialId,
      materialName: prod.materialName,
      unit: prod.unit,
      limitQty,
      limitUSD,
      limitINR,
      utilizedQty,
      utilizedUSD,
      utilizedINR,
      remainingQty,
      remainingUSD,
      remainingINR,
      isFullyUtilized,
    };
  });
}

const LicenceTracker: React.FC<LicenceTrackerProps> = ({ licences, shipments, user, onAddItem, onUpdateItem, onDeleteItem, onUpdateShipment }) => {
  const { hasPermission } = usePermissions(user);
  const canDeleteLicence = hasPermission('licences.delete');
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
    amountImportUSD: 0,
    amountImportINR: 0,
  });
  const [materials, setMaterials] = useState<Material[]>([]);
  const [newImportProducts, setNewImportProducts] = useState<LicenceImportProduct[]>([]);
  const [newExportProducts, setNewExportProducts] = useState<LicenceExportProduct[]>([]);

  useEffect(() => {
    if (showAddLicence) {
      api.materials.list().then((list: any) => setMaterials(Array.isArray(list) ? list : []));
    }
  }, [showAddLicence]);

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
      const fromAllocations = Array.isArray(s.licenceAllocations) && s.licenceAllocations.some((a: any) => String(a.licenceId) === licenceId);
      return lid === licenceId || epcg === licenceId || adv === licenceId || fromAllocations;
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

  const licenceIdForManage = selectedLicence?.id != null ? String(selectedLicence.id) : '';
  // Total import utilization for this licence: from allocations first, else licenceImportLines / obligation / invoice
  const totalImportUtilization = importShipments.reduce((sum, s) => {
    if (Array.isArray(s.licenceAllocations) && s.licenceAllocations.length > 0) {
      return sum + s.licenceAllocations.filter((a: any) => String(a.licenceId) === licenceIdForManage).reduce((s2: number, a: any) => s2 + (a.allocatedAmountINR || 0), 0);
    }
    if (Array.isArray(s.licenceImportLines) && s.licenceImportLines.length > 0) {
      return sum + s.licenceImportLines.reduce((s2, l) => s2 + (l.valueINR || 0), 0);
    }
    return sum + (s.licenceObligationAmount ?? s.invoiceValueINR ?? 0);
  }, 0);
  const isOverImportLimit = selectedLicence != null && totalImportUtilization > (selectedLicence.dutySaved || selectedLicence.amountImportINR || 0);
  const fulfilledFromExports = selectedLicence != null ? exportShipments.reduce((s, x) => {
    if (Array.isArray(x.licenceAllocations) && x.licenceAllocations.length > 0) {
      return s + x.licenceAllocations.filter((a: any) => String(a.licenceId) === licenceIdForManage).reduce((s2: number, a: any) => s2 + (a.allocatedAmountINR || 0), 0);
    }
    if (Array.isArray(x.licenceExportLines) && x.licenceExportLines.length > 0) {
      return s + x.licenceExportLines.reduce((s2, l) => s2 + (l.valueINR || 0), 0);
    }
    return s + (x.invoiceValueINR || 0);
  }, 0) : 0;

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
              const fulfilledUSD = getFulfilledUSDForLicence(lic.id, shipments);
              const utilized = getUtilizationForLicence(lic.id, shipments);
              const targetUSD = (lic.exportProducts || []).reduce((s, p) => s + (p.amountUSD || 0), 0);
              const progress = targetUSD > 0 ? Math.min(100, (fulfilledUSD / targetUSD) * 100) : (lic.eoRequired > 0 ? (fulfilled / lic.eoRequired) * 100 : 0);
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
                     <div className="flex items-center justify-end gap-2">
                       <button onClick={() => handleManage(lic)} className="bg-white border border-slate-200 text-slate-600 hover:border-indigo-200 hover:text-indigo-600 px-4 py-2 rounded-xl font-bold text-[10px] uppercase flex items-center gap-2 transition-all shadow-sm">
                         <Settings size={14} /> Manage
                       </button>
                       {onDeleteItem && canDeleteLicence && (
                         <button
                           onClick={async () => {
                             if (!window.confirm(`Delete licence ${lic.number}? This cannot be undone.`)) return;
                             try {
                               await onDeleteItem(lic.id);
                             } catch (e: any) {
                               alert(e?.message || 'Failed to delete licence.');
                             }
                           }}
                           className="p-2 rounded-xl border border-slate-200 text-slate-400 hover:border-red-200 hover:text-red-600 transition-all"
                           title="Delete licence"
                         >
                           <Trash2 size={14} />
                         </button>
                       )}
                     </div>
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
                       <p className="text-2xl font-black text-slate-900 mt-2">{formatINR(selectedLicence.dutySaved || selectedLicence.amountImportINR || 0)}</p>
                       {(selectedLicence.amountImportUSD != null && selectedLicence.amountImportUSD > 0) && <p className="text-[9px] text-slate-600 mt-0.5">USD limit: {formatCurrency(selectedLicence.amountImportUSD, 'USD')}</p>}
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

                 {selectedLicence && (selectedLicence.importProducts?.length ?? 0) > 0 && (
                   <div className="space-y-4">
                     <h3 className="text-xs font-black uppercase text-slate-900">Per-product utilization (whichever limit hits first = 100% utilized)</h3>
                     <p className="text-[10px] text-slate-500">As you allocate imports, these amounts are deducted. When quantity, USD or INR limit is reached for a product, that product is fully utilized.</p>
                     <div className="border border-slate-200 rounded-xl overflow-hidden">
                       <table className="w-full text-sm">
                         <thead>
                           <tr className="bg-slate-50 text-left text-[9px] font-black text-slate-500 uppercase">
                             <th className="p-3">Product</th>
                             <th className="p-3 text-right">Limit (Qty)</th>
                             <th className="p-3 text-right">Used (Qty)</th>
                             <th className="p-3 text-right">Left (Qty)</th>
                             <th className="p-3 text-right">Limit (USD)</th>
                             <th className="p-3 text-right">Used (USD)</th>
                             <th className="p-3 text-right">Limit (INR)</th>
                             <th className="p-3 text-right">Used (INR)</th>
                             <th className="p-3">Status</th>
                           </tr>
                         </thead>
                         <tbody className="divide-y divide-slate-100">
                           {getPerProductUtilization(selectedLicence, shipments).map((row, idx) => (
                             <tr key={idx}>
                               <td className="p-3 font-bold text-slate-800">{row.materialName || row.materialId}</td>
                               <td className="p-3 text-right">{row.limitQty} {row.unit || ''}</td>
                               <td className="p-3 text-right">{row.utilizedQty.toFixed(2)} {row.unit || ''}</td>
                               <td className="p-3 text-right">{row.remainingQty.toFixed(2)} {row.unit || ''}</td>
                               <td className="p-3 text-right">{formatCurrency(row.limitUSD, 'USD')}</td>
                               <td className="p-3 text-right">{formatCurrency(row.utilizedUSD, 'USD')}</td>
                               <td className="p-3 text-right">{formatINR(row.limitINR)}</td>
                               <td className="p-3 text-right">{formatINR(row.utilizedINR)}</td>
                               <td className="p-3">{row.isFullyUtilized ? <span className="text-[10px] font-black uppercase text-emerald-600 bg-emerald-50 px-2 py-1 rounded">100% utilized</span> : <span className="text-[10px] text-slate-500">Open</span>}</td>
                             </tr>
                           ))}
                         </tbody>
                       </table>
                     </div>
                   </div>
                 )}

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
                                  {importShipments.map(sh => {
                                    const allocationSum = Array.isArray(sh.licenceAllocations) && sh.licenceAllocations.length > 0
                                      ? sh.licenceAllocations.filter((a: any) => String(a.licenceId) === licenceIdForManage).reduce((s: number, a: any) => s + (a.allocatedAmountINR || 0), 0)
                                      : null;
                                    const lineSumINR = allocationSum != null ? allocationSum : (Array.isArray(sh.licenceImportLines) && sh.licenceImportLines.length > 0
                                      ? sh.licenceImportLines.reduce((s, l) => s + (l.valueINR || 0), 0)
                                      : null);
                                    const fromAllocations = allocationSum != null && allocationSum > 0;
                                    return (
                                     <tr key={sh.id}>
                                        <td className="py-3 pl-3">
                                           <p className="text-xs font-bold text-slate-900">{sh.invoiceNumber}</p>
                                           <p className="text-[9px] text-slate-400">{formatDate(sh.createdAt)}</p>
                                           {fromAllocations && (
                                             <p className="text-[9px] text-amber-600 mt-0.5">Allocated to this licence</p>
                                           )}
                                           {!fromAllocations && Array.isArray(sh.licenceImportLines) && sh.licenceImportLines.length > 0 && (
                                             <p className="text-[9px] text-amber-600 mt-0.5">BOE: {sh.licenceImportLines.length} product(s) · Σ {formatINR(sh.licenceImportLines.reduce((s, l) => s + (l.valueINR || 0), 0))}</p>
                                           )}
                                        </td>
                                        <td className="py-3">
                                           <p className="text-xs font-bold text-slate-700">{formatINR(sh.invoiceValueINR ?? 0)}</p>
                                        </td>
                                        <td className="py-3">
                                           {fromAllocations ? (
                                             <p className="text-xs font-bold text-amber-700">{formatINR(allocationSum)}</p>
                                           ) : (
                                             <input 
                                                type="number" 
                                                className="w-full max-w-[140px] px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold focus:ring-2 focus:ring-amber-500 outline-none"
                                                value={lineSumINR ?? sh.licenceObligationAmount ?? sh.invoiceValueINR ?? 0}
                                                onChange={(e) => handleObligationChange(sh.id, e.target.value)}
                                             />
                                           )}
                                        </td>
                                     </tr>
                                  ); })}
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
                                  {exportShipments.map(sh => {
                                    const allocationSum = Array.isArray(sh.licenceAllocations) && sh.licenceAllocations.length > 0
                                      ? sh.licenceAllocations.filter((a: any) => String(a.licenceId) === licenceIdForManage).reduce((s: number, a: any) => s + (a.allocatedAmountINR || 0), 0)
                                      : null;
                                    const lineSumINR = allocationSum != null ? allocationSum : (Array.isArray(sh.licenceExportLines) && sh.licenceExportLines.length > 0
                                      ? sh.licenceExportLines.reduce((s, l) => s + (l.valueINR || 0), 0)
                                      : null);
                                    const fromAllocations = allocationSum != null && allocationSum > 0;
                                    return (
                                     <tr key={sh.id}>
                                        <td className="py-3 pl-3">
                                           <p className="text-xs font-bold text-slate-900">{sh.invoiceNumber}</p>
                                           <p className="text-[9px] text-slate-400">{formatDate(sh.createdAt)}</p>
                                           {fromAllocations && (
                                             <p className="text-[9px] text-emerald-600 mt-0.5">Allocated to this licence</p>
                                           )}
                                           {!fromAllocations && Array.isArray(sh.licenceExportLines) && sh.licenceExportLines.length > 0 && (
                                             <p className="text-[9px] text-emerald-600 mt-0.5">Lines: {sh.licenceExportLines.length} product(s) · Σ {formatINR(lineSumINR!)}</p>
                                           )}
                                        </td>
                                        <td className="py-3">
                                           <p className="text-xs font-black text-emerald-600">{formatINR(lineSumINR ?? sh.invoiceValueINR ?? 0)}</p>
                                        </td>
                                     </tr>
                                  ); })}
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
          <div className="bg-white w-full max-w-4xl rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h2 className="text-lg font-black text-slate-900">Add New Licence</h2>
              <button type="button" onClick={() => { setShowAddLicence(false); setNewImportProducts([]); setNewExportProducts([]); }} className="p-2 hover:bg-slate-200 rounded-full transition-all"><X size={20} className="text-slate-500" /></button>
            </div>
            <form
              className="p-8 overflow-y-auto space-y-8"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!newLicence.issueDate || !newLicence.expiryDate || !newLicence.number || !newLicence.company) {
                  alert('Please fill Licence number, Opening date, and Export validity date.');
                  return;
                }
                const id = 'lic' + Date.now();
                const importTotalUSD = newImportProducts.reduce((s, r) => s + (r.amountUSDLimit || 0), 0);
                const importTotalINR = newImportProducts.reduce((s, r) => s + (r.amountINR || 0), 0);
                const dutySaved = importTotalINR > 0 ? importTotalINR : (Number(newLicence.dutySaved) || 0);
                const eoRequired = newExportProducts.reduce((sum, p) => sum + (p.amountINR || 0), 0) || Number(newLicence.eoRequired) || 0;
                const licence: Licence = {
                  id,
                  number: newLicence.number!,
                  type: newLicence.type ?? LicenceType.ADVANCE,
                  issueDate: newLicence.issueDate,
                  importValidityDate: newLicence.importValidityDate || undefined,
                  expiryDate: newLicence.expiryDate,
                  dutySaved,
                  eoRequired,
                  eoFulfilled: 0,
                  company: newLicence.company as 'GFPL' | 'GTEX',
                  status: 'ACTIVE',
                  amountImportUSD: importTotalUSD > 0 ? importTotalUSD : undefined,
                  amountImportINR: importTotalINR > 0 ? importTotalINR : undefined,
                  importProducts: newImportProducts.length > 0 ? newImportProducts : undefined,
                  exportProducts: newExportProducts.length > 0 ? newExportProducts : undefined,
                };
                await onAddItem(licence);
                setShowAddLicence(false);
                setNewLicence({ type: LicenceType.ADVANCE, company: 'GFPL', issueDate: '', importValidityDate: '', expiryDate: '', dutySaved: 0, eoRequired: 0, eoFulfilled: 0, status: 'ACTIVE', number: '', amountImportUSD: 0, amountImportINR: 0 });
                setNewImportProducts([]);
                setNewExportProducts([]);
              }}
            >
              {/* Section 1: Licence details */}
              <div className="space-y-4">
                <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest border-b border-slate-200 pb-2">1. Licence details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Licence Number</label>
                    <input type="text" className="w-full px-4 py-3 rounded-xl border border-slate-200 font-bold" value={newLicence.number ?? ''} onChange={e => setNewLicence(prev => ({ ...prev, number: e.target.value }))} placeholder="e.g. 0310224567" required />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Licence Type</label>
                    <select className="w-full px-4 py-3 rounded-xl border border-slate-200 font-bold bg-white" value={newLicence.type ?? LicenceType.ADVANCE} onChange={e => setNewLicence(prev => ({ ...prev, type: e.target.value as LicenceType }))}>
                      <option value={LicenceType.ADVANCE}>Advance Licence</option>
                      <option value={LicenceType.EPCG}>EPCG</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Company</label>
                    <select className="w-full px-4 py-3 rounded-xl border border-slate-200 font-bold bg-white" value={newLicence.company ?? 'GFPL'} onChange={e => setNewLicence(prev => ({ ...prev, company: e.target.value as 'GFPL' | 'GTEX' }))}>
                      {COMPANY_OPTIONS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Licence opening date</label>
                    <input type="date" className="w-full px-4 py-3 rounded-xl border border-slate-200 font-bold" value={newLicence.issueDate ?? ''} onChange={e => setNewLicence(prev => ({ ...prev, issueDate: e.target.value }))} required />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Import validity (optional)</label>
                    <input type="date" className="w-full px-4 py-3 rounded-xl border border-slate-200 font-bold" value={newLicence.importValidityDate ?? ''} onChange={e => setNewLicence(prev => ({ ...prev, importValidityDate: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Export validity date</label>
                    <input type="date" className="w-full px-4 py-3 rounded-xl border border-slate-200 font-bold" value={newLicence.expiryDate ?? ''} onChange={e => setNewLicence(prev => ({ ...prev, expiryDate: e.target.value }))} required />
                  </div>
                </div>
              </div>

              {/* Section 2: Import */}
              <div className="space-y-4">
                <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest border-b border-slate-200 pb-2">2. Import</h3>
                <p className="text-[10px] text-slate-500">Select products from <strong>Import Material Master</strong>. Enter approved Quantity limit, UOM, Amount in USD, Amount in INR per product. Total below = sum of products A, B, C only. Whichever limit (Qty / USD / INR) is hit first = 100% utilized for that product.</p>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-left text-[9px] font-black text-slate-500 uppercase">
                        <th className="p-3">Material (from master)</th>
                        <th className="p-3">Quantity limit</th>
                        <th className="p-3">UOM</th>
                        <th className="p-3">HSN</th>
                        <th className="p-3">Amount (USD)</th>
                        <th className="p-3">Amount (INR)</th>
                        <th className="p-3">UOM factor</th>
                        <th className="p-3 w-12"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {newImportProducts.map((row, idx) => (
                        <tr key={idx}>
                          <td className="p-2">
                            <select className="w-full px-2 py-2 rounded-lg border font-bold text-sm" value={row.materialId} onChange={e => { const m = materials.find(m => m.id === e.target.value); setNewImportProducts(prev => prev.map((r, i) => i === idx ? { ...r, materialId: e.target.value, materialName: m?.name, unit: m?.unit ?? r.unit, hsnCode: m?.hsnCode ?? r.hsnCode } : r)); }}>
                              <option value="">— Select material —</option>
                              {materials.map(m => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
                            </select>
                          </td>
                          <td className="p-2"><input type="number" step="any" min="0" className="w-full px-2 py-2 rounded-lg border font-bold" value={row.quantityLimit || ''} onChange={e => setNewImportProducts(prev => prev.map((r, i) => i === idx ? { ...r, quantityLimit: parseFloat(e.target.value) || 0 } : r))} placeholder="Limit" /></td>
                          <td className="p-2">
                            <select className="w-full px-2 py-2 rounded-lg border font-bold text-sm" value={row.unit || ''} onChange={e => setNewImportProducts(prev => prev.map((r, i) => i === idx ? { ...r, unit: e.target.value } : r))}>
                              <option value="">—</option>
                              {STANDARDISED_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                          </td>
                          <td className="p-2"><input type="text" className="w-full px-2 py-2 rounded-lg border font-bold text-sm" value={row.hsnCode || ''} onChange={e => setNewImportProducts(prev => prev.map((r, i) => i === idx ? { ...r, hsnCode: e.target.value } : r))} placeholder="HSN" /></td>
                          <td className="p-2"><input type="number" step="any" min="0" className="w-full px-2 py-2 rounded-lg border font-bold" value={row.amountUSDLimit || ''} onChange={e => setNewImportProducts(prev => prev.map((r, i) => i === idx ? { ...r, amountUSDLimit: parseFloat(e.target.value) || 0 } : r))} /></td>
                          <td className="p-2"><input type="number" step="any" min="0" className="w-full px-2 py-2 rounded-lg border font-bold" value={row.amountINR ?? ''} onChange={e => setNewImportProducts(prev => prev.map((r, i) => i === idx ? { ...r, amountINR: parseFloat(e.target.value) || 0 } : r))} /></td>
                          <td className="p-2"><input type="number" step="any" min="0" className="w-16 px-2 py-2 rounded-lg border font-bold text-xs" value={row.uomConversionFactor ?? ''} onChange={e => setNewImportProducts(prev => prev.map((r, i) => i === idx ? { ...r, uomConversionFactor: parseFloat(e.target.value) || undefined } : r))} placeholder="e.g. 2" title="Shipment units per 1 licence unit (e.g. 2 KGS = 1 SQM)" /></td>
                          <td className="p-2"><button type="button" onClick={() => setNewImportProducts(prev => prev.filter((_, i) => i !== idx))} className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg"><Trash2 size={16} /></button></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-amber-50 border-t-2 border-amber-200 text-[10px] font-black text-slate-700">
                        <td className="p-3" colSpan={2}>Total (sum of products above)</td>
                        <td className="p-3" colSpan={2}></td>
                        <td className="p-3">{formatCurrency(newImportProducts.reduce((s, r) => s + (r.amountUSDLimit || 0), 0), 'USD')}</td>
                        <td className="p-3">{formatINR(newImportProducts.reduce((s, r) => s + (r.amountINR || 0), 0))}</td>
                        <td className="p-3" colSpan={2}></td>
                      </tr>
                    </tfoot>
                  </table>
                  <div className="p-2 border-t border-slate-100">
                    <button type="button" onClick={() => setNewImportProducts(prev => [...prev, { materialId: '', quantityLimit: 0, amountUSDLimit: 0, unit: '', hsnCode: '', amountINR: 0 }])} className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"><Plus size={14} /> Add import product</button>
                  </div>
                </div>
              </div>

              {/* Section 3: Export */}
              <div className="space-y-4">
                <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest border-b border-slate-200 pb-2">3. Export</h3>
                <p className="text-[10px] text-slate-500">Add export products (obligation targets). Quantity Target, USD Target, INR Target. Obligation is met when USD target is reached.</p>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-left text-[9px] font-black text-slate-500 uppercase">
                        <th className="p-3">Product name</th>
                        <th className="p-3">HSN</th>
                        <th className="p-3">Quantity target</th>
                        <th className="p-3">Unit</th>
                        <th className="p-3">USD target</th>
                        <th className="p-3">INR target</th>
                        <th className="p-3 w-12"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {newExportProducts.map((row, idx) => (
                        <tr key={idx}>
                          <td className="p-2"><input type="text" className="w-full px-2 py-2 rounded-lg border font-bold" value={row.productName || ''} onChange={e => setNewExportProducts(prev => prev.map((r, i) => i === idx ? { ...r, productName: e.target.value } : r))} placeholder="Name" /></td>
                          <td className="p-2"><input type="text" className="w-full px-2 py-2 rounded-lg border font-bold" value={row.hsnCode || ''} onChange={e => setNewExportProducts(prev => prev.map((r, i) => i === idx ? { ...r, hsnCode: e.target.value } : r))} placeholder="HSN" /></td>
                          <td className="p-2"><input type="number" step="any" min="0" className="w-full px-2 py-2 rounded-lg border font-bold" value={row.quantity || ''} onChange={e => setNewExportProducts(prev => prev.map((r, i) => i === idx ? { ...r, quantity: parseFloat(e.target.value) || 0 } : r))} /></td>
                          <td className="p-2">
                            <select className="w-full px-2 py-2 rounded-lg border font-bold text-sm" value={row.unit || 'KGS'} onChange={e => setNewExportProducts(prev => prev.map((r, i) => i === idx ? { ...r, unit: e.target.value } : r))}>
                              {STANDARDISED_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                          </td>
                          <td className="p-2"><input type="number" step="any" min="0" className="w-full px-2 py-2 rounded-lg border font-bold" value={row.amountUSD || ''} onChange={e => setNewExportProducts(prev => prev.map((r, i) => i === idx ? { ...r, amountUSD: parseFloat(e.target.value) || 0 } : r))} /></td>
                          <td className="p-2"><input type="number" step="any" min="0" className="w-full px-2 py-2 rounded-lg border font-bold" value={row.amountINR || ''} onChange={e => setNewExportProducts(prev => prev.map((r, i) => i === idx ? { ...r, amountINR: parseFloat(e.target.value) || 0 } : r))} /></td>
                          <td className="p-2"><button type="button" onClick={() => setNewExportProducts(prev => prev.filter((_, i) => i !== idx))} className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg"><Trash2 size={16} /></button></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-emerald-50 border-t-2 border-emerald-200 text-[10px] font-black text-slate-700">
                        <td className="p-3" colSpan={4}>Total amount</td>
                        <td className="p-3">{formatCurrency(newExportProducts.reduce((s, r) => s + (r.amountUSD || 0), 0), 'USD')}</td>
                        <td className="p-3">{formatINR(newExportProducts.reduce((s, r) => s + (r.amountINR || 0), 0))}</td>
                        <td className="p-3 w-12"></td>
                      </tr>
                    </tfoot>
                  </table>
                  <div className="p-2 border-t border-slate-100">
                    <button type="button" onClick={() => setNewExportProducts(prev => [...prev, { productName: '', hsnCode: '', quantity: 0, unit: 'KGS', amountUSD: 0, amountINR: 0 }])} className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"><Plus size={14} /> Add export product</button>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-4 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => { setShowAddLicence(false); setNewImportProducts([]); setNewExportProducts([]); }} className="px-6 py-3 rounded-xl font-bold text-slate-500 hover:text-slate-700 uppercase text-xs">Cancel</button>
                <button type="submit" className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-black uppercase text-xs shadow-lg shadow-indigo-100 hover:bg-indigo-700 flex items-center gap-2">
                  <Save size={16} /> Create licence
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