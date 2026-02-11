
import React, { useState, useMemo } from 'react';
import { Shipment, Supplier, Buyer, User, UserRole } from '../types';
import { Truck, Search, Filter, ArrowUpDown, ChevronRight, FileDown, Plus, X, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatINR, formatDate, formatCurrency, getCompanyName, COMPANY_OPTIONS, getShipmentStatusLabel } from '../constants';
import * as XLSX from 'xlsx';
import NewShipment from './NewShipment';

interface ShipmentMasterProps {
  shipments: Shipment[];
  suppliers: Supplier[];
  buyers: Buyer[];
  user: User;
  isExport?: boolean;
  onAddShipment: (s: Shipment) => Promise<void>;
  onUpdateShipment?: (s: Shipment) => void;
  onDeleteShipment?: (id: string) => Promise<void>;
}

type SortKey = 'date_new' | 'date_old' | 'value_high' | 'value_low';

const ShipmentMaster: React.FC<ShipmentMasterProps> = ({ shipments, suppliers, buyers, user, isExport = false, onAddShipment, onUpdateShipment, onDeleteShipment }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [companyFilter, setCompanyFilter] = useState('ALL');
  const [sortOrder, setSortOrder] = useState<SortKey>('date_new');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingRemarksId, setEditingRemarksId] = useState<string | null>(null);
  const [remarksDraft, setRemarksDraft] = useState('');
  const canDelete = user.role === UserRole.MANAGEMENT || user.role === UserRole.CHECKER;

  const getPartnerName = (sh: Shipment) => {
    if (isExport) {
      return buyers.find(b => b.id === sh.buyerId)?.name || sh.buyerId || 'Unknown Buyer';
    }
    return suppliers.find(s => s.id === sh.supplierId)?.name || sh.supplierId || 'Unknown Vendor';
  };

  const filteredAndSorted = useMemo(() => {
    let result = shipments.filter(sh => isExport ? !!sh.buyerId : !!sh.supplierId);

    if (searchTerm) {
      result = result.filter(sh => 
        sh.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        sh.blNumber?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (companyFilter !== 'ALL') {
      result = result.filter(sh => sh.company === companyFilter);
    }

    result.sort((a, b) => {
      switch (sortOrder) {
        case 'date_new': return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'date_old': return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'value_high': return b.amount - a.amount;
        case 'value_low': return a.amount - b.amount;
        default: return 0;
      }
    });

    return result;
  }, [shipments, searchTerm, companyFilter, sortOrder, isExport]);

  const getProductNames = (sh: Shipment) => (sh.items && sh.items.length) ? sh.items.map(i => i.productName).join(', ') : (sh as any).productName || '—';
  /** Import: only payments marked as received count toward Paid/Partial */
  const getPaymentStatus = (sh: Shipment) => {
    const toFC = (p: { amount: number; currency: string }) =>
      p.currency === sh.currency ? p.amount : (p.currency === 'INR' ? p.amount / (sh.exchangeRate || 1) : 0);
    const receivedFC = (sh.payments || []).filter(p => p.received === true).reduce((sum, p) => sum + toFC(p), 0);
    const dueFC = sh.amount || 0;
    if (dueFC <= 0) return receivedFC > 0 ? 'Paid' : 'Pending';
    if (receivedFC >= dueFC) return 'Paid';
    if (receivedFC > 0) return 'Partial';
    return 'Pending';
  };

  /** Export: only payments marked as received count; full received only when received amount >= due (never mark partial as full) */
  const getExportPaymentStatus = (sh: Shipment): { status: 'pending' | 'partial' | 'received'; receivedFC: number } => {
    const toFC = (p: { amount: number; currency: string }) =>
      p.currency === sh.currency ? p.amount : (p.currency === 'INR' ? p.amount / (sh.exchangeRate || 1) : 0);
    const receivedFC = (sh.payments || []).filter(p => p.received === true).reduce((sum, p) => sum + toFC(p), 0);
    const dueFC = sh.amount || 0;
    if (dueFC <= 0) return { status: receivedFC > 0 ? 'received' : 'pending', receivedFC };
    if (receivedFC >= dueFC) return { status: 'received', receivedFC };
    if (receivedFC > 0) return { status: 'partial', receivedFC };
    return { status: 'pending', receivedFC };
  };
  const FILE_STATUS_OPTIONS = ['pending', 'clearing', 'ok'] as const;
  const getFileStatus = (sh: Shipment): string => {
    const v = (sh as any).fileStatus;
    return FILE_STATUS_OPTIONS.includes(v) ? v : (sh.documentsFolderPath ? 'ok' : 'pending');
  };
  const fileStatusLabel = (v: string) => (v === 'ok' ? 'OK' : v === 'clearing' ? 'Clearing' : 'Pending');

  const shipmentToExcelRow = (sh: Shipment): Record<string, string | number | boolean | undefined> => {
    const payStatus = isExport
      ? (() => {
          const { status } = getExportPaymentStatus(sh);
          if (status === 'pending') return 'Pending';
          if (status === 'received') return 'Received';
          return 'Partial received';
        })()
      : getPaymentStatus(sh);
    return {
      id: sh.id,
      supplierId: sh.supplierId ?? '',
      buyerId: sh.buyerId ?? '',
      partner: getPartnerName(sh),
      productSummary: getProductNames(sh),
      productId: (sh as any).productId ?? '',
      rate: sh.rate ?? 0,
      quantity: sh.quantity ?? 0,
      amount: sh.amount ?? 0,
      currency: sh.currency ?? '',
      exchangeRate: sh.exchangeRate ?? 1,
      incoTerm: sh.incoTerm ?? '',
      invoiceNumber: sh.invoiceNumber ?? '',
      invoiceFile: (sh as any).invoiceFile ?? '',
      company: sh.company ?? '',
      expectedShipmentDate: sh.expectedShipmentDate ? formatDate(sh.expectedShipmentDate) : '',
      expectedArrivalDate: sh.expectedArrivalDate ? formatDate(sh.expectedArrivalDate) : '',
      createdAt: sh.createdAt ? formatDate(sh.createdAt) : '',
      fobValueFC: sh.fobValueFC ?? 0,
      fobValueINR: sh.fobValueINR ?? 0,
      isUnderLC: !!sh.isUnderLC,
      lcNumber: sh.lcNumber ?? '',
      lcAmount: sh.lcAmount ?? 0,
      lcDate: sh.lcDate ?? '',
      lcSettled: !!(sh as any).lcSettled,
      linkedLcId: (sh as any).linkedLcId ?? '',
      containerNumber: sh.containerNumber ?? '',
      blNumber: sh.blNumber ?? '',
      blDate: sh.blDate ?? '',
      beNumber: sh.beNumber ?? '',
      beDate: sh.beDate ?? '',
      portCode: sh.portCode ?? '',
      portOfLoading: sh.portOfLoading ?? '',
      portOfDischarge: sh.portOfDischarge ?? '',
      shippingLine: sh.shippingLine ?? '',
      trackingUrl: sh.trackingUrl ?? '',
      assessedValue: sh.assessedValue ?? 0,
      dutyBCD: sh.dutyBCD ?? 0,
      dutySWS: sh.dutySWS ?? 0,
      dutyINT: sh.dutyINT ?? 0,
      gst: sh.gst ?? 0,
      invoiceValueINR: sh.invoiceValueINR ?? 0,
      paymentDueDate: sh.paymentDueDate ?? '',
      invoiceDate: sh.invoiceDate ?? '',
      freightCharges: sh.freightCharges ?? 0,
      otherCharges: sh.otherCharges ?? 0,
      isUnderLicence: !!sh.isUnderLicence,
      linkedLicenceId: sh.linkedLicenceId ?? '',
      licenceObligationAmount: sh.licenceObligationAmount ?? 0,
      status: sh.status ?? '',
      materialStatusLabel: getShipmentStatusLabel(sh.status),
      documentsFolderPath: (sh as any).documentsFolderPath ?? '',
      lodgement: (sh as any).lodgement ?? '',
      lodgementDate: (sh as any).lodgementDate ?? '',
      remarks: (sh as any).remarks ?? '',
      fileStatus: getFileStatus(sh),
      consigneeId: (sh as any).consigneeId ?? '',
      paymentStatus: payStatus,
      items_json: typeof sh.items === 'string' ? sh.items : JSON.stringify(sh.items ?? []),
      history_json: typeof sh.history === 'string' ? sh.history : JSON.stringify(sh.history ?? []),
      documents_json: typeof sh.documents === 'string' ? sh.documents : JSON.stringify(sh.documents ?? {}),
      payments_json: typeof sh.payments === 'string' ? sh.payments : JSON.stringify(sh.payments ?? []),
      attachments_json: typeof (sh as any).attachments === 'string' ? (sh as any).attachments : JSON.stringify((sh as any).attachments ?? {}),
    };
  };

  const handleExportExcel = () => {
    const exportData = filteredAndSorted.map(sh => shipmentToExcelRow(sh));
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Shipments");
    XLSX.writeFile(workbook, `Shipments_${isExport ? 'Export' : 'Import'}.xlsx`);
  };

  const themeClass = isExport ? 'text-amber-600 bg-amber-50' : 'text-indigo-600 bg-indigo-50';

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">{isExport ? 'Outbound' : 'Inbound'} Logistics Ledger</h1>
          <p className="text-slate-500 font-medium">Tracking {isExport ? 'sales' : 'purchase'} flows and compliance.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setShowAddForm(true)}
            className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-white shadow-lg transition-all ${isExport ? 'bg-amber-600 shadow-amber-100 hover:bg-amber-700' : 'bg-indigo-600 shadow-indigo-100 hover:bg-indigo-700'}`}
          >
            <Plus size={18} /> New {isExport ? 'Export' : 'Import'}
          </button>
          <button onClick={handleExportExcel} className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-2xl font-bold hover:bg-slate-50 transition-all shadow-sm">
            <FileDown size={18} /> Excel
          </button>
        </div>
      </header>

      {showAddForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-slate-50 w-full max-w-6xl h-[95vh] rounded-[2.5rem] shadow-2xl overflow-y-auto p-8 relative">
            <button onClick={() => setShowAddForm(false)} className="absolute top-8 right-8 p-2 hover:bg-slate-200 rounded-full transition-all">
              <X size={24} className="text-slate-500" />
            </button>
            <NewShipment 
              isExport={isExport}
              suppliers={suppliers}
              buyers={buyers}
              onSubmit={async (s) => { await onAddShipment(s); setShowAddForm(false); }} 
            />
          </div>
        </div>
      )}

      <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 flex flex-wrap items-center gap-4">
        <div className="flex-1 min-w-[240px] relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Search Invoice or BL..." 
            className="w-full pl-12 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 text-sm font-medium"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-3">
          <select className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold" value={companyFilter} onChange={e => setCompanyFilter(e.target.value)}>
            <option value="ALL">All Companies</option>
            {COMPANY_OPTIONS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className={`px-4 py-2.5 border rounded-2xl text-xs font-bold ${themeClass}`} value={sortOrder} onChange={e => setSortOrder(e.target.value as SortKey)}>
            <option value="date_new">Newest First</option>
            <option value="date_old">Oldest First</option>
            <option value="value_high">Value: High-Low</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {!isExport ? (
                  <>
                    <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Invoice No. & Date</th>
                    <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Supplier</th>
                    <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Product Imported</th>
                    <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Payment to be made</th>
                    <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Payment Status</th>
                    <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Material Status</th>
                    <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">File Status</th>
                    <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Remarks</th>
                    <th className="px-6 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
                  </>
                ) : (
                  <>
                    <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Shipment / Invoice</th>
                    <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Company</th>
                    <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Buyer</th>
                    <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Expected Arrival</th>
                    <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Amount (FC)</th>
                    <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Payment Status</th>
                    <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Material Status</th>
                    <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">File Status</th>
                    <th className="px-6 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAndSorted.map((sh) => (
                <tr key={sh.id} className="hover:bg-slate-50/50 transition-colors">
                  {!isExport ? (
                    <>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-xl ${themeClass}`}><Truck size={18} /></div>
                          <div>
                            <p className="font-bold text-slate-900 text-sm">#{sh.invoiceNumber}</p>
                            <p className="text-[10px] text-slate-500">{sh.invoiceDate ? formatDate(sh.invoiceDate) : '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <p className="font-bold text-slate-700 text-sm">{getPartnerName(sh)}</p>
                      </td>
                      <td className="px-6 py-5">
                        <p className="text-xs text-slate-700 max-w-[180px] truncate" title={getProductNames(sh)}>{getProductNames(sh)}</p>
                      </td>
                      <td className="px-6 py-5">
                        <p className="font-bold text-indigo-600 text-sm">{formatCurrency(sh.amount, sh.currency)}</p>
                      </td>
                      <td className="px-6 py-5">
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${getPaymentStatus(sh) === 'Paid' ? 'bg-emerald-100 text-emerald-700' : getPaymentStatus(sh) === 'Partial' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                          {getPaymentStatus(sh)}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full uppercase bg-blue-100 text-blue-700">{getShipmentStatusLabel(sh.status)}</span>
                      </td>
                      <td className="px-6 py-5">
                        <select
                          value={getFileStatus(sh)}
                          onChange={(e) => onUpdateShipment?.({ ...sh, fileStatus: e.target.value as 'pending' | 'clearing' | 'ok' })}
                          className={`text-[10px] font-bold px-2 py-1 rounded-lg border border-slate-200 bg-white focus:ring-1 focus:ring-indigo-200 ${getFileStatus(sh) === 'ok' ? 'text-emerald-600' : getFileStatus(sh) === 'clearing' ? 'text-amber-600' : 'text-slate-500'}`}
                        >
                          {FILE_STATUS_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>{fileStatusLabel(opt)}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-6 py-5">
                        {editingRemarksId === sh.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              className="w-full min-w-[120px] px-2 py-1 text-xs border border-slate-200 rounded-lg font-medium"
                              value={remarksDraft}
                              onChange={e => setRemarksDraft(e.target.value)}
                              placeholder="Remarks"
                            />
                            <button type="button" onClick={() => { onUpdateShipment?.({ ...sh, remarks: remarksDraft }); setEditingRemarksId(null); }} className="text-[10px] font-black text-emerald-600">Save</button>
                            <button type="button" onClick={() => { setEditingRemarksId(null); setRemarksDraft(''); }} className="text-[10px] font-black text-slate-400">Cancel</button>
                          </div>
                        ) : (
                          <button type="button" onClick={() => { setEditingRemarksId(sh.id); setRemarksDraft(sh.remarks || ''); }} className="text-left text-xs text-slate-600 hover:text-indigo-600 w-full min-w-[80px] truncate block" title={sh.remarks || 'Click to add remarks'}>
                            {sh.remarks || '—'}
                          </button>
                        )}
                      </td>
                      <td className="px-6 py-5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link to={`/shipments/${sh.id}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 font-bold rounded-xl transition-all text-[11px] text-indigo-600 hover:bg-indigo-50">
                            Manage <ChevronRight size={14} />
                          </Link>
                          {canDelete && onDeleteShipment && (
                            <button type="button" onClick={async () => { if (!window.confirm('Delete this shipment? This cannot be undone.')) return; await onDeleteShipment?.(sh.id); }} className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors" title="Delete shipment">
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-xl ${themeClass}`}><Truck size={18} /></div>
                          <div>
                            <p className="font-bold text-slate-900 text-sm">#{sh.invoiceNumber}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <p className="text-xs font-semibold text-slate-700">{getCompanyName(sh.company)}</p>
                      </td>
                      <td className="px-6 py-5">
                        <p className="font-bold text-slate-700 text-sm">{getPartnerName(sh)}</p>
                      </td>
                      <td className="px-6 py-5">
                        <p className="text-xs font-semibold text-slate-600">{sh.expectedArrivalDate ? formatDate(sh.expectedArrivalDate) : '—'}</p>
                      </td>
                      <td className="px-6 py-5">
                        <p className="font-bold text-sm text-emerald-600">{formatCurrency(sh.amount, sh.currency)}</p>
                      </td>
                      <td className="px-6 py-5">
                        {(() => {
                          const { status, receivedFC } = getExportPaymentStatus(sh);
                          if (status === 'pending') {
                            return <span className="text-[10px] font-black px-2 py-0.5 rounded-full uppercase bg-slate-100 text-slate-600">Pending</span>;
                          }
                          if (status === 'received') {
                            return <span className="text-[10px] font-black px-2 py-0.5 rounded-full uppercase bg-emerald-100 text-emerald-700">Received</span>;
                          }
                          return <span className="text-[10px] font-black px-2 py-0.5 rounded-full uppercase bg-amber-100 text-amber-700" title={formatCurrency(receivedFC, sh.currency)}>Partial received</span>;
                        })()}
                      </td>
                      <td className="px-6 py-5">
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full uppercase bg-blue-100 text-blue-700">{getShipmentStatusLabel(sh.status)}</span>
                      </td>
                      <td className="px-6 py-5">
                        <select
                          value={getFileStatus(sh)}
                          onChange={(e) => onUpdateShipment?.({ ...sh, fileStatus: e.target.value as 'pending' | 'clearing' | 'ok' })}
                          className={`text-[10px] font-bold px-2 py-1 rounded-lg border border-slate-200 bg-white focus:ring-1 focus:ring-amber-200 ${getFileStatus(sh) === 'ok' ? 'text-emerald-600' : getFileStatus(sh) === 'clearing' ? 'text-amber-600' : 'text-slate-500'}`}
                        >
                          {FILE_STATUS_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>{fileStatusLabel(opt)}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-6 py-5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link to={`/shipments/${sh.id}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 font-bold rounded-xl transition-all text-[11px] text-amber-600 hover:bg-amber-50">
                            Manage <ChevronRight size={14} />
                          </Link>
                          {canDelete && onDeleteShipment && (
                            <button type="button" onClick={async () => { if (!window.confirm('Delete this shipment? This cannot be undone.')) return; await onDeleteShipment?.(sh.id); }} className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors" title="Delete shipment">
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ShipmentMaster;
