import React, { useState, useMemo, useCallback } from 'react';
import { Supplier, Shipment, User, BankPaymentAllocationRow } from '../types';
import { FileText, Landmark, Truck, Banknote, Loader2, Plus, Trash2, Info } from 'lucide-react';
import { api } from '../api';
import { useAutoSavedDraft } from '../hooks/useAutoSavedDraft';

export interface ProductLine {
  id: string;
  description: string;
  hsnCode: string;
  quantity: string;
  unit: string;
  amount: string;
}

function newProductLine(id: string): ProductLine {
  return { id, description: '', hsnCode: '', quantity: '', unit: 'KGS', amount: '' };
}

interface AllocationRowState extends BankPaymentAllocationRow {
  id: string;
  amountInput: string;
  documentChecklist: Record<string, boolean>;
  invoiceAmount: number;
  alreadyPaid: number;
  pendingAmount: number;
  goodsDesc: string;
  hsnCodeText: string;
  quantityText: string;
  invoiceDateText: string;
  shipmentDateText: string;
  portLoadingText: string;
  portDischargeText: string;
  termText: string;
  modeShipmentText: string;
}

const COMPANY_OPTIONS: { value: string; label: string }[] = [
  { value: 'GFPL', label: 'Gujarat Flotex Pvt Ltd' },
  { value: 'GTEX', label: 'GTEX Fabrics' },
];

const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CNY'];
const INCO_TERMS = ['CIF', 'FOB', 'EXW', 'CFR'];
const SHIPMENT_MODES = ['SEA', 'AIR', 'ROAD', 'RAIL'];
const QTY_UNITS = ['KGS', 'MTR', 'MT', 'ROLLS', 'PCS', 'SETS', 'NOS', 'SQM', 'PKG', 'DRUM'];

const ADVANCE_DOCS = [
  'REQUEST LETTER',
  'FEMA DECLARATION',
  'OFAC DECLARATION',
  'ANNEXURE-B',
  'FORM A1',
  'INVOICE',
  'E-TRADE APPLICATION',
];

const BALANCE_DOCS = [
  'REQUEST LETTER',
  'FEMA DECLARATION',
  'OFAC DECLARATION',
  'FORM A1',
  'INVOICE',
  'PACKING LIST',
  'BILL OF LADING',
  'BANK ADVISE',
  'COO',
  'BILL OF ENTRY',
  'AIRWAY BILL',
  'INSURANCE COPY',
];

const PRINT_PACKET_DOCS = [
  { id: 'PI', label: 'Proforma Invoice', required: false },
  { id: 'CI', label: 'Commercial Invoice', required: true },
  { id: 'PL', label: 'Packing List', required: true },
  { id: 'BL', label: 'Bill of Lading', required: false },
  { id: 'AWB', label: 'Airway Bill', required: false },
  { id: 'BOE', label: 'Bill of Entry', required: false },
  { id: 'PAY_ADV', label: 'Payment Advise(s)', required: false },
  { id: 'COO', label: 'COO', required: false },
] as const;

type PacketDocId = typeof PRINT_PACKET_DOCS[number]['id'];

function formatDateForDoc(isoOrDdMm: string): string {
  if (!isoOrDdMm) return '';
  if (/^\d{2}-\d{2}-\d{4}$/.test(isoOrDdMm)) return isoOrDdMm;
  const d = new Date(isoOrDdMm);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

/** Parse a number from "Total Invoice Value" input (may contain commas). */
function parseInvoiceValue(s: string | undefined): number | null {
  if (s == null || typeof s !== 'string') return null;
  const cleaned = s.trim().replace(/,/g, '');
  if (!cleaned) return null;
  const n = parseFloat(cleaned);
  return Number.isNaN(n) ? null : n;
}

function normalizeHsnCode(v: string): string {
  return String(v || '').replace(/\D/g, '').slice(0, 8);
}

function parseAmount(v: unknown): number {
  const n = Number.parseFloat(String(v == null ? '' : v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

function toShipmentCurrency(amount: number, fromCurrency: string, toCurrency: string, exchangeRate: number): number {
  const val = Number(amount) || 0;
  const from = String(fromCurrency || '').toUpperCase();
  const to = String(toCurrency || '').toUpperCase();
  const fx = Number(exchangeRate) || 1;
  if (!val) return 0;
  if (from === to) return val;
  if (from === 'INR' && to !== 'INR') return val / fx;
  if (to === 'INR' && from !== 'INR') return val * fx;
  return val;
}

function getDocOptionsForMode(mode: 'Advance' | 'Balance', hasProforma: boolean): string[] {
  const base = mode === 'Advance' ? [...ADVANCE_DOCS, 'BANK ADVISE'] : [...BALANCE_DOCS];
  if (!hasProforma) return base;
  const copy = [...base];
  const invoiceIdx = copy.indexOf('INVOICE');
  if (invoiceIdx >= 0 && !copy.includes('PROFORMA INVOICE')) copy.splice(invoiceIdx, 0, 'PROFORMA INVOICE');
  if (invoiceIdx < 0 && !copy.includes('PROFORMA INVOICE')) copy.unshift('PROFORMA INVOICE');
  return copy;
}

function defaultDocSelected(mode: 'Advance' | 'Balance', doc: string): boolean {
  if (mode === 'Advance') {
    return doc !== 'BANK ADVISE';
  }
  return !['BANK ADVISE', 'AIRWAY BILL', 'INSURANCE COPY'].includes(doc);
}

function buildDocChecklist(mode: 'Advance' | 'Balance', hasProforma: boolean, existing?: Record<string, boolean> | null): Record<string, boolean> {
  const options = getDocOptionsForMode(mode, hasProforma);
  const out: Record<string, boolean> = {};
  options.forEach((doc) => {
    if (existing && Object.prototype.hasOwnProperty.call(existing, doc)) {
      out[doc] = !!existing[doc];
    } else {
      out[doc] = defaultDocSelected(mode, doc);
    }
  });
  return out;
}

function createAllocationRow(id: string, currencyCode: string, allocationType: 'Advance' | 'Balance' = 'Balance'): AllocationRowState {
  return {
    id,
    shipmentId: '',
    invoiceNo: '',
    allocationType,
    amount: 0,
    amountInput: '',
    documentChecklist: buildDocChecklist(allocationType, false, null),
    currency: String(currencyCode || 'USD').toUpperCase(),
    pendingAmountSnapshot: 0,
    invoiceAmount: 0,
    alreadyPaid: 0,
    pendingAmount: 0,
    goodsDesc: '',
    hsnCodeText: '',
    quantityText: '',
    invoiceDateText: '',
    shipmentDateText: '',
    portLoadingText: '',
    portDischargeText: '',
    termText: '',
    modeShipmentText: '',
  };
}

interface BankPaymentDocGeneratorProps {
  suppliers: Supplier[];
  shipments: Shipment[];
  user: User;
}

export const BankPaymentDocGenerator: React.FC<BankPaymentDocGeneratorProps> = ({
  suppliers,
  shipments,
}) => {
  const [companyChoice, setCompanyChoice] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [packetShipmentId, setPacketShipmentId] = useState('');
  const [payMode, setPayMode] = useState<'Advance' | 'Balance'>('Advance');

  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [invoiceValueDiff, setInvoiceValueDiff] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [paymentDate, setPaymentDate] = useState(() => formatDateForDoc(new Date().toISOString().slice(0, 10)));
  const [shipmentDate, setShipmentDate] = useState('');
  const [beneficiaryName, setBeneficiaryName] = useState('');
  const [beneficiaryAddress, setBeneficiaryAddress] = useState('');
  const [beneficiaryCountry, setBeneficiaryCountry] = useState('');
  const [beneficiaryAccount, setBeneficiaryAccount] = useState('');
  const [iban, setIban] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankSwift, setBankSwift] = useState('');
  const [bankAddress, setBankAddress] = useState('');
  const [intermediaryBankName, setIntermediaryBankName] = useState('');
  const [intermediaryBankSwift, setIntermediaryBankSwift] = useState('');
  const [intermediaryBankAddress, setIntermediaryBankAddress] = useState('');
  const [intermediaryBankCountry, setIntermediaryBankCountry] = useState('');
  const [portLoading, setPortLoading] = useState('');
  const [portDischarge, setPortDischarge] = useState('');
  const [term, setTerm] = useState('');
  const [modeShipment, setModeShipment] = useState('SEA');
  const [productLines, setProductLines] = useState<ProductLine[]>(() => [newProductLine('1')]);
  const [allocationRows, setAllocationRows] = useState<AllocationRowState[]>(() => [createAllocationRow('1', 'USD', 'Advance')]);

  const [generating, setGenerating] = useState(false);
  const nextIdRef = React.useRef(2);
  const nextAllocIdRef = React.useRef(2);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [shipmentFiles, setShipmentFiles] = useState<string[]>([]);
  const [packetSelection, setPacketSelection] = useState<Record<PacketDocId, boolean>>({
    PI: false,
    CI: true,
    PL: true,
    BL: true,
    AWB: true,
    BOE: true,
    PAY_ADV: true,
    COO: true,
  });
  const [printingPacket, setPrintingPacket] = useState(false);

  const restoreDraft = useCallback((draft: any) => {
    if (!draft || typeof draft !== 'object') return;
    if (typeof draft.companyChoice === 'string') setCompanyChoice(draft.companyChoice);
    if (typeof draft.supplierId === 'string') setSupplierId(draft.supplierId);
    if (typeof draft.packetShipmentId === 'string') setPacketShipmentId(draft.packetShipmentId);
    if (typeof draft.shipmentId === 'string' && !draft.packetShipmentId) setPacketShipmentId(draft.shipmentId);
    if (draft.payMode === 'Advance' || draft.payMode === 'Balance') setPayMode(draft.payMode);
    if (typeof draft.amount === 'string') setAmount(draft.amount);
    if (typeof draft.currency === 'string') setCurrency(draft.currency);
    if (typeof draft.invoiceValueDiff === 'string') setInvoiceValueDiff(draft.invoiceValueDiff);
    if (typeof draft.invoiceNo === 'string') setInvoiceNo(draft.invoiceNo);
    if (typeof draft.invoiceDate === 'string') setInvoiceDate(draft.invoiceDate);
    if (typeof draft.paymentDate === 'string') setPaymentDate(draft.paymentDate);
    if (typeof draft.shipmentDate === 'string') setShipmentDate(draft.shipmentDate);
    if (typeof draft.beneficiaryName === 'string') setBeneficiaryName(draft.beneficiaryName);
    if (typeof draft.beneficiaryAddress === 'string') setBeneficiaryAddress(draft.beneficiaryAddress);
    if (typeof draft.beneficiaryCountry === 'string') setBeneficiaryCountry(draft.beneficiaryCountry);
    if (typeof draft.beneficiaryAccount === 'string') setBeneficiaryAccount(draft.beneficiaryAccount);
    if (typeof draft.iban === 'string') setIban(draft.iban);
    if (typeof draft.bankName === 'string') setBankName(draft.bankName);
    if (typeof draft.bankSwift === 'string') setBankSwift(draft.bankSwift);
    if (typeof draft.bankAddress === 'string') setBankAddress(draft.bankAddress);
    if (typeof draft.intermediaryBankName === 'string') setIntermediaryBankName(draft.intermediaryBankName);
    if (typeof draft.intermediaryBankSwift === 'string') setIntermediaryBankSwift(draft.intermediaryBankSwift);
    if (typeof draft.intermediaryBankAddress === 'string') setIntermediaryBankAddress(draft.intermediaryBankAddress);
    if (typeof draft.intermediaryBankCountry === 'string') setIntermediaryBankCountry(draft.intermediaryBankCountry);
    if (typeof draft.portLoading === 'string') setPortLoading(draft.portLoading);
    if (typeof draft.portDischarge === 'string') setPortDischarge(draft.portDischarge);
    if (typeof draft.term === 'string') setTerm(draft.term);
    if (typeof draft.modeShipment === 'string') setModeShipment(draft.modeShipment);
    if (Array.isArray(draft.allocationRows) && draft.allocationRows.length > 0) {
      const rows = draft.allocationRows.map((r: any, idx: number) => {
        const id = String(r?.id || `restored-${idx + 1}`);
        const amountNum = parseAmount(r?.amountInput ?? r?.amount);
        return {
          ...createAllocationRow(id, String(r?.currency || draft.currency || 'USD')),
          ...r,
          id,
          amount: amountNum,
          amountInput: String(r?.amountInput ?? (amountNum > 0 ? amountNum : '')),
          documentChecklist: buildDocChecklist(
            (r?.allocationType === 'Advance' ? 'Advance' : 'Balance'),
            false,
            (r?.documentChecklist && typeof r.documentChecklist === 'object') ? r.documentChecklist : null
          ),
          currency: String(r?.currency || draft.currency || 'USD').toUpperCase(),
          pendingAmountSnapshot: parseAmount(r?.pendingAmountSnapshot),
          invoiceAmount: parseAmount(r?.invoiceAmount),
          alreadyPaid: parseAmount(r?.alreadyPaid),
          pendingAmount: parseAmount(r?.pendingAmount),
        } as AllocationRowState;
      });
      setAllocationRows(rows);
      const numericIds = rows
        .map((row) => parseInt(String(row.id || ''), 10))
        .filter((id) => Number.isFinite(id));
      const nextId = numericIds.length > 0 ? Math.max(...numericIds) + 1 : rows.length + 1;
      nextAllocIdRef.current = Math.max(2, nextId);
    }
    if (Array.isArray(draft.productLines) && draft.productLines.length > 0) {
      setProductLines(draft.productLines);
      const numericIds = draft.productLines
        .map((row: ProductLine) => parseInt(String(row.id || ''), 10))
        .filter((id: number) => Number.isFinite(id));
      const nextId = numericIds.length > 0 ? Math.max(...numericIds) + 1 : draft.productLines.length + 1;
      nextIdRef.current = Math.max(2, nextId);
    }
  }, []);

  useAutoSavedDraft({
    key: 'bank-payment-doc-generator',
    data: {
      companyChoice,
      supplierId,
      packetShipmentId,
      payMode,
      amount,
      currency,
      invoiceValueDiff,
      invoiceNo,
      invoiceDate,
      paymentDate,
      shipmentDate,
      beneficiaryName,
      beneficiaryAddress,
      beneficiaryCountry,
      beneficiaryAccount,
      iban,
      bankName,
      bankSwift,
      bankAddress,
      intermediaryBankName,
      intermediaryBankSwift,
      intermediaryBankAddress,
      intermediaryBankCountry,
      portLoading,
      portDischarge,
      term,
      modeShipment,
      allocationRows,
      productLines,
    },
    onRestore: restoreDraft,
    enabled: !generating,
    debounceMs: 700,
    version: '1',
  });

  const importShipments = useMemo(
    () => shipments.filter((s) => s.supplierId),
    [shipments]
  );

  /** Suppliers for the selected importer (company). Require companyChoice first. */
  const suppliersForSelect = useMemo(() => {
    if (!companyChoice) return [];
    return suppliers.filter((s) =>
      importShipments.some((sh) => sh.supplierId === s.id && sh.company === companyChoice)
    );
  }, [suppliers, importShipments, companyChoice]);

  /** Shipments for the selected importer and supplier. Require companyChoice then supplierId. */
  const shipmentsForSelect = useMemo(() => {
    if (!companyChoice) return [];
    return importShipments.filter((s) => s.company === companyChoice && (!supplierId || s.supplierId === supplierId));
  }, [importShipments, companyChoice, supplierId]);

  const selectedSupplier = useMemo(
    () => suppliers.find((s) => s.id === supplierId),
    [suppliers, supplierId]
  );

  const selectedShipment = useMemo(
    () => importShipments.find((s) => s.id === packetShipmentId),
    [importShipments, packetShipmentId]
  );

  const clearSupplierFields = useCallback(() => {
    setBeneficiaryName('');
    setBeneficiaryAddress('');
    setBeneficiaryCountry('');
    setBeneficiaryAccount('');
    setIban('');
    setBankName('');
    setBankSwift('');
    setBankAddress('');
    setIntermediaryBankName('');
    setIntermediaryBankSwift('');
    setIntermediaryBankAddress('');
    setIntermediaryBankCountry('');
  }, []);

  const clearShipmentFields = useCallback(() => {
    setInvoiceNo('');
    setInvoiceDate('');
    setShipmentDate('');
    setInvoiceValueDiff('');
    setPortLoading('');
    setPortDischarge('');
    setTerm('');
    setProductLines([newProductLine('1')]);
  }, []);

  const fillFromSupplier = useCallback((sup: Supplier) => {
    setBeneficiaryName(sup.name);
    setBeneficiaryAddress(sup.address || '');
    setBeneficiaryCountry(sup.country || '');
    setBeneficiaryAccount(sup.accountNumber || '');
    setBankName(sup.bankName || '');
    setBankSwift(sup.swiftCode || '');
    setBankAddress(sup.bankAddress || '');
    if (sup.products?.length) {
      const p = sup.products[0];
      setProductLines((prev) => {
        const next = [...prev];
        if (next.length) next[0] = { ...next[0], description: p.description || p.name || '', hsnCode: normalizeHsnCode(p.hsnCode || '') };
        return next;
      });
    }
  }, []);

  const fillFromShipment = useCallback(
    (sh: Shipment) => {
      setInvoiceNo(sh.invoiceNumber || '');
      setInvoiceDate(sh.invoiceDate ? formatDateForDoc(sh.invoiceDate) : '');
      setShipmentDate(sh.expectedShipmentDate ? formatDateForDoc(sh.expectedShipmentDate) : '');
      setCurrency(sh.currency || 'USD');
      const invAmt = sh.amount != null ? Number(sh.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
      setInvoiceValueDiff(invAmt);
      setPortLoading(sh.portOfLoading || '');
      const discharge = (sh.portOfDischarge || '').trim();
      const portCode = (sh.portCode || '').trim();
      const looksLikeCode = /^[A-Z]{2}[A-Z0-9]{3,8}$/i.test(discharge);
      setPortDischarge((discharge && looksLikeCode && portCode && discharge.toUpperCase() === portCode.toUpperCase()) ? '' : discharge);
      setTerm(sh.incoTerm || '');
      if (sh.items?.length) {
        setProductLines(
          sh.items.map((i, idx) => ({
            id: `ship-${idx}-${i.productId || idx}`,
            description: (i.productName || i.description || '').trim(),
            hsnCode: normalizeHsnCode((i.hsnCode || '').trim()),
            quantity: String(i.quantity ?? ''),
            unit: i.unit || 'KGS',
            amount: String(i.amount ?? ''),
          }))
        );
      } else {
        setProductLines([newProductLine('1')]);
      }
      if (sh.supplierId && !supplierId) {
        const sup = suppliers.find((s) => s.id === sh.supplierId);
        if (sup) {
          setSupplierId(sup.id);
          fillFromSupplier(sup);
        }
      }
    },
    [suppliers, supplierId, fillFromSupplier]
  );

  const deriveAllocationFromShipment = useCallback((sh: Shipment, rowId: string, allocationType: 'Balance' | 'Advance', currentAmountInput = ''): AllocationRowState => {
    const invoiceAmount = Number(sh.amount) || 0;
    const paid = (sh.payments || []).reduce((sum, p) => {
      const amt = Number(p?.amount) || 0;
      return sum + toShipmentCurrency(amt, p?.currency || sh.currency, sh.currency, sh.exchangeRate || 1);
    }, 0);
    const pending = Math.max(0, invoiceAmount - paid);
    const itemRows = Array.isArray(sh.items) ? sh.items : [];
    const goodsDesc = itemRows
      .map((i) => String(i.productName || i.description || '').trim())
      .filter(Boolean)
      .join(', ');
    const hsnCodeText = Array.from(
      new Set(
        itemRows
          .map((i) => normalizeHsnCode(String(i.hsnCode || '').trim()))
          .filter((code) => /^\d{8}$/.test(code))
      )
    ).join(', ');
    const quantityText = itemRows.length > 0
      ? itemRows.map((i) => `${String(i.quantity ?? '').trim()} ${String(i.unit || 'KGS').trim()}`).join(', ')
      : '';

    const amountInput = String(currentAmountInput || '').trim();
    const parsedAmount = parseAmount(amountInput);
    return {
      ...createAllocationRow(rowId, sh.currency || currency),
      shipmentId: sh.id,
      invoiceNo: sh.invoiceNumber || '',
      allocationType,
      amount: parsedAmount,
      amountInput,
      currency: String(sh.currency || currency || 'USD').toUpperCase(),
      pendingAmountSnapshot: Number(pending.toFixed(2)),
      invoiceAmount: Number(invoiceAmount.toFixed(2)),
      alreadyPaid: Number(paid.toFixed(2)),
      pendingAmount: Number(pending.toFixed(2)),
      goodsDesc: goodsDesc || '',
      hsnCodeText: hsnCodeText || '',
      quantityText: quantityText || '',
      invoiceDateText: sh.invoiceDate ? formatDateForDoc(sh.invoiceDate) : '',
      shipmentDateText: sh.expectedShipmentDate ? formatDateForDoc(sh.expectedShipmentDate) : '',
      portLoadingText: sh.portOfLoading || '',
      portDischargeText: sh.portOfDischarge || '',
      termText: sh.incoTerm || '',
      modeShipmentText: sh.shipmentMode || '',
    };
  }, [currency]);

  const addAllocationRow = useCallback(() => {
    const id = String(nextAllocIdRef.current++);
    setAllocationRows((prev) => [...prev, createAllocationRow(id, currency, payMode)]);
  }, [currency, payMode]);

  const removeAllocationRow = useCallback((id: string) => {
    setAllocationRows((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((row) => row.id !== id);
    });
  }, []);

  const updateAllocationAmount = useCallback((id: string, value: string) => {
    const parsed = parseAmount(value);
    setAllocationRows((prev) => prev.map((row) => row.id === id ? { ...row, amountInput: value, amount: parsed } : row));
  }, []);

  const toggleAllocationDoc = useCallback((id: string, doc: string) => {
    setAllocationRows((prev) => prev.map((row) => {
      if (row.id !== id) return row;
      const nextChecklist = { ...(row.documentChecklist || {}) };
      nextChecklist[doc] = !nextChecklist[doc];
      return { ...row, documentChecklist: nextChecklist };
    }));
  }, []);

  const updateAllocationShipment = useCallback((id: string, shipmentId: string) => {
    const shipment = shipmentsForSelect.find((s) => s.id === shipmentId);
    setAllocationRows((prev) => prev.map((row) => {
      if (row.id !== id) return row;
      if (!shipment) return { ...createAllocationRow(id, currency, payMode), allocationType: payMode };
      const next = deriveAllocationFromShipment(shipment, id, payMode, row.amountInput);
      const hasProforma = !!((shipment as any)?.documents?.PI);
      return {
        ...next,
        documentChecklist: buildDocChecklist(payMode, hasProforma, row.documentChecklist),
      };
    }));
  }, [currency, deriveAllocationFromShipment, shipmentsForSelect, payMode]);

  React.useEffect(() => {
    if (selectedSupplier) fillFromSupplier(selectedSupplier);
    else clearSupplierFields();
  }, [selectedSupplier, fillFromSupplier, clearSupplierFields]);

  React.useEffect(() => {
    setAllocationRows((prev) => prev.map((row) => {
      const sh = row.shipmentId ? importShipments.find((s) => s.id === row.shipmentId) : null;
      const hasProforma = !!((sh as any)?.documents?.PI);
      return {
        ...row,
        allocationType: payMode,
        documentChecklist: buildDocChecklist(payMode, hasProforma, row.documentChecklist),
      };
    }));
  }, [payMode, importShipments]);

  React.useEffect(() => {
    const firstSelected = allocationRows.find((row) => !!row.shipmentId)?.shipmentId || '';
    if (!packetShipmentId || !importShipments.some((s) => s.id === packetShipmentId)) {
      if (firstSelected) setPacketShipmentId(firstSelected);
    }
  }, [allocationRows, importShipments, packetShipmentId]);

  React.useEffect(() => {
    let mounted = true;
    const run = async () => {
      if (!selectedShipment?.id) {
        if (mounted) setShipmentFiles([]);
        return;
      }
      try {
        const result = await api.shipments.getDocumentsFolderFiles(selectedShipment.id);
        const files = Array.isArray(result?.files)
          ? result.files.map((f: any) => (typeof f === 'string' ? f : f?.name)).filter(Boolean)
          : [];
        if (mounted) setShipmentFiles(files as string[]);
      } catch (_) {
        if (mounted) setShipmentFiles([]);
      }
    };
    void run();
    return () => { mounted = false; };
  }, [selectedShipment?.id]);

  const findDocMatches = useCallback((docId: PacketDocId): string[] => {
    const names = shipmentFiles || [];
    const strip = (v: string) => String(v || '').replace(/\.[^/.]+$/, '').toUpperCase();
    const has = (file: string, pattern: RegExp) => pattern.test(strip(file));
    if (docId === 'PI') return names.filter((f) => has(f, /^PI(_|$)/));
    if (docId === 'CI') return names.filter((f) => has(f, /^CI(_|$)/));
    if (docId === 'PL') return names.filter((f) => has(f, /^PL(_|$)/));
    if (docId === 'BL') return names.filter((f) => has(f, /^BL(_|$)|BILL_OF_LADING|BOL/));
    if (docId === 'AWB') return names.filter((f) => has(f, /AWB|AIRWAY|AIR_WAY|AIRWAY_BILL/));
    if (docId === 'BOE') return names.filter((f) => has(f, /^BOE(_|$)|^BEO(_|$)|BILL_OF_ENTRY/));
    if (docId === 'COO') return names.filter((f) => has(f, /^COO(_|$)|CERTIFICATE_OF_ORIGIN|ORIGIN_CERTIFICATE/));
    if (docId === 'PAY_ADV') return names.filter((f) => has(f, /^PAY_ADV(_|$)/));
    return [];
  }, [shipmentFiles]);

  const packetDocAvailability = useMemo(() => {
    const out: Record<PacketDocId, string[]> = {
      PI: [],
      CI: [],
      PL: [],
      BL: [],
      AWB: [],
      BOE: [],
      PAY_ADV: [],
      COO: [],
    };
    PRINT_PACKET_DOCS.forEach((doc) => {
      out[doc.id] = findDocMatches(doc.id);
    });
    return out;
  }, [findDocMatches]);

  const handlePrintPacket = async () => {
    setError(null);
    setWarning(null);
    if (!selectedShipment?.id) {
      setError('Select a shipment first.');
      return;
    }
    const selectedDocs = PRINT_PACKET_DOCS.filter((d) => packetSelection[d.id]);
    if (selectedDocs.length === 0) {
      setError('Select at least one document to print.');
      return;
    }
    const toPrint: string[] = [];
    selectedDocs.forEach((doc) => {
      const files = packetDocAvailability[doc.id] || [];
      toPrint.push(...files);
    });
    if (toPrint.length === 0) {
      setError('No selected documents are available for this shipment.');
      return;
    }

    setPrintingPacket(true);
    try {
      const merged = await api.shipments.mergeFilesToPdf(selectedShipment.id, toPrint);
      const url = URL.createObjectURL(merged.blob);
      const opened = window.open(url, '_blank', 'noopener,noreferrer');
      if (!opened) {
        setError('Popup blocked by browser. Please allow popups and retry.');
        URL.revokeObjectURL(url);
        return;
      }
      setTimeout(() => {
        try {
          opened.focus();
          opened.print();
        } catch (_) {}
      }, 700);
      if (merged.skipped.length > 0) {
        const preview = merged.skipped.slice(0, 3).map((s) => s.filename).join(', ');
        setWarning(`Packet generated. ${merged.skipped.length} file(s) skipped (unsupported/corrupt): ${preview}${merged.skipped.length > 3 ? '...' : ''}`);
      }
      setTimeout(() => URL.revokeObjectURL(url), 12000);
    } catch (e: any) {
      setError(e?.message || 'Failed to print packet.');
    } finally {
      setPrintingPacket(false);
    }
  };

  const addProductLine = useCallback(() => {
    const id = String(nextIdRef.current++);
    setProductLines((prev) => [...prev, newProductLine(id)]);
  }, []);

  const removeProductLine = useCallback((id: string) => {
    setProductLines((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((row) => row.id !== id);
    });
  }, []);

  const updateProductLine = useCallback((id: string, field: keyof ProductLine, value: string) => {
    setProductLines((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [field]: field === 'hsnCode' ? normalizeHsnCode(value) : value } : row))
    );
  }, []);

  const buildDocumentListString = (rows: AllocationRowState[]): string => {
    const lines: string[] = [];
    rows.forEach((row, rowIndex) => {
      const selectedDocs = Object.entries(row.documentChecklist || {})
        .filter(([, checked]) => !!checked)
        .map(([doc]) => doc);
      lines.push(`Shipment ${rowIndex + 1} - Invoice ${row.invoiceNo || 'NA'}:`);
      if (selectedDocs.length === 0) {
        lines.push('1.       (No document selected)');
      } else {
        selectedDocs.forEach((doc, i) => lines.push(`${i + 1}.       ${doc}`));
      }
      lines.push('');
    });
    return lines.join('\n').trim() + '\n';
  };

  const validate = (): string | null => {
    const companyLabel = companyChoice === 'GFPL' ? 'Gujarat Flotex Pvt Ltd' : companyChoice === 'GTEX' ? 'GTEX Fabrics' : '';
    if (!companyChoice || !companyLabel) return 'Please select Importer (Company).';
    if (!supplierId || !selectedSupplier) return 'Please select a Supplier.';
    const amtNum = parseAmount(amount);
    if (!(amtNum > 0)) return 'Remittance amount must be greater than 0.';

    const validRows = allocationRows.filter((row) => !!row.shipmentId);
    if (validRows.length === 0) return 'Add at least one allocation row and select shipment/invoice.';

    const allocationTypes = Array.from(new Set(validRows.map((row) => row.allocationType)));
    if (allocationTypes.length > 1) {
      return 'You cannot mix Advance and Balance in one remittance. Use only one mode.';
    }
    if (allocationTypes.length === 1 && allocationTypes[0] !== payMode) {
      return `All rows must be ${payMode}.`;
    }

    const totalAllocated = validRows.reduce((sum, row) => sum + parseAmount(row.amountInput), 0);
    if (Math.abs(totalAllocated - amtNum) > 0.01) {
      return `Allocation total (${totalAllocated.toFixed(2)}) must match remittance amount (${amtNum.toFixed(2)}).`;
    }

    const perShipmentTotals = new Map<string, number>();
    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];
      const sh = shipmentsForSelect.find((s) => s.id === row.shipmentId);
      if (!sh) return `Allocation row ${i + 1}: Shipment not found.`;
      if (String(sh.supplierId || '') !== String(supplierId)) return `Allocation row ${i + 1}: Shipment belongs to a different supplier.`;
      if (String(sh.company || '') !== String(companyChoice || '')) return `Allocation row ${i + 1}: Shipment belongs to a different company.`;
      if (String(sh.currency || '').toUpperCase() !== String(currency || '').toUpperCase()) {
        return `Allocation row ${i + 1}: Currency mismatch. Shipment currency is ${sh.currency || 'NA'}.`;
      }
      const rowAmt = parseAmount(row.amountInput);
      if (!(rowAmt > 0)) return `Allocation row ${i + 1}: Amount must be greater than 0.`;
      if (rowAmt > row.pendingAmount + 0.0001) {
        return `Allocation row ${i + 1}: Amount cannot exceed pending amount (${row.pendingAmount.toFixed(2)} ${row.currency}).`;
      }
      const running = (perShipmentTotals.get(row.shipmentId) || 0) + rowAmt;
      if (running > row.pendingAmount + 0.0001) {
        return `Allocation rows for invoice ${row.invoiceNo || sh.invoiceNumber} exceed pending amount (${row.pendingAmount.toFixed(2)} ${row.currency}).`;
      }
      perShipmentTotals.set(row.shipmentId, running);
      if (!row.invoiceNo.trim()) return `Allocation row ${i + 1}: Invoice number missing.`;
      const selectedDocsCount = Object.values(row.documentChecklist || {}).filter(Boolean).length;
      if (selectedDocsCount === 0) return `Allocation row ${i + 1}: Select at least one document for this shipment.`;
    }

    if (!beneficiaryName.trim()) return 'Supplier Name is required.';
    if (!beneficiaryAddress.trim()) return 'Supplier Address is required.';
    if (!beneficiaryCountry.trim()) return 'Supplier Country is required.';
    if (!beneficiaryAccount.trim()) return 'Account Number is required.';
    if (!bankName.trim()) return 'Bank Name is required.';
    if (!bankSwift.trim()) return 'SWIFT Code is required.';
    if (!bankAddress.trim()) return 'Bank Branch Address is required.';
    if (!portLoading.trim()) return 'Port of Loading is required.';
    if (!portDischarge.trim()) return 'Port of Discharge is required.';
    if (!term) return 'Please select IncoTerm.';
    if (!modeShipment) return 'Please select Shipment Mode.';
    return null;
  };

  const handleGenerate = async () => {
    setError(null);
    setWarning(null);
    const err = validate();
    if (err) {
      setError(err);
      return;
    }

    const companyLabel = companyChoice === 'GFPL' ? 'Gujarat Flotex Pvt Ltd' : 'GTEX Fabrics';
    const selectedRows = allocationRows.filter((row) => !!row.shipmentId);
    const documentListStr = buildDocumentListString(selectedRows);
    const invoiceAmountNum = parseInvoiceValue(invoiceValueDiff) ?? selectedRows.reduce((sum, row) => sum + (row.invoiceAmount || 0), 0);
    const invoiceAmountVal = Number(invoiceAmountNum || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const invoiceNoJoined = selectedRows.map((row) => row.invoiceNo).filter(Boolean).join(', ');
    const invoiceDateJoined = selectedRows.map((row) => row.invoiceDateText).filter(Boolean).join(', ');
    const shipmentDateJoined = selectedRows.map((row) => row.shipmentDateText).filter(Boolean).join(', ');
    const goodsDescFromRows = selectedRows.map((row) => row.goodsDesc).filter(Boolean).join(', ');
    const hsnFromRows = selectedRows.map((row) => row.hsnCodeText).filter(Boolean).join(', ');
    const qtyFromRows = selectedRows.map((row) => row.quantityText).filter(Boolean).join(', ');
    const goodsDescFromManual = productLines.map((row) => row.description.trim()).filter(Boolean).join(', ');
    const hsnFromManual = productLines.map((row) => normalizeHsnCode(row.hsnCode || '')).filter((v) => /^\d{8}$/.test(v)).join(', ');
    const qtyFromManual = productLines.map((row) => `${row.quantity} ${row.unit}`.trim()).filter(Boolean).join(', ');
    const goodsDescStr = goodsDescFromRows || goodsDescFromManual || 'GOODS';
    const hsnStr = hsnFromRows || hsnFromManual || '00000000';
    const quantityStr = qtyFromRows || qtyFromManual || '1 LOT';
    const purpose = `PAYMENT FOR PURCHASE OF ${(goodsDescStr || 'GOODS').toUpperCase()} AGAINST INVOICES ${(invoiceNoJoined || invoiceNo).toUpperCase()}`;

    const items = selectedRows.map((row) => {
      return {
        description: row.goodsDesc || 'Shipment goods',
        hsn_code: row.hsnCodeText || '',
        quantity: row.quantityText || '',
        quantity_and_unit: row.quantityText || '',
        unit: '',
        amount: parseAmount(row.amountInput),
        invoice_no: row.invoiceNo,
        invoice_date: row.invoiceDateText,
        shipment_date: row.shipmentDateText,
        term: row.termText || term,
        mode_shipment: row.modeShipmentText || modeShipment,
      };
    });

    const allocationsPayload: BankPaymentAllocationRow[] = selectedRows.map((row) => ({
      shipmentId: row.shipmentId,
      invoiceNo: row.invoiceNo,
      allocationType: row.allocationType,
      amount: Number(parseAmount(row.amountInput).toFixed(2)),
      currency: String(row.currency || currency).toUpperCase(),
      pendingAmountSnapshot: Number(row.pendingAmount.toFixed(2)),
    }));

    const shouldPost = window.confirm('Press OK to generate documents and post allocations to shipment payments.\nPress Cancel to generate documents only.');

    const payload: Record<string, unknown> = {
      company_choice: companyLabel,
      date: paymentDate.trim() || formatDateForDoc(new Date().toISOString().slice(0, 10)),
      invoice_no: invoiceNoJoined || invoiceNo.trim(),
      invoice_date: invoiceDateJoined || invoiceDate.trim(),
      shipment_date: shipmentDateJoined || shipmentDate.trim(),
      currency: currency.trim(),
      raw_amount: amount.trim(),
      invoice_amount: invoiceAmountVal,
      quantity: quantityStr,
      beneficiary_name: beneficiaryName.trim(),
      beneficiary_address: beneficiaryAddress.trim(),
      beneficiary_country: beneficiaryCountry.trim(),
      beneficiary_account: beneficiaryAccount.trim(),
      iban: iban.trim(),
      bank_name: bankName.trim(),
      bank_swift: bankSwift.trim(),
      bank_address: bankAddress.trim(),
      intermediary_bank_name: intermediaryBankName.trim(),
      intermediary_bank_swift: intermediaryBankSwift.trim(),
      intermediary_bank_address: intermediaryBankAddress.trim(),
      intermediary_bank_country: intermediaryBankCountry.trim(),
      port_loading: portLoading.trim(),
      port_discharge: portDischarge.trim(),
      purpose,
      goods_desc: goodsDescStr,
      hsn_code: hsnStr,
      term: term.trim(),
      mode_shipment: modeShipment.trim(),
      payment_mode: payMode,
      document_list: documentListStr,
      items,
      allocations: allocationsPayload,
    };

    setGenerating(true);
    try {
      const blob = await api.bankPaymentDocs.generate(payload);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const firstInvoice = selectedRows[0]?.invoiceNo || invoiceNo || 'document';
      const suffix = selectedRows.length > 1 ? '_MULTI' : '';
      a.download = `BankPayment_${firstInvoice.replace(/\s/g, '_')}${suffix}_${currency || 'USD'}.docx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);

      if (shouldPost && allocationsPayload.length > 0) {
        const batchId = `BATCH_${Date.now()}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
        const postResult = await api.bankPaymentDocs.postAllocations({
          batchId,
          paymentDate: paymentDate.trim() || new Date().toISOString().slice(0, 10),
          currency: currency.trim(),
          raw_amount: amount.trim(),
          allocations: allocationsPayload,
          company_choice: companyLabel,
        });
        if (postResult?.alreadyPosted) {
          setWarning(`Documents generated. Batch ${batchId} was already posted earlier, so no duplicate payment entries were added.`);
        } else {
          setWarning(`Documents generated and ${postResult?.postedCount || 0} allocation row(s) posted to shipment payments.`);
        }
      } else {
        setWarning('Documents generated. Allocations were not posted to shipment payments.');
      }
    } catch (e: any) {
      const msg = e?.message || 'Failed to generate document.';
      const isTemplateError = typeof msg === 'string' && /multi\s*error|template\s*error/i.test(msg);
      setError(isTemplateError
        ? 'Document generation failed due to a template formatting issue. Try selecting the other company (e.g. GTEX instead of GFPL, or vice versa), or contact support.'
        : msg);
    } finally {
      setGenerating(false);
    }
  };

  const inputClass =
    'w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent';
  const labelClass = 'block text-sm font-bold text-slate-500 uppercase tracking-wide mb-2';
  const cardClass = 'bg-white p-5 sm:p-8 rounded-[2rem] shadow-sm border border-slate-100';

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-24">
      <header>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Bank Import Payment Document Generator</h1>
        <p className="text-slate-500 font-medium mt-1">Generate payment documents for bank submission using supplier and shipment data.</p>
      </header>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-4 py-3 font-medium">
          {error}
        </div>
      )}
      {warning && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 font-medium">
          {warning}
        </div>
      )}

      {/* Company, Supplier, Shipment pre-fill, Payment mode */}
      <div className={cardClass}>
        <h2 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
          <FileText className="text-indigo-600" size={20} /> Company & Supplier
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className={labelClass}>Importer (Company) *</label>
            <select
              required
              className={inputClass}
              value={companyChoice}
              onChange={(e) => {
                const v = e.target.value;
                setCompanyChoice(v);
                setSupplierId('');
                setPacketShipmentId('');
                setAllocationRows([createAllocationRow('1', currency, payMode)]);
                nextAllocIdRef.current = 2;
                clearSupplierFields();
                clearShipmentFields();
              }}
              title="Select the importer/company first. This filters suppliers and invoices."
            >
              <option value="">Select company...</option>
              {COMPANY_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <span className="inline-flex items-center mt-2 text-slate-400" title="Start by selecting the Importer (company). This enables the Supplier list.">
              <Info size={16} />
              <span className="sr-only">Start by selecting the Importer (company). This enables the Supplier list.</span>
            </span>
          </div>
          <div>
            <label className={labelClass}>Supplier *</label>
            <select
              required
              disabled={!companyChoice}
              className={inputClass}
              value={supplierId}
              onChange={(e) => {
                const v = e.target.value;
                setSupplierId(v);
                setPacketShipmentId('');
                setAllocationRows([createAllocationRow('1', currency, payMode)]);
                nextAllocIdRef.current = 2;
                clearShipmentFields();
              }}
              title={companyChoice ? 'Select supplier to load invoices' : 'Select company first to enable suppliers'}
            >
              <option value="">{companyChoice ? 'Select supplier...' : 'Select company first'}</option>
              {suppliersForSelect.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <span className="inline-flex items-center mt-2 text-slate-400" title="After choosing a company, pick the Supplier to filter invoices for that supplier.">
              <Info size={16} />
              <span className="sr-only">After choosing a company, pick the Supplier to filter invoices for that supplier.</span>
            </span>
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>Payment Mode For This Remittance</label>
            <div className="flex flex-wrap gap-4 sm:gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="payMode"
                  checked={payMode === 'Advance'}
                  onChange={() => setPayMode('Advance')}
                />
                <span className="font-semibold">Advance</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="payMode"
                  checked={payMode === 'Balance'}
                  onChange={() => setPayMode('Balance')}
                />
                <span className="font-semibold">Balance</span>
              </label>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              All allocation rows follow this mode. Mixed Advance + Balance is not allowed.
            </p>
          </div>
          <div className="md:col-span-2">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
              <label className={labelClass}>Payment Allocation Rows *</label>
              <button
                type="button"
                onClick={addAllocationRow}
                disabled={!supplierId}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 font-medium hover:bg-indigo-100 text-sm min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus size={16} /> Add allocation row
              </button>
            </div>
            <div className="space-y-3">
              {allocationRows.map((row, idx) => {
                const rowShipment = row.shipmentId ? shipmentsForSelect.find((s) => s.id === row.shipmentId) : null;
                const hasProforma = !!((rowShipment as any)?.documents?.PI);
                const rowDocOptions = getDocOptionsForMode(payMode, hasProforma);
                return (
                <div key={row.id} className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                    <div className="md:col-span-4">
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Shipment / Invoice</label>
                      <select
                        className={inputClass}
                        disabled={!supplierId}
                        value={row.shipmentId}
                        onChange={(e) => updateAllocationShipment(row.id, e.target.value)}
                      >
                        <option value="">{supplierId ? 'Select invoice...' : 'Select supplier first'}</option>
                        {shipmentsForSelect.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.invoiceNumber} - {s.expectedShipmentDate ? formatDateForDoc(s.expectedShipmentDate) : 'No date'}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Type</label>
                      <select
                        className={inputClass}
                        value={row.allocationType}
                        onChange={(e) => setPayMode(e.target.value === 'Advance' ? 'Advance' : 'Balance')}
                        disabled
                      >
                        <option value="Balance">Balance</option>
                        <option value="Advance">Advance</option>
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Allocation Amount</label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        className={inputClass}
                        value={row.amountInput}
                        onChange={(e) => updateAllocationAmount(row.id, e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="md:col-span-3">
                      <p className="text-[11px] font-semibold text-slate-600">Invoice: {row.invoiceAmount.toFixed(2)} {row.currency || currency}</p>
                      <p className="text-[11px] font-semibold text-slate-600">Paid: {row.alreadyPaid.toFixed(2)} {row.currency || currency}</p>
                      <p className="text-[11px] font-bold text-amber-700">Pending: {row.pendingAmount.toFixed(2)} {row.currency || currency}</p>
                    </div>
                    <div className="md:col-span-1 flex md:justify-end">
                      <button
                        type="button"
                        onClick={() => removeAllocationRow(row.id)}
                        disabled={allocationRows.length <= 1}
                        className="p-3 md:p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0"
                        title={allocationRows.length <= 1 ? 'At least one row required' : 'Remove row'}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    Row {idx + 1}: Invoice {row.invoiceNo || '-'} | Currency {row.currency || currency}
                  </div>
                  <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                    <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide mb-2">
                      Document List For This Shipment
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                      {rowDocOptions.map((doc) => (
                        <label key={`${row.id}-${doc}`} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!row.documentChecklist?.[doc]}
                            onChange={() => toggleAllocationDoc(row.id, doc)}
                          />
                          <span className="text-sm">{doc}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
            <div className="mt-2 text-xs text-slate-600 space-y-1">
              <p>Rule: Total of all allocation rows must exactly match remittance amount.</p>
              <p>Rule: One remittance can be only one mode: all Advance or all Balance.</p>
              <p>Total allocated: {allocationRows.reduce((sum, row) => sum + parseAmount(row.amountInput), 0).toFixed(2)} {currency || 'USD'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Remittance & Currency */}
      <div className={cardClass}>
        <h2 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
          <Banknote className="text-indigo-600" size={20} /> Remittance & Currency
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className={labelClass}>Remittance Amount *</label>
            <input
              type="number"
              step="any"
              min="0"
              className={inputClass}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div>
            <label className={labelClass}>Currency *</label>
            <select className={inputClass} value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>Total Invoice Value (if different)</label>
            <input
              type="text"
              className={inputClass}
              value={invoiceValueDiff}
              onChange={(e) => setInvoiceValueDiff(e.target.value)}
              placeholder="Leave blank to use remittance amount"
            />
          </div>
        </div>
      </div>

      {/* Invoice details */}
      <div className={cardClass}>
        <h2 className="text-lg font-bold text-slate-900 mb-6">Invoice Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className={labelClass}>Invoice Number *</label>
            <input
              className={inputClass}
              value={invoiceNo}
              onChange={(e) => setInvoiceNo(e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>Invoice Date * (dd-mm-yyyy)</label>
            <input
              className={inputClass}
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              placeholder="dd-mm-yyyy"
            />
          </div>
          <div>
            <label className={labelClass}>Payment Date (dd-mm-yyyy)</label>
            <input
              className={inputClass}
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              placeholder="dd-mm-yyyy"
            />
          </div>
        </div>
      </div>

      {/* Supplier information */}
      <div className={cardClass}>
        <h2 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
          <Landmark className="text-indigo-600" size={20} /> Supplier Information
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="md:col-span-2">
            <label className={labelClass}>Supplier Name *</label>
            <input className={inputClass} value={beneficiaryName} onChange={(e) => setBeneficiaryName(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>Address *</label>
            <input className={inputClass} value={beneficiaryAddress} onChange={(e) => setBeneficiaryAddress(e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Country *</label>
            <input className={inputClass} value={beneficiaryCountry} onChange={(e) => setBeneficiaryCountry(e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Account No *</label>
            <input className={inputClass} value={beneficiaryAccount} onChange={(e) => setBeneficiaryAccount(e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>IBAN (optional)</label>
            <input className={inputClass} value={iban} onChange={(e) => setIban(e.target.value)} placeholder="If applicable" />
          </div>
          <div>
            <label className={labelClass}>Bank Name *</label>
            <input className={inputClass} value={bankName} onChange={(e) => setBankName(e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>SWIFT Code *</label>
            <input className={inputClass} value={bankSwift} onChange={(e) => setBankSwift(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>Bank Branch Address *</label>
            <input className={inputClass} value={bankAddress} onChange={(e) => setBankAddress(e.target.value)} />
          </div>
          <div className="md:col-span-2 border-t border-slate-200 pt-4 mt-2">
            <p className="text-sm font-medium text-slate-600 mb-3">Intermediary bank (optional)</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Intermediary bank name</label>
                <input className={inputClass} value={intermediaryBankName} onChange={(e) => setIntermediaryBankName(e.target.value)} placeholder="If applicable" />
              </div>
              <div>
                <label className={labelClass}>Intermediary bank SWIFT</label>
                <input className={inputClass} value={intermediaryBankSwift} onChange={(e) => setIntermediaryBankSwift(e.target.value)} placeholder="If applicable" />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>Intermediary bank address</label>
                <input className={inputClass} value={intermediaryBankAddress} onChange={(e) => setIntermediaryBankAddress(e.target.value)} placeholder="If applicable" />
              </div>
              <div>
                <label className={labelClass}>Intermediary bank country</label>
                <input className={inputClass} value={intermediaryBankCountry} onChange={(e) => setIntermediaryBankCountry(e.target.value)} placeholder="If applicable" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Shipment & Goods */}
      <div className={cardClass}>
        <h2 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
          <Truck className="text-indigo-600" size={20} /> Shipment & Goods
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className={labelClass}>Shipment Date * (dd-mm-yyyy)</label>
            <input
              className={inputClass}
              value={shipmentDate}
              onChange={(e) => setShipmentDate(e.target.value)}
              placeholder="dd-mm-yyyy"
            />
          </div>
          <div>
            <label className={labelClass}>IncoTerm *</label>
            <select className={inputClass} value={term} onChange={(e) => setTerm(e.target.value)}>
              <option value="">Select...</option>
              {INCO_TERMS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Mode *</label>
            <select className={inputClass} value={modeShipment} onChange={(e) => setModeShipment(e.target.value)}>
              <option value="">Select...</option>
              {SHIPMENT_MODES.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Port of Loading *</label>
            <input className={inputClass} value={portLoading} onChange={(e) => setPortLoading(e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Port of Discharge *</label>
            <input className={inputClass} value={portDischarge} onChange={(e) => setPortDischarge(e.target.value)} />
          </div>
        </div>

        <div className="mt-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <label className={labelClass}>Product lines *</label>
            <button
              type="button"
              onClick={addProductLine}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 font-medium hover:bg-indigo-100 text-sm min-h-[44px]"
            >
              <Plus size={16} /> Add product line
            </button>
          </div>
          <div className="space-y-4">
            {productLines.map((row, index) => (
              <div
                key={row.id}
                className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 grid grid-cols-1 md:grid-cols-12 gap-3 items-end"
              >
                <div className="md:col-span-3">
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Description *</label>
                  <input
                    className={inputClass}
                    value={row.description}
                    onChange={(e) => updateProductLine(row.id, 'description', e.target.value)}
                    placeholder="Goods description"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">HSN Code *</label>
                  <input
                    className={inputClass}
                    value={row.hsnCode}
                    onChange={(e) => updateProductLine(row.id, 'hsnCode', e.target.value)}
                    placeholder="8-digit HSN"
                    inputMode="numeric"
                    maxLength={8}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Quantity *</label>
                  <input
                    type="text"
                    className={inputClass}
                    value={row.quantity}
                    onChange={(e) => updateProductLine(row.id, 'quantity', e.target.value)}
                    placeholder="Value"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Unit *</label>
                  <select
                    className={inputClass}
                    value={row.unit}
                    onChange={(e) => updateProductLine(row.id, 'unit', e.target.value)}
                  >
                    {QTY_UNITS.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Amount</label>
                  <input
                    type="text"
                    className={inputClass}
                    value={row.amount}
                    onChange={(e) => updateProductLine(row.id, 'amount', e.target.value)}
                    placeholder={productLines.length === 1 ? 'Optional' : 'Per product'}
                  />
                </div>
                <div className="md:col-span-1 flex justify-start md:justify-end">
                  <button
                    type="button"
                    onClick={() => removeProductLine(row.id)}
                    disabled={productLines.length <= 1}
                    className="p-3 md:p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0"
                    title={productLines.length <= 1 ? 'At least one product line required' : 'Remove product line'}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Print Packet */}
      <div className={cardClass}>
        <h2 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
          <FileText className="text-indigo-600" size={20} /> Print Shipment Packet
        </h2>
        <p className="text-sm text-slate-500 mb-4">
          Select documents to print for this shipment. Only uploaded files will be printed.
        </p>
        <div className="mb-4">
          <label className={labelClass}>Shipment For Print Packet</label>
          <select
            className={inputClass}
            disabled={!supplierId}
            value={packetShipmentId}
            onChange={(e) => setPacketShipmentId(e.target.value)}
          >
            <option value="">{supplierId ? 'Select shipment...' : 'Select supplier first'}</option>
            {shipmentsForSelect.map((s) => (
              <option key={s.id} value={s.id}>
                {s.invoiceNumber} - {s.expectedShipmentDate ? formatDateForDoc(s.expectedShipmentDate) : 'No date'}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
          {PRINT_PACKET_DOCS.map((doc) => {
            const availableCount = packetDocAvailability[doc.id]?.length || 0;
            const disabled = availableCount === 0;
            return (
              <label key={doc.id} className={`flex items-center justify-between gap-3 rounded-xl border p-3 ${disabled ? 'bg-slate-50 border-slate-200 text-slate-400' : 'bg-white border-slate-200 text-slate-700'}`}>
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!packetSelection[doc.id]}
                    disabled={disabled}
                    onChange={(e) => setPacketSelection((prev) => ({ ...prev, [doc.id]: e.target.checked }))}
                  />
                  <span className="text-sm font-medium">{doc.label}</span>
                </span>
                <span className="text-xs font-bold">{availableCount > 0 ? `${availableCount} file` : 'Missing'}</span>
              </label>
            );
          })}
        </div>
        <button
          type="button"
          onClick={handlePrintPacket}
          disabled={printingPacket || !selectedShipment?.id}
          className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-slate-900 text-white font-bold text-sm hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-h-[48px]"
        >
          {printingPacket ? <Loader2 size={18} className="animate-spin" /> : <FileText size={18} />}
          {printingPacket ? 'Preparing print...' : 'Print selected shipment documents'}
        </button>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating}
          className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg min-h-[48px]"
        >
          {generating ? <Loader2 size={18} className="animate-spin" /> : <FileText size={18} />}
          {generating ? 'Generating...' : 'Generate documents'}
        </button>
      </div>
    </div>
  );
};

export default BankPaymentDocGenerator;

