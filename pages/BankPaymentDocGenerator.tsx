import React, { useState, useMemo, useCallback } from 'react';
import { Supplier, Shipment, User } from '../types';
import { FileText, Landmark, Truck, Banknote, Loader2 } from 'lucide-react';
import { api } from '../api';

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
  const [goodsDesc, setGoodsDesc] = useState('');
  const [hsnCode, setHsnCode] = useState('');
  const [term, setTerm] = useState('');
  const [modeShipment, setModeShipment] = useState('SEA');
  const [qtyValue, setQtyValue] = useState('');
  const [qtyUnit, setQtyUnit] = useState('');

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const importShipments = useMemo(
    () => shipments.filter((s) => s.supplierId),
    [shipments]
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
      setGoodsDesc(p.description || p.name || '');
      setHsnCode(p.hsnCode || '');
    }
  }, []);

  const fillFromShipment = useCallback(
    (sh: Shipment) => {
      setInvoiceNo(sh.invoiceNumber || '');
      setInvoiceDate(sh.invoiceDate ? formatDateForDoc(sh.invoiceDate) : '');
      setShipmentDate(sh.expectedShipmentDate ? formatDateForDoc(sh.expectedShipmentDate) : '');
      setCurrency(sh.currency || 'USD');
      setAmount(String(sh.amount ?? ''));
      const invAmt = sh.amount != null ? Number(sh.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
      setInvoiceValueDiff(invAmt);
      setPortLoading(sh.portOfLoading || '');
      setPortDischarge(sh.portOfDischarge || '');
      setTerm(sh.incoTerm || '');
      if (sh.items?.length) {
        if (sh.items.length > 1) {
          setGoodsDesc(sh.items.map((i) => i.productName || i.description || '').filter(Boolean).join(', '));
          setHsnCode(sh.items.map((i) => i.hsnCode || '').filter(Boolean).join(', '));
          setQtyValue(sh.items.map((i) => `${i.quantity ?? ''} ${i.unit || 'KGS'}`).join(', '));
          setQtyUnit(sh.items[0].unit || 'KGS');
        } else {
          const first = sh.items[0];
          setQtyValue(String(first.quantity ?? ''));
          setQtyUnit(first.unit || 'KGS');
          setGoodsDesc((prev) => prev || first.productName || first.description || '');
          setHsnCode((prev) => prev || first.hsnCode || '');
        }
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
    if (!goodsDesc.trim()) return 'Goods Description is required.';
    if (!hsnCode.trim()) return 'HSN Code is required.';
    if (!term) return 'Please select IncoTerm.';
    if (!modeShipment) return 'Please select Shipment Mode.';
    if (!qtyValue.trim()) return 'Quantity value is required.';
    if (!qtyUnit) return 'Please select Quantity Unit.';
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
    const hasMultipleItems = selectedShipment?.items && selectedShipment.items.length > 1;

    let payload: Record<string, unknown>;
    if (hasMultipleItems && selectedShipment?.items) {
      const items = selectedShipment.items.map((i) => ({
        description: (i.productName || i.description || '').trim(),
        hsn_code: (i.hsnCode || '').trim(),
        quantity: i.quantity,
        unit: i.unit || 'KGS',
        amount: i.amount,
      }));
      const totalAmount = selectedShipment.amount ?? items.reduce((sum, i) => sum + (i.amount ?? 0), 0);
      const totalFormatted = totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const goodsDescStr = items.map((i) => i.description).filter(Boolean).join(', ');
      const hsnStr = items.map((i) => i.hsn_code).filter(Boolean).join(', ');
      const quantityStr = items.map((i) => `${i.quantity} ${i.unit}`).join(', ');
      const purpose = `PAYMENT FOR PURCHASE OF ${goodsDescStr.toUpperCase()}`;

      payload = {
        company_choice: companyLabel,
        date: formatDateForDoc(new Date().toISOString().slice(0, 10)),
        invoice_no: invoiceNo.trim(),
        invoice_date: invoiceDate.trim(),
        shipment_date: shipmentDate.trim(),
        currency: currency.trim(),
        raw_amount: amount.trim(),
        invoice_amount: totalFormatted,
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
    } else {
      const invoiceAmountVal = invoiceValueDiff.trim() || amtNum.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const quantityStr = `${qtyValue.trim()} ${qtyUnit}`;
      const purpose = `PAYMENT FOR PURCHASE OF ${(goodsDesc || '').toUpperCase()}`;
      payload = {
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
        goods_desc: goodsDesc.trim(),
        hsn_code: hsnCode.trim(),
        term: term.trim(),
        mode_shipment: modeShipment.trim(),
        document_list: documentListStr,
        items: [
          {
            description: goodsDesc.trim(),
            hsn_code: hsnCode.trim(),
            quantity: qtyValue.trim(),
            unit: qtyUnit,
            amount: invoiceAmountVal,
          },
        ],
      };
    }

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
      const raw = e?.message || 'Failed to generate document.';
      const friendly = (raw === 'Multi error' || String(raw).includes('Multi error'))
        ? 'One or more required fields are missing or invalid. Please check all sections (Company & Supplier, Remittance, Invoice, Supplier Information, Shipment & Goods) and try again.'
        : raw;
      setError(friendly);
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
              onChange={(e) => setCompanyChoice(e.target.value)}
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
              onChange={(e) => setSupplierId(e.target.value)}
            >
              <option value="">Select supplier...</option>
              {suppliers.map((s) => (
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
              {importShipments
                .filter((s) => !companyChoice || s.company === companyChoice)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.invoiceNumber} – {s.expectedShipmentDate?.slice(0, 10) || 'No date'}
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
            <label className={labelClass}>Quantity & Unit *</label>
            <div className="flex gap-2">
              <input
                type="text"
                className={inputClass}
                value={qtyValue}
                onChange={(e) => setQtyValue(e.target.value)}
                placeholder="Value"
              />
              <select className={inputClass} value={qtyUnit} onChange={(e) => setQtyUnit(e.target.value)}>
                <option value="">Select...</option>
                {QTY_UNITS.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
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
          <div>
            <label className={labelClass}>Goods Description *</label>
            <input className={inputClass} value={goodsDesc} onChange={(e) => setGoodsDesc(e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>HSN Code *</label>
            <input className={inputClass} value={hsnCode} onChange={(e) => setHsnCode(e.target.value)} />
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
