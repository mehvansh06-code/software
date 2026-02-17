import React, { useState, useMemo, useCallback } from 'react';
import { Supplier, Shipment, User } from '../types';
import { FileText, Landmark, Truck, Banknote, Loader2, Plus, Trash2 } from 'lucide-react';
import { api } from '../api';

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
  const [shipmentDate, setShipmentDate] = useState('');
  const [beneficiaryName, setBeneficiaryName] = useState('');
  const [beneficiaryAddress, setBeneficiaryAddress] = useState('');
  const [beneficiaryCountry, setBeneficiaryCountry] = useState('');
  const [beneficiaryAccount, setBeneficiaryAccount] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankSwift, setBankSwift] = useState('');
  const [bankAddress, setBankAddress] = useState('');
  const [portLoading, setPortLoading] = useState('');
  const [portDischarge, setPortDischarge] = useState('');
  const [term, setTerm] = useState('');
  const [modeShipment, setModeShipment] = useState('SEA');
  const [productLines, setProductLines] = useState<ProductLine[]>(() => [newProductLine('1')]);

  const [generating, setGenerating] = useState(false);
  const nextIdRef = React.useRef(2);
  const [error, setError] = useState<string | null>(null);

  const importShipments = useMemo(
    () => shipments.filter((s) => s.supplierId),
    [shipments]
  );

  /** Suppliers that have at least one running import shipment for the selected importer (company). */
  const suppliersForSelect = useMemo(() => {
    if (!companyChoice) return suppliers.filter((s) => importShipments.some((sh) => sh.supplierId === s.id));
    return suppliers.filter((s) =>
      importShipments.some((sh) => sh.supplierId === s.id && sh.company === companyChoice)
    );
  }, [suppliers, importShipments, companyChoice]);

  /** Shipments for the selected importer and supplier (only that supplier's when supplier selected). */
  const shipmentsForSelect = useMemo(
    () =>
      importShipments.filter(
        (s) =>
          (!companyChoice || s.company === companyChoice) &&
          (!supplierId || s.supplierId === supplierId)
      ),
    [importShipments, companyChoice, supplierId]
  );

  const selectedSupplier = useMemo(
    () => suppliers.find((s) => s.id === supplierId),
    [suppliers, supplierId]
  );

  const selectedShipment = useMemo(
    () => importShipments.find((s) => s.id === shipmentId),
    [importShipments, shipmentId]
  );

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
        if (next.length) next[0] = { ...next[0], description: p.description || p.name || '', hsnCode: p.hsnCode || '' };
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
      setPortDischarge(sh.portOfDischarge || '');
      setTerm(sh.incoTerm || '');
      if (sh.items?.length) {
        setProductLines(
          sh.items.map((i, idx) => ({
            id: `ship-${idx}-${i.productId || idx}`,
            description: (i.productName || i.description || '').trim(),
            hsnCode: (i.hsnCode || '').trim(),
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
  }, [supplierId]);

  React.useEffect(() => {
    if (selectedShipment) fillFromShipment(selectedShipment);
  }, [shipmentId]);

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
      prev.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );
  }, []);

  const buildDocumentList = (): string[] => {
    if (payMode === 'Advance') {
      const list = [...ADVANCE_DOCS];
      if (includeBankAdvise) list.push('BANK ADVISE');
      return list;
    }
    return BALANCE_DOCS.filter((d) => balanceChecklist[d]);
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
      parseInvoiceValue(invoiceValueDiff) ?? totalFromItems ?? (selectedShipment?.amount ?? null);
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
      if (!row.hsnCode.trim()) return `Product line ${i + 1}: HSN code is required.`;
      if (!row.quantity.trim()) return `Product line ${i + 1}: Quantity is required.`;
      if (!row.unit) return `Product line ${i + 1}: Unit is required.`;
      const amt = parseFloat(row.amount);
      if (productLines.length > 1 && (Number.isNaN(amt) || amt < 0)) return `Product line ${i + 1}: Amount must be a number ≥ 0.`;
    }
    return null;
  };

  const handleGenerate = async () => {
    setError(null);
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    const companyLabel = companyChoice === 'GFPL' ? 'Gujarat Flotex Pvt Ltd' : 'GTEX Fabrics';
    const docList = buildDocumentList();
    const documentListStr = docList.map((item, i) => `${i + 1}.       ${item}`).join('\n') + '\n';
    const amtNum = parseFloat(amount);

    const items = productLines.map((row) => {
      const qtyNum = parseFloat(row.quantity);
      const amt = row.amount.trim() ? parseFloat(row.amount) : null;
      return {
        description: row.description.trim(),
        hsn_code: row.hsnCode.trim(),
        quantity: Number.isNaN(qtyNum) ? row.quantity : qtyNum,
        unit: row.unit || 'KGS',
        amount: amt != null && !Number.isNaN(amt) ? amt : (productLines.length === 1 ? amtNum : 0),
      };
    });

    const goodsDescStr = items.map((i) => i.description).filter(Boolean).join(', ');
    const hsnStr = items.map((i) => i.hsn_code).filter(Boolean).join(', ');
    const quantityStr = items.map((i) => `${i.quantity} ${i.unit}`).join(', ');
    const purpose = `PAYMENT FOR PURCHASE OF ${goodsDescStr.toUpperCase()}`;

    const totalFromItems = items.reduce((sum, i) => sum + (typeof i.amount === 'number' ? i.amount : 0), 0);
    const invoiceAmountVal =
      invoiceValueDiff.trim() ||
      (totalFromItems > 0 ? totalFromItems.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : amtNum.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

    const payload: Record<string, unknown> = {
      company_choice: companyLabel,
      date: formatDateForDoc(new Date().toISOString().slice(0, 10)),
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
      bank_name: bankName.trim(),
      bank_swift: bankSwift.trim(),
      bank_address: bankAddress.trim(),
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
      a.download = `BankPayment_${invoiceNo.replace(/\s/g, '_')}_${currency}.docx`;
      a.click();
      URL.revokeObjectURL(url);
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
  const cardClass = 'bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100';

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-24">
      <header>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Bank Import Payment Document Generator</h1>
        <p className="text-slate-500 font-medium mt-1">Generate payment documents for bank submission using supplier and shipment data.</p>
      </header>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-4 py-3 font-medium">
          {error}
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
              }}
            >
              <option value="">Select company...</option>
              {COMPANY_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Supplier *</label>
            <select
              required
              className={inputClass}
              value={supplierId}
              onChange={(e) => {
                const v = e.target.value;
                setSupplierId(v);
                const keepShipment = v && importShipments.some((s) => s.id === shipmentId && s.supplierId === v);
                if (!keepShipment) setShipmentId('');
              }}
            >
              <option value="">Select supplier...</option>
              {suppliersForSelect.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>Pre-fill from shipment (optional)</label>
            <select
              className={inputClass}
              value={shipmentId}
              onChange={(e) => setShipmentId(e.target.value)}
            >
              <option value="">None</option>
              {shipmentsForSelect.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.invoiceNumber} – {s.expectedShipmentDate ? formatDateForDoc(s.expectedShipmentDate) : 'No date'}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Payment mode</label>
            <div className="flex gap-6">
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
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
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
          <div className="flex items-center justify-between mb-4">
            <label className={labelClass}>Product lines *</label>
            <button
              type="button"
              onClick={addProductLine}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 font-medium hover:bg-indigo-100 text-sm"
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
                    placeholder="HSN"
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
                <div className="md:col-span-1 flex justify-end">
                  <button
                    type="button"
                    onClick={() => removeProductLine(row.id)}
                    disabled={productLines.length <= 1}
                    className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
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

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating}
          className="px-8 py-3.5 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg"
        >
          {generating ? <Loader2 size={18} className="animate-spin" /> : <FileText size={18} />}
          {generating ? 'Generating...' : 'Generate documents'}
        </button>
      </div>
    </div>
  );
};

export default BankPaymentDocGenerator;
