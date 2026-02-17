
import React, { useState, useMemo, useCallback } from 'react';
import { Shipment, Supplier, Buyer, User, UserRole, Licence, LetterOfCredit, ShipmentStatus } from '../types';
import { Truck, Search, Filter, ArrowUpDown, ChevronRight, FileDown, Plus, X, Trash2, CheckSquare, Square, Calendar, Upload } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatINR, formatDate, formatCurrency, getCompanyName, COMPANY_OPTIONS, getShipmentStatusLabel } from '../constants';
import { usePermissions } from '../hooks/usePermissions';
import * as XLSX from 'xlsx';
import NewShipment from './NewShipment';
import { api } from '../api';

interface ShipmentMasterProps {
  shipments: Shipment[];
  suppliers: Supplier[];
  buyers: Buyer[];
  licences?: Licence[];
  lcs?: LetterOfCredit[];
  user: User;
  isExport?: boolean;
  onAddShipment: (s: Shipment) => Promise<void>;
  onUpdateShipment?: (s: Shipment) => void;
  onDeleteShipment?: (id: string) => Promise<void>;
}

type SortKey = 'date_new' | 'date_old' | 'value_high' | 'value_low';

/** Shipment date used for range filter: invoice date when set, else created date. */
function getShipmentDate(sh: Shipment): Date {
  const raw = sh.invoiceDate || sh.createdAt;
  if (!raw) return new Date(0);
  const d = new Date(raw);
  return isNaN(d.getTime()) ? new Date(0) : d;
}

/** Previous calendar month start (1st 00:00:00) and end (last day 23:59:59.999). */
function getPreviousMonthRange(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/** Column key, label, and whether to include by default in Excel export. Excluded by default: tracking, file status, documents, JSON blobs. */
const EXPORT_COLUMN_DEFS: { key: string; label: string; defaultSelected: boolean; exportOnly?: boolean }[] = [
  { key: 'invoiceNumber', label: 'Invoice No.', defaultSelected: true },
  { key: 'invoiceDate', label: 'Invoice Date', defaultSelected: true },
  { key: 'company', label: 'Company', defaultSelected: true },
  { key: 'partner', label: 'Partner (Supplier/Buyer)', defaultSelected: true },
  { key: 'productSummary', label: 'Product', defaultSelected: true },
  { key: 'amount', label: 'Amount', defaultSelected: true },
  { key: 'currency', label: 'Currency', defaultSelected: true },
  { key: 'exchangeRate', label: 'Exchange Rate', defaultSelected: true },
  { key: 'invoiceValueINR', label: 'Amount (INR)', defaultSelected: true },
  { key: 'expectedShipmentDate', label: 'Expected Shipment Date', defaultSelected: true },
  { key: 'expectedArrivalDate', label: 'Expected Arrival Date', defaultSelected: true },
  { key: 'createdAt', label: 'Created Date', defaultSelected: true },
  { key: 'status', label: 'Status', defaultSelected: true },
  { key: 'materialStatusLabel', label: 'Status Label', defaultSelected: true },
  { key: 'paymentStatus', label: 'Payment Status', defaultSelected: true },
  { key: 'incoTerm', label: 'Inco Term', defaultSelected: true },
  { key: 'fobValueFC', label: 'FOB Value (FC)', defaultSelected: true },
  { key: 'fobValueINR', label: 'FOB Value (INR)', defaultSelected: true },
  { key: 'isUnderLC', label: 'Under LC', defaultSelected: true },
  { key: 'lcNumber', label: 'LC Number', defaultSelected: true },
  { key: 'lcAmount', label: 'LC Amount', defaultSelected: true },
  { key: 'lcDate', label: 'LC Date', defaultSelected: true },
  { key: 'isUnderLicence', label: 'Under Licence', defaultSelected: true },
  { key: 'linkedLicenceId', label: 'Licence(s)', defaultSelected: true },
  { key: 'licenceObligationAmount', label: 'Licence Obligation Amount', defaultSelected: true },
  { key: 'containerNumber', label: 'Container No.', defaultSelected: true },
  { key: 'blNumber', label: 'BL No.', defaultSelected: true },
  { key: 'blDate', label: 'BL Date', defaultSelected: true },
  { key: 'beNumber', label: 'Bill of Entry No.', defaultSelected: true },
  { key: 'beDate', label: 'Bill of Entry Date', defaultSelected: true },
  { key: 'portCode', label: 'Port Code', defaultSelected: true },
  { key: 'portOfLoading', label: 'Port of Loading', defaultSelected: true },
  { key: 'portOfDischarge', label: 'Port of Discharge', defaultSelected: true },
  { key: 'shippingLine', label: 'Shipping Line', defaultSelected: true },
  { key: 'paymentDueDate', label: 'Payment Due Date', defaultSelected: true },
  { key: 'paymentTerm', label: 'Payment Term', defaultSelected: true },
  { key: 'freightCharges', label: 'Freight Charges', defaultSelected: true },
  { key: 'otherCharges', label: 'Other Charges', defaultSelected: true },
  { key: 'assessedValue', label: 'Assessed Value', defaultSelected: true },
  { key: 'dutyBCD', label: 'Duty BCD', defaultSelected: true },
  { key: 'dutySWS', label: 'Duty SWS', defaultSelected: true },
  { key: 'dutyINT', label: 'Duty INT', defaultSelected: true },
  { key: 'gst', label: 'GST', defaultSelected: true },
  { key: 'lodgement', label: 'Lodgement No.', defaultSelected: true },
  { key: 'lodgementDate', label: 'Lodgement Date', defaultSelected: true },
  { key: 'remarks', label: 'Remarks', defaultSelected: true, exportOnly: true },
  { key: 'ebrcNo', label: 'e-BRC No.', defaultSelected: true, exportOnly: true },
  { key: 'ebrcValue', label: 'e-BRC Value', defaultSelected: true, exportOnly: true },
  { key: 'trackingUrl', label: 'Tracking URL', defaultSelected: false },
  { key: 'fileStatus', label: 'File Status', defaultSelected: false },
  { key: 'documentsFolderPath', label: 'Documents Folder', defaultSelected: false },
  { key: 'documents_json', label: 'Documents (JSON)', defaultSelected: false },
  { key: 'items_json', label: 'Items (JSON)', defaultSelected: false },
  { key: 'history_json', label: 'History (JSON)', defaultSelected: false },
  { key: 'payments_json', label: 'Payments (JSON)', defaultSelected: false },
  { key: 'attachments_json', label: 'Attachments (JSON)', defaultSelected: false },
  { key: 'id', label: 'ID', defaultSelected: false },
  { key: 'supplierId', label: 'Supplier ID', defaultSelected: false },
  { key: 'buyerId', label: 'Buyer ID', defaultSelected: false },
  { key: 'invoiceFile', label: 'Invoice File', defaultSelected: false },
  { key: 'consigneeId', label: 'Consignee ID', defaultSelected: false },
  { key: 'lcSettled', label: 'LC Settled', defaultSelected: false },
  { key: 'linkedLcId', label: 'Linked LC ID', defaultSelected: false },
  { key: 'productId', label: 'Product ID', defaultSelected: false },
  { key: 'rate', label: 'Rate', defaultSelected: true },
  { key: 'quantity', label: 'Quantity', defaultSelected: true },
];

/** Column label for export/display: import = Bill of Entry, export = Shipping Bill for beNumber/beDate. */
function getExportColumnLabel(key: string, label: string, isExport: boolean): string {
  if (key === 'beNumber') return isExport ? 'Shipping Bill No.' : 'Bill of Entry No.';
  if (key === 'beDate') return isExport ? 'Shipping Bill Date' : 'Bill of Entry Date';
  return label;
}

const ShipmentMaster: React.FC<ShipmentMasterProps> = ({ shipments, suppliers, buyers, licences = [], lcs = [], user, isExport = false, onAddShipment, onUpdateShipment, onDeleteShipment }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [companyFilter, setCompanyFilter] = useState('ALL');
  const [partnerFilter, setPartnerFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortOrder, setSortOrder] = useState<SortKey>('date_new');
  const [showAddForm, setShowAddForm] = useState(false);
  const [showExportColumnsModal, setShowExportColumnsModal] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const exportColumnsForMode = useMemo(() =>
    EXPORT_COLUMN_DEFS.filter(c => c.exportOnly !== true || isExport),
    [isExport]
  );
  const defaultSelectedSet = useMemo(() =>
    new Set(exportColumnsForMode.filter(c => c.defaultSelected).map(c => c.key)),
    [exportColumnsForMode]
  );
  const [selectedExportColumns, setSelectedExportColumns] = useState<Set<string>>(() => defaultSelectedSet);

  const { hasPermission } = usePermissions(user);
  const canDelete = hasPermission('shipments.delete');

  const getPartnerName = (sh: Shipment) => {
    if (isExport) {
      return buyers.find(b => b.id === sh.buyerId)?.name || sh.buyerId || 'Unknown Buyer';
    }
    return suppliers.find(s => s.id === sh.supplierId)?.name || sh.supplierId || 'Unknown Vendor';
  };

  const filteredAndSorted = useMemo(() => {
    let result = shipments.filter(sh => isExport ? !!sh.buyerId : !!sh.supplierId);

    if (dateFrom || dateTo) {
      const from = dateFrom ? new Date(dateFrom + 'T00:00:00') : new Date(0);
      const to = dateTo ? new Date(dateTo + 'T23:59:59.999') : new Date(8640000000000000);
      result = result.filter(sh => {
        const d = getShipmentDate(sh);
        return d >= from && d <= to;
      });
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase().trim();
      result = result.filter(sh =>
        sh.invoiceNumber?.toLowerCase().includes(term) ||
        sh.blNumber?.toLowerCase().includes(term) ||
        sh.beNumber?.toLowerCase().includes(term) ||
        sh.containerNumber?.toLowerCase().includes(term)
      );
    }

    if (companyFilter !== 'ALL') {
      result = result.filter(sh => sh.company === companyFilter);
    }

    if (partnerFilter) {
      result = result.filter(sh => (isExport ? sh.buyerId === partnerFilter : sh.supplierId === partnerFilter));
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
  }, [shipments, searchTerm, companyFilter, partnerFilter, sortOrder, isExport, dateFrom, dateTo]);

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
  const getExportPaymentStatus = (sh: Shipment): { status: 'pending' | 'partial' | 'received'; receivedFC: number; pendingFC: number; dueFC: number } => {
    const toFC = (p: { amount: number; currency: string }) =>
      p.currency === sh.currency ? p.amount : (p.currency === 'INR' ? p.amount / (sh.exchangeRate || 1) : 0);
    const receivedFC = (sh.payments || []).filter(p => p.received === true).reduce((sum, p) => sum + toFC(p), 0);
    const dueFC = sh.amount || 0;
    const pendingFC = Math.max(0, dueFC - receivedFC);
    if (dueFC <= 0) return { status: receivedFC > 0 ? 'received' : 'pending', receivedFC, pendingFC: 0, dueFC };
    if (receivedFC >= dueFC) return { status: 'received', receivedFC, pendingFC: 0, dueFC };
    if (receivedFC > 0) return { status: 'partial', receivedFC, pendingFC, dueFC };
    return { status: 'pending', receivedFC, pendingFC, dueFC };
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
      linkedLicenceId: (Array.isArray((sh as any).licenceAllocations) && (sh as any).licenceAllocations.length > 0)
        ? `Multi (${(sh as any).licenceAllocations.length})`
        : (sh.linkedLicenceId ?? ''),
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
      ...(isExport ? { ebrcNo: (sh as any).ebrcNo ?? '', ebrcValue: (sh as any).ebrcValue ?? 0 } : {}),
    };
  };

  const openExportModal = () => {
    setSelectedExportColumns(new Set(defaultSelectedSet));
    setShowExportColumnsModal(true);
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(ws) as any[];
      const rows = json.map((r) => {
        const partnerId = isExport ? (r['Buyer ID'] ?? r.buyerId) : (r['Supplier ID'] ?? r.supplierId);
        const partnerName = isExport ? (r['Buyer Name'] ?? r.buyerName ?? r.Buyer) : (r['Supplier Name'] ?? r.supplierName ?? r.Supplier);
        const productName = r['Product Name'] ?? r.productName ?? r.Product ?? '';
        const hsnCode = r['HSN Code'] ?? r.hsnCode ?? r.HSN ?? '';
        const quantity = Number(r.Quantity ?? r.quantity) || 0;
        const unit = r.Unit ?? r.unit ?? 'KGS';
        const rate = Number(r.Rate ?? r.rate ?? r.ratePerUnit) || 0;
        const amount = Number(r.Amount ?? r.amount) || (quantity * rate) || 0;
        const exchangeRate = Number(r['Exchange Rate'] ?? r.exchangeRate) || 1;
        const invoiceNumber = r['Invoice No'] ?? r.invoiceNumber ?? r.InvoiceNo ?? '';
        const company = (r.Company === 'GTEX' || r.Company === 'GFPL' || r.company === 'GTEX' || r.company === 'GFPL') ? (r.Company || r.company) : 'GFPL';
        const currency = r.Currency ?? r.currency ?? 'USD';
        const expectedShipmentDate = r['Expected Shipment Date'] ?? r.expectedShipmentDate ?? r.expected_shipment_date ?? null;
        const invoiceDate = r['Invoice Date'] ?? r.invoiceDate ?? r.invoice_date ?? null;
        if (isExport) {
          return { buyerId: partnerId, buyerName: partnerName, productName, hsnCode, quantity, unit, rate, amount, exchangeRate, invoiceNumber, company, currency, expectedShipmentDate, invoiceDate };
        }
        return { supplierId: partnerId, supplierName: partnerName, productName, hsnCode, quantity, unit, rate, amount, exchangeRate, invoiceNumber, company, currency, expectedShipmentDate, invoiceDate };
      }).filter((r) => (isExport ? (r.buyerId || (r as any).buyerName) : (r.supplierId || (r as any).supplierName)) && (r as any).invoiceNumber && (r as any).productName);
      if (rows.length === 0) {
        alert(isExport ? 'No rows with Buyer ID/Name, Invoice No and Product Name found. Use the Download template for the correct format.' : 'No rows with Supplier ID/Name, Invoice No and Product Name found. Use the Download template for the correct format.');
        return;
      }
      const result = await api.shipments.import(rows, isExport);
      const count = (result as any)?.imported ?? 0;
      alert(`Imported ${count} shipment(s). Refreshing the list.`);
      window.location.reload();
    } catch (err: any) {
      alert(err?.message || 'Import failed.');
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  const downloadShipmentTemplate = () => {
    const importHeaders = ['Supplier ID', 'Supplier Name', 'Invoice No', 'Company', 'Currency', 'Exchange Rate', 'Product Name', 'HSN Code', 'Quantity', 'Unit', 'Rate', 'Amount', 'Expected Shipment Date', 'Invoice Date'];
    const exportHeaders = ['Buyer ID', 'Buyer Name', 'Invoice No', 'Company', 'Currency', 'Exchange Rate', 'Product Name', 'HSN Code', 'Quantity', 'Unit', 'Rate', 'Amount', 'Expected Shipment Date', 'Invoice Date'];
    const headers = isExport ? exportHeaders : importHeaders;
    const sample = isExport
      ? ['b1', 'London Fashion Hub', 'INV/EXP/001', 'GFPL', 'USD', 84, 'Cotton Yarn', '5205', 1000, 'KGS', 5, 5000, '2025-03-01', '2025-02-15']
      : ['s1', 'Shenzhen Global', 'INV/IMP/001', 'GFPL', 'USD', 84, 'Cotton Yarn', '5205', 5000, 'KGS', 3.5, 17500, '2025-03-01', '2025-02-15'];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, sample]);
    XLSX.utils.book_append_sheet(wb, ws, isExport ? 'Export Shipments' : 'Import Shipments');
    XLSX.writeFile(wb, `shipments_${isExport ? 'export' : 'import'}_template.xlsx`);
  };

  const runExportExcel = useCallback(() => {
    const exportData = filteredAndSorted.map(sh => {
      const full = shipmentToExcelRow(sh);
      const row: Record<string, string | number | boolean | undefined> = {};
      exportColumnsForMode.forEach(col => {
        if (selectedExportColumns.has(col.key) && full[col.key] !== undefined) {
          row[getExportColumnLabel(col.key, col.label, isExport)] = full[col.key];
        }
      });
      return row;
    });
    if (exportData.length > 0 && selectedExportColumns.size === 0) return;
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Shipments');
    XLSX.writeFile(workbook, `Shipments_${isExport ? 'Export' : 'Import'}.xlsx`);
    setShowExportColumnsModal(false);
  }, [filteredAndSorted, selectedExportColumns, isExport, exportColumnsForMode]);

  /** Date of realisation: latest payment date among received payments; blank if not realised. */
  const getDateOfRealisation = (sh: Shipment): string => {
    const receivedPayments = (sh.payments || []).filter(p => p.received === true);
    if (receivedPayments.length === 0) return '';
    const dates = receivedPayments.map(p => new Date(p.date).getTime()).filter(t => !isNaN(t));
    if (dates.length === 0) return '';
    const latest = new Date(Math.max(...dates));
    return formatDate(latest.toISOString().slice(0, 10));
  };

  const runExportForm203Excel = useCallback(() => {
    const { start: prevStart, end: prevEnd } = getPreviousMonthRange();
    const previousMonthShipments = filteredAndSorted.filter(sh => {
      if (!sh.blDate) return false;
      const d = new Date(sh.blDate);
      return !isNaN(d.getTime()) && d >= prevStart && d <= prevEnd;
    });
    const form203Rows = previousMonthShipments.map(sh => {
      const buyer = buyers.find(b => b.id === sh.buyerId);
      const country = buyer?.country ?? '';
      return {
        'BL Date': sh.blDate ? formatDate(sh.blDate) : '',
        'Invoice Number': sh.invoiceNumber ?? '',
        'Country (Destination)': country,
        'Buyer Name': getPartnerName(sh),
        'Country (Payment received from)': country,
        'Payment Term': sh.paymentTerm ?? '',
        'Expected Payment Date': sh.paymentDueDate ? formatDate(sh.paymentDueDate) : '',
        'Date of Realisation (if realised)': getDateOfRealisation(sh),
        'Invoice Value (INR)': sh.invoiceValueINR ?? 0,
      };
    });
    const worksheet = XLSX.utils.json_to_sheet(form203Rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Form 203 ECGC');
    const prevMonthLabel = prevStart.toISOString().slice(0, 7).replace('-', '_'); // e.g. 2025_01
    XLSX.writeFile(workbook, `Shipments_Form203_ECGC_${prevMonthLabel}.xlsx`);
  }, [filteredAndSorted, buyers, isExport]);

  const toggleExportColumn = (key: string) => {
    setSelectedExportColumns(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const selectAllExportColumns = () => setSelectedExportColumns(new Set(exportColumnsForMode.map(c => c.key)));
  const deselectAllExportColumns = () => setSelectedExportColumns(new Set());

  const themeClass = isExport ? 'text-amber-600 bg-amber-50' : 'text-indigo-600 bg-indigo-50';

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">{isExport ? 'Outbound' : 'Inbound'} Logistics Ledger</h1>
          <p className="text-slate-500 font-medium">Tracking {isExport ? 'sales' : 'purchase'} flows and compliance.</p>
        </div>
        <div className="flex gap-3">
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportExcel} />
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={importing} className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 text-slate-700 rounded-2xl font-bold hover:bg-slate-200 disabled:opacity-50 transition-all shadow-sm">
            <Upload size={18} /> {importing ? 'Importing...' : 'Import from Excel'}
          </button>
          <button type="button" onClick={downloadShipmentTemplate} className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all shadow-sm" title="Download template">
            <FileDown size={18} /> Template
          </button>
          <button 
            onClick={() => setShowAddForm(true)}
            className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-white shadow-lg transition-all ${isExport ? 'bg-amber-600 shadow-amber-100 hover:bg-amber-700' : 'bg-indigo-600 shadow-indigo-100 hover:bg-indigo-700'}`}
          >
            <Plus size={18} /> New {isExport ? 'Export' : 'Import'}
          </button>
          <button onClick={openExportModal} className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-2xl font-bold hover:bg-slate-50 transition-all shadow-sm">
            <FileDown size={18} /> Excel
          </button>
          {isExport && (
            <button onClick={runExportForm203Excel} className="flex items-center gap-2 px-5 py-2.5 bg-amber-50 border border-amber-200 text-amber-700 rounded-2xl font-bold hover:bg-amber-100 transition-all shadow-sm" title="Export columns for ECGC Form 203">
              <FileDown size={18} /> Form 203 (ECGC)
            </button>
          )}
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
              licences={licences}
              lcs={lcs}
              onSubmit={async (s) => { await onAddShipment(s); setShowAddForm(false); }} 
            />
          </div>
        </div>
      )}

      {showExportColumnsModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl max-h-[85vh] rounded-[2rem] shadow-2xl overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h2 className="text-base font-black text-slate-900 uppercase tracking-wide">Choose columns to export</h2>
              <button onClick={() => setShowExportColumnsModal(false)} className="p-2 hover:bg-slate-200 rounded-full transition-all">
                <X size={20} className="text-slate-500" />
              </button>
            </div>
            <div className="p-4 flex gap-2 border-b border-slate-100">
              <button type="button" onClick={selectAllExportColumns} className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700">Select all</button>
              <button type="button" onClick={deselectAllExportColumns} className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700">Deselect all</button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
              {exportColumnsForMode.map(col => (
                <label key={col.key} className="flex items-center gap-2 py-1.5 cursor-pointer group">
                  <span className="flex items-center text-slate-400 group-hover:text-indigo-500">
                    {selectedExportColumns.has(col.key) ? <CheckSquare size={18} className="text-indigo-600" /> : <Square size={18} className="border border-slate-300 rounded" />}
                  </span>
                  <input
                    type="checkbox"
                    checked={selectedExportColumns.has(col.key)}
                    onChange={() => toggleExportColumn(col.key)}
                    className="sr-only"
                  />
                  <span className="text-sm font-medium text-slate-800">{getExportColumnLabel(col.key, col.label, isExport)}</span>
                </label>
              ))}
            </div>
            <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
              <button type="button" onClick={() => setShowExportColumnsModal(false)} className="px-5 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-200 text-sm">Cancel</button>
              <button type="button" onClick={runExportExcel} disabled={selectedExportColumns.size === 0} className="px-6 py-2.5 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center gap-2">
                <FileDown size={16} /> Export to Excel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 flex flex-wrap items-center gap-4">
        <div className="flex-1 min-w-[240px] relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder={isExport ? 'Search Invoice, BL, Shipping Bill or Container...' : 'Search Invoice, BL, Bill of Entry or Container...'} 
            className="w-full pl-12 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 text-sm font-medium"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-slate-400 shrink-0" />
            <span className="text-xs font-bold text-slate-600">Invoice date</span>
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
              From
              <input
                type="date"
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-700"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                title="Show shipments from this invoice date"
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
              To
              <input
                type="date"
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-700"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                title="Show shipments up to this invoice date"
              />
            </label>
          </div>
          <select className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold" value={companyFilter} onChange={e => setCompanyFilter(e.target.value)}>
            <option value="ALL">All Companies</option>
            {COMPANY_OPTIONS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-700" value={partnerFilter} onChange={e => setPartnerFilter(e.target.value)} title={isExport ? 'Show shipments by buyer' : 'Show all invoices by this supplier'}>
            <option value="">{isExport ? 'All buyers' : 'All suppliers'}</option>
            {isExport
              ? buyers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)
              : suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select className={`px-4 py-2.5 border rounded-2xl text-xs font-bold ${themeClass}`} value={sortOrder} onChange={e => setSortOrder(e.target.value as SortKey)}>
            <option value="date_new">Newest First</option>
            <option value="date_old">Oldest First</option>
            <option value="value_high">Value: High-Low</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden min-w-0">
        <div className="w-full min-w-0">
          <table className="w-full table-fixed min-w-0">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {!isExport ? (
                  <>
                    <th className="w-[11%] min-w-0 px-3 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Invoice No. & Date</th>
                    <th className="w-[12%] min-w-0 px-3 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Supplier</th>
                    <th className="w-[8%] min-w-0 px-3 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">LC</th>
                    <th className="w-[14%] min-w-0 px-3 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Product</th>
                    <th className="w-[9%] min-w-0 px-3 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Amount</th>
                    <th className="w-[9%] min-w-0 px-3 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Arrival</th>
                    <th className="w-[9%] min-w-0 px-3 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Payment</th>
                    <th className="w-[9%] min-w-0 px-3 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">File</th>
                    <th className="w-[13%] min-w-0 px-3 py-3 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
                  </>
                ) : (
                  <>
                    <th className="w-[10%] min-w-0 px-3 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Invoice</th>
                    <th className="w-[8%] min-w-0 px-3 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Company</th>
                    <th className="w-[7%] min-w-0 px-3 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">LC</th>
                    <th className="w-[11%] min-w-0 px-3 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Buyer</th>
                    <th className="w-[8%] min-w-0 px-3 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">ETA</th>
                    <th className="w-[8%] min-w-0 px-3 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Pay Date</th>
                    <th className="w-[7%] min-w-0 px-3 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Term</th>
                    <th className="w-[8%] min-w-0 px-3 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Amount</th>
                    <th className="w-[12%] min-w-0 px-3 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Payment</th>
                    <th className="w-[8%] min-w-0 px-3 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">File</th>
                    <th className="w-[8%] min-w-0 px-3 py-3 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAndSorted.map((sh) => (
                <tr key={sh.id} className="hover:bg-slate-50/50 transition-colors">
                  {!isExport ? (
                    <>
                      <td className="px-3 py-3 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`p-1.5 rounded-lg shrink-0 ${themeClass}`}><Truck size={14} /></div>
                          <div className="min-w-0">
                            <p className="font-bold text-slate-900 text-xs truncate" title={sh.invoiceNumber}>#{sh.invoiceNumber}</p>
                            <p className="text-[9px] text-slate-500">{sh.invoiceDate ? formatDate(sh.invoiceDate) : '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 min-w-0">
                        <p className="font-bold text-slate-700 text-xs truncate" title={getPartnerName(sh)}>{getPartnerName(sh)}</p>
                      </td>
                      <td className="px-3 py-3 min-w-0">
                        <p className="text-[11px] font-mono font-semibold text-slate-600 truncate" title={sh.lcNumber || ''}>{sh.lcNumber || '—'}</p>
                      </td>
                      <td className="px-3 py-3 min-w-0">
                        <p className="text-[11px] text-slate-700 truncate" title={getProductNames(sh)}>{getProductNames(sh)}</p>
                      </td>
                      <td className="px-3 py-3 min-w-0">
                        <p className="font-bold text-indigo-600 text-xs whitespace-nowrap">{formatCurrency(sh.amount, sh.currency)}</p>
                      </td>
                      <td className="px-3 py-3 min-w-0">
                        <p className="text-[11px] font-semibold text-slate-700">{sh.expectedArrivalDate ? formatDate(sh.expectedArrivalDate) : '—'}</p>
                      </td>
                      <td className="px-3 py-3 min-w-0">
                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase ${getPaymentStatus(sh) === 'Paid' ? 'bg-emerald-100 text-emerald-700' : getPaymentStatus(sh) === 'Partial' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                          {getPaymentStatus(sh)}
                        </span>
                      </td>
                      <td className="px-3 py-3 min-w-0">
                        <select
                          value={getFileStatus(sh)}
                          onChange={(e) => onUpdateShipment?.({ ...sh, fileStatus: e.target.value as 'pending' | 'clearing' | 'ok' })}
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded border border-slate-200 bg-white focus:ring-1 focus:ring-indigo-200 max-w-full ${getFileStatus(sh) === 'ok' ? 'text-emerald-600' : getFileStatus(sh) === 'clearing' ? 'text-amber-600' : 'text-slate-500'}`}
                        >
                          {FILE_STATUS_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>{fileStatusLabel(opt)}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-3 min-w-0 text-right">
                        <div className="flex items-center justify-end gap-1 flex-wrap">
                          <Link to={`/shipments/${sh.id}`} className="inline-flex items-center gap-0.5 px-2 py-1 bg-white border border-slate-200 font-bold rounded-lg transition-all text-[10px] text-indigo-600 hover:bg-indigo-50 shrink-0">
                            Manage <ChevronRight size={12} />
                          </Link>
                          {canDelete && onDeleteShipment && (
                            <button type="button" onClick={async () => { if (!window.confirm('Delete this shipment? This cannot be undone.')) return; await onDeleteShipment?.(sh.id); }} className="p-1 rounded text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors shrink-0" title="Delete shipment">
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-3 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`p-1.5 rounded-lg shrink-0 ${themeClass}`}><Truck size={14} /></div>
                          <p className="font-bold text-slate-900 text-xs truncate" title={sh.invoiceNumber}>#{sh.invoiceNumber}</p>
                        </div>
                      </td>
                      <td className="px-3 py-3 min-w-0">
                        <p className="text-[11px] font-semibold text-slate-700 truncate" title={getCompanyName(sh.company)}>{getCompanyName(sh.company)}</p>
                      </td>
                      <td className="px-3 py-3 min-w-0">
                        <p className="text-[11px] font-mono font-semibold text-slate-600 truncate" title={sh.lcNumber || ''}>{sh.lcNumber || '—'}</p>
                      </td>
                      <td className="px-3 py-3 min-w-0">
                        <p className="font-bold text-slate-700 text-xs truncate" title={getPartnerName(sh)}>{getPartnerName(sh)}</p>
                      </td>
                      <td className="px-3 py-3 min-w-0">
                        <p className="text-[11px] font-semibold text-slate-600">{sh.expectedArrivalDate ? formatDate(sh.expectedArrivalDate) : '—'}</p>
                      </td>
                      <td className="px-3 py-3 min-w-0">
                        <p className="text-[11px] font-semibold text-slate-600">{sh.paymentDueDate ? formatDate(sh.paymentDueDate) : '—'}</p>
                      </td>
                      <td className="px-3 py-3 min-w-0">
                        <p className="text-[11px] font-semibold text-slate-600 truncate" title={sh.paymentTerm || ''}>{sh.paymentTerm || '—'}</p>
                      </td>
                      <td className="px-3 py-3 min-w-0">
                        <p className="font-bold text-xs text-emerald-600 whitespace-nowrap">{formatCurrency(sh.amount, sh.currency)}</p>
                      </td>
                      <td className="px-3 py-3 min-w-0">
                        {(() => {
                          const { status, receivedFC, pendingFC } = getExportPaymentStatus(sh);
                          return (
                            <div className="flex flex-col gap-0.5 min-w-0">
                              <p className="text-[9px] font-bold text-emerald-700 truncate">Rcvd: {formatCurrency(receivedFC, sh.currency)}</p>
                              <p className="text-[9px] font-bold text-slate-600 truncate">Pend: {formatCurrency(pendingFC, sh.currency)}</p>
                              <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase w-fit ${status === 'received' ? 'bg-emerald-100 text-emerald-700' : status === 'partial' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                                {status === 'pending' ? 'Pending' : status === 'received' ? 'Received' : 'Partial'}
                              </span>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-3 min-w-0">
                        <select
                          value={getFileStatus(sh)}
                          onChange={(e) => onUpdateShipment?.({ ...sh, fileStatus: e.target.value as 'pending' | 'clearing' | 'ok' })}
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded border border-slate-200 bg-white focus:ring-1 focus:ring-amber-200 max-w-full ${getFileStatus(sh) === 'ok' ? 'text-emerald-600' : getFileStatus(sh) === 'clearing' ? 'text-amber-600' : 'text-slate-500'}`}
                        >
                          {FILE_STATUS_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>{fileStatusLabel(opt)}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-3 min-w-0 text-right">
                        <div className="flex items-center justify-end gap-1 flex-wrap">
                          <Link to={`/shipments/${sh.id}`} className="inline-flex items-center gap-0.5 px-2 py-1 bg-white border border-slate-200 font-bold rounded-lg transition-all text-[10px] text-amber-600 hover:bg-amber-50 shrink-0">
                            Manage <ChevronRight size={12} />
                          </Link>
                          {canDelete && onDeleteShipment && (
                            <button type="button" onClick={async () => { if (!window.confirm('Delete this shipment? This cannot be undone.')) return; await onDeleteShipment?.(sh.id); }} className="p-1 rounded text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors shrink-0" title="Delete shipment">
                              <Trash2 size={14} />
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
