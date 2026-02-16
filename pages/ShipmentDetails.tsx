
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Shipment, ShipmentStatus, User, UserRole, Licence, Supplier, Buyer, ShipmentHistory, PaymentLog, LicenceType, LetterOfCredit, IMPORT_DOCUMENT_CHECKLIST, EXPORT_DOCUMENT_CHECKLIST, ShipmentItem, STANDARDISED_UNITS, ProductType, ShipmentLicenceImportLine, ShipmentLicenceExportLine, LicenceAllocation } from '../types';
import { SHIPMENT_STATUS_ORDER_IMPORT, SHIPMENT_STATUS_ORDER_EXPORT, getShipmentStatusLabel, formatINR, formatDate, formatCurrency } from '../constants';
import { 
  ArrowLeft, 
  CheckCircle, 
  Zap,
  FileText,
  Ship,
  Anchor,
  Edit3,
  Save,
  ExternalLink,
  MapPin,
  Plus,
  X,
  Pencil,
  Calendar,
  Landmark,
  ShieldAlert,
  Trash2,
  Eye,
  CreditCard,
  AlertCircle,
  FileCheck,
  RefreshCw,
  Loader2,
  Download
} from 'lucide-react';
import { api } from '../api';
import { usePermissions } from '../hooks/usePermissions';
import { ShipmentUpload } from '../components/ShipmentUpload';
import OcrReviewModal, { type OcrReviewedPayload } from '../components/OcrReviewModal';

interface ShipmentDetailsProps {
  shipments: Shipment[];
  suppliers: Supplier[];
  buyers: Buyer[];
  licences?: Licence[];
  lcs?: LetterOfCredit[];
  onUpdate: (updated: Shipment) => void;
  onDelete?: (id: string) => Promise<void>;
  onUpdateLC?: (updated: LetterOfCredit) => Promise<void>;
  user: User;
  /** When 'OFFLINE', document upload may fail with "Shipment not found"; we show a hint to refresh after reconnecting. */
  connectionMode?: 'SQL' | 'OFFLINE';
  /** Call after update so LC balance etc. refetch (e.g. after adding an LC payment). */
  onRefreshData?: () => Promise<void>;
}

const ShipmentDetails: React.FC<ShipmentDetailsProps> = ({ shipments, suppliers, buyers, licences = [], lcs = [], onUpdate, onDelete, onUpdateLC, user, connectionMode, onRefreshData }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const shipment = shipments.find(s => s.id === id);
  const historyArray = useMemo(() => (shipment && Array.isArray(shipment.history) ? shipment.history : []), [shipment?.history]);

  // Redirect to list when shipment was deleted (no longer in list)
  useEffect(() => {
    if (id && shipments.length >= 0 && !shipment) {
      navigate('/shipments', { replace: true });
    }
  }, [id, shipment, shipments.length, navigate]);

  const [editAll, setEditAll] = useState(false);
  const [editLogistics, setEditLogistics] = useState(false);
  const [editDuties, setEditDuties] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [editingHistoryIndex, setEditingHistoryIndex] = useState<number | null>(null);
  const [editHistoryDraft, setEditHistoryDraft] = useState<ShipmentHistory | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVariant, setToastVariant] = useState<'error' | 'success'>('error');

  const [newUpdate, setNewUpdate] = useState<{status: ShipmentStatus, location: string, remarks: string}>({
      status: shipment?.status || ShipmentStatus.INITIATED,
      location: '',
      remarks: ''
  });

  const [logisticsData, setLogisticsData] = useState({
    blNumber: '',
    blDate: '',
    containerNumber: '',
    shippingLine: '',
    trackingUrl: '',
    portCode: '',
    portOfLoading: '',
    portOfDischarge: '',
    expectedArrivalDate: '',
    expectedShipmentDate: '',
    shipperSealNumber: '',
    lineSealNumber: ''
  });

  const [dutiesData, setDutiesData] = useState({
    assessedValue: 0,
    dutyBCD: 0,
    dutySWS: 0,
    dutyINT: 0,
    gst: 0,
    beNumber: '',
    beDate: '',
    incoTerm: '',
    portCode: '',
    exchangeRate: Number(shipment?.exchangeRate) || 0
  });
  const [licenceImportData, setLicenceImportData] = useState({
    linkedLicenceId: '',
    licenceObligationAmount: 0,
    licenceObligationQuantity: 0
  });
  const [licenceImportLines, setLicenceImportLines] = useState<ShipmentLicenceImportLine[]>([]);
  const [licenceExportLines, setLicenceExportLines] = useState<ShipmentLicenceExportLine[]>([]);
  const [licenceAllocations, setLicenceAllocations] = useState<LicenceAllocation[]>([]);
  const [allocateModalProduct, setAllocateModalProduct] = useState<{ productId: string; productName: string; hsnCode?: string; lineQuantity?: number; lineUnit?: string; exchangeRate?: number } | null>(null);
  const [allocateModalRows, setAllocateModalRows] = useState<{ licenceId: string; allocatedQuantity: number; allocatedUom?: string; allocatedAmountUSD: number; allocatedAmountINR: number }[]>([]);
  const [editInvoice, setEditInvoice] = useState(false);
  const [invoiceEditData, setInvoiceEditData] = useState({
    invoiceNumber: shipment?.invoiceNumber || '',
    invoiceDate: shipment?.invoiceDate || '',
    /** Import only: payment due date */
    paymentDueDate: shipment?.paymentDueDate || '',
    /** Export: payment term (e.g. Net 30, CAD) */
    paymentTerm: shipment?.paymentTerm || '',
    freightCharges: Number(shipment?.freightCharges) || 0,
    otherCharges: Number(shipment?.otherCharges) || 0,
    items: (shipment?.items || []).map((it) => ({ ...it, amount: (it.quantity || 0) * (it.rate || 0) })),
    /** Export only: editable invoice/FOB amount in FC */
    amountFC: Number(shipment?.amount ?? (shipment as any)?.fobValueFC) || 0
  });
  const [remarksDraft, setRemarksDraft] = useState(shipment?.remarks ?? '');

  useEffect(() => {
    setRemarksDraft(shipment?.remarks ?? '');
  }, [shipment?.id, shipment?.remarks]);

  const [newPayment, setNewPayment] = useState<Partial<PaymentLog>>({
    amount: 0,
    date: new Date().toISOString().split('T')[0],
    currency: shipment?.currency ?? 'USD',
    mode: 'WIRE',
    reference: '',
    adviceUploaded: false
  });

  const [documentsFolderPath, setDocumentsFolderPath] = useState<string | null>(shipment?.documentsFolderPath ?? null);
  const [folderError, setFolderError] = useState<string | null>(null);
  const [folderFiles, setFolderFiles] = useState<string[]>([]);
  const [loadingDocFiles, setLoadingDocFiles] = useState(false);
  const [pendingOcrPayload, setPendingOcrPayload] = useState<{ file: File; data: any; docType: 'BOE' | 'SB' } | null>(null);
  const [editExportDoc, setEditExportDoc] = useState(false);
  const [lodgementValue, setLodgementValue] = useState('');
  const [lodgementDateValue, setLodgementDateValue] = useState('');
  const [exportDocData, setExportDocData] = useState({
    sbNo: '', sbDate: '', dbk: 0, rodtep: 0, scripNo: '', lodgement: '', lodgementDate: '', ebrcNo: '', ebrcValue: 0, exchangeRate: Number(shipment?.exchangeRate) || 0, incoTerm: (shipment as any)?.incoTerm || 'FOB'
  });
  const [epcgLicenceId, setEpcgLicenceId] = useState('');
  const [advLicenceId, setAdvLicenceId] = useState('');
  useEffect(() => {
    if (!shipment) return;
    if (shipment.documentsFolderPath) {
      setDocumentsFolderPath(shipment.documentsFolderPath);
      setFolderError(null);
    } else {
      api.shipments.getDocumentsFolder(shipment.id).then((r: { path?: string | null; exists?: boolean }) => {
        if (r?.path) {
          setDocumentsFolderPath(r.path);
          setFolderError(null);
        }
      }).catch(() => {});
    }
  }, [shipment?.id, shipment?.documentsFolderPath]);

  const refetchFolderFiles = useCallback(() => {
    if (!shipment?.id) return;
    setLoadingDocFiles(true);
    api.shipments.getDocumentsFolderFiles(shipment.id).then((r: { files?: Array<{ name: string } | string> }) => {
      const list = Array.isArray(r?.files) ? r.files : [];
      setFolderFiles(list.map((f: any) => (typeof f === 'string' ? f : f?.name)).filter(Boolean));
    }).catch(() => setFolderFiles([])).finally(() => setLoadingDocFiles(false));
  }, [shipment?.id]);

  const parseNum = (s: string): number | undefined => {
    if (!s || typeof s !== 'string') return undefined;
    const val = parseFloat(s.replace(/,/g, ''));
    return Number.isNaN(val) ? undefined : val;
  };

  const handleOcrConfirm = useCallback(async (reviewed: OcrReviewedPayload) => {
    const payload = pendingOcrPayload;
    if (!payload || !shipment) return;
    const formData = new FormData();
    formData.append('file', payload.file);
    try {
      await api.shipments.uploadFiles(shipment.id, formData, payload.docType);
      const update: any = { ...shipment, version: shipment.version };
      // BOE = import only; SB = export only. Each document contains only data under its own header.
      // Bill of Lading details (container, BL no/date, shipping line) and Invoice details are separate sections — not applied from BOE/SB.
      if (reviewed.portCode !== undefined) update.portCode = reviewed.portCode || null;

      if (payload.docType === 'BOE') {
        // Bill of Entry (import): only BOE-section fields
        update.beNumber = reviewed.number || null;
        update.beDate = reviewed.date || null;
        update.portOfDischarge = reviewed.portCode || null;
        const val = parseNum(reviewed.invoiceValue);
        if (val !== undefined) update.assessedValue = val;
        const exch = parseNum(reviewed.exchangeRate);
        if (exch !== undefined) update.exchangeRate = exch;
        if (reviewed.incoTerm !== undefined) (update as any).incoTerm = reviewed.incoTerm || null;
        const dutyBCD = parseNum(reviewed.dutyBCD);
        const dutySWS = parseNum(reviewed.dutySWS);
        const intVal = parseNum(reviewed.dutyINT) ?? 0;
        const penaltyVal = parseNum(reviewed.penalty) ?? 0;
        const fineVal = parseNum(reviewed.fine) ?? 0;
        const dutyINT = intVal + penaltyVal + fineVal;
        const gstVal = parseNum(reviewed.gst);
        if (dutyBCD !== undefined) update.dutyBCD = dutyBCD;
        if (dutySWS !== undefined) update.dutySWS = dutySWS;
        update.dutyINT = dutyINT;
        if (gstVal !== undefined) update.gst = gstVal;
      } else {
        // Shipping Bill (export): SB number, date, port, inco term, FOB FC/INR, exchange rate, DBK, RODTEP
        (update as any).sbNo = reviewed.number || null;
        (update as any).sbDate = reviewed.date || null;
        update.expectedShipmentDate = reviewed.date || null;
        update.portCode = reviewed.portCode || null;
        update.portOfLoading = reviewed.portCode || null;
        if (reviewed.incoTerm !== undefined) (update as any).incoTerm = reviewed.incoTerm || null;
        const exch = parseNum(reviewed.exchangeRate);
        if (exch !== undefined) update.exchangeRate = exch;
        const val = parseNum(reviewed.invoiceValue);
        if (val !== undefined) update.fobValueFC = val;
        const fobInr = parseNum(reviewed.fobValueINR);
        if (fobInr !== undefined) (update as any).fobValueINR = fobInr;
        const dbkVal = parseNum(reviewed.dbk);
        if (dbkVal !== undefined) (update as any).dbk = dbkVal;
        const rodtepVal = parseNum(reviewed.rodtep);
        if (rodtepVal !== undefined) (update as any).rodtep = rodtepVal;
      }
      const { status, data } = await api.shipments.updateWithResponse(shipment.id, update);
      if (status === 200) {
        const merged = { ...update, version: (data && (data as any).version) ?? update.version };
        onUpdate(merged);
      }
      refetchFolderFiles();
    } catch (e: any) {
      alert(e?.message || 'Failed to save');
    } finally {
      setPendingOcrPayload(null);
    }
  }, [pendingOcrPayload, shipment, onUpdate, refetchFolderFiles]);

  useEffect(() => {
    if (!shipment?.id) {
      setFolderFiles([]);
      return;
    }
    if (!hasPermission('documents.view')) {
      setFolderFiles([]);
      return;
    }
    setLoadingDocFiles(true);
    api.shipments.getDocumentsFolderFiles(shipment.id).then((r: { files?: Array<{ name: string } | string> }) => {
      const list = Array.isArray(r?.files) ? r.files : [];
      setFolderFiles(list.map((f: any) => (typeof f === 'string' ? f : f?.name)).filter(Boolean));
    }).catch(() => setFolderFiles([])).finally(() => setLoadingDocFiles(false));
  }, [shipment?.id]);

  useEffect(() => {
    if (!shipment) return;
    // Don't overwrite form state while user is editing invoice/details — prevents reverting invoice date etc. after save
    if (editAll) return;
    setInvoiceEditData(prev => ({
      ...prev,
      invoiceNumber: shipment.invoiceNumber || '',
      invoiceDate: shipment.invoiceDate || '',
      paymentDueDate: shipment.paymentDueDate || '',
      paymentTerm: shipment.paymentTerm || '',
      freightCharges: Number(shipment.freightCharges) || 0,
      otherCharges: Number(shipment.otherCharges) || 0,
      items: (shipment.items || []).map((it) => ({ ...it, amount: (it.quantity || 0) * (it.rate || 0) })),
      amountFC: Number(shipment.amount ?? (shipment as any).fobValueFC) || 0
    }));
    setLogisticsData({
      blNumber: shipment.blNumber || '',
      blDate: shipment.blDate || '',
      containerNumber: shipment.containerNumber || '',
      shippingLine: shipment.shippingLine || '',
      trackingUrl: shipment.trackingUrl || '',
      portCode: shipment.portCode || '',
      portOfLoading: shipment.portOfLoading || '',
      portOfDischarge: shipment.portOfDischarge || '',
      expectedArrivalDate: shipment.expectedArrivalDate || '',
      expectedShipmentDate: shipment.expectedShipmentDate || '',
      shipperSealNumber: (shipment as any).shipperSealNumber || '',
      lineSealNumber: (shipment as any).lineSealNumber || ''
    });
    setDutiesData({
      assessedValue: shipment.assessedValue || 0,
      dutyBCD: shipment.dutyBCD || 0,
      dutySWS: shipment.dutySWS || 0,
      dutyINT: shipment.dutyINT || 0,
      gst: shipment.gst || 0,
      beNumber: shipment.beNumber || '',
      beDate: shipment.beDate || '',
      incoTerm: shipment.incoTerm || 'FOB',
      portCode: shipment.portCode || '',
      exchangeRate: Number(shipment.exchangeRate) || 0
    });
    setLicenceImportData({
      linkedLicenceId: shipment.linkedLicenceId || '',
      licenceObligationAmount: shipment.licenceObligationAmount ?? 0,
      licenceObligationQuantity: shipment.licenceObligationQuantity ?? 0
    });
    setLicenceImportLines(Array.isArray(shipment.licenceImportLines) ? shipment.licenceImportLines : []);
    setLicenceExportLines(Array.isArray(shipment.licenceExportLines) ? shipment.licenceExportLines : []);
    setLicenceAllocations(Array.isArray(shipment.licenceAllocations) ? shipment.licenceAllocations : []);
    const linkedLic = shipment.linkedLicenceId ? licences.find(l => l.id === shipment.linkedLicenceId) : null;
    setExportDocData({
      sbNo: (shipment as any).sbNo || '',
      sbDate: (shipment as any).sbDate || '',
      dbk: (shipment as any).dbk ?? 0,
      rodtep: (shipment as any).rodtep ?? 0,
      scripNo: (shipment as any).scripNo || '',
      lodgement: (shipment as any).lodgement || '',
      lodgementDate: (shipment as any).lodgementDate || '',
      ebrcNo: (shipment as any).ebrcNo || '',
      ebrcValue: (shipment as any).ebrcValue ?? 0,
      exchangeRate: Number(shipment.exchangeRate) || 0,
      incoTerm: (shipment as any).incoTerm || 'FOB'
    });
    setEpcgLicenceId((shipment as any).epcgLicenceId || (shipment as any).epcg || (linkedLic?.type === LicenceType.EPCG ? linkedLic.id : '') || '');
    setAdvLicenceId((shipment as any).advLicenceId || (shipment as any).advLic || (linkedLic?.type === LicenceType.ADVANCE ? linkedLic.id : '') || '');
    setLodgementValue((shipment as any).lodgement || '');
    setLodgementDateValue((shipment as any).lodgementDate || '');
    setNewUpdate(prev => ({ ...prev, status: shipment.status }));
  }, [shipment, editAll, licences]);

  const isExport = !!(shipment?.buyerId);
  const partnerName = shipment
    ? (isExport
      ? (buyers.find(b => b.id === shipment.buyerId)?.name || 'Unknown Buyer')
      : (suppliers.find(s => s.id === shipment.supplierId)?.name || 'Unknown Vendor'))
    : '';

  const showPaymentAlert = useMemo(() => {
    if (!shipment?.paymentDueDate) return false;
    const dueDate = new Date(shipment.paymentDueDate).getTime();
    const today = new Date().getTime();
    const diffDays = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
    return diffDays <= 3 && diffDays >= 0;
  }, [shipment?.paymentDueDate]);

  const paymentSummary = useMemo(() => {
    if (!shipment) return { totalFC: 0, receivedFC: 0, pendingFC: 0 };
    const totalFC = isExport ? (shipment.fobValueFC ?? shipment.amount) : shipment.amount;
    const toFC = (p: PaymentLog) => {
      if (p.currency === shipment.currency) return p.amount;
      if (p.currency === 'INR') return p.amount / (shipment.exchangeRate || 1);
      return 0;
    };
    const receivedFC = (shipment.payments || []).filter(p => p.received === true).reduce((sum, p) => sum + toFC(p), 0);
    const pendingFC = Math.max(0, (totalFC ?? 0) - receivedFC);
    return { totalFC: totalFC ?? 0, receivedFC, pendingFC };
  }, [shipment, isExport]);

  const { documentCheckerRows, otherFiles } = useMemo(() => {
    const invRef = (shipment?.invoiceNumber || '')
      .replace(/[/\\:*?"<>|]/g, '_')
      .replace(/\s+/g, '_')
      .trim() || 'ref';
    const lodgementRef = ((shipment as any)?.lodgement || invRef).replace(/[/\\:*?"<>|]/g, '_').replace(/\s+/g, '_').trim() || 'ref';
    const baseName = (f: string) => f.replace(/\.[^/.]+$/, '').trim();
    const findMatch = (expected: string) =>
      folderFiles.find((f) => baseName(f).toUpperCase() === expected.toUpperCase()) ?? null;
    const rows: { label: string; expectedName: string; found: boolean; matchedFileName: string | null }[] = [];
    const staticList = isExport ? EXPORT_DOCUMENT_CHECKLIST : IMPORT_DOCUMENT_CHECKLIST;
    const matchedNames = new Set<string>();
    staticList.forEach((doc) => {
      const prefix = (doc as { prefix?: string }).prefix || doc.id + '_';
      const ref = doc.id === 'LODGE' ? lodgementRef : invRef;
      const expected = prefix + ref;
      const matched = findMatch(expected);
      if (matched) matchedNames.add(matched);
      rows.push({ label: doc.label, expectedName: expected, found: !!matched, matchedFileName: matched });
    });
    (shipment?.payments || []).forEach((pay) => {
      const amount = Number(pay.amount);
      const currency = (pay.currency || 'USD').toUpperCase();
      const expected = `PAY_ADV_${amount}_${currency}`;
      const matched = findMatch(expected);
      if (matched) matchedNames.add(matched);
      rows.push({
        label: `Payment Advise — ${formatCurrency(amount, currency)}`,
        expectedName: expected,
        found: !!matched,
        matchedFileName: matched
      });
    });
    const other = folderFiles.filter((f) => !matchedNames.has(f));
    return { documentCheckerRows: rows, otherFiles: other };
  }, [shipment?.invoiceNumber, shipment?.payments, (shipment as any)?.lodgement, isExport, folderFiles]);

  const allShipmentDetailsFilled = useMemo(() => {
    if (!shipment) return false;
    const hasInvoice = !!(shipment.invoiceNumber && (shipment.invoiceDate || shipment.expectedShipmentDate));
    const hasItems = (shipment.items?.length ?? 0) > 0;
    const hasLogistics = !!(shipment.blNumber || shipment.containerNumber);
    if (isExport) {
      const sbNo = (shipment as any).sbNo;
      const lodgement = (shipment as any).lodgement;
      return !!(hasInvoice && hasItems && hasLogistics && sbNo && lodgement);
    }
    const hasBOE = !!(shipment.beNumber && (shipment.assessedValue > 0 || (shipment.dutyBCD ?? 0) + (shipment.dutySWS ?? 0) + (shipment.gst ?? 0) > 0));
    return !!(hasInvoice && hasItems && hasLogistics && hasBOE);
  }, [shipment, isExport]);

  const linkedLC = useMemo(() => {
    if (!shipment?.isUnderLC || !lcs.length) return null;
    const lid = (shipment as any).linkedLcId;
    return lcs.find(lc => lc.id === lid || lc.lcNumber === shipment.lcNumber) || null;
  }, [shipment?.isUnderLC, shipment?.lcNumber, (shipment as any)?.linkedLcId, lcs]);

  /** Import: raw material → Advance Licence, capital goods → EPCG */
  const importLicenceType = useMemo(() => {
    if (isExport || !shipment?.items?.length) return null;
    const hasCapitalGoods = (shipment.items || []).some((it: ShipmentItem) => it.productType === ProductType.CAPITAL_GOOD);
    return hasCapitalGoods ? LicenceType.EPCG : LicenceType.ADVANCE;
  }, [isExport, shipment?.items]);

  const importLicencesFiltered = useMemo(() => {
    if (!importLicenceType || !shipment?.company) return [];
    return licences.filter(l => l.type === importLicenceType && l.company === shipment.company && l.status === 'ACTIVE');
  }, [licences, importLicenceType, shipment?.company]);

  if (!shipment) return <div className="p-20 text-center text-slate-400 font-bold uppercase">Record not found</div>;

  const { hasPermission } = usePermissions(user);
  const canDelete = hasPermission('shipments.delete');
  const canViewDocuments = hasPermission('documents.view');
  const canDeleteDocuments = hasPermission('documents.delete');
  const canUploadDocuments = hasPermission('documents.upload');
  const isViewableInBrowser = (filename: string) => /\.(pdf|jpg|jpeg|png|gif|webp)$/i.test(filename);
  const canEdit = user.role === UserRole.MANAGEMENT || user.role === UserRole.CHECKER;
  const handleDeleteShipment = async () => {
    if (!onDelete || !shipment?.id) return;
    if (!window.confirm('Delete this shipment? This cannot be undone.')) return;
    try {
      await onDelete(shipment.id);
      navigate(isExport ? '/export-shipments' : '/shipments');
    } catch (e: any) {
      setToastVariant('error');
      setToastMessage(e?.message || 'Insufficient permissions for this action.');
      setTimeout(() => setToastMessage(null), 5000);
    }
  };

  const handleSaveLogistics = async () => {
    try {
      const updated = { ...shipment, ...logisticsData };
      await onUpdate(updated);
      setEditLogistics(false);
    } catch (e: any) {
      setToastVariant('error');
      setToastMessage(e?.message || 'Failed to save.');
      setTimeout(() => setToastMessage(null), 5000);
    }
  };

  const handleSaveInvoice = async () => {
    try {
      const items = invoiceEditData.items.map((it) => ({
        ...it,
        amount: it.quantity * it.rate
      }));
      const subtotal = items.reduce((s, it) => s + it.amount, 0);
      const totalAmount = subtotal + (invoiceEditData.freightCharges || 0) + (invoiceEditData.otherCharges || 0);
      const updated: Shipment = {
        ...shipment,
        invoiceNumber: invoiceEditData.invoiceNumber,
        invoiceDate: invoiceEditData.invoiceDate || undefined,
        freightCharges: invoiceEditData.freightCharges || undefined,
        otherCharges: invoiceEditData.otherCharges || undefined,
        items,
        amount: totalAmount,
        invoiceValueINR: totalAmount * (shipment.exchangeRate ?? 1)
      };
      await onUpdate(updated);
      setEditInvoice(false);
    } catch (e: any) {
      setToastVariant('error');
      setToastMessage(e?.message || 'Failed to save.');
      setTimeout(() => setToastMessage(null), 5000);
    }
  };

  const updateInvoiceItem = (idx: number, field: keyof ShipmentItem, value: string | number) => {
    setInvoiceEditData((prev) => {
      const next = [...prev.items];
      const item = { ...next[idx] };
      if (field === 'quantity' || field === 'rate') {
        const num = typeof value === 'number' ? value : parseFloat(String(value)) || 0;
        (item as any)[field] = num;
        item.amount = item.quantity * item.rate;
      } else {
        (item as any)[field] = value;
      }
      next[idx] = item;
      return { ...prev, items: next };
    });
  };

  const updateInvoiceItemMergedNameDesc = (idx: number, value: string) => {
    const sep = value.indexOf(' — ');
    const productName = sep >= 0 ? value.slice(0, sep) : value;
    const description = sep >= 0 ? value.slice(sep + 3) : '';
    setInvoiceEditData((prev) => {
      const next = [...prev.items];
      const item = { ...next[idx], productName, amount: next[idx].quantity * next[idx].rate };
      (item as any).description = description;
      next[idx] = item;
      return { ...prev, items: next };
    });
  };

  const handleSaveDuties = async () => {
    try {
      const hasAllocations = licenceAllocations.length > 0;
      const updated = {
        ...shipment,
        ...dutiesData,
        portCode: dutiesData.portCode,
        isUnderLicence: hasAllocations || !!licenceImportData.linkedLicenceId,
        linkedLicenceId: (hasAllocations ? licenceAllocations[0]?.licenceId : licenceImportData.linkedLicenceId) || undefined,
        licenceObligationAmount: licenceImportData.licenceObligationAmount || undefined,
        licenceObligationQuantity: licenceImportData.licenceObligationQuantity || undefined,
        licenceImportLines: licenceImportData.linkedLicenceId && !hasAllocations ? undefined : (licenceImportLines.length > 0 ? licenceImportLines : undefined),
        licenceAllocations: licenceAllocations.length > 0 ? licenceAllocations : undefined,
      };
      await onUpdate(updated);
      setEditDuties(false);
    } catch (e: any) {
      setToastVariant('error');
      setToastMessage(e?.message || 'Failed to save.');
      setTimeout(() => setToastMessage(null), 5000);
    }
  };
  const handleSaveExportDoc = async () => {
    try {
      const hasAllocations = licenceAllocations.length > 0;
      const updated: any = { ...shipment, ...exportDocData };
      if (licenceExportLines.length > 0 && !epcgLicenceId && !advLicenceId) updated.licenceExportLines = licenceExportLines;
      updated.licenceAllocations = licenceAllocations.length > 0 ? licenceAllocations : undefined;
      updated.isUnderLicence = hasAllocations || !!epcgLicenceId || !!advLicenceId;
      updated.linkedLicenceId = (hasAllocations ? licenceAllocations[0]?.licenceId : epcgLicenceId || advLicenceId) || undefined;
      await onUpdate(updated);
      setEditExportDoc(false);
    } catch (e: any) {
      setToastVariant('error');
      setToastMessage(e?.message || 'Failed to save.');
      setTimeout(() => setToastMessage(null), 5000);
    }
  };

  const handleSaveAll = async () => {
    try {
      const items = invoiceEditData.items.map((it) => ({ ...it, amount: it.quantity * it.rate }));
      const subtotal = items.reduce((s, it) => s + it.amount, 0);
      const totalAmount = isExport
        ? (Number(invoiceEditData.amountFC) || 0)
        : subtotal + (invoiceEditData.freightCharges || 0) + (invoiceEditData.otherCharges || 0);
      const exchRate = isExport ? (exportDocData.exchangeRate || 1) : (dutiesData.exchangeRate || 1);
      const updated: Shipment = {
        ...shipment,
        invoiceNumber: invoiceEditData.invoiceNumber,
        invoiceDate: invoiceEditData.invoiceDate || undefined,
        paymentDueDate: invoiceEditData.paymentDueDate || undefined,
        paymentTerm: invoiceEditData.paymentTerm || undefined,
        freightCharges: invoiceEditData.freightCharges || undefined,
        otherCharges: invoiceEditData.otherCharges || undefined,
        items,
        amount: totalAmount,
        invoiceValueINR: totalAmount * exchRate,
        exchangeRate: exchRate,
        ...(isExport ? { fobValueFC: totalAmount, fobValueINR: totalAmount * exchRate } : {}),
        ...exportDocData,
        ...logisticsData,
        ...dutiesData
      } as Shipment;
      const hasAllocations = licenceAllocations.length > 0;
      updated.licenceAllocations = licenceAllocations.length > 0 ? licenceAllocations : undefined;
      if (isExport) {
        (updated as any).lodgement = lodgementValue || undefined;
        (updated as any).lodgementDate = lodgementDateValue || undefined;
        updated.epcgLicenceId = epcgLicenceId || undefined;
        updated.advLicenceId = advLicenceId || undefined;
        const exportLicenceId = epcgLicenceId || advLicenceId || (hasAllocations ? licenceAllocations[0]?.licenceId : undefined);
        updated.linkedLicenceId = exportLicenceId;
        updated.isUnderLicence = !!exportLicenceId || hasAllocations;
      } else {
        updated.isUnderLicence = hasAllocations || !!licenceImportData.linkedLicenceId;
        updated.linkedLicenceId = (hasAllocations ? licenceAllocations[0]?.licenceId : licenceImportData.linkedLicenceId) || undefined;
        updated.licenceObligationAmount = licenceImportData.licenceObligationAmount || undefined;
        updated.licenceObligationQuantity = licenceImportData.licenceObligationQuantity || undefined;
        updated.licenceImportLines = (licenceImportData.linkedLicenceId && !hasAllocations) ? undefined : (licenceImportLines.length > 0 ? licenceImportLines : undefined);
      }
      if (isExport) (updated as any).licenceExportLines = (epcgLicenceId || advLicenceId || hasAllocations) ? undefined : (licenceExportLines.length > 0 ? licenceExportLines : undefined);
      await onUpdate(updated);
      setEditAll(false);
      setEditInvoice(false);
      setEditExportDoc(false);
      setEditLogistics(false);
      setEditDuties(false);
    } catch (e: any) {
      setToastVariant('error');
      setToastMessage(e?.message || 'Failed to save.');
      setTimeout(() => setToastMessage(null), 5000);
    }
  };

  const handleCancelAll = () => {
    setInvoiceEditData({
      invoiceNumber: shipment.invoiceNumber || '',
      invoiceDate: shipment.invoiceDate || '',
      paymentDueDate: shipment.paymentDueDate || '',
      paymentTerm: shipment.paymentTerm || '',
      freightCharges: Number(shipment.freightCharges) || 0,
      otherCharges: Number(shipment.otherCharges) || 0,
      items: (shipment.items || []).map((it) => ({ ...it, amount: (it.quantity || 0) * (it.rate || 0) })),
      amountFC: Number(shipment.amount ?? (shipment as any).fobValueFC) || 0
    });
    setExportDocData({
      sbNo: (shipment as any).sbNo || '',
      sbDate: (shipment as any).sbDate || '',
      dbk: (shipment as any).dbk ?? 0,
      rodtep: (shipment as any).rodtep ?? 0,
      scripNo: (shipment as any).scripNo || '',
      lodgement: (shipment as any).lodgement || '',
      lodgementDate: (shipment as any).lodgementDate || '',
      ebrcNo: (shipment as any).ebrcNo || '',
      ebrcValue: (shipment as any).ebrcValue ?? 0,
      exchangeRate: Number(shipment.exchangeRate) || 0,
      incoTerm: (shipment as any).incoTerm || 'FOB'
    });
    setEpcgLicenceId((shipment as any).epcgLicenceId || (shipment as any).epcg || '');
    setAdvLicenceId((shipment as any).advLicenceId || (shipment as any).advLic || '');
    setLogisticsData({
      blNumber: shipment.blNumber || '',
      blDate: shipment.blDate || '',
      containerNumber: shipment.containerNumber || '',
      shippingLine: shipment.shippingLine || '',
      trackingUrl: shipment.trackingUrl || '',
      portCode: shipment.portCode || '',
      portOfLoading: shipment.portOfLoading || '',
      portOfDischarge: shipment.portOfDischarge || '',
      expectedArrivalDate: shipment.expectedArrivalDate || '',
      expectedShipmentDate: shipment.expectedShipmentDate || '',
      shipperSealNumber: (shipment as any).shipperSealNumber || '',
      lineSealNumber: (shipment as any).lineSealNumber || ''
    });
    setDutiesData({
      assessedValue: shipment.assessedValue ?? 0,
      dutyBCD: shipment.dutyBCD ?? 0,
      dutySWS: shipment.dutySWS ?? 0,
      dutyINT: shipment.dutyINT ?? 0,
      gst: shipment.gst ?? 0,
      beNumber: shipment.beNumber || '',
      beDate: shipment.beDate || '',
      incoTerm: shipment.incoTerm || '',
      portCode: shipment.portCode || '',
      exchangeRate: Number(shipment.exchangeRate) || 0
    });
    setLicenceImportData({
      linkedLicenceId: shipment.linkedLicenceId || '',
      licenceObligationAmount: shipment.licenceObligationAmount ?? 0,
      licenceObligationQuantity: shipment.licenceObligationQuantity ?? 0
    });
    setLicenceImportLines(Array.isArray(shipment.licenceImportLines) ? shipment.licenceImportLines : []);
    setLicenceExportLines(Array.isArray(shipment.licenceExportLines) ? shipment.licenceExportLines : []);
    setLicenceAllocations(Array.isArray(shipment.licenceAllocations) ? shipment.licenceAllocations : []);
    setLodgementValue((shipment as any).lodgement || '');
    setLodgementDateValue((shipment as any).lodgementDate || '');
    setEditAll(false);
    setEditInvoice(false);
    setEditInvoiceRate(false);
    setEditExportDoc(false);
    setEditLogistics(false);
    setEditDuties(false);
  };

  const handleAddPayment = async () => {
    if (!newPayment.amount || !newPayment.date) return;
    const totalFC = paymentSummary.totalFC;
    const amount = Number(newPayment.amount);
    const toFC = (p: PaymentLog) => {
      if (p.currency === shipment.currency) return p.amount;
      if (p.currency === 'INR') return p.amount / (shipment.exchangeRate || 1);
      return 0;
    };
    const existingTotalFC = (shipment.payments || []).reduce((sum, p) => sum + toFC(p), 0);
    const newTotalFC = existingTotalFC + amount;
    if (newTotalFC > totalFC) {
      setToastVariant('error');
      setToastMessage(`Total payments cannot exceed invoice amount (${formatCurrency(totalFC, shipment.currency)}). Current total: ${formatCurrency(existingTotalFC, shipment.currency)}. You can add up to ${formatCurrency(Math.max(0, totalFC - existingTotalFC), shipment.currency)}.`);
      setTimeout(() => setToastMessage(null), 5000);
      return;
    }
    // When shipment is under LC, further (non-LC) payments cannot exceed (shipment amount - LC amount)
    const lcAmountFC = Number(shipment.lcAmount) || 0;
    if (shipment.isUnderLC && lcAmountFC > 0) {
      const maxFurtherFC = Math.max(0, totalFC - lcAmountFC);
      const existingFurtherFC = (shipment.payments || []).filter(p => !p.linkedLcId).reduce((sum, p) => sum + toFC(p), 0);
      if (existingFurtherFC + amount > maxFurtherFC) {
        setToastVariant('error');
        setToastMessage(`Shipment is under LC (${formatCurrency(lcAmountFC, shipment.currency)}). Separate payments cannot exceed ${formatCurrency(maxFurtherFC, shipment.currency)}. Current separate payments: ${formatCurrency(existingFurtherFC, shipment.currency)}. You can add up to ${formatCurrency(Math.max(0, maxFurtherFC - existingFurtherFC), shipment.currency)}.`);
        setTimeout(() => setToastMessage(null), 5000);
        return;
      }
    }
    if (amount <= 0) {
      setToastVariant('error');
      setToastMessage('Payment amount must be greater than zero.');
      setTimeout(() => setToastMessage(null), 5000);
      return;
    }
    const payment: PaymentLog = {
      id: Math.random().toString(36).substr(2, 9),
      date: newPayment.date!,
      amount: Number(newPayment.amount),
      currency: shipment.currency,
      mode: newPayment.mode || 'WIRE',
      reference: newPayment.reference || '',
      adviceUploaded: false,
      ...(newPayment.mode === 'LC' && linkedLC ? { linkedLcId: linkedLC.id } : {})
    };
    const updated = { ...shipment, payments: [...(shipment.payments || []), payment] };
    await onUpdate(updated);
    if (shipment.isUnderLC && (newPayment.mode === 'LC' || newPayment.mode === 'Letter of Credit') && onRefreshData) {
      await onRefreshData();
    }
    setShowPaymentModal(false);
    setNewPayment({ amount: 0, date: new Date().toISOString().split('T')[0], currency: shipment.currency, mode: 'WIRE', reference: '' });
  };

  const handleDeletePayment = async (payId: string) => {
    const updated = { ...shipment, payments: (shipment.payments || []).filter(p => p.id !== payId) };
    await onUpdate(updated);
  };

  const handleSubmitUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUpdate.location) return alert('Location is required');

    const historyItem: ShipmentHistory = {
        status: newUpdate.status,
        location: newUpdate.location,
        remarks: newUpdate.remarks,
        date: new Date().toISOString(),
        updatedBy: user.name
    };

    const updatedShipment = {
        ...shipment,
        status: newUpdate.status,
        history: [historyItem, ...historyArray]
    };

    await onUpdate(updatedShipment);
    setShowUpdateModal(false);
    setNewUpdate({ status: newUpdate.status, location: '', remarks: '' });
  };

  const openEditTimeline = (index: number) => {
    const h = historyArray[index];
    if (!h) return;
    setEditHistoryDraft({
      status: h.status,
      date: h.date ? h.date.slice(0, 10) : new Date().toISOString().slice(0, 10),
      location: h.location || '',
      remarks: h.remarks || '',
      updatedBy: h.updatedBy
    });
    setEditingHistoryIndex(index);
  };

  const handleSaveTimelineEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingHistoryIndex == null || !editHistoryDraft || !shipment) return;
    if (!editHistoryDraft.location?.trim()) {
      alert('Location is required.');
      return;
    }
    const dateStr = editHistoryDraft.date && editHistoryDraft.date.length >= 10
      ? new Date(editHistoryDraft.date + 'T12:00:00').toISOString()
      : new Date().toISOString();
    const updatedEntry: ShipmentHistory = {
      status: editHistoryDraft.status,
      date: dateStr,
      location: editHistoryDraft.location.trim(),
      remarks: editHistoryDraft.remarks?.trim() || undefined,
      updatedBy: user.name
    };
    const newHistory = [...historyArray];
    newHistory[editingHistoryIndex] = updatedEntry;
    await onUpdate({ ...shipment, history: newHistory });
    setEditingHistoryIndex(null);
    setEditHistoryDraft(null);
  };

  const handleRemoveTimelineEntry = async (index: number) => {
    if (!shipment || !window.confirm('Remove this entry from the tracking timeline?')) return;
    const newHistory = historyArray.filter((_, i) => i !== index);
    await onUpdate({ ...shipment, history: newHistory });
    setEditingHistoryIndex(null);
    setEditHistoryDraft(null);
  };

  const totalDuty = dutiesData.dutyBCD + dutiesData.dutySWS + dutiesData.dutyINT;

  const handleMarkPaymentReceived = async (payId: string) => {
    const payments = (shipment.payments || []).map(p => p.id === payId ? { ...p, received: true } : p);
    await onUpdate({ ...shipment, payments });
  };

  return (
    <>
    {toastMessage && (
      <div
        className={`fixed top-4 left-1/2 -translate-x-1/2 z-[110] max-w-md w-full mx-4 px-4 py-3 rounded-xl shadow-lg border flex items-center gap-3 ${
          toastVariant === 'error' ? 'bg-red-50 border-red-200 text-red-900' : 'bg-emerald-50 border-emerald-200 text-emerald-900'
        }`}
        role="alert"
      >
        <AlertCircle size={20} className={toastVariant === 'error' ? 'text-red-600' : 'text-emerald-600'} />
        <p className="text-sm font-medium flex-1">{toastMessage}</p>
        <button type="button" onClick={() => setToastMessage(null)} className="p-1 rounded hover:bg-black/10" aria-label="Dismiss">
          <X size={18} />
        </button>
      </div>
    )}
    <div className="space-y-6 pb-24 animate-in fade-in">
      <header className="flex items-center justify-between bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
        <div className="flex items-center gap-6">
          <button onClick={() => navigate(-1)} className="p-3 bg-slate-50 rounded-2xl hover:bg-slate-100 transition-colors"><ArrowLeft size={20} /></button>
          <div>
            <div className="flex items-center gap-2 mb-1">
               <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase text-white ${isExport ? 'bg-amber-600' : 'bg-indigo-600'}`}>
                 {isExport ? 'Export Node' : 'Import Node'}
               </span>
               <h1 className="text-xl font-black text-slate-900 tracking-tight">{String(shipment.invoiceNumber)}</h1>
            </div>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{String(partnerName)}</p>
          </div>
        </div>
        <div className="flex gap-4">
           <button onClick={() => setShowUpdateModal(true)} className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100">
              <Plus size={16} /> Add Status Update
           </button>
           {canDelete && onDelete && (
             <button type="button" onClick={handleDeleteShipment} className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-black uppercase text-[10px] tracking-widest flex items-center gap-2 transition-all shadow-lg shadow-red-100">
               <Trash2 size={16} /> Delete Shipment
             </button>
           )}
        </div>
      </header>
      
      {showPaymentAlert && (
         <div className="bg-red-50 border border-red-100 p-4 rounded-2xl flex items-center gap-3 animate-pulse">
            <AlertCircle className="text-red-600" size={20} />
            <div>
               <p className="text-xs font-black text-red-700 uppercase">Payment Deadline Approaching</p>
               <p className="text-[10px] font-medium text-red-500">Due on {formatDate(shipment.paymentDueDate)} (Within 3 days)</p>
            </div>
         </div>
      )}

      <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">File status</span>
          <select
            value={shipment?.fileStatus ?? 'pending'}
            onChange={(e) => {
              const v = e.target.value as 'pending' | 'clearing' | 'ok';
              onUpdate({ ...shipment!, fileStatus: v });
            }}
            className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 bg-white focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
          >
            <option value="pending">Pending</option>
            <option value="clearing">Clearing</option>
            <option value="ok">OK</option>
          </select>
        </div>
      </div>

      {/* Export reminders: lodgement after BL filled; e-BRC after payment received */}
      {isExport && (
        <div className="space-y-3">
          {((shipment.blNumber || shipment.blDate) && !(shipment as any).lodgement) && (
            <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-center gap-3">
              <AlertCircle size={22} className="text-amber-600 shrink-0" />
              <div>
                <p className="text-xs font-black text-amber-800 uppercase tracking-wide">Reminder</p>
                <p className="text-sm font-medium text-amber-800">Bill of Lading is filled. File lodgement with bank when documents are lodged.</p>
              </div>
            </div>
          )}
          {(shipment.payments || []).some(p => p.received === true) && !(shipment as any).ebrcNo && (
            <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-center gap-3">
              <AlertCircle size={22} className="text-amber-600 shrink-0" />
              <div>
                <p className="text-xs font-black text-amber-800 uppercase tracking-wide">Reminder</p>
                <p className="text-sm font-medium text-amber-800">Payment received. File e-BRC and update the shipment with e-BRC number and value.</p>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">

          {/* 1. Invoice Details (first in flow) — editable */}
          <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
              <h2 className="text-xs font-black uppercase text-slate-400 tracking-widest flex items-center gap-2"><FileText size={16} /> Invoice Details</h2>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-900">{String(shipment.company)} Entity</span>
                {canEdit && (editAll ? (
                  <>
                    <button type="button" onClick={handleSaveAll} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-widest">
                      <Save size={12} /> Save
                    </button>
                    <button type="button" onClick={handleCancelAll} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-[10px] font-black uppercase tracking-widest">
                      <X size={12} /> Cancel
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={() => setEditAll(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black uppercase tracking-widest">
                    <Edit3 size={12} /> Edit
                  </button>
                ))}
              </div>
            </div>
            <div className="p-8 space-y-4">
              <div className={`grid grid-cols-1 gap-6 ${isExport ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Invoice No.</label>
                  {editAll ? (
                    <input className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold" value={invoiceEditData.invoiceNumber} onChange={e => setInvoiceEditData(prev => ({ ...prev, invoiceNumber: e.target.value }))} />
                  ) : (
                    <p className="text-sm font-bold text-slate-900">#{shipment.invoiceNumber}</p>
                  )}
                </div>
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Invoice Date</label>
                  {editAll ? (
                    <input type="date" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold" value={invoiceEditData.invoiceDate} onChange={e => setInvoiceEditData(prev => ({ ...prev, invoiceDate: e.target.value }))} />
                  ) : (
                    <p className="text-sm font-bold text-slate-800">{shipment.invoiceDate ? formatDate(shipment.invoiceDate) : '—'}</p>
                  )}
                </div>
                {!isExport && (
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Payment Due Date</label>
                  {editAll ? (
                    <input type="date" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold" value={invoiceEditData.paymentDueDate} onChange={e => setInvoiceEditData(prev => ({ ...prev, paymentDueDate: e.target.value }))} />
                  ) : (
                    <p className="text-sm font-bold text-slate-800">{shipment.paymentDueDate ? formatDate(shipment.paymentDueDate) : '—'}</p>
                  )}
                </div>
                )}
                {isExport && (
                <>
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Amount</label>
                  {editAll ? (
                    <input
                      type="number"
                      step="any"
                      min="0"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold"
                      value={invoiceEditData.amountFC ?? ''}
                      onChange={e => setInvoiceEditData(prev => ({ ...prev, amountFC: parseFloat(e.target.value) || 0 }))}
                      placeholder="0"
                    />
                  ) : (
                    <p className="text-sm font-bold text-slate-900">{formatCurrency(shipment.amount ?? shipment.fobValueFC, shipment.currency)}</p>
                  )}
                </div>
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Expected Payment Date</label>
                  {editAll ? (
                    <input type="date" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold" value={invoiceEditData.paymentDueDate} onChange={e => setInvoiceEditData(prev => ({ ...prev, paymentDueDate: e.target.value }))} />
                  ) : (
                    <p className="text-sm font-bold text-slate-800">{shipment.paymentDueDate ? formatDate(shipment.paymentDueDate) : '—'}</p>
                  )}
                </div>
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Payment Term</label>
                  {editAll ? (
                    <input className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold" value={invoiceEditData.paymentTerm} onChange={e => setInvoiceEditData(prev => ({ ...prev, paymentTerm: e.target.value }))} placeholder="e.g. Net 30, CAD" />
                  ) : (
                    <p className="text-sm font-bold text-slate-800">{shipment.paymentTerm || '—'}</p>
                  )}
                </div>
                </>
                )}
              </div>
              {!isExport && (licenceAllocations.length > 0 || licenceImportData.linkedLicenceId) && (
                <div className="mb-6 p-4 rounded-2xl border border-amber-100 bg-amber-50/50">
                  <h3 className="text-[10px] font-black uppercase text-amber-700 tracking-widest mb-3">Invoice linkage (import under licence)</h3>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                    <div><span className="text-slate-500 block text-[9px] font-black uppercase">Invoice No.</span><span className="font-bold text-slate-800">{shipment?.invoiceNumber || '—'}</span></div>
                    <div><span className="text-slate-500 block text-[9px] font-black uppercase">Supplier</span><span className="font-bold text-slate-800">{partnerName || '—'}</span></div>
                    <div><span className="text-slate-500 block text-[9px] font-black uppercase">BOE No.</span><span className="font-bold text-slate-800">{dutiesData.beNumber || shipment?.beNumber || '—'}</span></div>
                    <div><span className="text-slate-500 block text-[9px] font-black uppercase">BOE Date</span><span className="font-bold text-slate-800">{dutiesData.beDate || shipment?.beDate ? formatDate(dutiesData.beDate || shipment?.beDate!) : '—'}</span></div>
                    <div><span className="text-slate-500 block text-[9px] font-black uppercase">Exchange rate</span><span className="font-bold text-slate-800">{dutiesData.exchangeRate || shipment?.exchangeRate || '—'}</span></div>
                  </div>
                </div>
              )}
              {isExport && (licenceAllocations.length > 0 || epcgLicenceId || advLicenceId) && (
                <div className="mb-6 p-4 rounded-2xl border border-emerald-100 bg-emerald-50/50">
                  <h3 className="text-[10px] font-black uppercase text-emerald-700 tracking-widest mb-3">Invoice linkage (export under licence)</h3>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                    <div><span className="text-slate-500 block text-[9px] font-black uppercase">Invoice No.</span><span className="font-bold text-slate-800">{shipment?.invoiceNumber || '—'}</span></div>
                    <div><span className="text-slate-500 block text-[9px] font-black uppercase">Buyer</span><span className="font-bold text-slate-800">{partnerName || '—'}</span></div>
                    <div><span className="text-slate-500 block text-[9px] font-black uppercase">SB No.</span><span className="font-bold text-slate-800">{(shipment as any)?.sbNo || '—'}</span></div>
                    <div><span className="text-slate-500 block text-[9px] font-black uppercase">SB Date</span><span className="font-bold text-slate-800">{(shipment as any)?.sbDate ? formatDate((shipment as any).sbDate) : '—'}</span></div>
                    <div><span className="text-slate-500 block text-[9px] font-black uppercase">Exchange rate</span><span className="font-bold text-slate-800">{shipment?.exchangeRate ?? exportDocData.exchangeRate ?? '—'}</span></div>
                  </div>
                </div>
              )}
              {!isExport && (
              <table className="w-full">
                <thead>
                  <tr className="text-left text-[9px] font-black uppercase text-slate-400 border-b pb-4">
                    <th className="pb-4">Item / Description</th>
                    <th className="pb-4">HSN</th>
                    <th className="pb-4 text-right">Quantity</th>
                    <th className="pb-4 text-right">Unit</th>
                    <th className="pb-4 text-right">Rate (per unit)</th>
                    <th className="pb-4 text-right">Amount</th>
                    {(editAll || editDuties) && (isExport ? licences?.length : importLicencesFiltered.length) ? <th className="pb-4 text-right">Licence</th> : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {(editAll ? invoiceEditData.items : (shipment.items || [])).map((item, idx) => {
                    const mergedNameDesc = `${item.productName || ''}${(item as any).description ? ' — ' + (item as any).description : ''}`.trim();
                    const allocationsForItem = licenceAllocations.filter(a => a.productId === item.productId);
                    const licenceList = isExport ? (licences || []).filter(l => l.company === shipment?.company && l.status === 'ACTIVE') : importLicencesFiltered;
                    return (
                    <tr key={idx} className="group">
                      <td className="py-2">
                        {editAll ? (
                          <input
                            className="w-full px-2 py-1.5 rounded border border-slate-200 bg-slate-50 text-sm font-bold"
                            value={mergedNameDesc}
                            onChange={e => updateInvoiceItemMergedNameDesc(idx, e.target.value)}
                            placeholder="Item name — Description"
                          />
                        ) : (
                          <span className="text-sm font-bold text-slate-800">{mergedNameDesc || '—'}</span>
                        )}
                      </td>
                      <td className="py-2">
                        {editAll ? (
                          <input className="w-full px-2 py-1.5 rounded border border-slate-200 bg-slate-50 text-[10px] font-mono" value={item.hsnCode} onChange={e => updateInvoiceItem(idx, 'hsnCode', e.target.value)} />
                        ) : (
                          <span className="text-[10px] font-mono text-slate-400">{String(item.hsnCode)}</span>
                        )}
                      </td>
                      <td className="py-2 text-right">
                        {editAll ? (
                          <input type="number" step="any" className="w-20 px-2 py-1.5 rounded border border-slate-200 bg-slate-50 text-xs font-bold text-right" value={item.quantity} onChange={e => updateInvoiceItem(idx, 'quantity', e.target.value)} />
                        ) : (
                          <span className="text-xs font-bold">{String(item.quantity)}</span>
                        )}
                      </td>
                      <td className="py-2 text-right">
                        {editAll ? (
                          <select className="px-2 py-1.5 rounded border border-slate-200 bg-slate-50 text-[10px] font-bold" value={item.unit} onChange={e => updateInvoiceItem(idx, 'unit', e.target.value)}>
                            {STANDARDISED_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                          </select>
                        ) : (
                          <span className="text-xs font-bold text-slate-600">{String(item.unit)}</span>
                        )}
                      </td>
                      <td className="py-2 text-right">
                        {editAll ? (
                          <input type="number" step="any" className="w-24 px-2 py-1.5 rounded border border-slate-200 bg-slate-50 text-xs font-bold text-right" value={item.rate} onChange={e => updateInvoiceItem(idx, 'rate', e.target.value)} />
                        ) : (
                          <span className="text-xs">{formatCurrency(item.rate, shipment.currency)}</span>
                        )}
                      </td>
                      <td className="py-2 text-right text-sm font-black text-slate-900">{formatCurrency(editAll ? (invoiceEditData.items[idx]?.amount ?? item.amount) : item.amount, shipment.currency)}</td>
                      {(editAll || editDuties) && licenceList.length > 0 ? (
                        <td className="py-2 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              const lineQty = editAll ? (invoiceEditData.items[idx]?.quantity ?? item.quantity) : item.quantity;
                              const lineUnit = editAll ? (invoiceEditData.items[idx]?.unit ?? item.unit) : item.unit;
                              setAllocateModalProduct({ productId: item.productId, productName: item.productName || '', hsnCode: item.hsnCode, lineQuantity: lineQty, lineUnit: lineUnit || 'KGS', exchangeRate: dutiesData.exchangeRate || shipment?.exchangeRate || 1 });
                              const existing = licenceAllocations.filter(a => a.productId === item.productId);
                              setAllocateModalRows(existing.length > 0 ? existing.map(a => ({ licenceId: a.licenceId, allocatedQuantity: a.allocatedQuantity, allocatedUom: a.allocatedUom || item.unit || 'KGS', allocatedAmountUSD: a.allocatedAmountUSD, allocatedAmountINR: a.allocatedAmountINR })) : [{ licenceId: '', allocatedQuantity: 0, allocatedUom: item.unit || 'KGS', allocatedAmountUSD: 0, allocatedAmountINR: 0 }]);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-amber-50 hover:border-amber-200 text-[10px] font-bold text-slate-700"
                          >
                            {allocationsForItem.length > 0 ? `Split · ${allocationsForItem.length}` : 'Split / Allocate'}
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  );})}
                </tbody>
              </table>
              )}
              {!isExport && (
                <div className="flex flex-wrap justify-end gap-8 py-2 text-sm">
                  <div className="text-right">
                    <label className="block text-[9px] font-black text-slate-400 uppercase">Freight</label>
                    {editAll ? (
                      <input type="number" step="any" className="w-32 px-2 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-sm font-bold" value={invoiceEditData.freightCharges || ''} onChange={e => setInvoiceEditData(prev => ({ ...prev, freightCharges: parseFloat(e.target.value) || 0 }))} />
                    ) : (
                      <p className="font-bold text-slate-700">{Number(shipment.freightCharges) > 0 ? formatCurrency(shipment.freightCharges!, shipment.currency) : '—'}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <label className="block text-[9px] font-black text-slate-400 uppercase">Other charges</label>
                    {editAll ? (
                      <input type="number" step="any" className="w-32 px-2 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-sm font-bold" value={invoiceEditData.otherCharges || ''} onChange={e => setInvoiceEditData(prev => ({ ...prev, otherCharges: parseFloat(e.target.value) || 0 }))} />
                    ) : (
                      <p className="font-bold text-slate-700">{Number(shipment.otherCharges) > 0 ? formatCurrency(shipment.otherCharges!, shipment.currency) : '—'}</p>
                    )}
                  </div>
                </div>
              )}
              {!isExport && (
              <div className="pt-6 border-t flex flex-wrap justify-end gap-8 gap-y-4 bg-slate-50 -mx-6 -mb-6 p-6 rounded-b-2xl">
                <div className="text-right">
                  <p className="text-[9px] font-black text-slate-400 uppercase">Value / Total (FC)</p>
                  <p className="text-xl font-black text-slate-900">{formatCurrency(editAll ? (invoiceEditData.items.reduce((s, it) => s + it.amount, 0) + (invoiceEditData.freightCharges || 0) + (invoiceEditData.otherCharges || 0)) : shipment.amount, shipment.currency)}</p>
                </div>
              </div>
              )}
            </div>
          </div>

          {/* Export: Bill of Lading details — BL number, date, container, seals, ports, expected shipment date */}
          {isExport && (
          <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
               <h2 className="text-xs font-black uppercase text-slate-500 tracking-widest flex items-center gap-2"><FileText size={16} /> Bill of Lading Details</h2>
            </div>
            <div className="p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Bill of Lading No.</label>
                  {editAll ? (
                    <input className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold" value={logisticsData.blNumber} onChange={e => setLogisticsData({...logisticsData, blNumber: e.target.value})} placeholder="e.g. BL123" />
                  ) : (
                    <p className="text-sm font-bold text-slate-800">{logisticsData.blNumber || '—'}</p>
                  )}
                </div>
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">BL Date</label>
                  {editAll ? (
                    <input type="date" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold" value={logisticsData.blDate} onChange={e => setLogisticsData({...logisticsData, blDate: e.target.value})} />
                  ) : (
                    <p className="text-sm font-bold text-slate-800">{logisticsData.blDate ? formatDate(logisticsData.blDate) : '—'}</p>
                  )}
                </div>
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Container Number</label>
                  {editAll ? (
                    <input className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold" value={logisticsData.containerNumber} onChange={e => setLogisticsData({...logisticsData, containerNumber: e.target.value})} placeholder="e.g. MSKU1234567" />
                  ) : (
                    <p className="text-sm font-bold text-slate-800">{logisticsData.containerNumber || '—'}</p>
                  )}
                </div>
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Shipper / Custom Seal Number</label>
                  {editAll ? (
                    <input className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold" value={logisticsData.shipperSealNumber} onChange={e => setLogisticsData({...logisticsData, shipperSealNumber: e.target.value})} placeholder="e.g. seal no." />
                  ) : (
                    <p className="text-sm font-bold text-slate-800">{logisticsData.shipperSealNumber || '—'}</p>
                  )}
                </div>
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Line Seal Number</label>
                  {editAll ? (
                    <input className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold" value={logisticsData.lineSealNumber} onChange={e => setLogisticsData({...logisticsData, lineSealNumber: e.target.value})} placeholder="e.g. line seal" />
                  ) : (
                    <p className="text-sm font-bold text-slate-800">{logisticsData.lineSealNumber || '—'}</p>
                  )}
                </div>
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Port of Loading</label>
                  {editAll ? (
                    <input className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold" value={logisticsData.portOfLoading} onChange={e => setLogisticsData({...logisticsData, portOfLoading: e.target.value})} />
                  ) : (
                    <p className="text-sm font-bold text-slate-800">{logisticsData.portOfLoading || '—'}</p>
                  )}
                </div>
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Port of Discharge</label>
                  {editAll ? (
                    <input className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold" value={logisticsData.portOfDischarge} onChange={e => setLogisticsData({...logisticsData, portOfDischarge: e.target.value})} />
                  ) : (
                    <p className="text-sm font-bold text-slate-800">{logisticsData.portOfDischarge || '—'}</p>
                  )}
                </div>
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Destination ETA</label>
                  {editAll ? (
                    <input type="date" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold" value={logisticsData.expectedShipmentDate} onChange={e => setLogisticsData({...logisticsData, expectedShipmentDate: e.target.value})} />
                  ) : (
                    <p className="text-sm font-bold text-slate-800">{logisticsData.expectedShipmentDate ? formatDate(logisticsData.expectedShipmentDate) : '—'}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
          )}

          {/* Export: Shipping Bill details — SB number, date, port code, inco term, exchange rate, FOB FC/INR, DBK, RODTEP, scrip, licence selection */}
          {isExport && (
          <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-amber-50/50">
               <h2 className="text-xs font-black uppercase text-amber-700 tracking-widest flex items-center gap-2"><FileText size={16} /> Shipping Bill Details</h2>
            </div>
            <div className="p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Shipping Bill No.</label>
                  {editAll ? (
                    <input className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold" value={exportDocData.sbNo} onChange={e => setExportDocData({...exportDocData, sbNo: e.target.value})} placeholder="e.g. SB/24/001" />
                  ) : (
                    <p className="text-sm font-bold text-slate-800">{(shipment as any).sbNo || '—'}</p>
                  )}
                </div>
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Shipping Bill Date</label>
                  {editAll ? (
                    <input type="date" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold" value={exportDocData.sbDate} onChange={e => setExportDocData({...exportDocData, sbDate: e.target.value})} />
                  ) : (
                    <p className="text-sm font-bold text-slate-800">{(shipment as any).sbDate ? formatDate((shipment as any).sbDate) : '—'}</p>
                  )}
                </div>
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Port Code</label>
                  {editAll ? (
                    <input className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold" value={logisticsData.portCode} onChange={e => setLogisticsData({...logisticsData, portCode: e.target.value})} placeholder="e.g. INMUN" />
                  ) : (
                    <p className="text-sm font-bold text-slate-800">{logisticsData.portCode || '—'}</p>
                  )}
                </div>
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Inco Term</label>
                  {editAll ? (
                    <select className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold" value={exportDocData.incoTerm} onChange={e => setExportDocData({...exportDocData, incoTerm: e.target.value})}>
                      <option value="FOB">FOB</option>
                      <option value="CIF">CIF</option>
                      <option value="EXW">EXW</option>
                      <option value="DDP">DDP</option>
                    </select>
                  ) : (
                    <p className="text-sm font-bold text-slate-800">{exportDocData.incoTerm || '—'}</p>
                  )}
                </div>
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Exchange Rate (to INR)</label>
                  {editAll ? (
                    <input type="number" step="0.01" min="0" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold" value={exportDocData.exchangeRate || ''} onChange={e => setExportDocData({...exportDocData, exchangeRate: parseFloat(e.target.value) || 0})} placeholder="e.g. 84" />
                  ) : (
                    <p className="text-sm font-bold text-slate-800">{(shipment.exchangeRate ?? exportDocData.exchangeRate) ? `1 ${shipment.currency} = ₹${(shipment.exchangeRate ?? exportDocData.exchangeRate)}` : '—'}</p>
                  )}
                </div>
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">FOB Value (FC)</label>
                  {editAll ? (
                    <input type="number" step="any" min="0" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold" value={invoiceEditData.amountFC ?? shipment.fobValueFC ?? ''} onChange={e => setInvoiceEditData(prev => ({ ...prev, amountFC: parseFloat(e.target.value) || 0 }))} placeholder="0" />
                  ) : (
                    <p className="text-sm font-bold text-slate-800">{formatCurrency(shipment.fobValueFC ?? shipment.amount, shipment.currency)}</p>
                  )}
                </div>
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">FOB Value (INR)</label>
                  <p className="text-sm font-bold text-slate-800">{formatINR(shipment.fobValueINR ?? (shipment.amount * (shipment.exchangeRate || 1)))}</p>
                </div>
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">DBK</label>
                  {editAll ? (
                    <input type="number" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold" value={exportDocData.dbk || ''} onChange={e => setExportDocData({...exportDocData, dbk: parseFloat(e.target.value) || 0})} />
                  ) : (
                    <p className="text-sm font-bold text-slate-800">{(shipment as any).dbk != null ? formatINR((shipment as any).dbk) : '—'}</p>
                  )}
                </div>
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">RODTEP</label>
                  {editAll ? (
                    <input type="number" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold" value={exportDocData.rodtep || ''} onChange={e => setExportDocData({...exportDocData, rodtep: parseFloat(e.target.value) || 0})} />
                  ) : (
                    <p className="text-sm font-bold text-slate-800">{(shipment as any).rodtep != null ? formatINR((shipment as any).rodtep) : '—'}</p>
                  )}
                </div>
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Scrip No.</label>
                  {editAll ? (
                    <input className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold" value={exportDocData.scripNo} onChange={e => setExportDocData({...exportDocData, scripNo: e.target.value})} />
                  ) : (
                    <p className="text-sm font-bold text-slate-800">{(shipment as any).scripNo || '—'}</p>
                  )}
                </div>
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">EPCG Licence</label>
                  {editAll ? (
                    <select className="w-full px-3 py-2 border rounded-lg font-bold bg-white" value={epcgLicenceId} onChange={e => setEpcgLicenceId(e.target.value)}>
                      <option value="">— Select EPCG —</option>
                      {licences.filter(l => l.type === LicenceType.EPCG && l.company === shipment.company && l.status === 'ACTIVE').map(l => <option key={l.id} value={l.id}>{l.number}</option>)}
                    </select>
                  ) : <p className="font-bold text-slate-800">{epcgLicenceId ? (licences.find(l => l.id === epcgLicenceId)?.number || epcgLicenceId) : '—'}</p>}
                </div>
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Advance Licence</label>
                  {editAll ? (
                    <select className="w-full px-3 py-2 border rounded-lg font-bold bg-white" value={advLicenceId} onChange={e => setAdvLicenceId(e.target.value)}>
                      <option value="">— Select Advance —</option>
                      {licences.filter(l => l.type === LicenceType.ADVANCE && l.company === shipment.company && l.status === 'ACTIVE').map(l => <option key={l.id} value={l.id}>{l.number}</option>)}
                    </select>
                  ) : <p className="font-bold text-slate-800">{advLicenceId ? (licences.find(l => l.id === advLicenceId)?.number || advLicenceId) : '—'}</p>}
                </div>
              </div>
              {isExport && (epcgLicenceId || advLicenceId) && (
                <p className="text-xs text-slate-500 mt-2">This shipment is linked to the selected licence(s) for export. Product-level fulfillment is managed in Licence Audit Control.</p>
              )}
              {/* Products fulfilling this licence (export). When a licence is selected, invoice is just a reference — no product add here; that is in Licence system. */}
              {isExport && licenceExportLines.length > 0 && !epcgLicenceId && !advLicenceId && (
                <div className="mt-6">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Products fulfilling this licence</p>
                  <p className="text-[10px] text-slate-500 mb-2">
                    Invoice: {shipment?.invoiceNumber ?? '—'} · Buyer: {partnerName || '—'} · SB No: {exportDocData.sbNo || (shipment as any)?.sbNo || '—'} · SB Date: {exportDocData.sbDate ? formatDate(exportDocData.sbDate) : ((shipment as any)?.sbDate ? formatDate((shipment as any).sbDate) : '—')} · Exchange rate: {exportDocData.exchangeRate ?? shipment?.exchangeRate ?? '—'}
                  </p>
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 text-left text-[9px] font-black text-slate-500 uppercase">
                          <th className="p-2">Product name</th>
                          <th className="p-2">HSN</th>
                          <th className="p-2">Quantity</th>
                          <th className="p-2">Value (INR)</th>
                          <th className="p-2">Value (USD)</th>
                          <th className="p-2 w-10"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {licenceExportLines.map((row, idx) => (
                          <tr key={idx}>
                            <td className="p-2"><input type="text" className="w-full px-2 py-1.5 rounded-lg border font-bold text-sm" value={row.productName || ''} onChange={e => setLicenceExportLines(prev => prev.map((r, i) => i === idx ? { ...r, productName: e.target.value } : r))} placeholder="Name" /></td>
                            <td className="p-2"><input type="text" className="w-full px-2 py-1.5 rounded-lg border font-bold text-sm" value={row.hsnCode || ''} onChange={e => setLicenceExportLines(prev => prev.map((r, i) => i === idx ? { ...r, hsnCode: e.target.value } : r))} placeholder="HSN" /></td>
                            <td className="p-2"><input type="number" step="any" min="0" className="w-full px-2 py-1.5 rounded-lg border font-bold text-sm" value={row.quantity ?? ''} onChange={e => setLicenceExportLines(prev => prev.map((r, i) => i === idx ? { ...r, quantity: parseFloat(e.target.value) || 0 } : r))} /></td>
                            <td className="p-2">
                              <input type="number" step="any" min="0" className="w-full px-2 py-1.5 rounded-lg border font-bold text-sm" value={row.valueINR ?? ''} onChange={e => {
                                const v = parseFloat(e.target.value) || 0;
                                const ex = exportDocData.exchangeRate || 1;
                                setLicenceExportLines(prev => prev.map((r, i) => i === idx ? { ...r, valueINR: v, valueUSD: ex > 0 ? v / ex : 0 } : r));
                              }} />
                            </td>
                            <td className="p-2">
                              <input type="number" step="any" min="0" className="w-full px-2 py-1.5 rounded-lg border font-bold text-sm" value={row.valueUSD ?? ''} onChange={e => {
                                const usd = parseFloat(e.target.value) || 0;
                                const ex = exportDocData.exchangeRate || 1;
                                setLicenceExportLines(prev => prev.map((r, i) => i === idx ? { ...r, valueUSD: usd, valueINR: usd * ex } : r));
                              }} />
                            </td>
                            <td className="p-2"><button type="button" onClick={() => setLicenceExportLines(prev => prev.filter((_, i) => i !== idx))} className="p-1 text-slate-400 hover:text-red-600 rounded"><Trash2 size={14} /></button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {(editAll || editExportDoc) && (
                      <div className="p-2 border-t border-slate-100">
                        <button type="button" onClick={() => setLicenceExportLines(prev => [...prev, { productName: '', hsnCode: '', quantity: 0, valueINR: 0, valueUSD: 0 }])} className="text-xs font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1"><Plus size={12} /> Add product</button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
          )}

          {/* Shipment Details (Import only — export uses Invoice → Bill of Lading → Shipping Bill → Payment) */}
          {!isExport && (
          <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
               <h2 className="text-xs font-black uppercase text-slate-400 tracking-widest flex items-center gap-2"><Ship size={16} /> Shipment Details</h2>
            </div>
            <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
               <div className="space-y-4">
                  <div>
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Shipping Line / Carrier</label>
                    {editAll ? (
                      <input className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold" value={logisticsData.shippingLine} onChange={e => setLogisticsData({...logisticsData, shippingLine: e.target.value})} placeholder="e.g. MAERSK" />
                    ) : (
                      <p className="text-sm font-bold text-slate-800">{logisticsData.shippingLine || '---'}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Container Number</label>
                    {editAll ? (
                      <input className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold" value={logisticsData.containerNumber} onChange={e => setLogisticsData({...logisticsData, containerNumber: e.target.value})} placeholder="e.g. MSKU1234567" />
                    ) : (
                      <p className="text-sm font-bold text-slate-800">{logisticsData.containerNumber || '---'}</p>
                    )}
                  </div>
                  {isExport && (
                    <>
                      <div>
                        <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Shipper / Custom Seal Number</label>
                        {editAll ? (
                          <input className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold" value={logisticsData.shipperSealNumber} onChange={e => setLogisticsData({...logisticsData, shipperSealNumber: e.target.value})} placeholder="e.g. seal no." />
                        ) : (
                          <p className="text-sm font-bold text-slate-800">{logisticsData.shipperSealNumber || '—'}</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Line Seal Number</label>
                        {editAll ? (
                          <input className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold" value={logisticsData.lineSealNumber} onChange={e => setLogisticsData({...logisticsData, lineSealNumber: e.target.value})} placeholder="e.g. line seal" />
                        ) : (
                          <p className="text-sm font-bold text-slate-800">{logisticsData.lineSealNumber || '—'}</p>
                        )}
                      </div>
                    </>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                     <div>
                       <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Port of Loading</label>
                       {editAll ? (
                         <input className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold" value={logisticsData.portOfLoading} onChange={e => setLogisticsData({...logisticsData,portOfLoading: e.target.value})} />
                       ) : <p className="text-sm font-bold text-slate-800">{logisticsData.portOfLoading || '---'}</p>}
                     </div>
                     <div>
                       <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Port of Discharge</label>
                       {editAll ? (
                         <input className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold" value={logisticsData.portOfDischarge} onChange={e => setLogisticsData({...logisticsData, portOfDischarge: e.target.value})} />
                       ) : <p className="text-sm font-bold text-slate-800">{logisticsData.portOfDischarge || '---'}</p>}
                     </div>
                  </div>
                  {!isExport && (
                  <div>
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Tracking URL</label>
                    {editAll ? (
                      <input className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold" value={logisticsData.trackingUrl} onChange={e => setLogisticsData({...logisticsData, trackingUrl: e.target.value})} placeholder="https://..." />
                    ) : (
                       logisticsData.trackingUrl ? (
                         <a href={logisticsData.trackingUrl} target="_blank" rel="noreferrer" className="text-sm font-bold text-indigo-600 hover:underline flex items-center gap-2">
                           Track Shipment <ExternalLink size={12} />
                         </a>
                       ) : <p className="text-sm text-slate-400 italic">Not available</p>
                    )}
                  </div>
                  )}
                  <div>
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Expected Arrival Date</label>
                    {editAll ? (
                      <input type="date" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold" value={logisticsData.expectedArrivalDate} onChange={e => setLogisticsData({...logisticsData, expectedArrivalDate: e.target.value})} />
                    ) : (
                      <p className="text-sm font-bold text-slate-800">{logisticsData.expectedArrivalDate ? formatDate(logisticsData.expectedArrivalDate) : '---'}</p>
                    )}
                  </div>
               </div>
               <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">BL / AWB Number</label>
                      {editAll ? (
                        <input className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold" value={logisticsData.blNumber} onChange={e => setLogisticsData({...logisticsData, blNumber: e.target.value})} />
                      ) : (
                        <p className="text-sm font-bold text-slate-800">{logisticsData.blNumber || '---'}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">BL Date</label>
                      {editAll ? (
                        <input type="date" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold" value={logisticsData.blDate} onChange={e => setLogisticsData({...logisticsData, blDate: e.target.value})} />
                      ) : (
                        <p className="text-sm font-bold text-slate-800">{formatDate(logisticsData.blDate)}</p>
                      )}
                    </div>
                  </div>
               </div>
            </div>
          </div>
          )}

          {/* Bill of Entry (Import only). When a licence is selected, invoice is just a reference — no BOE or product add here; those are in Licence system. */}
          {!isExport && (
          <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
               <h2 className="text-xs font-black uppercase text-slate-400 tracking-widest flex items-center gap-2"><Landmark size={16} /> Bill of Entry (Import)</h2>
            </div>
            <div className="p-8">
               {/* When licence is selected: only show licence reference (dropdown + note). No BOE or product add on invoice. */}
               {licenceImportData.linkedLicenceId ? (
                 <div className="mb-8 pb-8 border-b border-slate-50">
                   <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-4 flex items-center gap-2"><ShieldAlert size={14} /> Licence reference</h3>
                   <p className="text-xs text-slate-500 mb-4">This shipment is linked to the selected licence for import. Bill of Entry and product-level details are managed in Licence Audit Control.</p>
                   <div className="max-w-sm">
                     <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{importLicenceType === LicenceType.EPCG ? 'EPCG Licence' : 'Advance Licence'}</label>
                     {(editAll || editDuties) ? (
                       <select
                         className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold"
                         value={licenceImportData.linkedLicenceId}
                         onChange={e => setLicenceImportData(prev => ({ ...prev, linkedLicenceId: e.target.value }))}
                       >
                         <option value="">— Select —</option>
                         {importLicencesFiltered.map(l => <option key={l.id} value={l.id}>{l.number}</option>)}
                       </select>
                     ) : (
                       <p className="text-sm font-bold text-slate-800">
                         {licences.find(l => l.id === licenceImportData.linkedLicenceId)?.number || licenceImportData.linkedLicenceId}
                       </p>
                     )}
                   </div>
                 </div>
               ) : (
                 <>
               <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8 pb-8 border-b border-slate-50">
                   <div>
                       <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Amount (INR)</label>
                       <p className="text-sm font-bold text-indigo-600">{formatINR(editAll ? ((invoiceEditData.items.reduce((s, it) => s + it.amount, 0) + (invoiceEditData.freightCharges || 0) + (invoiceEditData.otherCharges || 0)) * (dutiesData.exchangeRate || 1)) : shipment.invoiceValueINR)}</p>
                   </div>
                   <div>
                       <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Exchange Rate (to INR)</label>
                       {editAll ? (
                           <input type="number" step="0.01" min="0" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold" value={dutiesData.exchangeRate || ''} onChange={e => setDutiesData({...dutiesData, exchangeRate: parseFloat(e.target.value) || 0})} placeholder="e.g. 84" />
                       ) : <p className="text-sm font-bold text-slate-800">{(shipment.exchangeRate ?? dutiesData.exchangeRate) ? `1 ${shipment.currency} = ₹${(shipment.exchangeRate ?? dutiesData.exchangeRate)}` : '—'}</p>}
                   </div>
                   <div>
                       <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Port Code</label>
                       {editAll ? (
                           <input className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold" value={dutiesData.portCode} onChange={e => setDutiesData({...dutiesData, portCode: e.target.value})} placeholder="e.g. INMUN" />
                       ) : <p className="text-sm font-bold text-slate-800">{dutiesData.portCode || '---'}</p>}
                   </div>
                   <div>
                       <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Inco Term</label>
                       {editAll ? (
                           <select className="w-full px-2 py-1.5 rounded-lg border font-bold" value={dutiesData.incoTerm} onChange={e => setDutiesData({...dutiesData, incoTerm: e.target.value})}>
                               <option value="FOB">FOB</option>
                               <option value="CIF">CIF</option>
                               <option value="EXW">EXW</option>
                               <option value="DDP">DDP</option>
                           </select>
                       ) : <p className="text-sm font-bold text-slate-800">{dutiesData.incoTerm}</p>}
                   </div>
                   <div>
                       <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Bill of Entry No.</label>
                       {editAll ? (
                           <input className="w-full px-2 py-1.5 rounded-lg border font-bold" value={dutiesData.beNumber} onChange={e => setDutiesData({...dutiesData, beNumber: e.target.value})} />
                       ) : <p className="text-sm font-bold text-slate-800">{dutiesData.beNumber || '---'}</p>}
                   </div>
                   <div>
                       <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Bill of Entry Date</label>
                       {editAll ? (
                           <input type="date" className="w-full px-2 py-1.5 rounded-lg border font-bold" value={dutiesData.beDate} onChange={e => setDutiesData({...dutiesData, beDate: e.target.value})} />
                       ) : <p className="text-sm font-bold text-slate-800">{formatDate(dutiesData.beDate)}</p>}
                   </div>
               </div>

               {/* Licence (Import): Advance for raw material, EPCG for capital goods — only when no licence selected yet */}
               <div className="mb-8 pb-8 border-b border-slate-50">
                   <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-4 flex items-center gap-2"><ShieldAlert size={14} /> Licence</h3>
                   {importLicenceType ? (
                   <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                       <div>
                           <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{importLicenceType === LicenceType.EPCG ? 'EPCG Licence' : 'Advance Licence'}</label>
                           {(editAll || editDuties) ? (
                               <select
                                 className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold"
                                 value={licenceImportData.linkedLicenceId}
                                 onChange={e => setLicenceImportData(prev => ({ ...prev, linkedLicenceId: e.target.value }))}
                               >
                                 <option value="">— Select —</option>
                                 {importLicencesFiltered.map(l => <option key={l.id} value={l.id}>{l.number}</option>)}
                               </select>
                           ) : (
                               <p className="text-sm font-bold text-slate-800">
                                 {licenceImportData.linkedLicenceId ? (licences.find(l => l.id === licenceImportData.linkedLicenceId)?.number || licenceImportData.linkedLicenceId) : '—'}
                               </p>
                           )}
                       </div>
                       <div>
                           <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Quantity</label>
                           {(editAll || editDuties) ? (
                               <input
                                 type="number"
                                 step="any"
                                 min="0"
                                 className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold"
                                 value={licenceImportData.licenceObligationQuantity || ''}
                                 onChange={e => setLicenceImportData(prev => ({ ...prev, licenceObligationQuantity: parseFloat(e.target.value) || 0 }))}
                               />
                           ) : <p className="text-sm font-bold text-slate-800">{licenceImportData.licenceObligationQuantity != null && licenceImportData.licenceObligationQuantity !== 0 ? licenceImportData.licenceObligationQuantity : '—'}</p>}
                       </div>
                       <div>
                           <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Amount (INR)</label>
                           {(editAll || editDuties) ? (
                               <input
                                 type="number"
                                 step="any"
                                 min="0"
                                 className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold"
                                 value={licenceImportData.licenceObligationAmount || ''}
                                 onChange={e => setLicenceImportData(prev => ({ ...prev, licenceObligationAmount: parseFloat(e.target.value) || 0 }))}
                               />
                           ) : <p className="text-sm font-bold text-slate-800">{licenceImportData.licenceObligationAmount != null && licenceImportData.licenceObligationAmount !== 0 ? formatINR(licenceImportData.licenceObligationAmount) : '—'}</p>}
                       </div>
                   </div>
                   ) : (
                   <p className="text-xs text-slate-400 italic">Add line items with product type to show Advance (raw material) or EPCG (capital goods) licence selection.</p>
                   )}
                   {/* Products in this Bill of Entry — only when no licence selected (when selected, BOE/product add are in Licence system) */}
                   {licenceImportLines.length > 0 && (
                     <div className="mt-6">
                       <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Products in this Bill of Entry</p>
                       <p className="text-[10px] text-slate-500 mb-2">Invoice: {shipment?.invoiceNumber} · Supplier: {partnerName} · BE No: {dutiesData.beNumber || '—'} · BE Date: {dutiesData.beDate ? formatDate(dutiesData.beDate) : '—'} · Exchange rate: {dutiesData.exchangeRate || '—'}</p>
                       <div className="border border-slate-200 rounded-xl overflow-hidden">
                         <table className="w-full text-sm">
                           <thead>
                             <tr className="bg-slate-50 text-left text-[9px] font-black text-slate-500 uppercase">
                               <th className="p-2">Product name</th>
                               <th className="p-2">Quantity</th>
                               <th className="p-2">Unit</th>
                               <th className="p-2">Value (INR)</th>
                               <th className="p-2">Amount (USD)</th>
                               <th className="p-2 w-10"></th>
                             </tr>
                           </thead>
                           <tbody className="divide-y divide-slate-100">
                             {licenceImportLines.map((row, idx) => (
                               <tr key={idx}>
                                 <td className="p-2">
                                   <input type="text" className="w-full px-2 py-1.5 rounded-lg border font-bold text-sm" value={row.productName || ''} onChange={e => setLicenceImportLines(prev => prev.map((r, i) => i === idx ? { ...r, productName: e.target.value } : r))} placeholder="Name" />
                                 </td>
                                 <td className="p-2"><input type="number" step="any" min="0" className="w-full px-2 py-1.5 rounded-lg border font-bold text-sm" value={row.quantity ?? ''} onChange={e => setLicenceImportLines(prev => prev.map((r, i) => i === idx ? { ...r, quantity: parseFloat(e.target.value) || 0 } : r))} /></td>
                                 <td className="p-2">
                                   <select className="w-full px-2 py-1.5 rounded-lg border font-bold text-sm" value={row.unit || 'KGS'} onChange={e => setLicenceImportLines(prev => prev.map((r, i) => i === idx ? { ...r, unit: e.target.value } : r))}>
                                     {STANDARDISED_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                                   </select>
                                 </td>
                                 <td className="p-2">
                                   <input type="number" step="any" min="0" className="w-full px-2 py-1.5 rounded-lg border font-bold text-sm" value={row.valueINR ?? ''} onChange={e => {
                                     const v = parseFloat(e.target.value) || 0;
                                     const ex = dutiesData.exchangeRate || 1;
                                     setLicenceImportLines(prev => prev.map((r, i) => i === idx ? { ...r, valueINR: v, amountUSD: ex > 0 ? v / ex : 0 } : r));
                                   }} />
                                 </td>
                                 <td className="p-2">
                                   <input type="number" step="any" min="0" className="w-full px-2 py-1.5 rounded-lg border font-bold text-sm" value={row.amountUSD ?? ''} onChange={e => {
                                     const usd = parseFloat(e.target.value) || 0;
                                     const ex = dutiesData.exchangeRate || 1;
                                     setLicenceImportLines(prev => prev.map((r, i) => i === idx ? { ...r, amountUSD: usd, valueINR: usd * ex } : r));
                                   }} />
                                 </td>
                                 <td className="p-2"><button type="button" onClick={() => setLicenceImportLines(prev => prev.filter((_, i) => i !== idx))} className="p-1 text-slate-400 hover:text-red-600 rounded"><Trash2 size={14} /></button></td>
                               </tr>
                             ))}
                           </tbody>
                         </table>
                         {(editAll || editDuties) && (
                           <div className="p-2 border-t border-slate-100">
                             <button type="button" onClick={() => setLicenceImportLines(prev => [...prev, { productName: '', quantity: 0, unit: 'KGS', valueINR: 0, amountUSD: 0 }])} className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"><Plus size={12} /> Add product</button>
                           </div>
                         )}
                       </div>
                     </div>
                   )}
               </div>
               </>
               )}

               {/* Duties / BOE details only when no licence selected (when selected, BOE is in Licence system) */}
               {!licenceImportData.linkedLicenceId && (
               <>
               <div className="flex items-center gap-4 mb-6 pb-6 border-b border-slate-50">
                   <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl"><Zap size={20} /></div>
                   <div className="flex-1">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Assessable Value (INR)</p>
                      {editAll ? (
                         <input type="number" className="text-xl font-black bg-slate-50 border border-slate-200 rounded-lg px-2 w-48" value={dutiesData.assessedValue} onChange={e => setDutiesData({...dutiesData, assessedValue: parseFloat(e.target.value)})} />
                      ) : <p className="text-2xl font-black text-slate-900">{formatINR(dutiesData.assessedValue)}</p>}
                   </div>
               </div>
               
               <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div>
                     <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Basic Customs Duty</label>
                     {editAll ? <input type="number" className="w-full px-2 py-1 border rounded font-bold" value={dutiesData.dutyBCD} onChange={e => setDutiesData({...dutiesData, dutyBCD: parseFloat(e.target.value)})} /> 
                     : <p className="font-bold text-slate-700">{formatINR(dutiesData.dutyBCD)}</p>}
                  </div>
                  <div>
                     <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">SWS (Surcharge)</label>
                     {editAll ? <input type="number" className="w-full px-2 py-1 border rounded font-bold" value={dutiesData.dutySWS} onChange={e => setDutiesData({...dutiesData, dutySWS: parseFloat(e.target.value)})} /> 
                     : <p className="font-bold text-slate-700">{formatINR(dutiesData.dutySWS)}</p>}
                  </div>
                  <div>
                     <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">INT+PNLTY+FINE</label>
                     {editAll ? <input type="number" className="w-full px-2 py-1 border rounded font-bold" value={dutiesData.dutyINT} onChange={e => setDutiesData({...dutiesData, dutyINT: parseFloat(e.target.value)})} /> 
                     : <p className="font-bold text-slate-700">{formatINR(dutiesData.dutyINT)}</p>}
                  </div>
                  <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                     <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Duty</label>
                     <p className="font-black text-indigo-600">{formatINR(totalDuty)}</p>
                  </div>
               </div>

               <div className="mt-6 pt-6 border-t border-slate-50 grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div className="md:col-span-3"></div>
                  <div className="bg-emerald-50 p-2 rounded-lg border border-emerald-100">
                     <label className="block text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-1">IGST Payable</label>
                     {editAll ? <input type="number" className="w-full px-2 py-1 border rounded font-bold" value={dutiesData.gst} onChange={e => setDutiesData({...dutiesData, gst: parseFloat(e.target.value)})} /> 
                     : <p className="font-black text-emerald-700">{formatINR(dutiesData.gst)}</p>}
                  </div>
               </div>
               </>
               )}
            </div>
          </div>
          )}

          {/* Payment Ledger */}
          <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
             <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
               <div className="flex items-center gap-2">
                   <h2 className="text-xs font-black uppercase text-slate-400 tracking-widest flex items-center gap-2"><CreditCard size={16} /> Payment Ledger</h2>
                   {shipment.paymentDueDate && (
                       <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded ml-2">Due: {formatDate(shipment.paymentDueDate)}</span>
                   )}
               </div>
               <button 
                  onClick={() => {
                    setNewPayment(prev => ({
                      ...prev,
                      currency: shipment.currency,
                      ...(shipment.isUnderLC && linkedLC ? { mode: 'LC' } : {})
                    }));
                    setShowPaymentModal(true);
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
               >
                 <Plus size={14} /> Add Payment
               </button>
             </div>
             {isExport && (
             <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/30">
               <p className="text-[10px] text-slate-500 mb-3">Lodgement is filed with the bank; the bank gives a lodgement number. Incoming payment is settled against this lodgement no.</p>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div>
                   <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Lodgement No.</label>
                   {editAll ? (
                     <input className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold" value={lodgementValue} onChange={e => setLodgementValue(e.target.value)} placeholder="Bank lodgement number" />
                   ) : (
                     <p className="text-sm font-bold text-slate-800">{(shipment as any).lodgement || '—'}</p>
                   )}
                 </div>
                 <div>
                   <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Lodgement Date</label>
                   {editAll ? (
                     <input type="date" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold" value={lodgementDateValue} onChange={e => setLodgementDateValue(e.target.value)} />
                   ) : (
                     <p className="text-sm font-bold text-slate-800">{(shipment as any).lodgementDate ? formatDate((shipment as any).lodgementDate) : '—'}</p>
                   )}
                 </div>
               </div>
             </div>
             )}
             <div className="px-6 py-4 grid grid-cols-2 gap-4 border-b border-slate-100 bg-slate-50/30">
               <div><p className="text-[9px] font-black uppercase text-slate-400">Total ({shipment.currency})</p><p className="text-sm font-black text-slate-800">{formatCurrency(paymentSummary.totalFC, shipment.currency)}</p></div>
               <div><p className="text-[9px] font-black uppercase text-amber-600">Pending</p><p className="text-sm font-black text-amber-700">{formatCurrency(paymentSummary.pendingFC, shipment.currency)}</p></div>
             </div>
             {isExport && (
             <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/30">
               <h3 className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-3">e-BRC</h3>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div>
                   <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">e-BRC No.</label>
                   {editAll ? <input className="w-full px-3 py-2 border rounded-lg font-bold" value={exportDocData.ebrcNo} onChange={e => setExportDocData({...exportDocData, ebrcNo: e.target.value})} /> : <p className="font-bold text-slate-800">{(shipment as any).ebrcNo || '—'}</p>}
                 </div>
                 <div>
                   <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">e-BRC Value</label>
                   {editAll ? <input type="number" className="w-full px-3 py-2 border rounded-lg font-bold" value={exportDocData.ebrcValue || ''} onChange={e => setExportDocData({...exportDocData, ebrcValue: parseFloat(e.target.value) || 0})} /> : <p className="font-bold text-slate-800">{(shipment as any).ebrcValue != null ? formatINR((shipment as any).ebrcValue) : '—'}</p>}
                 </div>
               </div>
             </div>
             )}
             {shipment.isUnderLC && (
             <div className="px-6 py-4 border-b border-slate-100 bg-indigo-50/50">
               <p className="text-sm font-bold text-slate-800"><span className="text-[9px] font-black text-slate-500 uppercase">LC No.</span> {shipment.lcNumber || '—'}</p>
             </div>
             )}
             <div className="p-6">
               {(shipment.payments || []).length > 0 ? (
                 <table className="w-full">
                    <thead>
                       <tr className="text-left text-[9px] font-black uppercase text-slate-400 border-b pb-2">
                          <th className="pb-3 pl-2">Date</th>
                          <th className="pb-3">Reference</th>
                          <th className="pb-3">Mode</th>
                          <th className="pb-3 text-right">Amount</th>
                          <th className="pb-3">Status</th>
                          <th className="pb-3 text-right">Action</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                       {shipment.payments.map((pay) => (
                          <tr key={pay.id} className="group">
                             <td className="py-3 pl-2 text-xs font-mono text-slate-500">{formatDate(pay.date)}</td>
                             <td className="py-3 text-xs font-bold text-slate-700">{pay.reference || '-'}</td>
                             <td className="py-3 text-[10px] font-black uppercase text-slate-400">{pay.mode}</td>
                             <td className="py-3 text-right text-sm font-black text-slate-900">{formatCurrency(pay.amount, pay.currency)}</td>
                             <td className="py-3">
                                {pay.received ? <span className="text-[9px] font-black uppercase text-emerald-600 flex items-center gap-1"><CheckCircle size={12} /> Received</span> : <button type="button" onClick={() => handleMarkPaymentReceived(pay.id)} className="text-[9px] font-black uppercase text-amber-600 hover:text-amber-700">Mark received</button>}
                             </td>
                             <td className="py-3 text-right">
                                <button onClick={() => handleDeletePayment(pay.id)} className="text-slate-300 hover:text-red-500"><Trash2 size={14} /></button>
                             </td>
                          </tr>
                       ))}
                    </tbody>
                 </table>
               ) : (
                 <p className="text-center text-slate-400 italic text-sm py-4">No payments recorded yet.</p>
               )}
             </div>
          </div>

        </div>

        <div className="space-y-8">
           <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white shadow-2xl">
              <h2 className="text-xs font-black uppercase text-indigo-400 mb-8 flex items-center gap-2">
                 <Zap size={14} className="animate-pulse" /> Lifecycle
              </h2>
              <div className="space-y-6">
                {(isExport ? SHIPMENT_STATUS_ORDER_EXPORT : SHIPMENT_STATUS_ORDER_IMPORT).map((step, idx) => {
                  const statusOrder = isExport ? SHIPMENT_STATUS_ORDER_EXPORT : SHIPMENT_STATUS_ORDER_IMPORT;
                  let currentIdx = statusOrder.indexOf(shipment.status);
                  if (currentIdx === -1 && (shipment.status === 'ORDERED' || shipment.status === 'INITIATED')) currentIdx = 0;
                  const isDone = idx <= currentIdx;
                  return (
                    <div key={step} className="flex gap-4">
                       <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${isDone ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-500'}`}>
                          {isDone ? <CheckCircle size={14} /> : idx + 1}
                       </div>
                       <p className={`text-[10px] font-black uppercase tracking-widest ${isDone ? 'text-white' : 'text-slate-600'}`}>{getShipmentStatusLabel(step)}</p>
                    </div>
                  )
                })}
              </div>
           </div>

           <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm relative overflow-hidden">
               <h2 className="text-xs font-black uppercase text-slate-900 mb-6 flex items-center gap-2">
                   <MapPin size={16} className="text-indigo-500" /> Tracking Timeline
               </h2>
               <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full blur-3xl opacity-50 -mr-16 -mt-16 pointer-events-none"></div>

               <div className="relative">
                  <div className="absolute top-0 bottom-0 left-6 md:left-1/2 w-0.5 bg-slate-200 md:-ml-px"></div>
                  
                  <div className="space-y-8 relative">
                      {historyArray.map((h, i) => {
                          const isRight = i % 2 === 0;
                          return (
                              <div key={i} className="relative md:grid md:grid-cols-2 md:gap-12 group">
                                  <div className={`absolute top-5 left-6 md:left-1/2 -translate-x-1/2 w-4 h-4 rounded-full border-2 border-white shadow-sm z-10 box-content ${i === 0 ? 'bg-indigo-600 ring-4 ring-indigo-50' : 'bg-slate-300'}`}></div>
                                  <div className={`hidden md:block absolute top-[1.6rem] h-px bg-slate-200 w-6 ${isRight ? 'left-1/2' : 'right-1/2'}`}></div>
                                  <div className={`${isRight ? 'hidden md:block' : 'pl-14 md:pl-0'}`}>
                                      {!isRight && (
                                          <div className="p-5 rounded-2xl border border-slate-100 bg-slate-50 shadow-sm w-full relative hover:border-indigo-100 transition-colors group/card">
                                              <button type="button" onClick={(e) => { e.stopPropagation(); openEditTimeline(i); }} className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-400 hover:bg-indigo-100 hover:text-indigo-600 transition-colors" title="Edit timeline entry"><Pencil size={14} /></button>
                                              <div className="mb-2">
                                                  <span className="block font-black text-xs text-slate-900 uppercase tracking-tight mb-1">{getShipmentStatusLabel(h.status)}</span>
                                                  <div className="inline-flex items-center gap-2 text-[9px] font-bold text-slate-500 bg-white border border-slate-100 px-3 py-1.5 rounded-lg">
                                                      <span className="flex items-center gap-1"><Calendar size={10} className="text-indigo-400" />{new Date(h.date).toLocaleDateString()}</span>
                                                      <span className="flex items-center gap-1"><MapPin size={10} className="text-slate-400" />{h.location || 'Unknown Location'}</span>
                                                  </div>
                                              </div>
                                              {h.remarks && <p className="text-xs text-slate-600 italic bg-white/50 p-2 rounded-lg border border-slate-100/50">"{h.remarks}"</p>}
                                          </div>
                                      )}
                                  </div>
                                  <div className={`${!isRight ? 'hidden md:block' : 'pl-14 md:pl-0'}`}>
                                      {isRight && (
                                          <div className="p-5 rounded-2xl border border-slate-100 bg-slate-50 shadow-sm w-full relative hover:border-indigo-100 transition-colors group/card">
                                              <button type="button" onClick={(e) => { e.stopPropagation(); openEditTimeline(i); }} className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-400 hover:bg-indigo-100 hover:text-indigo-600 transition-colors" title="Edit timeline entry"><Pencil size={14} /></button>
                                              <div className="mb-2">
                                                  <span className="block font-black text-xs text-slate-900 uppercase tracking-tight mb-1">{getShipmentStatusLabel(h.status)}</span>
                                                  <div className="inline-flex items-center gap-2 text-[9px] font-bold text-slate-500 bg-white border border-slate-100 px-3 py-1.5 rounded-lg">
                                                      <span className="flex items-center gap-1"><Calendar size={10} className="text-indigo-400" />{new Date(h.date).toLocaleDateString()}</span>
                                                      <span className="flex items-center gap-1"><MapPin size={10} className="text-slate-400" />{h.location || 'Unknown Location'}</span>
                                                  </div>
                                              </div>
                                              {h.remarks && <p className="text-xs text-slate-600 italic bg-white/50 p-2 rounded-lg border border-slate-100/50">"{h.remarks}"</p>}
                                          </div>
                                      )}
                                  </div>
                              </div>
                          );
                      })}
                  </div>
               </div>
           </div>

           {/* Documents: upload, file list, and checker in one section */}
           <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-6">
             <div className="flex items-center justify-between gap-4">
               <h2 className="text-xs font-black uppercase text-slate-900 flex items-center gap-2">
                 <FileText size={16} className="text-indigo-500" /> Documents
               </h2>
               {canViewDocuments && (
                 <button
                   type="button"
                   onClick={refetchFolderFiles}
                   disabled={loadingDocFiles}
                   className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-indigo-600 disabled:opacity-50 transition-colors"
                   title="Refresh list from folder"
                 >
                   <RefreshCw size={16} className={loadingDocFiles ? 'animate-spin' : ''} />
                 </button>
               )}
             </div>
             {!canViewDocuments ? (
               <div className="flex flex-col items-center justify-center py-12 px-6 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                 <div className="w-16 h-16 rounded-full bg-slate-200 flex items-center justify-center mb-4">
                   <FileText size={32} className="text-slate-500" />
                 </div>
                 <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Access Restricted</h3>
                 <p className="text-slate-500 text-sm mt-1 max-w-xs">You don’t have permission to view or manage documents for this shipment.</p>
               </div>
             ) : (
               <>
                 {connectionMode === 'OFFLINE' && (
                   <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
                     Document upload is available when connected to the server. If you see &quot;Shipment not found&quot; after uploading, refresh the page to sync, then try again.
                   </p>
                 )}
                 {canUploadDocuments && (
                   <div>
                     <h3 className="text-[10px] font-black uppercase text-slate-500 mb-3">Upload file</h3>
                     <ShipmentUpload
                       shipmentId={shipment.id}
                       isExport={isExport}
                       onUploadSuccess={refetchFolderFiles}
                       onShipmentNotFound={async () => {
                         try {
                           await api.shipments.create(shipment);
                           return true;
                         } catch {
                           return false;
                         }
                       }}
                       onOcrDataExtracted={(payload) => setPendingOcrPayload(payload)}
                     />
                   </div>
                 )}
                 <div className="border-t border-slate-100 pt-6">
                   <h3 className="text-[10px] font-black uppercase text-slate-500 mb-3 flex items-center gap-2">
                     <FileCheck size={14} className="text-indigo-500" /> Checklist
                   </h3>
                   <p className="text-[10px] text-slate-500 mb-3">Upload a file with the matching type to turn the row green. View, download, or delete from the row.</p>
                   {loadingDocFiles ? (
                     <p className="text-sm text-slate-400 italic flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading…</p>
                   ) : (
                     <div className="space-y-2">
                       {documentCheckerRows.map((row, idx) => {
                         const isPending = !row.found;
                         const showRed = allShipmentDetailsFilled && isPending;
                         const showGreen = row.found;
                         const fileName = row.matchedFileName;
                         return (
                           <div
                             key={`${row.expectedName}-${idx}`}
                             className={`flex items-center justify-between gap-4 py-2.5 px-4 rounded-xl border-2 ${
                               showGreen
                                 ? 'border-emerald-200 bg-emerald-50'
                                 : showRed
                                   ? 'border-red-200 bg-red-50'
                                   : 'border-slate-100 bg-slate-50'
                             }`}
                           >
                             <div className="flex items-center gap-2 min-w-0">
                               {showGreen ? (
                                 <CheckCircle size={18} className="text-emerald-600 shrink-0" />
                               ) : (
                                 <span className={`w-[18px] h-[18px] rounded-full border-2 shrink-0 ${showRed ? 'border-red-400' : 'border-slate-300'}`} />
                               )}
                               <span className={`text-sm font-bold truncate ${showRed ? 'text-red-900' : 'text-slate-800'}`}>{row.label}</span>
                             </div>
                             {fileName && (
                               <div className="flex items-center gap-1 shrink-0">
                                 {canViewDocuments && isViewableInBrowser(fileName) && (
                                   <button
                                     type="button"
                                     title="View in new tab"
                                     onClick={async () => {
                                       try {
                                         const blob = await api.shipments.downloadFile(shipment.id, fileName);
                                         const url = URL.createObjectURL(blob);
                                         window.open(url, '_blank', 'noopener');
                                         setTimeout(() => URL.revokeObjectURL(url), 60000);
                                       } catch (e: any) {
                                         alert(e?.message || 'View failed');
                                       }
                                     }}
                                     className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
                                   >
                                     <Eye size={16} />
                                   </button>
                                 )}
                                 {canViewDocuments && (
                                   <button
                                     type="button"
                                     title="Download"
                                     onClick={async () => {
                                       try {
                                         const blob = await api.shipments.downloadFile(shipment.id, fileName);
                                         const url = URL.createObjectURL(blob);
                                         const a = document.createElement('a');
                                         a.href = url;
                                         a.download = fileName;
                                         document.body.appendChild(a);
                                         a.click();
                                         document.body.removeChild(a);
                                         URL.revokeObjectURL(url);
                                       } catch (e: any) {
                                         alert(e?.message || 'Download failed');
                                       }
                                     }}
                                     className="p-2 rounded-lg bg-indigo-100 hover:bg-indigo-200 text-indigo-700 transition-colors"
                                   >
                                     <Download size={16} />
                                   </button>
                                 )}
                                 {canDeleteDocuments && (
                                   <button
                                     type="button"
                                     title="Delete file"
                                     onClick={async () => {
                                       if (!window.confirm(`Delete "${fileName}"? This cannot be undone.`)) return;
                                       try {
                                         await api.shipments.deleteFile(shipment.id, fileName);
                                         refetchFolderFiles();
                                       } catch (e: any) {
                                         alert(e?.message || 'Delete failed');
                                       }
                                     }}
                                     className="p-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition-colors"
                                   >
                                     <Trash2 size={16} />
                                   </button>
                                 )}
                               </div>
                             )}
                           </div>
                         );
                       })}
                     </div>
                   )}
                 </div>
                 {otherFiles.length > 0 && (
                   <div className="border-t border-slate-100 pt-6">
                     <h3 className="text-[10px] font-black uppercase text-slate-500 mb-3">Other files</h3>
                     <p className="text-[10px] text-slate-500 mb-2">Files that don’t match a checklist item.</p>
                     <ul className="space-y-2">
                       {otherFiles.map((name) => (
                         <li key={name} className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg bg-slate-50 hover:bg-slate-100">
                           <span className="flex items-center gap-2 text-sm text-slate-800 truncate min-w-0">
                             <FileText size={14} className="text-slate-400 shrink-0" />
                             {name}
                           </span>
                           <div className="flex items-center gap-1 shrink-0">
                             {canViewDocuments && isViewableInBrowser(name) && (
                               <button type="button" title="View" onClick={async () => { try { const blob = await api.shipments.downloadFile(shipment.id, name); const url = URL.createObjectURL(blob); window.open(url, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(url), 60000); } catch (e: any) { alert(e?.message || 'View failed'); } }} className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600"><Eye size={16} /></button>
                             )}
                             {canViewDocuments && (
                               <button type="button" title="Download" onClick={async () => { try { const blob = await api.shipments.downloadFile(shipment.id, name); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); } catch (e: any) { alert(e?.message || 'Download failed'); } }} className="p-2 rounded-lg bg-indigo-100 hover:bg-indigo-200 text-indigo-700"><Download size={16} /></button>
                             )}
                             {canDeleteDocuments && (
                               <button type="button" title="Delete" onClick={async () => { if (!window.confirm(`Delete "${name}"?`)) return; try { await api.shipments.deleteFile(shipment.id, name); refetchFolderFiles(); } catch (e: any) { alert(e?.message || 'Delete failed'); } }} className="p-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-600"><Trash2 size={16} /></button>
                             )}
                           </div>
                         </li>
                       ))}
                     </ul>
                   </div>
                 )}
               </>
             )}
           </div>

           {/* Remarks: free-form notes for this shipment */}
           <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-4">
             <h2 className="text-xs font-black uppercase text-slate-900 flex items-center gap-2">
               <Edit3 size={16} className="text-indigo-500" /> Remarks
             </h2>
             <p className="text-[10px] text-slate-500">Add any notes or information for this shipment. They are saved automatically when you leave the box.</p>
             <textarea
               rows={4}
               className="w-full px-4 py-3 rounded-xl border border-slate-200 font-medium text-sm placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300"
               placeholder="Enter any information you want to remember for this shipment…"
               value={remarksDraft}
               onChange={e => setRemarksDraft(e.target.value)}
               onBlur={() => {
                 if (shipment && remarksDraft !== (shipment.remarks ?? '')) {
                   onUpdate({ ...shipment, remarks: remarksDraft });
                 }
               }}
             />
           </div>
        </div>
      </div>

      {showUpdateModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl p-8 relative">
                  <button onClick={() => setShowUpdateModal(false)} className="absolute top-6 right-6 p-2 hover:bg-slate-100 rounded-full text-slate-400">
                      <X size={20} />
                  </button>
                  <h2 className="text-xl font-black text-slate-900 mb-6">Log Shipment Update</h2>
                  <form onSubmit={handleSubmitUpdate} className="space-y-6">
                      <div>
                          <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Current Status</label>
                          <select 
                            className="w-full px-4 py-3 rounded-xl border font-bold text-sm bg-slate-50"
                            value={newUpdate.status}
                            onChange={e => setNewUpdate({...newUpdate, status: e.target.value as ShipmentStatus})}
                          >
                              {(isExport ? SHIPMENT_STATUS_ORDER_EXPORT : SHIPMENT_STATUS_ORDER_IMPORT).map(s => (
                                  <option key={s} value={s}>{getShipmentStatusLabel(s)}</option>
                              ))}
                          </select>
                      </div>
                      <div>
                          <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Location</label>
                          <div className="relative">
                              <MapPin size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-500" />
                              <input required className="w-full pl-10 pr-4 py-3 rounded-xl border font-bold text-sm" placeholder="e.g. Mundra Port, Gujarat" value={newUpdate.location} onChange={e => setNewUpdate({...newUpdate, location: e.target.value})} />
                          </div>
                      </div>
                      <div>
                          <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Remarks / Notes</label>
                          <textarea rows={3} className="w-full px-4 py-3 rounded-xl border font-medium text-sm" placeholder="Any delays, weather conditions..." value={newUpdate.remarks} onChange={e => setNewUpdate({...newUpdate, remarks: e.target.value})} />
                      </div>
                      <button type="submit" className="w-full py-4 bg-indigo-600 text-white font-black uppercase rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-2">
                          <CheckCircle size={18} /> Confirm Update
                      </button>
                  </form>
              </div>
          </div>
      )}

      {editingHistoryIndex !== null && editHistoryDraft && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl p-8 relative">
                  <button onClick={() => { setEditingHistoryIndex(null); setEditHistoryDraft(null); }} className="absolute top-6 right-6 p-2 hover:bg-slate-100 rounded-full text-slate-400">
                      <X size={20} />
                  </button>
                  <h2 className="text-xl font-black text-slate-900 mb-6">Edit timeline entry</h2>
                  <form onSubmit={handleSaveTimelineEdit} className="space-y-6">
                      <div>
                          <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Status</label>
                          <select
                            className="w-full px-4 py-3 rounded-xl border font-bold text-sm bg-slate-50"
                            value={editHistoryDraft.status}
                            onChange={e => setEditHistoryDraft({ ...editHistoryDraft, status: e.target.value as ShipmentStatus })}
                          >
                              {(isExport ? SHIPMENT_STATUS_ORDER_EXPORT : SHIPMENT_STATUS_ORDER_IMPORT).map(s => (
                                  <option key={s} value={s}>{getShipmentStatusLabel(s)}</option>
                              ))}
                          </select>
                      </div>
                      <div>
                          <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Date</label>
                          <input
                            type="date"
                            className="w-full px-4 py-3 rounded-xl border font-bold text-sm bg-slate-50"
                            value={editHistoryDraft.date && editHistoryDraft.date.length >= 10 ? editHistoryDraft.date.slice(0, 10) : ''}
                            onChange={e => setEditHistoryDraft({ ...editHistoryDraft, date: e.target.value })}
                          />
                      </div>
                      <div>
                          <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Location</label>
                          <div className="relative">
                              <MapPin size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-500" />
                              <input required className="w-full pl-10 pr-4 py-3 rounded-xl border font-bold text-sm" placeholder="e.g. Mundra Port, Gujarat" value={editHistoryDraft.location} onChange={e => setEditHistoryDraft({ ...editHistoryDraft, location: e.target.value })} />
                          </div>
                      </div>
                      <div>
                          <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Remarks / Notes</label>
                          <textarea rows={3} className="w-full px-4 py-3 rounded-xl border font-medium text-sm" placeholder="Any delays, weather conditions..." value={editHistoryDraft.remarks || ''} onChange={e => setEditHistoryDraft({ ...editHistoryDraft, remarks: e.target.value })} />
                      </div>
                      <div className="flex gap-3">
                          <button type="button" onClick={() => handleRemoveTimelineEntry(editingHistoryIndex)} className="px-4 py-3 border border-red-200 text-red-600 font-bold rounded-xl hover:bg-red-50 transition-all text-sm">
                              Remove entry
                          </button>
                          <button type="submit" className="flex-1 py-4 bg-indigo-600 text-white font-black uppercase rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-2">
                              <Save size={18} /> Save changes
                          </button>
                      </div>
                  </form>
              </div>
          </div>
      )}

      <OcrReviewModal
        open={!!pendingOcrPayload}
        isExport={pendingOcrPayload?.docType === 'SB'}
        initialData={
          pendingOcrPayload?.docType === 'BOE'
            ? {
                beNumber: pendingOcrPayload.data?.beNumber ?? null,
                date: pendingOcrPayload.data?.date ?? null,
                portCode: pendingOcrPayload.data?.portCode ?? null,
                invoiceValue: pendingOcrPayload.data?.invoiceValue ?? null,
                exchangeRate: pendingOcrPayload.data?.exchangeRate ?? null,
                incoTerm: pendingOcrPayload.data?.incoTerm ?? null,
                dutyBCD: pendingOcrPayload.data?.dutyBCD ?? null,
                dutySWS: pendingOcrPayload.data?.dutySWS ?? null,
                dutyINT: pendingOcrPayload.data?.dutyINT ?? null,
                penalty: pendingOcrPayload.data?.penalty ?? null,
                fine: pendingOcrPayload.data?.fine ?? null,
                gst: pendingOcrPayload.data?.gst ?? null,
                source: pendingOcrPayload.data?.source ?? null,
                confidence: pendingOcrPayload.data?.confidence ?? null,
              }
            : {
                sbNumber: pendingOcrPayload?.data?.sbNumber ?? null,
                date: pendingOcrPayload?.data?.date ?? null,
                portCode: pendingOcrPayload?.data?.portCode ?? null,
                invoiceValue: pendingOcrPayload?.data?.fobValueFC ?? pendingOcrPayload?.data?.invoiceValue ?? null,
                fobValueFC: pendingOcrPayload?.data?.fobValueFC ?? null,
                fobValueINR: pendingOcrPayload?.data?.fobValueINR ?? null,
                exchangeRate: pendingOcrPayload?.data?.exchangeRate ?? null,
                incoTerm: pendingOcrPayload?.data?.incoTerm ?? null,
                dbk: pendingOcrPayload?.data?.dbk ?? null,
                rodtep: pendingOcrPayload?.data?.rodtep ?? null,
                source: pendingOcrPayload?.data?.source ?? null,
                confidence: pendingOcrPayload?.data?.confidence ?? null,
              }
        }
        viewFile={pendingOcrPayload?.file ?? null}
        onConfirm={handleOcrConfirm}
        onCancel={() => setPendingOcrPayload(null)}
      />

      {showPaymentModal && (() => {
        const toFC = (p: PaymentLog) => {
          if (p.currency === shipment.currency) return p.amount;
          if (p.currency === 'INR') return p.amount / (shipment.exchangeRate || 1);
          return 0;
        };
        const existingTotalFC = (shipment.payments || []).reduce((sum, p) => sum + toFC(p), 0);
        const remainingFC = Math.max(0, paymentSummary.totalFC - existingTotalFC);
        const enteredAmount = Number(newPayment.amount) || 0;
        const exceedsInvoice = enteredAmount > 0 && enteredAmount > remainingFC;
        return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
           <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl p-8 relative">
              <button onClick={() => setShowPaymentModal(false)} className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-600"><X size={20} /></button>
              <h2 className="text-xl font-black text-slate-900 mb-6">Record Payment</h2>
              <div className="space-y-4">
                 <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Amount</label>
                    <input type="number" className={`w-full px-4 py-2 rounded-xl border font-bold ${exceedsInvoice ? 'border-red-400 bg-red-50/50' : ''}`} value={newPayment.amount ?? ''} onChange={e => setNewPayment({...newPayment, amount: e.target.value === '' ? undefined : parseFloat(e.target.value)})} />
                    {exceedsInvoice && (
                      <p className="mt-2 text-xs font-medium text-red-700 flex items-center gap-1.5">
                        <AlertCircle size={14} /> Total payments cannot exceed invoice amount ({formatCurrency(paymentSummary.totalFC, shipment.currency)}). You can add up to {formatCurrency(remainingFC, shipment.currency)}.
                      </p>
                    )}
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                   <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Currency</label>
                      <p className="w-full px-4 py-2 rounded-xl border font-bold bg-slate-50 text-slate-800">{shipment.currency}</p>
                      <p className="text-[9px] text-slate-500 mt-1">Payments are recorded in shipment currency (FC) only.</p>
                   </div>
                   <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Date</label>
                      <input type="date" className="w-full px-4 py-2 rounded-xl border font-bold" value={newPayment.date} onChange={e => setNewPayment({...newPayment, date: e.target.value})} />
                   </div>
                 </div>
                 <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Reference / UTR</label>
                    <input type="text" className="w-full px-4 py-2 rounded-xl border font-bold" value={newPayment.reference} onChange={e => setNewPayment({...newPayment, reference: e.target.value})} />
                 </div>
                 <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Payment Mode</label>
                    <select className="w-full px-4 py-2 rounded-xl border font-bold" value={newPayment.mode} onChange={e => setNewPayment({...newPayment, mode: e.target.value})}>
                       <option value="WIRE">Wire Transfer / TT</option>
                       <option value="CHECK">Check / DD</option>
                       <option value="LC">Letter of Credit</option>
                    </select>
                    {shipment.isUnderLC && linkedLC && (newPayment.mode === 'LC' || newPayment.mode === 'Letter of Credit') && (
                      <p className="mt-2 text-[10px] text-indigo-600 font-medium bg-indigo-50 px-3 py-2 rounded-lg border border-indigo-100">
                        This payment will be recorded under LC <span className="font-bold">{linkedLC.lcNumber}</span> in the LC Tracker with the same details (invoice, reference, date, amount) as in this Payment Ledger.
                      </p>
                    )}
                 </div>
                 <button onClick={handleAddPayment} className="w-full py-3 bg-emerald-600 text-white font-black uppercase rounded-xl hover:bg-emerald-700 mt-2 disabled:opacity-50 disabled:cursor-not-allowed" disabled={exceedsInvoice}>
                    Save Transaction
                 </button>
              </div>
           </div>
        </div>
        );
      })()}

      {allocateModalProduct && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-4xl rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h2 className="text-lg font-black text-slate-900">Split / Allocate — {allocateModalProduct.productName}</h2>
                {allocateModalProduct.hsnCode && <p className="text-[10px] text-slate-500 mt-0.5">HSN: {allocateModalProduct.hsnCode}</p>}
                {!isExport && allocateModalProduct.lineQuantity != null && (
                  <p className="text-[10px] text-amber-600 font-bold mt-1">Max quantity in this shipment: {allocateModalProduct.lineQuantity} {allocateModalProduct.lineUnit || 'KGS'} — total allocated must not exceed this.</p>
                )}
              </div>
              <button type="button" onClick={() => { setAllocateModalProduct(null); setAllocateModalRows([]); }} className="p-2 hover:bg-slate-200 rounded-full"><X size={20} className="text-slate-500" /></button>
            </div>
            <p className="px-6 py-2 text-[10px] text-slate-500">Add rows to allocate to one or more licences (same type only for import). Quantity, UOM, Amount INR, Amount USD. USD is auto-calculated from INR using exchange rate when you enter INR.</p>
            <div className="flex-1 overflow-auto px-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[9px] font-black text-slate-500 uppercase border-b">
                    <th className="pb-2 pt-2">Licence</th>
                    <th className="pb-2 pt-2 text-right">Quantity</th>
                    <th className="pb-2 pt-2">UOM</th>
                    <th className="pb-2 pt-2 text-right">Amount (INR)</th>
                    <th className="pb-2 pt-2 text-right">Amount (USD)</th>
                    <th className="pb-2 pt-2 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {allocateModalRows.map((row, rIdx) => {
                    const exch = allocateModalProduct?.exchangeRate || shipment?.exchangeRate || 1;
                    return (
                    <tr key={rIdx}>
                      <td className="py-2">
                        <select
                          className="w-full px-2 py-1.5 rounded-lg border font-bold text-sm bg-white"
                          value={row.licenceId}
                          onChange={e => setAllocateModalRows(prev => prev.map((r, i) => i === rIdx ? { ...r, licenceId: e.target.value } : r))}
                        >
                          <option value="">— Select licence —</option>
                          {(isExport ? (licences || []).filter(l => l.company === shipment?.company && l.status === 'ACTIVE') : importLicencesFiltered).map(l => (
                            <option key={l.id} value={l.id}>{l.number} ({l.type})</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 text-right">
                        <input type="number" step="any" className="w-24 px-2 py-1.5 rounded-lg border font-bold text-sm text-right" value={row.allocatedQuantity || ''} onChange={e => setAllocateModalRows(prev => prev.map((r, i) => i === rIdx ? { ...r, allocatedQuantity: parseFloat(e.target.value) || 0 } : r))} />
                      </td>
                      <td className="py-2">
                        <select className="w-full px-2 py-1.5 rounded-lg border font-bold text-sm bg-white" value={row.allocatedUom || allocateModalProduct?.lineUnit || 'KGS'} onChange={e => setAllocateModalRows(prev => prev.map((r, i) => i === rIdx ? { ...r, allocatedUom: e.target.value } : r))}>
                          {STANDARDISED_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </td>
                      <td className="py-2 text-right">
                        <input type="number" step="any" className="w-28 px-2 py-1.5 rounded-lg border font-bold text-sm text-right" value={row.allocatedAmountINR || ''} onChange={e => {
                          const inr = parseFloat(e.target.value) || 0;
                          setAllocateModalRows(prev => prev.map((r, i) => i === rIdx ? { ...r, allocatedAmountINR: inr, allocatedAmountUSD: exch > 0 ? inr / exch : 0 } : r));
                        }} />
                      </td>
                      <td className="py-2 text-right">
                        <input type="number" step="any" className="w-28 px-2 py-1.5 rounded-lg border font-bold text-sm text-right" value={row.allocatedAmountUSD || ''} onChange={e => {
                          const usd = parseFloat(e.target.value) || 0;
                          setAllocateModalRows(prev => prev.map((r, i) => i === rIdx ? { ...r, allocatedAmountUSD: usd, allocatedAmountINR: usd * exch } : r));
                        }} />
                      </td>
                      <td className="py-2">
                        <button type="button" onClick={() => setAllocateModalRows(prev => prev.filter((_, i) => i !== rIdx))} className="p-1.5 text-slate-400 hover:text-red-600 rounded"><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  );})}
                </tbody>
              </table>
              <div className="py-3">
                <button type="button" onClick={() => setAllocateModalRows(prev => [...prev, { licenceId: '', allocatedQuantity: 0, allocatedUom: allocateModalProduct?.lineUnit || 'KGS', allocatedAmountUSD: 0, allocatedAmountINR: 0 }])} className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"><Plus size={14} /> Add row</button>
              </div>
            </div>
            <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
              <button type="button" onClick={() => { setAllocateModalProduct(null); setAllocateModalRows([]); }} className="px-4 py-2 rounded-xl font-bold text-slate-500 hover:text-slate-700 uppercase text-xs">Cancel</button>
              <button
                type="button"
                onClick={() => {
                  if (!allocateModalProduct) return;
                  const productId = allocateModalProduct.productId;
                  const totalQty = allocateModalRows.reduce((s, r) => s + (r.allocatedQuantity || 0), 0);
                  if (!isExport && allocateModalProduct.lineQuantity != null && totalQty > allocateModalProduct.lineQuantity) {
                    alert(`Total allocated quantity (${totalQty} ${allocateModalProduct.lineUnit || 'KGS'}) cannot exceed shipment line quantity (${allocateModalProduct.lineQuantity} ${allocateModalProduct.lineUnit || 'KGS'}).`);
                    return;
                  }
                  const newRows = allocateModalRows.filter(r => r.licenceId).map(r => ({
                    licenceId: r.licenceId,
                    productId,
                    productName: allocateModalProduct.productName,
                    hsnCode: allocateModalProduct.hsnCode,
                    allocatedQuantity: r.allocatedQuantity,
                    allocatedUom: r.allocatedUom || allocateModalProduct.lineUnit || 'KGS',
                    allocatedAmountUSD: r.allocatedAmountUSD,
                    allocatedAmountINR: r.allocatedAmountINR,
                  }));
                  setLicenceAllocations(prev => [...prev.filter(a => a.productId !== productId), ...newRows]);
                  setAllocateModalProduct(null);
                  setAllocateModalRows([]);
                }}
                className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold text-xs uppercase hover:bg-indigo-700"
              >
                Save allocation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
};

export default ShipmentDetails;
