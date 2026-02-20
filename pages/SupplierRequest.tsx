import React, { useState, useCallback } from 'react';
import { Supplier, User, SupplierStatus } from '../types';
import { Globe, Landmark, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAutoSavedDraft } from '../hooks/useAutoSavedDraft';

interface SupplierRequestProps {
  onSubmit: (supplier: Supplier) => Promise<void>;
  user: User;
}

const SupplierRequest: React.FC<SupplierRequestProps> = ({ onSubmit, user }) => {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    country: '',
    bankName: '',
    accountHolderName: '',
    accountNumber: '',
    swiftCode: '',
    bankAddress: '',
    contactPerson: '',
    contactNumber: '',
    contactEmail: '',
    contactDetails: '',
    hasIntermediaryBank: false,
    intermediaryBankName: '',
    intermediaryAccountHolderName: '',
    intermediaryAccountNumber: '',
    intermediarySwiftCode: '',
    intermediaryBankAddress: '',
  });

  const restoreDraft = useCallback((draft: any) => {
    if (!draft || typeof draft !== 'object') return;
    if (draft.formData && typeof draft.formData === 'object') {
      setFormData((prev) => ({ ...prev, ...draft.formData }));
    }
  }, []);

  const { clearDraft } = useAutoSavedDraft({
    key: 'supplier-request',
    data: { formData },
    onRestore: restoreDraft,
    enabled: !isSubmitting,
    debounceMs: 600,
    version: '1',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      const contactDetails = [formData.contactNumber, formData.contactEmail].filter(Boolean).join(' / ') || formData.contactDetails || '';
      const newSupplier: Supplier = {
        ...formData,
        contactDetails,
        id: 's_' + Math.random().toString(36).substring(2, 11),
        status: SupplierStatus.PENDING,
        products: [],
        requestedBy: user.name,
        createdAt: new Date().toISOString(),
        hasIntermediaryBank: formData.hasIntermediaryBank,
        intermediaryBankName: formData.hasIntermediaryBank ? formData.intermediaryBankName : undefined,
        intermediaryAccountHolderName: formData.hasIntermediaryBank ? formData.intermediaryAccountHolderName : undefined,
        intermediaryAccountNumber: formData.hasIntermediaryBank ? formData.intermediaryAccountNumber : undefined,
        intermediarySwiftCode: formData.hasIntermediaryBank ? formData.intermediarySwiftCode : undefined,
        intermediaryBankAddress: formData.hasIntermediaryBank ? formData.intermediaryBankAddress : undefined,
      };

      await onSubmit(newSupplier);
      clearDraft();
      navigate('/suppliers');
    } catch (err: unknown) {
      console.error('Submission failed', err);
      const message = err instanceof Error ? err.message : 'Could not add supplier. Check your permissions or try again.';
      alert(message);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-2 bg-white rounded-xl hover:bg-slate-100 transition-colors border border-slate-100 shadow-sm"><ArrowLeft size={20} /></button>
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Onboard New Supplier</h1>
            <p className="text-slate-500 font-medium italic">Initiate verification for a new global partner.</p>
          </div>
        </div>
      </header>

      <form onSubmit={handleSubmit} className="space-y-8 pb-32">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 space-y-6">
            <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
              <Globe className="text-indigo-600" size={20} />
              <h2 className="text-lg font-bold text-slate-900">General Identity</h2>
            </div>
            <div className="grid grid-cols-1 gap-6">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Legal Company Name</label>
                <input required className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-100" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Country</label>
                  <input required className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-100" value={formData.country} onChange={e => setFormData({...formData, country: e.target.value})} />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Contact Person Name</label>
                  <input required className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-100" value={formData.contactPerson} onChange={e => setFormData({...formData, contactPerson: e.target.value})} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Contact Number</label>
                  <input type="tel" className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-100" value={formData.contactNumber} onChange={e => setFormData({...formData, contactNumber: e.target.value})} placeholder="e.g. +90 212 123 4567" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Contact Email</label>
                  <input type="email" className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-100" value={formData.contactEmail} onChange={e => setFormData({...formData, contactEmail: e.target.value})} placeholder="contact@supplier.com" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Office Headquarters</label>
                <textarea required rows={3} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-100" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
              </div>
            </div>
          </div>

          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 space-y-6">
            <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
              <Landmark className="text-indigo-600" size={20} />
              <h2 className="text-lg font-bold text-slate-900">Banking & SWIFT</h2>
            </div>
            <div className="grid grid-cols-1 gap-6">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Bank A/C Beneficiary Name</label>
                <input required className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-100" value={formData.accountHolderName} onChange={e => setFormData({...formData, accountHolderName: e.target.value})} />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Account Number</label>
                <input className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-100" value={formData.accountNumber} onChange={e => setFormData({...formData, accountNumber: e.target.value})} placeholder="e.g. 1234567890" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Bank Institution</label>
                  <input required className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-100" value={formData.bankName} onChange={e => setFormData({...formData, bankName: e.target.value})} />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">SWIFT / BIC</label>
                  <input required className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-100" value={formData.swiftCode} onChange={e => setFormData({...formData, swiftCode: e.target.value})} />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Bank Branch Address</label>
                <textarea required rows={3} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-100" value={formData.bankAddress} onChange={e => setFormData({...formData, bankAddress: e.target.value})} />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-50 pb-4">
            <h2 className="text-lg font-bold text-slate-900">Intermediary Bank</h2>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="w-5 h-5 rounded accent-indigo-600" checked={formData.hasIntermediaryBank} onChange={e => setFormData({...formData, hasIntermediaryBank: e.target.checked})} />
              <span className="text-sm font-semibold text-slate-700">There is an intermediary bank</span>
            </label>
          </div>
          {formData.hasIntermediaryBank && (
            <div className="grid grid-cols-1 gap-6 pt-2">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Intermediary Bank A/C Beneficiary Name</label>
                <input required className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-100" value={formData.intermediaryAccountHolderName} onChange={e => setFormData({...formData, intermediaryAccountHolderName: e.target.value})} />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Intermediary Bank Account Number</label>
                <input className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-100" value={formData.intermediaryAccountNumber} onChange={e => setFormData({...formData, intermediaryAccountNumber: e.target.value})} placeholder="e.g. 1234567890" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Intermediary Bank Institution</label>
                  <input required className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-100" value={formData.intermediaryBankName} onChange={e => setFormData({...formData, intermediaryBankName: e.target.value})} />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Intermediary SWIFT / BIC</label>
                  <input required className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-100" value={formData.intermediarySwiftCode} onChange={e => setFormData({...formData, intermediarySwiftCode: e.target.value})} />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Intermediary Bank Branch Address</label>
                <textarea required rows={3} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-100" value={formData.intermediaryBankAddress} onChange={e => setFormData({...formData, intermediaryBankAddress: e.target.value})} />
              </div>
            </div>
          )}
        </div>

        <div className="fixed bottom-0 left-0 lg:left-64 right-0 bg-white border-t p-4 sm:p-6 flex flex-col sm:flex-row justify-end gap-3 sm:gap-4 z-50 shadow-2xl">
          <button type="button" onClick={() => navigate('/suppliers')} className="w-full sm:w-auto px-10 py-3 rounded-xl font-bold text-slate-400 hover:text-slate-600 uppercase text-[10px] tracking-widest transition-all">
            Cancel
          </button>
          <button type="submit" disabled={isSubmitting} className="w-full sm:w-auto px-12 py-3 bg-indigo-600 text-white rounded-xl font-black uppercase text-xs tracking-widest shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 disabled:opacity-70">
            {isSubmitting ? 'Processing...' : 'Onboard Vendor'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default SupplierRequest;
