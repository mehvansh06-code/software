import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Licence, LicenceType, LicenceImportProduct, LicenceExportProduct, Shipment, User, UserRole, Material } from '../types';
import { Award, ShieldAlert, Calendar, FileCheck, TrendingUp, Plus, Briefcase, Settings, X, Save, ArrowDownLeft, ArrowUpRight, Pencil, Trash2, ArrowLeft, FileDown } from 'lucide-react';
import { downloadWorkbookAsXlsx } from '../utils/excel';
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

/** Per-product import utilization for a licence. Uses licenceAllocations when present, else licenceImportLines (product-wise import lines). */
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
      if (!s.supplierId) continue;
      const isLinked = (s?.linkedLicenceId != null && s.linkedLicenceId !== '' && String(s.linkedLicenceId) === id) ||
        (s?.epcgLicenceId != null && String(s.epcgLicenceId) === id) ||
        (s?.advLicenceId != null && String(s.advLicenceId) === id) ||
        (Array.isArray(s.licenceAllocations) && s.licenceAllocations.some((a: any) => String(a.licenceId) === id));
      if (!isLinked) continue;
      if (Array.isArray(s.licenceAllocations) && s.licenceAllocations.length > 0) {
        const allocs = s.licenceAllocations.filter((a: any) => String(a.licenceId) === id && (String(a.productId) === String(prod.materialId)));
        for (const a of allocs) {
          utilizedUSD += a.allocatedAmountUSD || 0;
          utilizedINR += a.allocatedAmountINR || 0;
          utilizedQty += (a.allocatedQuantity || 0) / factor;
        }
      } else if (Array.isArray(s.licenceImportLines) && s.licenceImportLines.length > 0) {
        const linesForProduct = s.licenceImportLines.filter((line: { productId?: string; productName?: string }) =>
          String(line.productId ?? '') === String(prod.materialId ?? '') ||
          (line.productName != null && prod.materialName != null && String(line.productName).trim() === String(prod.materialName).trim())
        );
        for (const ln of linesForProduct) {
          const line = ln as { quantity?: number; amountUSD?: number; valueINR?: number };
          utilizedQty += (line.quantity || 0) / factor;
          utilizedUSD += line.amountUSD || 0;
          utilizedINR += line.valueINR || 0;
        }
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
  const { id: licenceIdFromUrl } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasPermission } = usePermissions(user);
  const canDeleteLicence = hasPermission('licences.delete');
  const [selectedLicence, setSelectedLicence] = useState<Licence | null>(null);
  const selectedLicenceResolved = licenceIdFromUrl ? (licences.find(l => l.id === licenceIdFromUrl) ?? null) : selectedLicence;
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

  useEffect(() => {
    if (!licenceIdFromUrl || !selectedLicenceResolved) return;
    const licenceId = String(selectedLicenceResolved.id);
    const linked = shipments.filter(s => {
      const lid = s?.linkedLicenceId != null && s.linkedLicenceId !== '' ? String(s.linkedLicenceId) : null;
      const epcg = s?.epcgLicenceId != null && s.epcgLicenceId !== '' ? String(s.epcgLicenceId) : null;
      const adv = s?.advLicenceId != null && s.advLicenceId !== '' ? String(s.advLicenceId) : null;
      const fromAllocations = Array.isArray(s.licenceAllocations) && s.licenceAllocations.some((a: any) => String(a.licenceId) === licenceId);
      return lid === licenceId || epcg === licenceId || adv === licenceId || fromAllocations;
    });
    setImportShipments(linked.filter(s => !!s.supplierId));
    setExportShipments(linked.filter(s => !!s.buyerId));
  }, [licenceIdFromUrl, selectedLicenceResolved?.id, shipments]);

  const handleManage = (licence: Licence) => {
    navigate(`/licences/${licence.id}`);
  };

  const handleObligationChange = (shipmentId: string, value: string) => {
    setImportShipments(prev => prev.map(s => s.id === shipmentId ? { ...s, licenceObligationAmount: parseFloat(value) || 0 } : s));
  };

  const getImportLines = (sh: Shipment): typeof sh.licenceImportLines => {
    return Array.isArray(sh.licenceImportLines) && sh.licenceImportLines.length > 0 ? sh.licenceImportLines : [];
  };

  const addImportLine = (shipmentId: string) => {
    setImportShipments(prev => prev.map(s => {
      if (s.id !== shipmentId) return s;
      const items = s.items || [];
      const first = items[0];
      const newLine = {
        productId: first?.productId,
        productName: first?.productName ?? '',
        quantity: 0,
        unit: first?.unit ?? 'KGS',
        valueINR: 0,
        amountUSD: 0,
      };
      return { ...s, licenceImportLines: [...getImportLines(s), newLine] };
    }));
  };

  const removeImportLine = (shipmentId: string, lineIndex: number) => {
    setImportShipments(prev => prev.map(s => {
      if (s.id !== shipmentId) return s;
      const lines = getImportLines(s);
      return { ...s, licenceImportLines: lines.filter((_, i) => i !== lineIndex) };
    }));
  };

  const updateImportLine = (shipmentId: string, lineIndex: number, field: 'productId' | 'quantity' | 'unit' | 'valueINR' | 'amountUSD', value: number | string) => {
    setImportShipments(prev => prev.map(s => {
      if (s.id !== shipmentId) return s;
      const lines = getImportLines(s);
      const line = lines[lineIndex];
      if (!line) return s;
      if (field === 'productId') {
        const item = (s.items || []).find((it: any) => String(it.productId) === String(value) || (it.productName && String(it.productName) === String(value)));
        const next = { ...line, productId: item?.productId, productName: item?.productName ?? String(value), unit: item?.unit ?? line.unit };
        const nextLines = lines.map((l, i) => i === lineIndex ? next : l);
        return { ...s, licenceImportLines: nextLines };
      }
      const parsed = field === 'unit' ? String(value) : (parseFloat(String(value)) || 0);
      const next = { ...line, [field]: parsed };
      const exchangeRate = Number(s.exchangeRate) || 0;
      if (field === 'valueINR' && exchangeRate > 0) next.amountUSD = Number(parsed) / exchangeRate;
      if (field === 'amountUSD' && exchangeRate > 0) next.valueINR = Number(parsed) * exchangeRate;
      const nextLines = lines.map((l, i) => i === lineIndex ? next : l);
      return { ...s, licenceImportLines: nextLines };
    }));
  };

  const getExportLineDefaults = (sh: Shipment) => {
    const line = Array.isArray(sh.licenceExportLines) && sh.licenceExportLines.length > 0 ? sh.licenceExportLines[0] : null;
    return {
      quantity: line?.quantity ?? 0,
      unit: (line as any)?.unit ?? 'KGS',
      valueINR: line?.valueINR ?? sh.invoiceValueINR ?? 0,
      valueUSD: line?.valueUSD ?? (sh.fobValueFC ?? sh.invoiceValueINR ? (sh.invoiceValueINR / (sh.exchangeRate || 1)) : 0),
    };
  };

  const updateExportLine = (shipmentId: string, field: 'quantity' | 'unit' | 'valueINR' | 'valueUSD', value: number | string) => {
    setExportShipments(prev => prev.map(s => {
      if (s.id !== shipmentId) return s;
      const current = getExportLineDefaults(s);
      const parsed = field === 'unit' ? value : (parseFloat(String(value)) || 0);
      const next = { ...current, [field]: parsed };
      const line = { productName: s.invoiceNumber || '', hsnCode: '', quantity: next.quantity, unit: next.unit, valueINR: next.valueINR, valueUSD: next.valueUSD };
      return { ...s, licenceExportLines: [line] };
    }));
  };

  const saveObligations = async () => {
    const lic = selectedLicenceResolved ?? selectedLicence;
    if (!lic) return;
    try {
      for (const sh of importShipments) {
        const lines = getImportLines(sh);
        const totalINR = lines.reduce((sum, l) => sum + (l.valueINR || 0), 0);
        await onUpdateShipment({ ...sh, licenceImportLines: lines.length > 0 ? lines : undefined, licenceObligationAmount: totalINR });
      }
      for (const sh of exportShipments) {
        const def = getExportLineDefaults(sh);
        const line = { productName: sh.invoiceNumber || '', hsnCode: '', quantity: def.quantity, unit: def.unit, valueINR: def.valueINR, valueUSD: def.valueUSD };
        await onUpdateShipment({ ...sh, licenceExportLines: [line] });
      }
      const totalFulfilled = exportShipments.reduce((sum, s) => {
        const def = getExportLineDefaults(s);
        return sum + (def.valueINR || 0);
      }, 0);
      await onUpdateItem({ ...lic, eoFulfilled: totalFulfilled });
      setSelectedLicence(null);
      if (licenceIdFromUrl) navigate('/');
    } catch (err: any) {
      alert(err?.message || 'Failed to save licence obligations.');
    }
  };

  const licenceIdForManage = selectedLicenceResolved?.id != null ? String(selectedLicenceResolved.id) : '';
  // Total import utilization for this licence: from allocations first, else licenceImportLines / obligation / invoice
  const totalImportUtilization = importShipments.reduce((sum, s) => {
    if (Array.isArray(s.licenceAllocations) && s.licenceAllocations.length > 0) {
      return sum + s.licenceAllocations.filter((a: any) => String(a.licenceId) === licenceIdForManage).reduce((s2: number, a: any) => s2 + (a.allocatedAmountINR || 0), 0);
    }
    const lines = getImportLines(s);
    if (lines.length > 0) return sum + lines.reduce((s2, l) => s2 + (l.valueINR || 0), 0);
    return sum + (s.licenceObligationAmount ?? s.invoiceValueINR ?? 0);
  }, 0);
  const isOverImportLimit = selectedLicenceResolved != null && totalImportUtilization > (selectedLicenceResolved.dutySaved || selectedLicenceResolved.amountImportINR || 0);
  const fulfilledFromExports = selectedLicenceResolved != null ? exportShipments.reduce((s, x) => {
    if (Array.isArray(x.licenceAllocations) && x.licenceAllocations.length > 0) {
      return s + x.licenceAllocations.filter((a: any) => String(a.licenceId) === licenceIdForManage).reduce((s2: number, a: any) => s2 + (a.allocatedAmountINR || 0), 0);
    }
    if (Array.isArray(x.licenceExportLines) && x.licenceExportLines.length > 0) {
      return s + x.licenceExportLines.reduce((s2, l) => s2 + (l.valueINR || 0), 0);
    }
    return s + (x.invoiceValueINR || 0);
  }, 0) : 0;

  const exportSingleLicenceToExcel = React.useCallback((lic: Licence) => {
    const fulfilled = getFulfilledForLicence(lic.id, shipments);
    const fulfilledUSD = getFulfilledUSDForLicence(lic.id, shipments);
    const utilized = getUtilizationForLicence(lic.id, shipments);
    const targetUSD = (lic.exportProducts || []).reduce((s, p) => s + (p.amountUSD || 0), 0);
    const progress = targetUSD > 0 ? Math.min(100, (fulfilledUSD / targetUSD) * 100) : (lic.eoRequired > 0 ? (fulfilled / lic.eoRequired) * 100 : 0);
    const isNearingExpiry = new Date(lic.expiryDate).getTime() - Date.now() < 120 * 24 * 60 * 60 * 1000;
    const isOverLimit = utilized > (lic.dutySaved || 0);

    const summaryRow = {
      'Licence No.': lic.number,
      'Type': lic.type,
      'Company': lic.company,
      'Status': lic.status,
      'Opening Date': formatDate(lic.issueDate),
      'Import Validity Date': formatDate(lic.importValidityDate),
      'Obligation Due By': formatDate(lic.expiryDate),
      'Duty-free Import Limit (INR)': formatINR(lic.dutySaved),
      'Used by Imports (INR)': formatINR(utilized),
      'Export Obligation (INR)': formatINR(lic.eoRequired),
      'Fulfilled by Exports (INR)': formatINR(fulfilled),
      'Progress %': Math.round(progress),
      'Over Limit': isOverLimit ? 'Yes' : 'No',
      'Nearing Due': isNearingExpiry ? 'Yes' : 'No',
    };

    const productRows: Record<string, string | number>[] = [];
    if (lic.importProducts && lic.importProducts.length > 0) {
      const rows = getPerProductUtilization(lic, shipments);
      for (const row of rows) {
        productRows.push({
          'Licence No.': lic.number,
          'Type': lic.type,
          'Company': lic.company,
          'Product': row.materialName || row.materialId || '—',
          'Unit': row.unit || '—',
          'Limit (Qty)': row.limitQty,
          'Used (Qty)': row.utilizedQty.toFixed(2),
          'Left (Qty)': row.remainingQty.toFixed(2),
          'Limit (USD)': formatCurrency(row.limitUSD, 'USD'),
          'Used (USD)': formatCurrency(row.utilizedUSD, 'USD'),
          'Left (USD)': formatCurrency(row.remainingUSD, 'USD'),
          'Limit (INR)': formatINR(row.limitINR),
          'Used (INR)': formatINR(row.utilizedINR),
          'Left (INR)': formatINR(row.remainingINR),
          'Status': row.isFullyUtilized ? '100% utilized' : 'Open',
        });
      }
    }

    const dateStr = new Date().toISOString().slice(0, 10);
    const safeNumber = (lic.number || 'lic').replace(/[/\\:*?"<>|]/g, '_');
    void downloadWorkbookAsXlsx(`Licence_${safeNumber}_${dateStr}.xlsx`, [
      { sheetName: 'Licence', rows: [summaryRow] },
      {
        sheetName: 'Product utilization',
        rows: productRows.length > 0
          ? productRows
          : [{ Note: 'No product-wise data (no import products defined on this licence).' }],
      },
    ]);
  }, [shipments]);

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

  if (selectedLicenceResolved) {
    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="bg-white w-full max-w-6xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col relative border border-slate-100">
          <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => navigate('/')} className="p-2 hover:bg-slate-200 rounded-full transition-all text-slate-500 flex items-center gap-2" title="Back to list">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-xl font-black text-slate-900 uppercase">Manage Obligations</h2>
            <p className="text-xs font-bold text-slate-500 mt-1">Licence: <span className="text-indigo-600">{selectedLicenceResolved.number}</span></p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => exportSingleLicenceToExcel(selectedLicenceResolved)}
            className="px-4 py-2 rounded-xl font-bold text-slate-700 border border-slate-200 hover:bg-slate-50 flex items-center gap-2 text-xs uppercase tracking-widest"
          >
            <FileDown size={14} /> Export to Excel
          </button>
          {canEditLicence(user) && (
            <button
              type="button"
              onClick={() => { setEditLicenceForm({ ...selectedLicenceResolved }); setShowEditLicence(true); }}
              className="px-4 py-2 rounded-xl font-bold text-indigo-600 hover:bg-indigo-50 flex items-center gap-2 text-xs uppercase tracking-widest"
            >
              <Pencil size={14} /> Edit licence details
            </button>
          )}
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
                      if (!selectedLicenceResolved?.id || !editLicenceForm.number?.trim()) { alert('Licence number is required.'); return; }
                      const updated: Licence = {
                        ...selectedLicenceResolved,
                        type: editLicenceForm.type ?? selectedLicenceResolved.type,
                        number: editLicenceForm.number,
                        company: (editLicenceForm.company as 'GFPL' | 'GTEX') ?? selectedLicenceResolved.company,
                        issueDate: editLicenceForm.issueDate ?? selectedLicenceResolved.issueDate,
                        importValidityDate: editLicenceForm.importValidityDate ?? selectedLicenceResolved.importValidityDate,
                        expiryDate: editLicenceForm.expiryDate ?? selectedLicenceResolved.expiryDate,
                        dutySaved: Number(editLicenceForm.dutySaved) ?? selectedLicenceResolved.dutySaved,
                        eoRequired: Number(editLicenceForm.eoRequired) ?? selectedLicenceResolved.eoRequired,
                        eoFulfilled: selectedLicenceResolved.eoFulfilled,
                        status: (editLicenceForm.status as 'ACTIVE' | 'CLOSED' | 'EXPIRED') ?? selectedLicenceResolved.status,
                      };
                      try {
                        await onUpdateItem(updated);
                        setShowEditLicence(false);
                      } catch (err: any) {
                        alert(err?.message || 'Failed to save licence.');
                      }
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
                  <p className="text-xs text-red-600 mt-0.5">Used {formatINR(totalImportUtilization)} against limit {formatINR(selectedLicenceResolved.dutySaved)}. Adjust amounts below or link fewer imports to this licence.</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-amber-50 p-6 rounded-2xl border border-amber-100">
                <p className="text-[10px] font-black uppercase text-amber-600">Duty-free import limit</p>
                <p className="text-2xl font-black text-slate-900 mt-2">{formatINR(selectedLicenceResolved.dutySaved || selectedLicenceResolved.amountImportINR || 0)}</p>
                {(selectedLicenceResolved.amountImportUSD != null && selectedLicenceResolved.amountImportUSD > 0) && <p className="text-[9px] text-slate-600 mt-0.5">USD limit: {formatCurrency(selectedLicenceResolved.amountImportUSD, 'USD')}</p>}
                <p className="text-[9px] text-slate-500 mt-1">Fixed: max you can import without duty/GST</p>
              </div>
              <div className="bg-orange-50 p-6 rounded-2xl border border-orange-100">
                <p className="text-[10px] font-black uppercase text-orange-600">Used by imports</p>
                <p className={`text-2xl font-black mt-2 ${isOverImportLimit ? 'text-red-600' : 'text-slate-900'}`}>{formatINR(totalImportUtilization)}</p>
                <p className="text-[9px] text-slate-500 mt-1">From linked import invoices (editable below)</p>
              </div>
              <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-100">
                <p className="text-[10px] font-black uppercase text-emerald-600">Export obligation</p>
                <p className="text-2xl font-black text-slate-900 mt-2">{formatINR(selectedLicenceResolved.eoRequired)}</p>
                <p className="text-[9px] text-slate-500 mt-1">Must export by {formatDate(selectedLicenceResolved.expiryDate)}</p>
              </div>
              <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100">
                <p className="text-[10px] font-black uppercase text-blue-600">Fulfilled by exports</p>
                <p className="text-2xl font-black text-slate-900 mt-2">{formatINR(fulfilledFromExports)}</p>
                <p className="text-[9px] text-slate-500 mt-1">Sum of linked export invoice value (INR)</p>
              </div>
            </div>

            {selectedLicenceResolved && (selectedLicenceResolved.importProducts?.length ?? 0) > 0 && (
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
                        <th className="p-3 text-right">Left (USD)</th>
                        <th className="p-3 text-right">Limit (INR)</th>
                        <th className="p-3 text-right">Used (INR)</th>
                        <th className="p-3 text-right">Left (INR)</th>
                        <th className="p-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {getPerProductUtilization(selectedLicenceResolved, importShipments).map((row, idx) => (
                        <tr key={idx}>
                          <td className="p-3 font-bold text-slate-800">{row.materialName || row.materialId}</td>
                          <td className="p-3 text-right">{row.limitQty} {row.unit || ''}</td>
                          <td className="p-3 text-right">{row.utilizedQty.toFixed(2)} {row.unit || ''}</td>
                          <td className="p-3 text-right">{row.remainingQty.toFixed(2)} {row.unit || ''}</td>
                          <td className="p-3 text-right">{formatCurrency(row.limitUSD, 'USD')}</td>
                          <td className="p-3 text-right">{formatCurrency(row.utilizedUSD, 'USD')}</td>
                          <td className="p-3 text-right">{formatCurrency(row.remainingUSD, 'USD')}</td>
                          <td className="p-3 text-right">{formatINR(row.limitINR)}</td>
                          <td className="p-3 text-right">{formatINR(row.utilizedINR)}</td>
                          <td className="p-3 text-right">{formatINR(row.remainingINR)}</td>
                          <td className="p-3">{row.isFullyUtilized ? <span className="text-[10px] font-black uppercase text-emerald-600 bg-emerald-50 px-2 py-1 rounded">100% utilized</span> : <span className="text-[10px] text-slate-500">Open</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-8">
              <div className="space-y-4">
                <h3 className="text-xs font-black uppercase text-slate-900 flex items-center gap-2">
                  <ArrowDownLeft size={16} className="text-amber-500" /> Duty-free utilization (imports)
                </h3>
                <p className="text-[10px] text-slate-500">Data from linked import invoice. Select product from that invoice and enter quantity, amount (INR/USD) per line.</p>
                <div className="space-y-6">
                  {importShipments.length > 0 ? importShipments.map(sh => {
                    const lines = getImportLines(sh);
                    const items = sh.items || [];
                    const exRate = sh.exchangeRate || 1;
                    return (
                      <div key={sh.id} className="bg-slate-50 rounded-2xl border border-slate-100 overflow-hidden">
                        <div className="px-4 py-3 border-b border-slate-200 grid grid-cols-2 md:grid-cols-4 gap-4 bg-white/50">
                          <div>
                            <span className="text-[9px] font-black uppercase text-slate-400 block">Invoice</span>
                            <span className="text-sm font-bold text-slate-900">{sh.invoiceNumber || '—'}</span>
                          </div>
                          <div>
                            <span className="text-[9px] font-black uppercase text-slate-400 block">Bill of Entry No.</span>
                            <span className="text-sm font-bold text-slate-900">{sh.boeNumber || '—'}</span>
                          </div>
                          <div>
                            <span className="text-[9px] font-black uppercase text-slate-400 block">Bill of Entry Date</span>
                            <span className="text-sm font-bold text-slate-900">{formatDate(sh.boeDate)}</span>
                          </div>
                          <div>
                            <span className="text-[9px] font-black uppercase text-slate-400 block">Exchange rate</span>
                            <span className="text-sm font-bold text-slate-900">{exRate}</span>
                          </div>
                        </div>
                        <div className="p-4">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-[9px] font-black text-slate-500 uppercase border-b border-slate-200">
                                <th className="py-2 pr-2">Product (from invoice)</th>
                                <th className="py-2 pr-2 text-right">Quantity</th>
                                <th className="py-2 pr-2">UOM</th>
                                <th className="py-2 pr-2 text-right">Amount (INR)</th>
                                <th className="py-2 pr-2 text-right">Amount (USD)</th>
                                <th className="py-2 pr-2 w-10"></th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {lines.map((line, lineIdx) => (
                                <tr key={lineIdx}>
                                  <td className="py-2 pr-2">
                                    <select
                                      className="w-full max-w-xs px-2 py-1.5 rounded-lg border border-slate-200 text-xs font-bold bg-white"
                                      value={line.productId ?? line.productName ?? ''}
                                      onChange={e => updateImportLine(sh.id, lineIdx, 'productId', e.target.value)}
                                    >
                                      <option value="">Select product</option>
                                      {items.map((it: any) => (
                                        <option key={it.productId ?? it.productName ?? lineIdx} value={it.productId ?? it.productName}>{it.productName ?? it.productId ?? '—'}</option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="py-2 pr-2 text-right">
                                    <input type="number" step="any" min="0" className="w-24 text-right px-2 py-1.5 rounded-lg border border-slate-200 text-xs font-bold" value={line.quantity || ''} onChange={e => updateImportLine(sh.id, lineIdx, 'quantity', e.target.value)} />
                                  </td>
                                  <td className="py-2 pr-2">
                                    <select className="w-24 px-2 py-1.5 rounded-lg border border-slate-200 text-xs font-bold bg-white" value={line.unit ?? 'KGS'} onChange={e => updateImportLine(sh.id, lineIdx, 'unit', e.target.value)}>
                                      {(STANDARDISED_UNITS as string[]).map(u => <option key={u} value={u}>{u}</option>)}
                                    </select>
                                  </td>
                                  <td className="py-2 pr-2 text-right">
                                    <input type="number" step="any" min="0" className="w-28 text-right px-2 py-1.5 rounded-lg border border-slate-200 text-xs font-bold" value={line.valueINR ?? ''} onChange={e => updateImportLine(sh.id, lineIdx, 'valueINR', e.target.value)} />
                                  </td>
                                  <td className="py-2 pr-2 text-right">
                                    <input type="number" step="any" min="0" className="w-24 text-right px-2 py-1.5 rounded-lg border border-slate-200 text-xs font-bold" value={line.amountUSD ?? ''} onChange={e => updateImportLine(sh.id, lineIdx, 'amountUSD', e.target.value)} />
                                  </td>
                                  <td className="py-2 pr-2">
                                    <button type="button" onClick={() => removeImportLine(sh.id, lineIdx)} className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:bg-red-50 hover:text-red-600 hover:border-red-200"><Trash2 size={14} /></button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <button type="button" onClick={() => addImportLine(sh.id)} className="mt-2 text-xs font-bold text-indigo-600 hover:text-indigo-700 uppercase tracking-widest">+ Add product line</button>
                        </div>
                      </div>
                    );
                  }) : <p className="text-sm text-slate-500 italic">No import shipments linked to this licence.</p>}
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-xs font-black uppercase text-slate-900 flex items-center gap-2">
                  <ArrowUpRight size={16} className="text-emerald-500" /> Export obligation fulfillment
                </h3>
                <p className="text-[10px] text-slate-500">Linked export invoices and value (INR/USD) applied to this licence.</p>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  {exportShipments.length > 0 ? (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 text-left text-[9px] font-black text-slate-500 uppercase">
                          <th className="p-3">Invoice / Shipment</th>
                          <th className="p-3 text-right">Quantity</th>
                          <th className="p-3">UOM</th>
                          <th className="p-3 text-right">Value (INR)</th>
                          <th className="p-3 text-right">Value (USD)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {exportShipments.map(sh => {
                          const def = getExportLineDefaults(sh);
                          return (
                            <tr key={sh.id}>
                              <td className="p-3 font-bold text-slate-800">{sh.invoiceNumber || sh.id}</td>
                              <td className="p-3 text-right">
                                <input type="number" step="any" min="0" className="w-24 text-right px-2 py-1.5 rounded-lg border border-slate-200 text-xs font-bold" value={def.quantity ?? ''} onChange={e => updateExportLine(sh.id, 'quantity', e.target.value)} />
                              </td>
                              <td className="p-3">
                                <select className="w-24 px-2 py-1.5 rounded-lg border border-slate-200 text-xs font-bold bg-white" value={def.unit ?? 'KGS'} onChange={e => updateExportLine(sh.id, 'unit', e.target.value)}>
                                  {(STANDARDISED_UNITS as string[]).map(u => <option key={u} value={u}>{u}</option>)}
                                </select>
                              </td>
                              <td className="p-3 text-right">
                                <input type="number" step="any" min="0" className="w-28 text-right px-2 py-1.5 rounded-lg border border-slate-200 text-xs font-bold" value={def.valueINR ?? ''} onChange={e => updateExportLine(sh.id, 'valueINR', e.target.value)} />
                              </td>
                              <td className="p-3 text-right">
                                <input type="number" step="any" min="0" className="w-24 text-right px-2 py-1.5 rounded-lg border border-slate-200 text-xs font-bold" value={def.valueUSD ?? ''} onChange={e => updateExportLine(sh.id, 'valueUSD', e.target.value)} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : <p className="p-6 text-center text-xs text-slate-400 italic">No export shipments fulfilling this licence.</p>}
                </div>
              </div>
            </div>
          </div>

          <div className="p-6 border-t border-slate-100 bg-white flex justify-end gap-4">
            <button type="button" onClick={() => navigate('/')} className="px-8 py-3 rounded-xl font-bold text-slate-400 hover:text-slate-600 uppercase text-xs tracking-widest">Cancel</button>
            <button type="button" onClick={saveObligations} className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-black uppercase text-xs tracking-widest shadow-lg shadow-indigo-100 hover:bg-indigo-700 flex items-center gap-2">
              <Save size={16} /> Save Obligation Ledger
            </button>
          </div>
        </div>
      </div>
    );
  }

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

      {/* Manage is now a full page at /licences/:id - see early return when selectedLicenceResolved */}


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
