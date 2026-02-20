import React, { useState, useMemo, useCallback } from 'react';
import { Supplier, Shipment, User } from '../types';
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
  const [shipmentId, setShipmentId] = useState('');
  const [payMode, setPayMode] = useState<'Advance' | 'Balance'>('Advance');
  const [includeBankAdvise, setIncludeBankAdvise] = useState(false);
  const [balanceChecklist, setBalanceChecklist] = useState<Record<string, boolean>>(() => {
    const o: Record<string, boolean> = {};
    BALANCE_DOCS.forEach((d) => {
      o[d] = !['BANK ADVISE', 'AIRWAY BILL', 'INSURANCE COPY'].includes(d);
    });
    return o;
  });

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

  const [generating, setGenerating] = useState(false);
  const nextIdRef = React.useRef(2);
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
    if (typeof draft.shipmentId === 'string') setShipmentId(draft.shipmentId);
    if (draft.payMode === 'Advance' || draft.payMode === 'Balance') setPayMode(draft.payMode);
    if (typeof draft.includeBankAdvise === 'boolean') setIncludeBankAdvise(draft.includeBankAdvise);
    if (draft.balanceChecklist && typeof draft.balanceChecklist === 'object') {
      setBalanceChecklist((prev) => ({ ...prev, ...draft.balanceChecklist }));
    }
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
      shipmentId,
      payMode,
      includeBankAdvise,
      balanceChecklist,
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
    () => importShipments.find((s) => s.id === shipmentId),
    [importShipments, shipmentId]
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

  React.useEffect(() => {
    if (selectedSupplier) fillFromSupplier(selectedSupplier);
    else clearSupplierFields();
  }, [selectedSupplier, fillFromSupplier, clearSupplierFields]);

  React.useEffect(() => {
    if (selectedShipment) fillFromShipment(selectedShipment);
    else clearShipmentFields();
  }, [selectedShipment, fillFromShipment, clearShipmentFields]);

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

  const buildDocumentList = (): string[] => {
    const hasProforma = !!(selectedShipment as any)?.documents?.PI;
    const withOptionalProforma = (base: string[]) => {
      if (!hasProforma) return [...base];
      const copy = [...base];
      const invoiceIdx = copy.indexOf('INVOICE');
      if (invoiceIdx >= 0) copy.splice(invoiceIdx, 0, 'PROFORMA INVOICE');
      else copy.unshift('PROFORMA INVOICE');
      return copy;
    };
    if (payMode === 'Advance') {
      const list = withOptionalProforma(ADVANCE_DOCS);
      if (includeBankAdvise) list.push('BANK ADVISE');
      return list;
    }
    return withOptionalProforma(BALANCE_DOCS).filter((d) => d === 'PROFORMA INVOICE' || balanceChecklist[d]);
  };

  const validate = (): string | null => {
    const companyLabel = companyChoice === 'GFPL' ? 'Gujarat Flotex Pvt Ltd' : companyChoice === 'GTEX' ? 'GTEX Fabrics' : '';
    if (!companyChoice || !companyLabel) return 'Please select Importer (Company).';
    if (!supplierId || !selectedSupplier) return 'Please select a Supplier.';
    const amtNum = parseFloat(amount);
    if (Number.isNaN(amtNum) || amtNum <= 0) return 'Remittance amount must be greater than 0.';
    const totalFromItems = productLines.reduce(
      (sum, row) => sum + (parseFloat(row.amount) || 0),
      0
    );
    const totalInvoiceValue =
      parseInvoiceValue(invoiceValueDiff) ?? (totalFromItems > 0 ? totalFromItems : null) ?? (selectedShipment?.amount ?? null);
    if (totalInvoiceValue != null && totalInvoiceValue >= 0 && amtNum > totalInvoiceValue) {
      return 'Remittance amount cannot be more than total invoice value.';
    }
    if (!invoiceNo.trim()) return 'Invoice Number is required.';
    if (!invoiceDate.trim()) return 'Invoice Date is required.';
    if (!shipmentDate.trim()) return 'Shipment Date is required.';
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
    if (productLines.length === 0) return 'At least one product line is required.';
    for (let i = 0; i < productLines.length; i++) {
      const row = productLines[i];
      if (!row.description.trim()) return `Product line ${i + 1}: Goods description is required.`;
      if (!/^\d{8}$/.test(normalizeHsnCode(row.hsnCode.trim()))) return `Product line ${i + 1}: HSN code must be exactly 8 digits.`;
      if (!row.quantity.trim()) return `Product line ${i + 1}: Quantity is required.`;
      if (!row.unit) return `Product line ${i + 1}: Unit is required.`;
      const amt = parseFloat(row.amount);
      if (productLines.length > 1 && (Number.isNaN(amt) || amt < 0)) return `Product line ${i + 1}: Amount must be a number ≥ 0.`;
    }
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
    const docList = buildDocumentList();
    const documentListStr = docList.map((item, i) => `${i + 1}.       ${item}`).join('\n') + '\n';
    const amtNum = parseFloat(amount);
    const preTotalFromItems = productLines.reduce((sum, row) => sum + (parseFloat(row.amount) || 0), 0);
    const invoiceAmountNum =
      parseInvoiceValue(invoiceValueDiff) ??
      (preTotalFromItems > 0 ? preTotalFromItems : null) ??
      (selectedShipment?.amount ?? null) ??
      amtNum;

    const items = productLines.map((row) => {
      const qtyNum = parseFloat(row.quantity);
      const amt = row.amount.trim() ? parseFloat(row.amount) : null;
      return {
        description: row.description.trim(),
        hsn_code: normalizeHsnCode(row.hsnCode.trim()),
        quantity: Number.isNaN(qtyNum) ? row.quantity : qtyNum,
        unit: row.unit || 'KGS',
        amount: amt != null && !Number.isNaN(amt) ? amt : (productLines.length === 1 ? invoiceAmountNum : 0),
      };
    });

    const goodsDescStr = items.map((i) => i.description).filter(Boolean).join(', ');
    const hsnStr = items.map((i) => i.hsn_code).filter(Boolean).join(', ');
    const quantityStr = items.map((i) => `${i.quantity} ${i.unit}`).join(', ');
    const purpose = `PAYMENT FOR PURCHASE OF ${goodsDescStr.toUpperCase()}`;

    const invoiceAmountVal = Number(invoiceAmountNum || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const payload: Record<string, unknown> = {
      company_choice: companyLabel,
      date: paymentDate.trim() || formatDateForDoc(new Date().toISOString().slice(0, 10)),
      invoice_no: invoiceNo.trim(),
      invoice_date: invoiceDate.trim(),
      shipment_date: shipmentDate.trim(),
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
      document_list: documentListStr,
      items,
    };

    setGenerating(true);
    try {
      const blob = await api.bankPaymentDocs.generate(payload);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `BankPayment_${(invoiceNo || 'document').replace(/\s/g, '_')}_${currency || 'USD'}.docx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
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
                setShipmentId('');
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
                setShipmentId('');
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
            <label className={labelClass}>Pre-fill from shipment (invoice) *</label>
            <select
              className={inputClass}
              disabled={!supplierId}
              value={shipmentId}
              onChange={(e) => setShipmentId(e.target.value)}
              title={supplierId ? 'Select an invoice to pre-fill fields' : 'Select supplier first to enable invoices'}
            >
              <option value="">{supplierId ? 'None' : 'Select supplier first'}</option>
              {shipmentsForSelect.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.invoiceNumber} – {s.expectedShipmentDate ? formatDateForDoc(s.expectedShipmentDate) : 'No date'}
                </option>
              ))}
            </select>
            <span className="inline-flex items-center mt-2 text-slate-400" title="Choose an invoice to auto-fill invoice and shipment details. This requires company → supplier selection first.">
              <Info size={16} />
              <span className="sr-only">Choose an invoice to auto-fill invoice and shipment details. This requires company → supplier selection first.</span>
            </span>
          </div>
          <div>
            <label className={labelClass}>Payment mode</label>
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
          </div>
          {payMode === 'Advance' && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="bankAdvise"
                checked={includeBankAdvise}
                onChange={(e) => setIncludeBankAdvise(e.target.checked)}
              />
              <label htmlFor="bankAdvise" className="font-medium">Include BANK ADVISE</label>
            </div>
          )}
        </div>
        {payMode === 'Balance' && (
          <div className="mt-6">
            <label className={labelClass}>Document checklist</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {BALANCE_DOCS.map((d) => (
                <label key={d} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={balanceChecklist[d] ?? false}
                    onChange={(e) => setBalanceChecklist((prev) => ({ ...prev, [d]: e.target.checked }))}
                  />
                  <span className="text-sm">{d}</span>
                </label>
              ))}
            </div>
          </div>
        )}
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
