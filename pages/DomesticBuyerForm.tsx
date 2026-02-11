import React, { useState, useEffect } from 'react';
import { DomesticBuyer, DomesticBuyerSite } from '../types';
import { Plus, Trash2, MapPin } from 'lucide-react';

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

interface DomesticBuyerFormProps {
  initialBuyer?: DomesticBuyer | null;
  onSubmit: (b: DomesticBuyer) => Promise<void>;
  onCancel?: () => void;
}

export const DomesticBuyerForm: React.FC<DomesticBuyerFormProps> = ({ initialBuyer, onSubmit, onCancel }) => {
  const isEdit = !!initialBuyer;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    billingAddress: '',
    state: '',
    gstNo: '',
    mobile: '',
    salesPersonName: '',
    salesPersonMobile: '',
    salesPersonEmail: '',
    paymentTerms: '',
  });
  const [sites, setSites] = useState<DomesticBuyerSite[]>([]);

  useEffect(() => {
    if (initialBuyer) {
      setFormData({
        name: initialBuyer.name,
        billingAddress: initialBuyer.billingAddress || '',
        state: initialBuyer.state || '',
        gstNo: initialBuyer.gstNo || '',
        mobile: initialBuyer.mobile || '',
        salesPersonName: initialBuyer.salesPersonName || '',
        salesPersonMobile: initialBuyer.salesPersonMobile || '',
        salesPersonEmail: initialBuyer.salesPersonEmail || '',
        paymentTerms: initialBuyer.paymentTerms || '',
      });
      setSites(initialBuyer.sites?.length ? [...initialBuyer.sites] : []);
    }
  }, [initialBuyer?.id]);

  const addSite = () => {
    setSites([...sites, { id: 's_' + Math.random().toString(36).slice(2, 11), siteName: '', shippingAddress: '' }]);
  };
  const removeSite = (id: string) => setSites(sites.filter((s) => s.id !== id));
  const updateSite = (id: string, field: keyof DomesticBuyerSite, value: string) => {
    setSites(sites.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const payload: DomesticBuyer = isEdit && initialBuyer
        ? { ...formData, id: initialBuyer.id, sites, createdAt: initialBuyer.createdAt }
        : {
            ...formData,
            id: 'db_' + Math.random().toString(36).slice(2, 11),
            sites,
            createdAt: new Date().toISOString(),
          };
      await onSubmit(payload);
      if (onCancel) onCancel();
    } catch (err) {
      console.error(err);
      alert('Failed to save domestic buyer.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 pb-24">
      <header>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">{isEdit ? 'Edit Domestic Buyer' : 'Add Domestic Buyer'}</h1>
        <p className="text-slate-500 font-medium">Buyer within India for sales indent.</p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-8">
        <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 space-y-6">
          <h2 className="text-lg font-bold text-slate-900 border-b border-slate-50 pb-4">Identity & Billing</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="block text-sm font-bold text-slate-500 uppercase tracking-wide mb-2">Customer Name *</label>
              <input required className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-rose-500" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-bold text-slate-500 uppercase tracking-wide mb-2">Billing Address</label>
              <textarea rows={3} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-rose-500" value={formData.billingAddress} onChange={(e) => setFormData({ ...formData, billingAddress: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-500 uppercase tracking-wide mb-2">State</label>
              <input className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-rose-500" value={formData.state} onChange={(e) => setFormData({ ...formData, state: e.target.value })} placeholder="e.g. Gujarat" />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-500 uppercase tracking-wide mb-2">GST No</label>
              <input className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-rose-500" value={formData.gstNo} onChange={(e) => setFormData({ ...formData, gstNo: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-500 uppercase tracking-wide mb-2">Mobile</label>
              <input type="tel" className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-rose-500" value={formData.mobile} onChange={(e) => setFormData({ ...formData, mobile: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-500 uppercase tracking-wide mb-2">Payment Terms</label>
              <select className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-rose-500" value={formData.paymentTerms} onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value })}>
                <option value="">Select...</option>
                {PAYMENT_TERMS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 space-y-6">
          <h2 className="text-lg font-bold text-slate-900 border-b border-slate-50 pb-4">Sales Person</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-bold text-slate-500 uppercase tracking-wide mb-2">Name</label>
              <input className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-rose-500" value={formData.salesPersonName} onChange={(e) => setFormData({ ...formData, salesPersonName: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-500 uppercase tracking-wide mb-2">Mobile</label>
              <input className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-rose-500" value={formData.salesPersonMobile} onChange={(e) => setFormData({ ...formData, salesPersonMobile: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-500 uppercase tracking-wide mb-2">Email</label>
              <input type="email" className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-rose-500" value={formData.salesPersonEmail} onChange={(e) => setFormData({ ...formData, salesPersonEmail: e.target.value })} />
            </div>
          </div>
        </div>

        <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-50 pb-4">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2"><MapPin size={20} className="text-rose-600" /> Consignee / Ship Sites</h2>
            <button type="button" onClick={addSite} className="px-4 py-2 rounded-xl bg-rose-50 text-rose-600 font-bold text-sm hover:bg-rose-100 flex items-center gap-2">
              <Plus size={16} /> Add Site
            </button>
          </div>
          {sites.length === 0 ? (
            <p className="text-slate-500 text-sm italic">No separate consignee sites. Billing address will be used as shipping.</p>
          ) : (
            <div className="space-y-4">
              {sites.map((s) => (
                <div key={s.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 relative">
                  <button type="button" onClick={() => removeSite(s.id)} className="absolute top-2 right-2 p-1 text-slate-300 hover:text-red-500"><Trash2 size={16} /></button>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Site / Consignee Name</label>
                      <input className="w-full px-3 py-2 rounded-lg border border-slate-200" value={s.siteName} onChange={(e) => updateSite(s.id, 'siteName', e.target.value)} />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Shipping Address</label>
                      <textarea rows={2} className="w-full px-3 py-2 rounded-lg border border-slate-200" value={s.shippingAddress} onChange={(e) => updateSite(s.id, 'shippingAddress', e.target.value)} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-4">
          {onCancel && <button type="button" onClick={onCancel} className="px-8 py-3 rounded-2xl font-bold text-slate-500 hover:bg-slate-100">Cancel</button>}
          <button type="submit" disabled={isSubmitting} className="px-10 py-3 bg-rose-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl hover:bg-rose-700 disabled:opacity-50">
            {isSubmitting ? 'Saving...' : isEdit ? 'Save' : 'Add Buyer'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default DomesticBuyerForm;
