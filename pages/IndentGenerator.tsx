import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Buyer, User, DomesticBuyer, IndentProduct, IndentCartItem } from '../types';
import { FileText, Plus, Trash2, X, Package, Users, MapPin } from 'lucide-react';
import { api } from '../api';
import BuyerRequest from './BuyerRequest';
import DomesticBuyerForm from './DomesticBuyerForm';
import { useAutoSavedDraft } from '../hooks/useAutoSavedDraft';

const PAYMENT_TERMS = [
  'Payment Fully Advance',
  'Payment Before Delivery',
  'Payment Against Delivery',
  'Payment Within 7 Days',
  'Payment Within 15 Days',
  'Payment Within 30 Days',
  'Payment Within 45 Days',
  'Payment Within 60 Days',
];
const INCO_TERMS = ['CIF', 'FOB', 'EXW', 'CFR', 'DAP'];
const EXPORT_CURRENCIES = ['USD', 'GBP'];

interface IndentGeneratorProps {
  buyers: Buyer[];
  user: User;
  onAddBuyer: (b: Buyer) => Promise<void>;
}

export const IndentGenerator: React.FC<IndentGeneratorProps> = ({ buyers, user, onAddBuyer }) => {
  const [companies, setCompanies] = useState<string[]>([]);
  const [domesticBuyers, setDomesticBuyers] = useState<DomesticBuyer[]>([]);
  const [products, setProducts] = useState<IndentProduct[]>([]);
  const [txnType, setTxnType] = useState<'Domestic' | 'Export'>('Domestic');
  const [company, setCompany] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [ourRef, setOurRef] = useState('');
  const [buyerRef, setBuyerRef] = useState('');
  const [ordRef, setOrdRef] = useState('');
  const [indentDate, setIndentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [selectedBuyerId, setSelectedBuyerId] = useState('');
  const [selectedConsignee, setSelectedConsignee] = useState('');
  const [salesName, setSalesName] = useState('');
  const [salesMob, setSalesMob] = useState('');
  const [salesMail, setSalesMail] = useState('');
  const [incoterm, setIncoterm] = useState('');
  const [countryOrigin, setCountryOrigin] = useState('India');
  const [countryDest, setCountryDest] = useState('');
  const [portLoad, setPortLoad] = useState('');
  const [portDis, setPortDis] = useState('');
  const [shippingDate, setShippingDate] = useState('');
  const [validityDays, setValidityDays] = useState(30);
  const [paymentTerms, setPaymentTerms] = useState('');
  const [sampling, setSampling] = useState('');
  const [packaging, setPackaging] = useState('');
  const [terms, setTerms] = useState('');
  const [cart, setCart] = useState<IndentCartItem[]>([]);
  const [showProductModal, setShowProductModal] = useState(false);
  const [productModalQuality, setProductModalQuality] = useState('');
  const [showAddDomestic, setShowAddDomestic] = useState(false);
  const [showAddExport, setShowAddExport] = useState(false);
  const [generating, setGenerating] = useState(false);

  const restoreDraft = useCallback((draft: any) => {
    if (!draft || typeof draft !== 'object') return;
    if (draft.txnType === 'Domestic' || draft.txnType === 'Export') setTxnType(draft.txnType);
    if (typeof draft.company === 'string') setCompany(draft.company);
    if (typeof draft.currency === 'string') setCurrency(draft.currency);
    if (typeof draft.ourRef === 'string') setOurRef(draft.ourRef);
    if (typeof draft.buyerRef === 'string') setBuyerRef(draft.buyerRef);
    if (typeof draft.ordRef === 'string') setOrdRef(draft.ordRef);
    if (typeof draft.indentDate === 'string') setIndentDate(draft.indentDate);
    if (typeof draft.selectedBuyerId === 'string') setSelectedBuyerId(draft.selectedBuyerId);
    if (typeof draft.selectedConsignee === 'string') setSelectedConsignee(draft.selectedConsignee);
    if (typeof draft.salesName === 'string') setSalesName(draft.salesName);
    if (typeof draft.salesMob === 'string') setSalesMob(draft.salesMob);
    if (typeof draft.salesMail === 'string') setSalesMail(draft.salesMail);
    if (typeof draft.incoterm === 'string') setIncoterm(draft.incoterm);
    if (typeof draft.countryOrigin === 'string') setCountryOrigin(draft.countryOrigin);
    if (typeof draft.countryDest === 'string') setCountryDest(draft.countryDest);
    if (typeof draft.portLoad === 'string') setPortLoad(draft.portLoad);
    if (typeof draft.portDis === 'string') setPortDis(draft.portDis);
    if (typeof draft.shippingDate === 'string') setShippingDate(draft.shippingDate);
    if (typeof draft.validityDays === 'number' && Number.isFinite(draft.validityDays)) setValidityDays(draft.validityDays);
    if (typeof draft.paymentTerms === 'string') setPaymentTerms(draft.paymentTerms);
    if (typeof draft.sampling === 'string') setSampling(draft.sampling);
    if (typeof draft.packaging === 'string') setPackaging(draft.packaging);
    if (typeof draft.terms === 'string') setTerms(draft.terms);
    if (Array.isArray(draft.cart)) setCart(draft.cart);
  }, []);

  useAutoSavedDraft({
    key: 'indent-generator',
    data: {
      txnType,
      company,
      currency,
      ourRef,
      buyerRef,
      ordRef,
      indentDate,
      selectedBuyerId,
      selectedConsignee,
      salesName,
      salesMob,
      salesMail,
      incoterm,
      countryOrigin,
      countryDest,
      portLoad,
      portDis,
      shippingDate,
      validityDays,
      paymentTerms,
      sampling,
      packaging,
      terms,
      cart,
    },
    onRestore: restoreDraft,
    enabled: !generating,
    debounceMs: 700,
    version: '1',
  });

  useEffect(() => {
    (async () => {
      try {
        const [compRes, dom, prods] = await Promise.all([
          api.indent.getCompanies(),
          api.domesticBuyers.list(),
          api.indentProducts.list(),
        ]);
        setCompanies((compRes as { companies?: string[] })?.companies || []);
        setDomesticBuyers(Array.isArray(dom) ? dom : []);
        setProducts(Array.isArray(prods) ? prods : []);
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  const productsByQuality = useMemo(() => {
    const map: Record<string, IndentProduct[]> = {};
    products.forEach((p) => {
      if (!map[p.quality]) map[p.quality] = [];
      map[p.quality].push(p);
    });
    return map;
  }, [products]);

  const exportBuyersFiltered = useMemo(() => buyers.filter((b) => (b as any).status === 'APPROVED' || !(b as any).status), [buyers]);

  const selectedDomestic = domesticBuyers.find((b) => b.id === selectedBuyerId);
  const selectedExport = exportBuyersFiltered.find((b) => b.id === selectedBuyerId);

  const consigneeOptions = useMemo(() => {
    if (txnType === 'Domestic' && selectedDomestic) {
      const sites = selectedDomestic.sites?.filter((s) => s.siteName || s.shippingAddress) || [];
      if (sites.length === 0) return [{ id: 'same', label: 'Same as Billing' }];
      return sites.map((s) => ({ id: s.siteName || s.id, label: s.siteName || 'Ship site', site: s }));
    }
    if (txnType === 'Export' && selectedExport?.consignees?.length) {
      return selectedExport.consignees.map((c) => ({ id: c.id, label: c.name, addr: c.address }));
    }
    return [{ id: 'same', label: 'Same as Billing' }];
  }, [txnType, selectedDomestic, selectedExport]);

  useEffect(() => {
    if (txnType === 'Domestic' && selectedDomestic) {
      setSalesName(selectedDomestic.salesPersonName || '');
      setSalesMob(selectedDomestic.salesPersonMobile || '');
      setSalesMail(selectedDomestic.salesPersonEmail || '');
      setPaymentTerms(selectedDomestic.paymentTerms || '');
      setSelectedConsignee(consigneeOptions[0]?.id || '');
    }
    if (txnType === 'Export' && selectedExport) {
      setSalesName(selectedExport.salesPersonName || '');
      setSalesMob(selectedExport.salesPersonContact || '');
      setPaymentTerms('');
      setSelectedConsignee(consigneeOptions[0]?.id || '');
      setCountryDest(selectedExport.country || '');
    }
  }, [txnType, selectedBuyerId, selectedDomestic, selectedExport, consigneeOptions]);

  const buyerName = txnType === 'Domestic' ? selectedDomestic?.name : selectedExport?.name;
  const billAddr = txnType === 'Domestic' ? selectedDomestic?.billingAddress : selectedExport?.address;
  const buyerGst = txnType === 'Domestic' ? selectedDomestic?.gstNo : '';
  const buyerState = txnType === 'Domestic' ? selectedDomestic?.state : '';
  const shipSite =
    txnType === 'Domestic'
      ? (consigneeOptions.find((c) => c.id === selectedConsignee) as { site?: { siteName?: string; shippingAddress?: string } })?.site?.siteName ?? selectedDomestic?.billingAddress ?? ''
      : (consigneeOptions.find((c) => c.id === selectedConsignee) as { label?: string; addr?: string })?.label ?? selectedExport?.address ?? '';
  const shipAddr =
    txnType === 'Domestic'
      ? (consigneeOptions.find((c) => c.id === selectedConsignee) as { site?: { shippingAddress?: string } })?.site?.shippingAddress ?? selectedDomestic?.billingAddress ?? ''
      : (consigneeOptions.find((c) => c.id === selectedConsignee) as { addr?: string })?.addr ?? selectedExport?.address ?? '';
  const shipContact = txnType === 'Domestic' ? selectedDomestic?.mobile : selectedExport?.contactNumber || selectedExport?.contactDetails || '';

  const currencyDisplay = txnType === 'Export' ? currency : 'INR';

  const openProductModal = (quality: string) => {
    setShowProductModal(true);
    setProductModalQuality(quality);
  };

  const addToCart = (items: { product: IndentProduct; qty: number; rate: number }[]) => {
    const newItems: IndentCartItem[] = items.map(({ product, qty, rate }) => ({
      quality: product.quality,
      desc: product.description || '',
      design: product.designNo || '',
      shade: product.shadeNo || '',
      hsn: product.hsnCode || '',
      unit: product.unit || 'MTR',
      qty,
      rate,
      amount: qty * rate,
      buyerRef: `${product.designNo || ''} / ${product.shadeNo || ''}`,
    }));
    setCart((prev) => [...prev, ...newItems]);
    setShowProductModal(false);
    setProductModalQuality('');
  };

  const removeCartItem = (index: number) => setCart((prev) => prev.filter((_, i) => i !== index));
  const subtotal = cart.reduce((s, i) => s + i.amount, 0);

  const handleGenerate = async () => {
    if (!company || !ourRef.trim() || !buyerRef.trim() || !buyerName || !cart.length) {
      alert('Please fill Company, Our Ref, Buyer Ref, select Buyer, and add at least one item.');
      return;
    }
    setGenerating(true);
    try {
      const payload = {
        company,
        txnType,
        currency: currencyDisplay,
        ourRef: ourRef.trim(),
        buyerRef: buyerRef.trim(),
        ordRef: ordRef.trim(),
        date: indentDate,
        buyerName,
        billAddr: billAddr || '',
        buyerGst: buyerGst || '',
        buyerState: buyerState || '',
        countryDest: txnType === 'Export' ? countryDest : undefined,
        shipSite: shipSite || '',
        shipAddr: shipAddr || '',
        shipContact: shipContact || '',
        salesName,
        salesMob,
        salesMail,
        incoterm: txnType === 'Export' ? incoterm : undefined,
        countryOrigin: txnType === 'Export' ? countryOrigin : undefined,
        portLoad: txnType === 'Export' ? portLoad : undefined,
        portDis: txnType === 'Export' ? portDis : undefined,
        shippingDate: txnType === 'Export' ? shippingDate : undefined,
        validityDays: txnType === 'Export' ? validityDays : undefined,
        items: cart,
        subtotal,
        paymentTerms,
        sampling,
        packaging,
        terms,
      };
      const blob = await api.indent.generate(payload);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Indent_${ourRef.replace(/\s/g, '_')}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(e?.message || 'Failed to generate document.');
    } finally {
      setGenerating(false);
    }
  };

  const handleAddDomestic = async (b: DomesticBuyer) => {
    await api.domesticBuyers.create(b);
    const list = await api.domesticBuyers.list();
    setDomesticBuyers(Array.isArray(list) ? list : []);
    setSelectedBuyerId(b.id);
    setShowAddDomestic(false);
  };

  const handleAddExport = async (b: Buyer) => {
    await onAddBuyer(b);
    setSelectedBuyerId(b.id);
    setShowAddExport(false);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-24">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Sales Indent Generator</h1>
          <p className="text-slate-500 font-medium">Create proforma indents for domestic and export buyers.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setShowAddDomestic(true)}
            className="px-4 py-3 md:py-2.5 rounded-xl bg-rose-50 text-rose-600 font-bold text-sm hover:bg-rose-100 flex items-center gap-2 min-h-[44px] md:min-h-0"
          >
            <Plus size={16} /> Domestic Buyer
          </button>
          <button
            type="button"
            onClick={() => setShowAddExport(true)}
            className="px-4 py-3 md:py-2.5 rounded-xl bg-amber-50 text-amber-600 font-bold text-sm hover:bg-amber-100 flex items-center gap-2 min-h-[44px] md:min-h-0"
          >
            <Plus size={16} /> Export Buyer
          </button>
        </div>
      </header>

      {/* Company & Type */}
      <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
        <h2 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2"><FileText className="text-rose-600" size={20} /> Company & Type</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-bold text-slate-500 uppercase tracking-wide mb-2">Company *</label>
            <select required className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-rose-500" value={company} onChange={(e) => setCompany(e.target.value)}>
              <option value="">Select company...</option>
              {companies.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-500 uppercase tracking-wide mb-2">Type</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="txnType" checked={txnType === 'Domestic'} onChange={() => { setTxnType('Domestic'); setSelectedBuyerId(''); }} />
                <span className="font-semibold">Domestic</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="txnType" checked={txnType === 'Export'} onChange={() => { setTxnType('Export'); setSelectedBuyerId(''); }} />
                <span className="font-semibold">Export</span>
              </label>
            </div>
          </div>
          {txnType === 'Export' && (
            <div>
              <label className="block text-sm font-bold text-slate-500 uppercase tracking-wide mb-2">Currency</label>
              <select className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {EXPORT_CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Refs & Date */}
      <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
        <h2 className="text-lg font-bold text-slate-900 mb-6">References</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div>
            <label className="block text-sm font-bold text-slate-500 uppercase tracking-wide mb-2">Our Ref *</label>
            <input required className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-rose-500" value={ourRef} onChange={(e) => setOurRef(e.target.value)} placeholder="e.g. IND/24/001" />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-500 uppercase tracking-wide mb-2">Buyer PO No *</label>
            <input required className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-rose-500" value={buyerRef} onChange={(e) => setBuyerRef(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-500 uppercase tracking-wide mb-2">Order Ref</label>
            <input className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-rose-500" value={ordRef} onChange={(e) => setOrdRef(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-500 uppercase tracking-wide mb-2">Indent Date</label>
            <input type="date" className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-rose-500" value={indentDate} onChange={(e) => setIndentDate(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Buyer & Consignee */}
      <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
        <h2 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2"><Users className="text-rose-600" size={20} /> Buyer & Consignee</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-bold text-slate-500 uppercase tracking-wide mb-2">Buyer *</label>
            <select required className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-rose-500" value={selectedBuyerId} onChange={(e) => setSelectedBuyerId(e.target.value)}>
              <option value="">Select buyer...</option>
              {txnType === 'Domestic'
                ? domesticBuyers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)
                : exportBuyersFiltered.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-500 uppercase tracking-wide mb-2">Consignee</label>
            <select className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-rose-500" value={selectedConsignee} onChange={(e) => setSelectedConsignee(e.target.value)}>
              {consigneeOptions.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
          <div>
            <label className="block text-sm font-bold text-slate-500 uppercase tracking-wide mb-2">Sales Name</label>
            <input className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-rose-500" value={salesName} onChange={(e) => setSalesName(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-500 uppercase tracking-wide mb-2">Sales Mobile</label>
            <input className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-rose-500" value={salesMob} onChange={(e) => setSalesMob(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-500 uppercase tracking-wide mb-2">Sales Email</label>
            <input type="email" className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-rose-500" value={salesMail} onChange={(e) => setSalesMail(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Export logistics */}
      {txnType === 'Export' && (
        <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
          <h2 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2"><MapPin className="text-rose-600" size={20} /> Logistics</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-bold text-slate-500 uppercase tracking-wide mb-2">Incoterm</label>
              <select className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50" value={incoterm} onChange={(e) => setIncoterm(e.target.value)}>
                <option value="">Select...</option>
                {INCO_TERMS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-500 uppercase tracking-wide mb-2">Country of Origin</label>
              <input className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50" value={countryOrigin} onChange={(e) => setCountryOrigin(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-500 uppercase tracking-wide mb-2">Country of Destination</label>
              <input className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50" value={countryDest} onChange={(e) => setCountryDest(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-500 uppercase tracking-wide mb-2">Port of Loading</label>
              <input className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50" value={portLoad} onChange={(e) => setPortLoad(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-500 uppercase tracking-wide mb-2">Port of Discharge</label>
              <input className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50" value={portDis} onChange={(e) => setPortDis(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-500 uppercase tracking-wide mb-2">Shipping Date</label>
              <input type="date" className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50" value={shippingDate} onChange={(e) => setShippingDate(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-500 uppercase tracking-wide mb-2">Validity (Days)</label>
              <input type="number" min={1} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50" value={validityDays} onChange={(e) => setValidityDays(parseInt(e.target.value, 10) || 30)} />
            </div>
          </div>
        </div>
      )}

      {/* Products & Cart */}
      <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
        <h2 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2"><Package className="text-rose-600" size={20} /> Product Items</h2>
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <label className="text-sm font-bold text-slate-600">Add items by quality:</label>
          <select
            value=""
            onChange={(e) => {
              const q = e.target.value;
              if (q) {
                openProductModal(q);
                e.target.value = '';
              }
            }}
            className="min-w-[220px] px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-rose-500 font-medium"
          >
            <option value="">Select quality...</option>
            {Object.keys(productsByQuality).sort().map((q) => (
              <option key={q} value={q}>{q}</option>
            ))}
          </select>
          {Object.keys(productsByQuality).length === 0 && <p className="text-slate-500 text-sm">No products. Add products under Indent Products or import from Excel.</p>}
        </div>
        <div className="border border-slate-200 rounded-xl overflow-hidden overflow-x-auto scroll-touch">
          <table className="w-full text-sm min-w-[500px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-3 text-left font-black text-slate-500 uppercase">S.No</th>
                <th className="px-4 py-3 text-left font-black text-slate-500 uppercase">Quality</th>
                <th className="px-4 py-3 text-left font-black text-slate-500 uppercase">Ref</th>
                <th className="px-4 py-3 text-right font-black text-slate-500 uppercase">Qty</th>
                <th className="px-4 py-3 text-right font-black text-slate-500 uppercase">Rate</th>
                <th className="px-4 py-3 text-right font-black text-slate-500 uppercase">Amount</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {cart.map((item, idx) => (
                <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50/50">
                  <td className="px-4 py-3">{idx + 1}</td>
                  <td className="px-4 py-3 font-medium">{item.quality}</td>
                  <td className="px-4 py-3 text-slate-600">{item.buyerRef}</td>
                  <td className="px-4 py-3 text-right">{item.qty} {item.unit}</td>
                  <td className="px-4 py-3 text-right">{item.rate.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right font-semibold">{item.amount.toFixed(2)}</td>
                  <td className="px-2 py-3">
                    <button type="button" onClick={() => removeCartItem(idx)} className="p-1 text-slate-300 hover:text-red-500"><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {cart.length > 0 && (
            <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 text-right font-bold text-slate-900">
              Subtotal ({currencyDisplay}): {subtotal.toFixed(2)}
            </div>
          )}
        </div>
      </div>

      {/* Terms */}
      <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
        <h2 className="text-lg font-bold text-slate-900 mb-6">Terms & Notes</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-500 uppercase tracking-wide mb-2">Payment Terms</label>
            <select className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)}>
              <option value="">Select...</option>
              {PAYMENT_TERMS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-500 uppercase tracking-wide mb-2">Sampling Requirements</label>
            <textarea rows={2} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-rose-500" value={sampling} onChange={(e) => setSampling(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-500 uppercase tracking-wide mb-2">Packaging Requirements</label>
            <textarea rows={2} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-rose-500" value={packaging} onChange={(e) => setPackaging(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-500 uppercase tracking-wide mb-2">Notes</label>
            <textarea rows={2} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-rose-500" value={terms} onChange={(e) => setTerms(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button type="button" onClick={handleGenerate} disabled={generating || !company || !ourRef.trim() || !buyerRef.trim() || !buyerName || cart.length === 0} className="px-10 py-4 bg-rose-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-xl hover:bg-rose-700 disabled:opacity-50 flex items-center gap-2 min-h-[44px] md:min-h-0">
          <FileText size={20} /> {generating ? 'Generating...' : 'Generate Word'}
        </button>
      </div>

      {/* Product selection modal */}
      {showProductModal && productModalQuality && (
        <ProductSelectModal
          quality={productModalQuality}
          items={productsByQuality[productModalQuality] || []}
          currency={currencyDisplay}
          onAdd={(items) => addToCart(items)}
          onClose={() => { setShowProductModal(false); setProductModalQuality(''); }}
        />
      )}

      {showAddDomestic && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-slate-50 w-full max-w-3xl max-h-[90vh] rounded-[2.5rem] shadow-2xl overflow-y-auto p-8 relative">
            <button onClick={() => setShowAddDomestic(false)} className="absolute top-8 right-8 p-2 hover:bg-slate-200 rounded-full"><X size={24} /></button>
            <DomesticBuyerForm onSubmit={handleAddDomestic} onCancel={() => setShowAddDomestic(false)} />
          </div>
        </div>
      )}

      {showAddExport && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-slate-50 w-full max-w-5xl max-h-[90vh] rounded-[2.5rem] shadow-2xl overflow-y-auto p-8 relative">
            <button onClick={() => setShowAddExport(false)} className="absolute top-8 right-8 p-2 hover:bg-slate-200 rounded-full"><X size={24} /></button>
            <BuyerRequest user={user} onSubmit={handleAddExport} onCancel={() => setShowAddExport(false)} />
          </div>
        </div>
      )}
    </div>
  );
};

function ProductSelectModal({
  quality,
  items,
  currency,
  onAdd,
  onClose,
}: {
  quality: string;
  items: IndentProduct[];
  currency: string;
  onAdd: (selected: { product: IndentProduct; qty: number; rate: number }[]) => void;
  onClose: () => void;
}) {
  const rateKey = currency === 'USD' ? 'rateUsd' : currency === 'GBP' ? 'rateGbp' : 'rateInr';
  const [selected, setSelected] = useState<Record<string, { qty: number; rate: number }>>({});

  const setRow = (id: string, qty: number, rate: number) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (qty > 0) next[id] = { qty, rate }; else delete next[id];
      return next;
    });
  };

  const handleAdd = () => {
    const entries = Object.entries(selected) as Array<[string, { qty: number; rate: number }]>;
    const toAdd = entries
      .filter(([, v]) => v.qty > 0)
      .map(([id, v]) => {
        const product = items.find((p) => p.id === id)!;
        return { product, qty: v.qty, rate: v.rate };
      });
    if (toAdd.length) onAdd(toAdd);
    onClose();
  };

  const selectedCount = (Object.values(selected) as Array<{ qty: number; rate: number }>).filter((v) => v.qty > 0).length;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-[2rem] shadow-2xl overflow-hidden flex flex-col">
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-black text-slate-900">Products under: {quality}</h2>
              <p className="text-sm text-slate-500 mt-1">Enter quantity and rate for each line (change rate if needed), then click Add to cart.</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors" aria-label="Close"><X size={22} className="text-slate-500" /></button>
          </div>
        </div>
        <div className="overflow-y-auto overflow-x-auto flex-1 min-h-0">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="sticky top-0 bg-slate-50 z-10">
              <tr className="border-b border-slate-200">
                <th className="px-4 py-3 text-left font-black text-slate-500 uppercase text-xs">Design</th>
                <th className="px-4 py-3 text-left font-black text-slate-500 uppercase text-xs">Shade</th>
                <th className="px-4 py-3 text-left font-black text-slate-500 uppercase text-xs">Description</th>
                <th className="px-4 py-3 text-right font-black text-slate-500 uppercase text-xs w-28">Rate ({currency})</th>
                <th className="px-4 py-3 text-right font-black text-slate-500 uppercase text-xs w-24">Quantity</th>
                <th className="px-4 py-3 text-center font-black text-slate-500 uppercase text-xs w-20">In cart</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => {
                const defaultRate = (p as any)[rateKey] ?? 0;
                const s = selected[p.id];
                const qty = s?.qty ?? 0;
                const rate = s?.rate ?? defaultRate;
                return (
                  <tr key={p.id} className="border-b border-slate-100 hover:bg-rose-50/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-900">{p.designNo || '—'}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{p.shadeNo || '—'}</td>
                    <td className="px-4 py-3 text-slate-600 max-w-xs">{p.description || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <input type="number" min={0} step={0.01} className="w-full max-w-[100px] px-3 py-2 rounded-lg border border-slate-200 text-right outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent" value={rate || ''} onChange={(e) => setRow(p.id, qty, parseFloat(e.target.value) || 0)} placeholder="0" />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <input type="number" min={0} step={0.01} className="w-full max-w-[80px] px-3 py-2 rounded-lg border border-slate-200 text-right outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent" value={qty || ''} onChange={(e) => setRow(p.id, parseFloat(e.target.value) || 0, rate)} placeholder="0" />
                    </td>
                    <td className="px-4 py-3 text-center">
                      {qty > 0 ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-700">{qty} × {rate}</span> : <span className="text-slate-300">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between gap-4">
          <p className="text-sm text-slate-600">
            {selectedCount > 0 ? <><strong>{selectedCount} line(s)</strong> with qty &gt; 0 will be added to cart.</> : 'Enter quantity (and rate if needed) for the lines you want to add.'}
          </p>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="px-5 py-3 md:py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-200 transition-colors min-h-[44px] md:min-h-0">Cancel</button>
            <button type="button" onClick={handleAdd} disabled={selectedCount === 0} className="px-6 py-3 md:py-2.5 rounded-xl font-bold bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50 disabled:pointer-events-none transition-colors shadow-lg shadow-rose-100 min-h-[44px] md:min-h-0">
              Add to cart
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default IndentGenerator;

