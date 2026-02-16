
import React, { useState, useMemo, useEffect } from 'react';
import { Supplier, Shipment, ShipmentStatus, Licence, Buyer, Consignee, ProductType, LicenceType, ShipmentItem, STANDARDISED_UNITS, MasterProduct, Material, LetterOfCredit, LCStatus } from '../types';
import { UploadCloud, Award, CreditCard, Package, Zap, Trash2, CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatCurrency, formatINR, formatDate, COMPANY_OPTIONS } from '../constants';
import { api } from '../api';
import { MASTER_PRODUCTS } from '../sampleData';

interface NewShipmentProps {
  suppliers?: Supplier[];
  buyers?: Buyer[];
  licences?: Licence[];
  lcs?: LetterOfCredit[];
  isExport?: boolean;
  onSubmit: (shipment: Shipment) => Promise<void>;
}

const NewShipment: React.FC<NewShipmentProps> = ({ suppliers = [], buyers = [], licences: licencesProp, lcs = [], isExport = false, onSubmit }) => {
  const navigate = useNavigate();
  const [licencesLocal, setLicencesLocal] = useState<Licence[]>([]);
  const licences = (licencesProp != null && Array.isArray(licencesProp)) ? licencesProp : licencesLocal;
  const [materials, setMaterials] = useState<Material[]>([]);
  const [selectedEntityId, setSelectedEntityId] = useState('');

  const [currentItems, setCurrentItems] = useState<ShipmentItem[]>([]);
  const [activeItem, setActiveItem] = useState({ productId: '', description: '', quantity: '', rate: '', unit: 'KGS' });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [invoiceUploaded, setInvoiceUploaded] = useState(false);

  const [formData, setFormData] = useState<any>({
    currency: isExport ? 'USD' : 'USD',
    exchangeRate: '',
    incoTerm: 'FOB',
    invoiceNumber: '',
    company: 'GFPL',
    expectedShipmentDate: '',
    expectedArrivalDate: '',
    invoiceDate: '',
    freightCharges: '',
    otherCharges: '',
    paymentDueDate: '',
    isUnderLC: false,
    lcNumber: '',
    linkedLcId: '' as string,
    lcDate: '',
    isUnderLicence: false,
    linkedLicenceId: '',
    fobValueFC: '',
    portOfLoading: '',
    portOfDischarge: '',
    amountFC: '', // Export: single amount in foreign currency (no product selection)
    exportLicenceType: '' as '' | LicenceType, // Export: manual licence type when linking
    lcAmount: undefined as number | undefined,
    hasCOO: false, // Certificate of Origin (if any) — only then add to document ledger
    consigneeId: '' as string, // Export: selected consignee (from buyer.consignees)
  });

  useEffect(() => {
    const loadData = async () => {
      try {
        const [licData, matData] = await Promise.all([
          licencesProp != null ? Promise.resolve(null) : api.licences.list(),
          api.materials.list()
        ]);
        if (licencesProp == null) setLicencesLocal(licData || []);
        setMaterials(Array.isArray(matData) ? matData : []);
      } catch (e) {
        console.error("Data load failed", e);
      }
    };
    loadData();
  }, [licencesProp]);

  const approvedSuppliers = useMemo(() => suppliers.filter(s => s.status === 'APPROVED'), [suppliers]);
  const approvedBuyers = useMemo(() => buyers.filter(b => b.status === 'APPROVED'), [buyers]);
  // Use all partners for dropdown so list is never empty when any exist (approved or pending)
  const partnerSuppliers = suppliers.length ? suppliers : approvedSuppliers;
  const partnerBuyers = buyers.length ? buyers : approvedBuyers;

  const selectedBuyer = useMemo(() => {
    if (!isExport || !selectedEntityId) return null;
    return buyers.find(b => b.id === selectedEntityId) || approvedBuyers.find(b => b.id === selectedEntityId) || null;
  }, [isExport, selectedEntityId, buyers, approvedBuyers]);
  const consigneesForBuyer = useMemo(() => {
    if (!selectedBuyer?.hasConsignee || !selectedBuyer.consignees?.length) return [];
    return selectedBuyer.consignees;
  }, [selectedBuyer]);


  const availableProducts = useMemo(() => {
    if (isExport) return MASTER_PRODUCTS;
    return materials.map(m => ({ id: m.id, name: m.name, hsnCode: m.hsnCode || '', type: (m.type === 'CAPITAL_GOOD' ? ProductType.CAPITAL_GOOD : ProductType.RAW_MATERIAL) as any, unit: m.unit }));
  }, [isExport, materials]);

  const handleAddItem = () => {
    const product = availableProducts.find(p => p.id === activeItem.productId);
    if (!product || !activeItem.quantity || !activeItem.rate) {
      alert("Please select a material/product and specify quantity and rate.");
      return;
    }

    let derivedType = ProductType.RAW_MATERIAL;
    if (isExport) {
      const mp = product as MasterProduct;
      derivedType = mp.category === 'MACHINERY' ? ProductType.CAPITAL_GOOD : ProductType.RAW_MATERIAL;
    } else {
      derivedType = (product as any).type === ProductType.CAPITAL_GOOD ? ProductType.CAPITAL_GOOD : ProductType.RAW_MATERIAL;
    }

    const qty = parseFloat(activeItem.quantity);
    const rate = parseFloat(activeItem.rate);
    const newItem: ShipmentItem = {
      productId: product.id,
      productName: product.name,
      description: activeItem.description || undefined,
      hsnCode: product.hsnCode,
      quantity: qty,
      unit: activeItem.unit.toUpperCase(),
      rate: rate,
      amount: qty * rate,
      productType: derivedType
    };

    setCurrentItems([...currentItems, newItem]);
    setActiveItem({ productId: '', description: '', quantity: '', rate: '', unit: 'KGS' });
  };

  const removeTableItem = (idx: number) => {
    setCurrentItems(currentItems.filter((_, i) => i !== idx));
  };

  const subtotalAmount = useMemo(() => currentItems.reduce((sum, item) => sum + item.amount, 0), [currentItems]);
  const freight = !isExport ? (parseFloat(formData.freightCharges) || 0) : 0;
  const otherCharges = !isExport ? (parseFloat(formData.otherCharges) || 0) : 0;
  const totalAmount = subtotalAmount + freight + otherCharges;
  
  const detectedLicenceType = useMemo(() => {
    if (isExport) return null; // Export uses amount-only; licence type can be set manually below
    if (currentItems.length === 0) return null;
    const hasCapitalGoods = currentItems.some(i => i.productType === ProductType.CAPITAL_GOOD);
    return hasCapitalGoods ? LicenceType.EPCG : LicenceType.ADVANCE;
  }, [isExport, currentItems]);

  const filteredLicences = useMemo(() => {
    const type = isExport ? (formData as any).exportLicenceType : detectedLicenceType;
    const byCompany = licences.filter(l => l.company === formData.company && l.status === 'ACTIVE');
    if (type) return byCompany.filter(l => l.type === type);
    return byCompany;
  }, [licences, formData.company, detectedLicenceType, isExport, formData]);

  /** Import: open LCs for the selected supplier (for LC dropdown) */
  const lcsForSupplier = useMemo(() => {
    if (isExport || !selectedEntityId) return [];
    return lcs.filter(lc => lc.supplierId === selectedEntityId && lc.status === LCStatus.OPEN);
  }, [lcs, selectedEntityId, isExport]);

  const handleChange = (field: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isExport) {
      const amt = parseFloat(formData.amountFC);
      if (!selectedEntityId) return alert('Select a partner.');
      if (!amt || amt <= 0) return alert('Enter amount in foreign currency.');
    } else {
      if (currentItems.length === 0) return alert('Add at least one product to the list.');
      if (!selectedEntityId) return alert('Select a partner.');
    }

    setIsSubmitting(true);
    try {
      const exchRate = parseFloat(formData.exchangeRate) || 1;
      const totalOrAmountFC = isExport ? parseFloat(formData.amountFC) || 0 : totalAmount;
      const finalFobFC = parseFloat(formData.fobValueFC) || totalOrAmountFC;
      const itemsToUse = isExport
        ? [{ productId: 'export', productName: 'Export value', hsnCode: '', quantity: 1, unit: 'NOS', rate: totalOrAmountFC, amount: totalOrAmountFC, productType: ProductType.RAW_MATERIAL }]
        : currentItems;
      const partner = isExport
         ? (buyers.find(b => b.id === selectedEntityId) || approvedBuyers.find(b => b.id === selectedEntityId))
         : (suppliers.find(s => s.id === selectedEntityId) || approvedSuppliers.find(s => s.id === selectedEntityId));
      const newShipment: Shipment = {
        id: Math.random().toString(36).substr(2, 9),
        supplierId: !isExport ? selectedEntityId : undefined,
        buyerId: isExport ? selectedEntityId : undefined,
        consigneeId: isExport && formData.consigneeId ? formData.consigneeId : undefined,
        items: itemsToUse,
        rate: itemsToUse[0].rate,
        quantity: itemsToUse[0].quantity,
        amount: totalOrAmountFC,
        currency: formData.currency,
        exchangeRate: exchRate,
        incoTerm: formData.incoTerm,
        invoiceNumber: formData.invoiceNumber,
        company: formData.company,
        expectedShipmentDate: isExport ? formData.expectedShipmentDate : (formData.invoiceDate || ''),
        expectedArrivalDate: undefined,
        invoiceDate: isExport ? (formData.invoiceDate || undefined) : formData.invoiceDate,
        freightCharges: !isExport ? (parseFloat(formData.freightCharges) || 0) : undefined,
        otherCharges: !isExport ? (parseFloat(formData.otherCharges) || 0) : undefined,
        paymentDueDate: isExport ? undefined : (formData.paymentDueDate || undefined),
        fobValueFC: finalFobFC,
        fobValueINR: finalFobFC * exchRate,
        isUnderLC: formData.isUnderLC,
        lcNumber: formData.lcNumber || undefined,
        linkedLcId: formData.isUnderLC && formData.linkedLcId ? formData.linkedLcId : undefined,
        lcAmount: formData.isUnderLC ? (typeof formData.lcAmount === 'number' ? formData.lcAmount : (formData.lcAmount ? parseFloat(formData.lcAmount) : (isExport ? totalOrAmountFC : 0))) : 0,
        lcDate: formData.lcDate || undefined,
        isUnderLicence: formData.isUnderLicence,
        linkedLicenceId: formData.isUnderLicence ? formData.linkedLicenceId : undefined,
        licenceObligationAmount: 0,
        createdAt: new Date().toISOString(),
        status: ShipmentStatus.INITIATED,
        history: [{
            status: ShipmentStatus.INITIATED,
            date: new Date().toISOString(),
            location: 'System Origin',
            remarks: `Order placed with ${partner?.name || 'Partner'}`
        }],
        documents: { CI: invoiceUploaded, ...(formData.hasCOO ? { COO: false } : {}) },
        documentsFolderPath: undefined,
        payments: [],
        assessedValue: 0,
        dutyBCD: 0, dutySWS: 0, dutyINT: 0, gst: 0,
        invoiceValueINR: (isExport ? parseFloat(formData.amountFC) || 0 : totalAmount) * exchRate,
        portOfLoading: formData.portOfLoading,
        portOfDischarge: formData.portOfDischarge,
      };

      await onSubmit(newShipment);
      navigate(isExport ? '/export-shipments' : '/shipments');
    } catch (error) {
      alert('Failed to register shipment to ledger.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 pb-32">
      <header>
        <h1 className="text-3xl font-black text-slate-900 tracking-tight uppercase">
          New {isExport ? 'Export' : 'Import'} Registration
        </h1>
        <p className="text-slate-500 font-medium italic">
          {isExport ? 'Outbound shipment entry against sales orders.' : 'Inbound procurement from approved vendor list.'}
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
               <h2 className="text-xs font-black uppercase text-slate-400 mb-4 flex items-center gap-2">Company</h2>
               <p className="text-[10px] text-slate-500 mb-4">Select which company this {isExport ? 'export' : 'import'} shipment is for.</p>
               <div className="flex flex-wrap gap-4">
                 {COMPANY_OPTIONS.map((c) => (
                   <label key={c.id} className={`flex items-center gap-3 px-5 py-3 rounded-xl border-2 cursor-pointer transition-all ${formData.company === c.id ? (isExport ? 'border-amber-500 bg-amber-50' : 'border-indigo-500 bg-indigo-50') : 'border-slate-200 hover:border-slate-300'}`}>
                     <input type="radio" name="company" value={c.id} checked={formData.company === c.id} onChange={() => handleChange('company', c.id)} className="sr-only" />
                     <span className="font-bold text-slate-800">{c.name}</span>
                   </label>
                 ))}
               </div>
            </div>
            <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
               <h2 className="text-xs font-black uppercase text-slate-400 mb-6 flex items-center gap-2"><Package size={16} /> Partner & Currency</h2>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div className="md:col-span-2">
                   <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Approved Account</label>
                   <select
                     required
                     className="w-full px-4 py-3 rounded-xl border bg-slate-50 font-bold"
                     value={selectedEntityId}
                     onChange={e => {
                       setSelectedEntityId(e.target.value);
                       if (isExport) handleChange('consigneeId', '');
                       if (!isExport) setFormData((prev: any) => ({ ...prev, lcNumber: '', linkedLcId: '', lcDate: '' }));
                     }}
                   >
                     <option value="">-- Choose Partner --</option>
                     {(isExport ? partnerBuyers : partnerSuppliers).map(e => <option key={e.id} value={e.id}>{e.name} ({e.country}){e.status && e.status !== 'APPROVED' ? ' (Pending)' : ''}</option>)}
                   </select>
                 </div>
                 {isExport && consigneesForBuyer.length > 0 && (
                   <div className="md:col-span-2">
                     <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Consignee</label>
                     <select
                       className="w-full px-4 py-3 rounded-xl border bg-slate-50 font-bold"
                       value={formData.consigneeId || ''}
                       onChange={e => handleChange('consigneeId', e.target.value)}
                     >
                       <option value="">-- No consignee / Same as buyer --</option>
                       {consigneesForBuyer.map((c: Consignee) => (
                         <option key={c.id} value={c.id}>{c.name}{c.address ? ` — ${c.address}` : ''}</option>
                       ))}
                     </select>
                     <p className="text-[9px] text-slate-400 mt-1">Optional: select delivery consignee if different from buyer.</p>
                   </div>
                 )}
                 <div>
                   <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Transaction Currency</label>
                   <select className="w-full px-4 py-3 rounded-xl border bg-slate-50 font-bold" value={formData.currency} onChange={e => handleChange('currency', e.target.value)}>
                     {isExport ? (
                       <>
                         <option value="USD">USD - US Dollar</option>
                         <option value="GBP">GBP - British Pound</option>
                       </>
                     ) : (
                       <>
                         <option value="USD">USD</option>
                         <option value="EUR">EUR</option>
                         <option value="INR">INR</option>
                       </>
                     )}
                   </select>
                 </div>
               </div>
            </div>

            {!isExport && (
            <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
              <h2 className="text-xs font-black uppercase text-slate-400 mb-6 flex items-center gap-2">
                <Zap size={16} />
                Material Selection (Materials Master)
              </h2>

              {materials.length === 0 && (
                 <div className="p-4 bg-amber-50 text-amber-700 text-xs font-bold rounded-xl mb-4 text-center">
                    Add materials in Materials Master first, then they will appear here.
                 </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-6 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100 items-end">
                 <div>
                   <label className="block text-[9px] font-black uppercase text-slate-500 mb-1">Select {isExport ? 'Product' : 'Material'}</label>
                   <select
                     className="w-full px-3 py-2 rounded-xl border text-sm font-bold disabled:opacity-50"
                     value={activeItem.productId}
                     onChange={e => setActiveItem({...activeItem, productId: e.target.value})}
                     disabled={!isExport && materials.length === 0}
                   >
                     <option value="">-- Select Item --</option>
                     {availableProducts.map(p => <option key={p.id} value={p.id}>{p.name} (HSN: {p.hsnCode})</option>)}
                   </select>
                 </div>
                 <div>
                   <label className="block text-[9px] font-black uppercase text-slate-500 mb-1">Description</label>
                   <input type="text" className="w-full px-3 py-2 rounded-xl border text-sm font-bold" value={activeItem.description} onChange={e => setActiveItem({...activeItem, description: e.target.value})} placeholder="Optional" />
                 </div>
                 <div>
                   <label className="block text-[9px] font-black uppercase text-slate-500 mb-1">Quantity</label>
                   <input type="number" className="w-full px-3 py-2 rounded-xl border text-sm font-bold" value={activeItem.quantity} onChange={e => setActiveItem({...activeItem, quantity: e.target.value})} placeholder="0" />
                 </div>
                 <div>
                   <label className="block text-[9px] font-black uppercase text-slate-500 mb-1">Unit</label>
                   <select className="w-full px-3 py-2 rounded-xl border text-sm font-bold" value={activeItem.unit} onChange={e => setActiveItem({...activeItem, unit: e.target.value.toUpperCase()})}>
                     {STANDARDISED_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                   </select>
                 </div>
                 <div>
                    <label className="block text-[9px] font-black uppercase text-slate-500 mb-1">Unit Price</label>
                    <input type="number" placeholder="Rate" className="w-full px-3 py-2 rounded-xl border text-sm font-bold" value={activeItem.rate} onChange={e => setActiveItem({...activeItem, rate: e.target.value})} />
                 </div>
              </div>
              <button type="button" onClick={handleAddItem} className="mt-4 w-full py-2 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all bg-indigo-600 hover:bg-indigo-700">
                + Append Item to Invoice
              </button>

              {currentItems.length > 0 && (
                <div className="mt-8 border-t border-slate-50 pt-6">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-[9px] font-black uppercase text-slate-400 border-b pb-2">
                        <th className="pb-2">Item Name</th>
                        <th className="pb-2">Description</th>
                        <th className="pb-2">HSN</th>
                        <th className="pb-2">Quantity</th>
                        <th className="pb-2">Rate</th>
                        <th className="pb-2 text-right">Amount</th>
                        <th className="pb-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {currentItems.map((item, i) => (
                        <tr key={i}>
                          <td className="py-3 text-sm font-bold text-slate-900">{item.productName}</td>
                          <td className="py-3 text-xs text-slate-600">{item.description || '—'}</td>
                          <td className="py-3 text-[10px] font-mono text-slate-400">{item.hsnCode}</td>
                          <td className="py-3 text-xs font-bold text-slate-700">{item.quantity} {item.unit}</td>
                          <td className="py-3 text-xs font-medium text-slate-500">{formatCurrency(item.rate, formData.currency)}</td>
                          <td className="py-3 text-right text-sm font-black text-indigo-600">{formatCurrency(item.amount, formData.currency)}</td>
                          <td className="py-3 text-right">
                              <button type="button" onClick={() => removeTableItem(i)} className="text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={16} /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            )}

            {isExport && (
            <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
              <h2 className="text-xs font-black uppercase text-slate-400 mb-4 flex items-center gap-2"><Zap size={16} /> Amount</h2>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Amount (Foreign Currency)</label>
                <input type="number" step="0.01" required className="w-full px-4 py-3 rounded-xl border font-bold" placeholder="0" value={formData.amountFC} onChange={e => handleChange('amountFC', e.target.value)} />
                <p className="text-[9px] text-slate-400 mt-2">Enter the invoice value in {formData.currency}.</p>
              </div>
            </div>
            )}

            <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-2xl ${isExport ? 'bg-amber-50 text-amber-600' : 'bg-indigo-50 text-indigo-600'}`}><CreditCard size={20} /></div>
                    <div>
                      <h3 className="text-xs font-black uppercase text-slate-900">Letter of Credit</h3>
                      <p className="text-[10px] text-slate-400">{isExport ? 'Is payment against buyer\'s LC?' : 'Is this shipment under LC?'}</p>
                    </div>
                  </div>
                  <input type="checkbox" className={`w-6 h-6 rounded-lg ${isExport ? 'accent-amber-600' : 'accent-indigo-600'}`} checked={formData.isUnderLC} onChange={e => handleChange('isUnderLC', e.target.checked)} />
                </div>
                
                {formData.isUnderLC && (
                  <div className="grid grid-cols-2 gap-6 p-4 bg-slate-50 rounded-2xl border border-slate-100 animate-in slide-in-from-top-2">
                    {!isExport ? (
                      <>
                        <div>
                          <label className="block text-[9px] font-black uppercase text-slate-500 mb-1">LC Number</label>
                          {lcsForSupplier.length > 0 ? (
                            <select
                              className="w-full px-4 py-2 rounded-xl border text-sm font-bold bg-white"
                              value={formData.lcNumber}
                              onChange={e => {
                                const val = e.target.value;
                                const lc = lcsForSupplier.find(l => l.lcNumber === val);
                                setFormData((prev: any) => ({
                                  ...prev,
                                  lcNumber: val,
                                  linkedLcId: lc?.id ?? '',
                                  lcDate: lc?.issueDate ?? prev.lcDate
                                }));
                              }}
                            >
                              <option value="">-- Select LC --</option>
                              {lcsForSupplier.map(lc => (
                                <option key={lc.id} value={lc.lcNumber}>
                                  {lc.lcNumber} — {formatCurrency(lc.amount ?? 0, lc.currency)} (balance: {formatCurrency(lc.balanceAmount ?? lc.amount ?? 0, lc.currency)})
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input className="w-full px-4 py-2 rounded-xl border text-sm font-bold" value={formData.lcNumber} onChange={e => { handleChange('lcNumber', e.target.value); handleChange('linkedLcId', ''); }} placeholder={selectedEntityId ? 'No open LCs for this supplier — type LC number' : 'Select supplier first'} />
                          )}
                        </div>
                        <div>
                          <label className="block text-[9px] font-black uppercase text-slate-500 mb-1">LC Date</label>
                          <input type="date" className="w-full px-4 py-2 rounded-xl border text-sm font-bold" value={formData.lcDate} onChange={e => handleChange('lcDate', e.target.value)} />
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <label className="block text-[9px] font-black uppercase text-slate-500 mb-1">LC Number</label>
                          <input className="w-full px-4 py-2 rounded-xl border text-sm font-bold" value={formData.lcNumber} onChange={e => handleChange('lcNumber', e.target.value)} placeholder="e.g. LC/001/24" />
                        </div>
                        <div>
                          <label className="block text-[9px] font-black uppercase text-slate-500 mb-1">LC Date</label>
                          <input type="date" className="w-full px-4 py-2 rounded-xl border text-sm font-bold" value={formData.lcDate} onChange={e => handleChange('lcDate', e.target.value)} />
                        </div>
                        <div>
                          <label className="block text-[9px] font-black uppercase text-slate-500 mb-1">LC Amount ({formData.currency})</label>
                          <input type="number" step="0.01" className="w-full px-4 py-2 rounded-xl border text-sm font-bold" value={formData.lcAmount ?? ''} onChange={e => handleChange('lcAmount', e.target.value)} placeholder="Optional" />
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

            {!isExport && (
            <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 space-y-4">
              <div className="flex items-center justify-between border-b pb-4 mb-4">
                <h3 className="font-bold flex items-center gap-2 text-slate-700 uppercase text-xs tracking-widest">
                  <Award size={18} className="text-emerald-600" /> 
                  Licence Utilization (Duty Benefit)
                </h3>
                <input type="checkbox" className="w-6 h-6 rounded-lg accent-emerald-600" checked={formData.isUnderLicence} onChange={e => handleChange('isUnderLicence', e.target.checked)} />
              </div>
              {formData.isUnderLicence && (
                <div className="animate-in slide-in-from-top-2">
                  <div className="mb-4">
                     {detectedLicenceType ? (
                       <span className={`text-[10px] font-black uppercase px-2 py-1 rounded ${detectedLicenceType === LicenceType.EPCG ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-700'}`}>
                         Detected Goods: {detectedLicenceType}
                       </span>
                     ) : (
                       <span className="text-[10px] font-black uppercase bg-slate-100 text-slate-500 px-2 py-1 rounded">No items added</span>
                     )}
                  </div>
                  {filteredLicences.length > 0 ? (
                    <>
                      <label className="block text-[9px] font-black uppercase text-slate-500 mb-2">
                        {detectedLicenceType ? `Select Active ${detectedLicenceType} Licence` : 'Select Active Licence'}
                      </label>
                      <select className="w-full px-4 py-3 rounded-xl border text-sm font-bold" value={formData.linkedLicenceId} onChange={e => handleChange('linkedLicenceId', e.target.value)}>
                        <option value="">-- Active Licences --</option>
                        {filteredLicences.map(l => <option key={l.id} value={l.id}>{l.number} ({l.type}) — Balance: {formatINR(l.eoRequired - l.eoFulfilled)}</option>)}
                      </select>
                      {!detectedLicenceType && <p className="text-[10px] text-slate-500 mt-2">Add items to auto-detect licence type (Advance/EPCG). You can still link any active licence above.</p>}
                    </>
                  ) : (
                    <p className="text-sm text-slate-400 italic">{detectedLicenceType ? `No active ${detectedLicenceType} licences found for ${formData.company}.` : 'No active licences for this company. Add licences in Licence Tracker first.'}</p>
                  )}
                  <p className="text-[10px] text-slate-400 mt-2 italic">Imports create/increase the obligation target for this licence.</p>
                </div>
              )}
            </div>
            )}

            <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                   <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Invoice / Ref Reference</label>
                   <input required className="w-full px-4 py-3 rounded-xl border font-bold" placeholder="e.g. GFPL/EXP/24-25/001" value={formData.invoiceNumber} onChange={e => handleChange('invoiceNumber', e.target.value)} />
                </div>
                {isExport ? (
                  <>
                    <div>
                       <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Invoice Date</label>
                       <input type="date" className="w-full px-4 py-3 rounded-xl border font-bold" value={formData.invoiceDate} onChange={e => handleChange('invoiceDate', e.target.value)} />
                    </div>
                    <div>
                       <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Shipment Date</label>
                       <input type="date" required className="w-full px-4 py-3 rounded-xl border font-bold" value={formData.expectedShipmentDate} onChange={e => handleChange('expectedShipmentDate', e.target.value)} />
                    </div>
                  </>
                ) : (
                  <div>
                     <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Invoice Date</label>
                     <input type="date" required className="w-full px-4 py-3 rounded-xl border font-bold" value={formData.invoiceDate} onChange={e => handleChange('invoiceDate', e.target.value)} />
                  </div>
                )}
            </div>

            {!isExport && (
            <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-6">
               <div>
                 <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Freight Charges (if any)</label>
                 <input type="number" step="0.01" min="0" className="w-full px-4 py-3 rounded-xl border font-bold" placeholder="0" value={formData.freightCharges} onChange={e => handleChange('freightCharges', e.target.value)} />
               </div>
               <div>
                 <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Other Charges (if any)</label>
                 <input type="number" step="0.01" min="0" className="w-full px-4 py-3 rounded-xl border font-bold" placeholder="0" value={formData.otherCharges} onChange={e => handleChange('otherCharges', e.target.value)} />
               </div>
            </div>
            )}

            {!isExport && (
            <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
               <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Payment Due Date</label>
               <input type="date" className="w-full px-4 py-3 rounded-xl border font-bold" value={formData.paymentDueDate} onChange={e => handleChange('paymentDueDate', e.target.value)} />
               <p className="text-[9px] text-slate-400 mt-2 italic">System will remind 3 days prior to due date.</p>
            </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="bg-white p-8 rounded-3xl border border-slate-100 sticky top-8 text-center space-y-6 shadow-sm">
              <div onClick={() => setInvoiceUploaded(!invoiceUploaded)} className={`p-8 border-2 border-dashed rounded-2xl cursor-pointer transition-all flex flex-col items-center justify-center gap-4 ${invoiceUploaded ? 'bg-emerald-50 border-emerald-300' : 'bg-slate-50 border-slate-200 hover:border-indigo-400'}`}>
                {invoiceUploaded ? (
                  <>
                    <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center"><CheckCircle size={24} /></div>
                    <p className="text-emerald-700 font-bold text-xs uppercase tracking-tight">Invoice Attached</p>
                    <p className="text-[9px] text-emerald-500">Click to remove</p>
                  </>
                ) : (
                  <>
                    <UploadCloud size={40} className="text-slate-300" />
                    <p className="text-slate-500 font-bold text-xs uppercase">Upload Invoice (Optional)</p>
                    <p className="text-[9px] text-slate-400">Can be uploaded later in vault</p>
                  </>
                )}
              </div>

              <div className="flex items-center justify-between p-4 rounded-2xl border border-slate-100 bg-slate-50">
                <div>
                  <p className="text-[10px] font-black text-slate-700 uppercase tracking-tight">Certificate of Origin (if any)</p>
                  <p className="text-[9px] text-slate-500 mt-0.5">Add COO to document ledger only when applicable</p>
                </div>
                <input type="checkbox" className="w-5 h-5 rounded accent-indigo-600" checked={formData.hasCOO} onChange={e => handleChange('hasCOO', e.target.checked)} />
              </div>
              
              <div className="bg-slate-900 p-8 rounded-[2rem] text-white text-left">
                {!isExport && (
                  <>
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 mb-1">Subtotal</p>
                    <p className="text-lg font-bold text-slate-300 mb-2">{formatCurrency(subtotalAmount, formData.currency)}</p>
                    {(freight > 0 || otherCharges > 0) && (
                      <div className="mb-2 space-y-1 text-[10px]">
                        {freight > 0 && <p className="flex justify-between"><span className="text-slate-500">Freight</span><span>{formatCurrency(freight, formData.currency)}</span></p>}
                        {otherCharges > 0 && <p className="flex justify-between"><span className="text-slate-500">Other charges</span><span>{formatCurrency(otherCharges, formData.currency)}</span></p>}
                      </div>
                    )}
                  </>
                )}
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 mt-2 mb-2">Total Amount</p>
                <p className="text-3xl font-black">{formatCurrency(isExport ? (parseFloat(formData.amountFC) || 0) : totalAmount, formData.currency)}</p>
                <div className="mt-4 pt-4 border-t border-white/10 flex justify-between">
                   <span className="text-[9px] text-slate-500 uppercase font-black">Settlement (INR)</span>
                   <span className="text-xs font-bold text-indigo-400">{formatINR((isExport ? (parseFloat(formData.amountFC) || 0) : totalAmount) * (parseFloat(formData.exchangeRate) || 0))}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="fixed bottom-0 left-64 right-0 bg-white/95 backdrop-blur-md border-t p-6 flex justify-end gap-4 shadow-2xl z-50">
          <button type="button" onClick={() => navigate(-1)} className="px-10 py-3 text-slate-400 font-bold hover:text-slate-600 uppercase text-[10px] tracking-widest">Discard</button>
          <button type="submit" disabled={isSubmitting} className="px-16 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest disabled:opacity-50 hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100">
            {isSubmitting ? 'Processing Sync...' : 'Commit to Ledger'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default NewShipment;
