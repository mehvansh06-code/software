import React, { useState } from 'react';
import { Licence, LicenceType, Shipment } from '../types';
import { Award, ShieldAlert, Calendar, FileCheck, TrendingUp, Plus, Briefcase, Settings, X, Save, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { formatINR, formatDate, formatCurrency } from '../constants';

interface LicenceTrackerProps {
  licences: Licence[];
  shipments: Shipment[];
  onUpdateItem: (updated: Licence) => Promise<void>;
  onUpdateShipment: (updated: Shipment) => Promise<void>;
}

const LicenceTracker: React.FC<LicenceTrackerProps> = ({ licences, shipments, onUpdateItem, onUpdateShipment }) => {
  const [selectedLicence, setSelectedLicence] = useState<Licence | null>(null);
  const [importShipments, setImportShipments] = useState<Shipment[]>([]);
  const [exportShipments, setExportShipments] = useState<Shipment[]>([]);
  
  const epcgLicences = licences.filter(l => l.type === LicenceType.EPCG);
  const advanceLicences = licences.filter(l => l.type === LicenceType.ADVANCE);

  const stats = {
    totalDutySaved: licences.reduce((acc, l) => acc + (l.dutySaved || 0), 0),
    totalFulfilled: licences.reduce((acc, l) => acc + (l.eoFulfilled || 0), 0),
    totalRequired: licences.reduce((acc, l) => acc + (l.eoRequired || 0), 0),
  };

  const handleManage = (licence: Licence) => {
    const linked = shipments.filter(s => s.linkedLicenceId === licence.id);
    setImportShipments(linked.filter(s => !!s.supplierId)); // Has Supplier = Import
    setExportShipments(linked.filter(s => !!s.buyerId)); // Has Buyer = Export
    setSelectedLicence(licence);
  };

  const handleObligationChange = (shipmentId: string, value: string) => {
    setImportShipments(prev => prev.map(s => s.id === shipmentId ? { ...s, licenceObligationAmount: parseFloat(value) || 0 } : s));
  };

  const saveObligations = async () => {
    if (!selectedLicence) return;
    
    // 1. Update all modified Import shipments
    for (const sh of importShipments) {
      await onUpdateShipment(sh);
    }
    
    // 2. Calculate Totals
    // eoFulfilled = Sum of Exports
    const totalFulfilled = exportShipments.reduce((sum, s) => sum + (s.invoiceValueINR || 0), 0);
    
    // Note: Utilized imports do NOT change dutySaved. Duty Saved is the fixed limit.
    // We only update eoFulfilled based on exports.
    const updatedLicence = { 
      ...selectedLicence, 
      eoFulfilled: totalFulfilled 
    };
    
    await onUpdateItem(updatedLicence);
    setSelectedLicence(null);
  };

  // Calculate total utilized amount from imports to display in modal
  const totalImportUtilization = importShipments.reduce((sum, s) => sum + (s.licenceObligationAmount || 0), 0);

  const LicenceTable = ({ title, data, icon: Icon, colorClass }: { title: string, data: Licence[], icon: React.ElementType, colorClass: string }) => (
    <section className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden mb-8">
      <div className="p-8 border-b border-slate-50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-2xl ${colorClass}`}>
            <Icon size={24} />
          </div>
          <div>
             <h2 className="text-lg font-black text-slate-900 tracking-tight">{title}</h2>
             <p className="text-xs text-slate-400 font-medium">Monitoring compliance and regulatory thresholds</p>
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
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Licence ID</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Company</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Import Limit (Duty Saved)</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">EO Target</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Fulfilled</th>
              <th className="px-8 py-5 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.map(lic => {
              const progress = lic.eoRequired > 0 ? (lic.eoFulfilled / lic.eoRequired) * 100 : 0;
              const isNearingExpiry = new Date(lic.expiryDate).getTime() - Date.now() < 120 * 24 * 60 * 60 * 1000;

              return (
                <tr key={lic.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-8 py-6">
                    <p className="font-black text-slate-900 text-sm tracking-tight">{lic.number}</p>
                    <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">Exp: {formatDate(lic.expiryDate)}</p>
                  </td>
                  <td className="px-8 py-6">
                    <span className="text-[10px] font-black text-slate-400 bg-white border border-slate-100 px-2 py-1 rounded-lg uppercase tracking-widest">{lic.company}</span>
                  </td>
                  <td className="px-8 py-6">
                    <p className="font-black text-amber-600 text-sm">{formatINR(lic.dutySaved)}</p>
                  </td>
                  <td className="px-8 py-6">
                    <p className="font-black text-indigo-600 text-sm">{formatINR(lic.eoRequired)}</p>
                  </td>
                  <td className="px-8 py-6">
                    <div className="w-48">
                      <div className="flex justify-between items-center mb-2">
                         <span className={`text-[10px] font-black ${progress > 80 ? 'text-emerald-500' : 'text-slate-500'} uppercase tracking-tight`}>
                           {Math.round(progress)}%
                         </span>
                         <span className="text-[9px] font-black text-slate-300 uppercase tracking-tighter">{formatINR(lic.eoFulfilled)}</span>
                      </div>
                      <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-1000 ease-out shadow-sm ${progress > 90 ? 'bg-emerald-500' : 'bg-indigo-600'}`} 
                          style={{ width: `${progress}%` }} 
                        />
                      </div>
                    </div>
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
          <p className="text-slate-500 font-medium">Real-time monitoring of Export Obligations & Customs Duty Benefits.</p>
        </div>
        <button className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 flex items-center gap-2">
          <Plus size={18} /> Add Compliance Record
        </button>
      </header>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm relative overflow-hidden">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl"><TrendingUp size={20} /></div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total EO Target</p>
          </div>
          <p className="text-2xl font-black text-slate-900">{formatINR(stats.totalRequired)}</p>
          <div className="absolute top-0 right-0 p-4 opacity-5"><Award size={80} /></div>
        </div>
        <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm relative overflow-hidden">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl"><FileCheck size={20} /></div>
            <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Total Fulfilled</p>
          </div>
          <p className="text-2xl font-black text-emerald-600">{formatINR(stats.totalFulfilled)}</p>
          <div className="absolute top-0 right-0 p-4 opacity-5"><FileCheck size={80} /></div>
        </div>
        <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm relative overflow-hidden">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 bg-rose-50 text-rose-600 rounded-xl"><ShieldAlert size={20} /></div>
            <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest">Pending Liability</p>
          </div>
          <p className="text-2xl font-black text-slate-900">{formatINR(Math.max(0, stats.totalRequired - stats.totalFulfilled))}</p>
          <div className="absolute top-0 right-0 p-4 opacity-5"><ShieldAlert size={80} /></div>
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
                 <button onClick={() => setSelectedLicence(null)} className="p-2 hover:bg-slate-200 rounded-full transition-all text-slate-400"><X size={20} /></button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-8">
                 <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="bg-amber-50 p-6 rounded-2xl border border-amber-100">
                       <p className="text-[10px] font-black uppercase text-amber-600">Import Limit (Duty Saved)</p>
                       <p className="text-2xl font-black text-slate-900 mt-2">{formatINR(selectedLicence.dutySaved)}</p>
                       <p className="text-[9px] text-slate-500 mt-1">Fixed Allowable</p>
                    </div>
                    <div className="bg-orange-50 p-6 rounded-2xl border border-orange-100">
                       <p className="text-[10px] font-black uppercase text-orange-600">Actual Utilization</p>
                       <p className="text-2xl font-black text-slate-900 mt-2">{formatINR(totalImportUtilization)}</p>
                       <p className="text-[9px] text-slate-500 mt-1">Consumed by Imports</p>
                    </div>
                    <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-100">
                       <p className="text-[10px] font-black uppercase text-emerald-600">EO Target</p>
                       <p className="text-2xl font-black text-slate-900 mt-2">{formatINR(selectedLicence.eoRequired)}</p>
                       <p className="text-[9px] text-slate-500 mt-1">Required Export Value</p>
                    </div>
                    <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100">
                       <p className="text-[10px] font-black uppercase text-blue-600">Achieved Fulfilment</p>
                       <p className="text-2xl font-black text-slate-900 mt-2">{formatINR(exportShipments.reduce((s, x) => s + (x.invoiceValueINR || 0), 0))}</p>
                       <p className="text-[9px] text-slate-500 mt-1">Actual Exports</p>
                    </div>
                 </div>

                 <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* IMPORTS: UTILIZATION */}
                    <div className="space-y-4">
                       <h3 className="text-xs font-black uppercase text-slate-900 flex items-center gap-2">
                         <ArrowDownLeft size={16} className="text-amber-500" /> Licence Utilization (Imports)
                       </h3>
                       <div className="bg-slate-50 rounded-2xl border border-slate-100 overflow-hidden">
                          {importShipments.length > 0 ? (
                            <table className="w-full">
                               <thead>
                                  <tr className="text-left text-[9px] font-black uppercase text-slate-400 border-b">
                                     <th className="pb-3 pt-3 pl-3">Invoice</th>
                                     <th className="pb-3 pt-3">Amount Utilized (Duty/Value)</th>
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
                                           <input 
                                              type="number" 
                                              className="w-full max-w-[140px] px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold focus:ring-2 focus:ring-amber-500 outline-none"
                                              value={sh.licenceObligationAmount || 0}
                                              onChange={(e) => handleObligationChange(sh.id, e.target.value)}
                                           />
                                        </td>
                                     </tr>
                                  ))}
                               </tbody>
                            </table>
                          ) : <p className="p-6 text-center text-xs text-slate-400 italic">No import shipments using this licence.</p>}
                       </div>
                    </div>

                    {/* EXPORTS: FULFILLMENT */}
                    <div className="space-y-4">
                       <h3 className="text-xs font-black uppercase text-slate-900 flex items-center gap-2">
                         <ArrowUpRight size={16} className="text-emerald-500" /> Obligation Fulfillment (Exports)
                       </h3>
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
    </div>
  );
};

export default LicenceTracker;