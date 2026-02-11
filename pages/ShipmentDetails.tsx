
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Shipment, ShipmentStatus, User, UserRole, Licence, Supplier, Buyer, ShipmentHistory, PaymentLog, LicenceType, LetterOfCredit, LCStatus, IMPORT_DOCUMENT_CHECKLIST, EXPORT_DOCUMENT_CHECKLIST, ShipmentItem, STANDARDISED_UNITS, ProductType } from '../types';
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
}

const ShipmentDetails: React.FC<ShipmentDetailsProps> = ({ shipments, suppliers, buyers, licences = [], lcs = [], onUpdate, onDelete, onUpdateLC, user }) => {
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
  const [editInvoice, setEditInvoice] = useState(false);
  const [invoiceEditData, setInvoiceEditData] = useState({
    invoiceNumber: shipment?.invoiceNumber || '',
    invoiceDate: shipment?.invoiceDate || '',
    freightCharges: Number(shipment?.freightCharges) || 0,
    otherCharges: Number(shipment?.otherCharges) || 0,
    items: (shipment?.items || []).map((it) => ({ ...it, amount: (it.quantity || 0) * (it.rate || 0) })),
    /** Export only: editable invoice/FOB amount in FC */
    amountFC: Number(shipment?.amount ?? (shipment as any)?.fobValueFC) || 0
  });
  const [newPayment, setNewPayment] = useState<Partial<PaymentLog>>({
    amount: 0,
    date: new Date().toISOString().split('T')[0],
    currency: shipment?.currency ?? 'USD',
    mode: 'WIRE',
    reference: '',
    adviceUploaded: false
  });

  const [documentsFolderPath, setDocumentsFolderPath] = useState<string | null>(shipment?.documentsFolderPath ?? null);
  const [folderFiles, setFolderFiles] = useState<string[]>([]);
  const [loadingDocFiles, setLoadingDocFiles] = useState(false);
  const [editExportDoc, setEditExportDoc] = useState(false);
  const [editLodgementOnly, setEditLodgementOnly] = useState(false);
  const [lodgementValue, setLodgementValue] = useState('');
  const [lodgementDateValue, setLodgementDateValue] = useState('');
  const [exportDocData, setExportDocData] = useState({
    sbNo: '', sbDate: '', dbk: 0, rodtep: 0, scripNo: '', epcg: '', advLic: '', lodgement: '', lodgementDate: '', ebrcNo: '', ebrcValue: 0, exchangeRate: Number(shipment?.exchangeRate) || 0, incoTerm: (shipment as any)?.incoTerm || 'FOB'
  });
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
    setExportDocData({
      sbNo: (shipment as any).sbNo || '',
      sbDate: (shipment as any).sbDate || '',
      dbk: (shipment as any).dbk ?? 0,
      rodtep: (shipment as any).rodtep ?? 0,
      scripNo: (shipment as any).scripNo || '',
      epcg: (shipment as any).epcg || '',
      advLic: (shipment as any).advLic || '',
      lodgement: (shipment as any).lodgement || '',
      lodgementDate: (shipment as any).lodgementDate || '',
      ebrcNo: (shipment as any).ebrcNo || '',
      ebrcValue: (shipment as any).ebrcValue ?? 0,
      exchangeRate: Number(shipment.exchangeRate) || 0,
      incoTerm: (shipment as any).incoTerm || 'FOB'
    });
    setLodgementValue((shipment as any).lodgement || '');
    setLodgementDateValue((shipment as any).lodgementDate || '');
    setNewUpdate(prev => ({ ...prev, status: shipment.status }));
  }, [shipment, editAll]);

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

  const documentCheckerRows = useMemo(() => {
    const invRef = (shipment?.invoiceNumber || '')
      .replace(/[/\\:*?"<>|]/g, '_')
      .replace(/\s+/g, '_')
      .trim() || 'ref';
    const lodgementRef = ((shipment as any)?.lodgement || invRef).replace(/[/\\:*?"<>|]/g, '_').replace(/\s+/g, '_').trim() || 'ref';
    const baseName = (f: string) => f.replace(/\.[^/.]+$/, '').trim();
    const hasFile = (expected: string) =>
      folderFiles.some((f) => baseName(f).toUpperCase() === expected.toUpperCase());
    const rows: { label: string; expectedName: string; found: boolean }[] = [];
    const staticList = isExport ? EXPORT_DOCUMENT_CHECKLIST : IMPORT_DOCUMENT_CHECKLIST;
    staticList.forEach((doc) => {
      const prefix = (doc as { prefix?: string }).prefix || doc.id + '_';
      const ref = doc.id === 'LODGE' ? lodgementRef : invRef;
      rows.push({ label: doc.label, expectedName: prefix + ref, found: hasFile(prefix + ref) });
    });
    (shipment?.payments || []).forEach((pay) => {
      const amount = Number(pay.amount);
      const currency = (pay.currency || 'USD').toUpperCase();
      rows.push({
        label: `Payment Advise — ${formatCurrency(amount, currency)}`,
        expectedName: `PAY_ADV_${amount}_${currency}`,
        found: hasFile(`PAY_ADV_${amount}_${currency}`)
      });
    });
    return rows;
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
    if (!shipment?.isUnderLC || !shipment?.lcNumber || !lcs.length) return null;
    return lcs.find(lc => lc.lcNumber === shipment.lcNumber || lc.id === (shipment as any).linkedLcId) || null;
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
      const updated = {
        ...shipment,
        ...dutiesData,
        portCode: dutiesData.portCode,
        isUnderLicence: !!licenceImportData.linkedLicenceId,
        linkedLicenceId: licenceImportData.linkedLicenceId || undefined,
        licenceObligationAmount: licenceImportData.licenceObligationAmount || undefined,
        licenceObligationQuantity: licenceImportData.licenceObligationQuantity || undefined
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
      const updated = { ...shipment, ...exportDocData };
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
      if (isExport) {
        (updated as any).lodgement = lodgementValue || undefined;
        (updated as any).lodgementDate = lodgementDateValue || undefined;
      } else {
        updated.isUnderLicence = !!licenceImportData.linkedLicenceId;
        updated.linkedLicenceId = licenceImportData.linkedLicenceId || undefined;
        updated.licenceObligationAmount = licenceImportData.licenceObligationAmount || undefined;
        updated.licenceObligationQuantity = licenceImportData.licenceObligationQuantity || undefined;
      }
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
      epcg: (shipment as any).epcg || '',
      advLic: (shipment as any).advLic || '',
      lodgement: (shipment as any).lodgement || '',
      lodgementDate: (shipment as any).lodgementDate || '',
      ebrcNo: (shipment as any).ebrcNo || '',
      ebrcValue: (shipment as any).ebrcValue ?? 0,
      exchangeRate: Number(shipment.exchangeRate) || 0,
      incoTerm: (shipment as any).incoTerm || 'FOB'
    });
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
    setLodgementValue((shipment as any).lodgement || '');
    setLodgementDateValue((shipment as any).lodgementDate || '');
    setEditAll(false);
    setEditInvoice(false);
    setEditInvoiceRate(false);
    setEditExportDoc(false);
    setEditLogistics(false);
    setEditDuties(false);
  };

  const handleSaveLodgement = async () => {
    try {
      await onUpdate({ ...shipment, lodgement: lodgementValue, lodgementDate: lodgementDateValue || undefined });
      setExportDocData((prev) => ({ ...prev, lodgement: lodgementValue, lodgementDate: lodgementDateValue }));
      setEditLodgementOnly(false);
    } catch (e: any) {
      setToastVariant('error');
      setToastMessage(e?.message || 'Failed to save.');
      setTimeout(() => setToastMessage(null), 5000);
    }
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
      adviceUploaded: false
    };
    const updated = { ...shipment, payments: [...(shipment.payments || []), payment] };
    await onUpdate(updated);
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

  const totalDuty = dutiesData.dutyBCD + dutiesData.dutySWS + dutiesData.dutyINT;

  const handleMarkPaymentReceived = async (payId: string) => {
    const payments = (shipment.payments || []).map(p => p.id === payId ? { ...p, received: true } : p);
    await onUpdate({ ...shipment, payments });
  };

  const handleMarkLCSettled = async () => {
    await onUpdate({ ...shipment, lcSettled: true });
    if (linkedLC && onUpdateLC) {
      await onUpdateLC({ ...linkedLC, status: LCStatus.PAID });
    }
  };

  return (
    <>
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
                {isExport && (
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
                )}
              </div>
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
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {(editAll ? invoiceEditData.items : (shipment.items || [])).map((item, idx) => {
                    const mergedNameDesc = `${item.productName || ''}${(item as any).description ? ' — ' + (item as any).description : ''}`.trim();
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

          {/* Export: Shipping Bill — SB No., Date, Exchange Rate, FOB FC, FOB INR, Port Code, Inco Term, DBK, RODTEP, Scrip No. */}
          {isExport && (
          <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-amber-50/50">
               <h2 className="text-xs font-black uppercase text-amber-700 tracking-widest flex items-center gap-2"><FileText size={16} /> Shipping Bill (Export)</h2>
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
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Exchange Rate (to INR)</label>
                  {editAll ? (
                    <input type="number" step="0.01" min="0" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold" value={exportDocData.exchangeRate || ''} onChange={e => setExportDocData({...exportDocData, exchangeRate: parseFloat(e.target.value) || 0})} placeholder="e.g. 84" />
                  ) : (
                    <p className="text-sm font-bold text-slate-800">{(shipment.exchangeRate ?? exportDocData.exchangeRate) ? `1 ${shipment.currency} = ₹${(shipment.exchangeRate ?? exportDocData.exchangeRate)}` : '—'}</p>
                  )}
                </div>
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">FOB Value (FC)</label>
                  <p className="text-sm font-bold text-slate-800">{formatCurrency(shipment.fobValueFC ?? shipment.amount, shipment.currency)}</p>
                </div>
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">FOB Value (INR)</label>
                  <p className="text-sm font-bold text-slate-800">{formatINR(shipment.fobValueINR ?? (shipment.amount * (shipment.exchangeRate || 1)))}</p>
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
              </div>
            </div>
          </div>
          )}

          {/* 3. Shipment Details */}
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

          {/* Export: Further info — EPCG & Advance Licence only; e-BRC is in Payment Ledger */}
          {isExport && (
          <>
          <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
               <h2 className="text-xs font-black uppercase text-slate-500 tracking-widest flex items-center gap-2"><FileText size={16} /> Further Info</h2>
            </div>
            <div className="p-8 space-y-6">
              <div>
                <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-3">EPCG & Advance Licence</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">EPCG Licence</label>
                    {editAll ? (
                      <select className="w-full px-3 py-2 border rounded-lg font-bold bg-white" value={exportDocData.epcg} onChange={e => setExportDocData({...exportDocData, epcg: e.target.value})}>
                        <option value="">— Select EPCG —</option>
                        {licences.filter(l => l.type === LicenceType.EPCG && l.status === 'ACTIVE').map(l => <option key={l.id} value={l.id}>{l.number}</option>)}
                      </select>
                    ) : <p className="font-bold text-slate-800">{exportDocData.epcg ? (licences.find(l => l.id === exportDocData.epcg)?.number || exportDocData.epcg) : '—'}</p>}
                  </div>
                  <div>
                    <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Advance Licence</label>
                    {editAll ? (
                      <select className="w-full px-3 py-2 border rounded-lg font-bold bg-white" value={exportDocData.advLic} onChange={e => setExportDocData({...exportDocData, advLic: e.target.value})}>
                        <option value="">— Select Advance —</option>
                        {licences.filter(l => l.type === LicenceType.ADVANCE && l.status === 'ACTIVE').map(l => <option key={l.id} value={l.id}>{l.number}</option>)}
                      </select>
                    ) : <p className="font-bold text-slate-800">{exportDocData.advLic ? (licences.find(l => l.id === exportDocData.advLic)?.number || exportDocData.advLic) : '—'}</p>}
                  </div>
                </div>
              </div>
            </div>
          </div>
          </>
          )}

          {/* Bill of Entry (Import only) */}
          {!isExport && (
          <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
               <h2 className="text-xs font-black uppercase text-slate-400 tracking-widest flex items-center gap-2"><Landmark size={16} /> Bill of Entry (Import)</h2>
            </div>
            <div className="p-8">
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

               {/* Licence (Import): Advance for raw material, EPCG for capital goods */}
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
               </div>

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
                     <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Interest</label>
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
                  onClick={() => { setNewPayment(prev => ({ ...prev, currency: shipment.currency })); setShowPaymentModal(true); }}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
               >
                 <Plus size={14} /> Add Payment
               </button>
             </div>
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
               <h3 className="text-[10px] font-black uppercase text-indigo-700 tracking-widest mb-2 flex items-center gap-2"><CreditCard size={14} /> Payment is on LC</h3>
               <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                 <div><span className="text-[9px] font-black text-slate-500 uppercase">LC No.</span><p className="font-bold text-slate-800">{shipment.lcNumber || '—'}</p></div>
                 <div><span className="text-[9px] font-black text-slate-500 uppercase">LC Date</span><p className="font-bold text-slate-800">{shipment.lcDate ? formatDate(shipment.lcDate) : '—'}</p></div>
                 <div><span className="text-[9px] font-black text-slate-500 uppercase">Amount</span><p className="font-bold text-slate-800">{shipment.lcAmount != null ? formatCurrency(shipment.lcAmount, shipment.currency) : (shipment.amount ? formatCurrency(shipment.amount, shipment.currency) : '—')}</p></div>
                 {linkedLC && <div><span className="text-[9px] font-black text-slate-500 uppercase">Issuing Bank</span><p className="font-bold text-slate-800">{linkedLC.issuingBank || '—'}</p></div>}
               </div>
               {shipment.lcSettled ? (
                 <p className="text-xs font-black text-emerald-600 uppercase mt-2 flex items-center gap-2"><CheckCircle size={14} /> LC Settled</p>
               ) : (
                 <button type="button" onClick={handleMarkLCSettled} className="mt-3 px-4 py-2 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase hover:bg-emerald-700">Mark LC as settled</button>
               )}
             </div>
             )}
             {isExport && (
             <div className="px-6 py-4 bg-amber-50/50 border-b border-slate-100">
               <p className="text-[10px] text-slate-500 mb-2">Lodgement is filed with the bank; the bank gives a lodgement number. Incoming payment is settled against this lodgement no.</p>
               <div className="flex items-center gap-4 flex-wrap mb-3">
                 <span className="text-[10px] font-black uppercase text-slate-500">Lodgement No.</span>
                 {canEdit && editLodgementOnly ? (
                   <>
                     <input className="flex-1 min-w-[200px] max-w-xs px-3 py-2 border rounded-lg font-bold text-sm" value={lodgementValue} onChange={e => setLodgementValue(e.target.value)} placeholder="Bank lodgement number" />
                     <button type="button" onClick={handleSaveLodgement} className="text-[10px] font-black uppercase text-emerald-600 hover:text-emerald-700">Save</button>
                     <button type="button" onClick={() => { setEditLodgementOnly(false); setLodgementValue((shipment as any).lodgement || ''); setLodgementDateValue((shipment as any).lodgementDate || ''); }} className="text-[10px] font-black uppercase text-slate-500">Cancel</button>
                   </>
                 ) : (
                   <>
                     <span className="font-bold text-slate-800">{(shipment as any).lodgement || '—'}</span>
                     {canEdit && <button type="button" onClick={() => setEditLodgementOnly(true)} className="text-[10px] font-black uppercase text-amber-600 hover:text-amber-700">Edit</button>}
                   </>
                 )}
               </div>
               <div className="flex items-center gap-4 flex-wrap">
                 <span className="text-[10px] font-black uppercase text-slate-500">Lodgement Date</span>
                 {canEdit && editLodgementOnly ? (
                   <input type="date" className="px-3 py-2 border rounded-lg font-bold text-sm" value={lodgementDateValue} onChange={e => setLodgementDateValue(e.target.value)} />
                 ) : (
                   <span className="font-bold text-slate-800">{(shipment as any).lodgementDate ? formatDate((shipment as any).lodgementDate) : '—'}</span>
                 )}
               </div>
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
                                          <div className="p-5 rounded-2xl border border-slate-100 bg-slate-50 shadow-sm w-full relative hover:border-indigo-100 transition-colors">
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
                                          <div className="p-5 rounded-2xl border border-slate-100 bg-slate-50 shadow-sm w-full relative hover:border-indigo-100 transition-colors">
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

           {/* Documents: upload and file list — or Access Restricted */}
           <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-6">
             <h2 className="text-xs font-black uppercase text-slate-900 flex items-center gap-2">
               <FileText size={16} className="text-indigo-500" /> Documents
             </h2>
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
                 {canUploadDocuments && (
                   <div>
                     <h3 className="text-[10px] font-black uppercase text-slate-500 mb-3">Upload file</h3>
                     <ShipmentUpload
                       shipmentId={shipment.id}
                       onUploadSuccess={refetchFolderFiles}
                     />
                   </div>
                 )}
                 <div className="border-t border-slate-100 pt-6">
                   <h3 className="text-[10px] font-black uppercase text-slate-500 mb-3">Existing files</h3>
                   {loadingDocFiles ? (
                     <p className="text-sm text-slate-400 italic flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading…</p>
                   ) : folderFiles.length === 0 ? (
                     <p className="text-sm text-slate-500">No files yet.{canUploadDocuments ? ' Upload one above.' : ''}</p>
                   ) : (
                     <ul className="space-y-2">
                       {folderFiles.map((name) => (
                         <li key={name} className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg bg-slate-50 hover:bg-slate-100">
                           <span className="flex items-center gap-2 text-sm text-slate-800 truncate min-w-0">
                             <FileText size={14} className="text-slate-400 shrink-0" />
                             {name}
                           </span>
                           <div className="flex items-center gap-1.5 shrink-0">
                             {isViewableInBrowser(name) && (
                               <button
                                 type="button"
                                 title="View in new tab"
                                 onClick={async () => {
                                   try {
                                     const blob = await api.shipments.downloadFile(shipment.id, name);
                                     const url = URL.createObjectURL(blob);
                                     window.open(url, '_blank', 'noopener');
                                     setTimeout(() => URL.revokeObjectURL(url), 60000);
                                   } catch (e: any) {
                                     alert(e?.message || 'View failed');
                                   }
                                 }}
                                 className="inline-flex items-center gap-1 rounded-md bg-slate-100 hover:bg-slate-200 px-2 py-1.5 text-xs font-medium text-slate-700"
                               >
                                 <Eye size={14} /> View
                               </button>
                             )}
                             <button
                               type="button"
                               title="Download"
                               onClick={async () => {
                                 try {
                                   const blob = await api.shipments.downloadFile(shipment.id, name);
                                   const url = URL.createObjectURL(blob);
                                   const a = document.createElement('a');
                                   a.href = url;
                                   a.download = name;
                                   document.body.appendChild(a);
                                   a.click();
                                   document.body.removeChild(a);
                                   URL.revokeObjectURL(url);
                                 } catch (e: any) {
                                   alert(e?.message || 'Download failed');
                                 }
                               }}
                               className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
                             >
                               <Download size={14} /> Download
                             </button>
                             {canDeleteDocuments && (
                               <button
                                 type="button"
                                 title="Delete file"
                                 onClick={async () => {
                                   if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
                                   try {
                                     await api.shipments.deleteFile(shipment.id, name);
                                     refetchFolderFiles();
                                   } catch (e: any) {
                                     alert(e?.message || 'Delete failed');
                                   }
                                 }}
                                 className="inline-flex items-center gap-1 rounded-md bg-red-50 hover:bg-red-100 text-red-600 px-2 py-1.5 text-xs font-medium"
                               >
                                 <Trash2 size={14} /> Delete
                               </button>
                             )}
                           </div>
                         </li>
                       ))}
                     </ul>
                   )}
                 </div>
               </>
             )}
           </div>

           {/* Document Checker — visible only with documents.view */}
           {canViewDocuments && (
             <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
               <div className="flex items-center justify-between gap-4 mb-2">
                 <h2 className="text-xs font-black uppercase text-slate-900 flex items-center gap-2">
                   <FileCheck size={16} className="text-indigo-500" /> Document Checker
                 </h2>
                 <button
                   type="button"
                   onClick={refetchFolderFiles}
                   disabled={loadingDocFiles}
                   className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-indigo-600 disabled:opacity-50 transition-colors"
                   title="Refresh list from folder"
                 >
                   <RefreshCw size={16} className={loadingDocFiles ? 'animate-spin' : ''} />
                 </button>
               </div>
               <p className="text-[10px] text-slate-500 mb-4">Status is read from the shipment documents folder.</p>
               {loadingDocFiles ? (
                 <p className="text-sm text-slate-400 italic">Loading folder…</p>
               ) : (
                 <div className="space-y-2">
                   {documentCheckerRows.map((row, idx) => {
                     const isPending = !row.found;
                     const showRed = allShipmentDetailsFilled && isPending;
                     const showGreen = row.found;
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
                         <div className="flex items-center gap-2">
                           {showGreen ? (
                             <CheckCircle size={18} className="text-emerald-600 shrink-0" />
                           ) : (
                             <span className={`w-[18px] h-[18px] rounded-full border-2 shrink-0 ${showRed ? 'border-red-400' : 'border-slate-300'}`} />
                           )}
                           <span className={`text-sm font-bold ${showRed ? 'text-red-900' : 'text-slate-800'}`}>{row.label}</span>
                         </div>
                       </div>
                     );
                   })}
                 </div>
               )}
             </div>
           )}
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

      {showPaymentModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
           <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl p-8 relative">
              <button onClick={() => setShowPaymentModal(false)} className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-600"><X size={20} /></button>
              <h2 className="text-xl font-black text-slate-900 mb-6">Record Payment</h2>
              <div className="space-y-4">
                 <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Amount</label>
                    <input type="number" className="w-full px-4 py-2 rounded-xl border font-bold" value={newPayment.amount} onChange={e => setNewPayment({...newPayment, amount: parseFloat(e.target.value)})} />
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
                 </div>
                 <button onClick={handleAddPayment} className="w-full py-3 bg-emerald-600 text-white font-black uppercase rounded-xl hover:bg-emerald-700 mt-2">
                    Save Transaction
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
