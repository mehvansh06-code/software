import React, { useState, useEffect } from 'react';
import { Buyer, Consignee, User, SupplierStatus } from '../types';
import { Plus, Trash2, Globe, Landmark, CheckCircle, Users, MapPin } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface BuyerRequestProps {
  onSubmit: (buyer: Buyer) => Promise<void>;
  user: User;
  initialBuyer?: Buyer | null;
  onCancel?: () => void;
}

const BuyerRequest: React.FC<BuyerRequestProps> = ({ onSubmit, user, initialBuyer, onCancel }) => {
  const navigate = useNavigate();
  const isEdit = !!initialBuyer;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    country: '',
    bankName: '',
    accountHolderName: '',
    swiftCode: '',
    bankAddress: '',
    contactPerson: '',
    contactNumber: '',
    contactEmail: '',
    contactDetails: '',
    salesPersonName: '',
    salesPersonContact: '',
    hasConsignee: false
  });

  const [consignees, setConsignees] = useState<Consignee[]>([]);

  useEffect(() => {
    if (initialBuyer) {
      setFormData({
        name: initialBuyer.name,
        address: initialBuyer.address,
        country: initialBuyer.country,
        bankName: initialBuyer.bankName,
        accountHolderName: initialBuyer.accountHolderName,
        swiftCode: initialBuyer.swiftCode,
        bankAddress: initialBuyer.bankAddress,
        contactPerson: initialBuyer.contactPerson,
        contactNumber: initialBuyer.contactNumber ?? '',
        contactEmail: initialBuyer.contactEmail ?? '',
        contactDetails: initialBuyer.contactDetails ?? '',
        salesPersonName: initialBuyer.salesPersonName,
        salesPersonContact: initialBuyer.salesPersonContact,
        hasConsignee: (initialBuyer.consignees?.length ?? 0) > 0
      });
      setConsignees(initialBuyer.consignees?.length ? [...initialBuyer.consignees] : []);
    }
  }, [initialBuyer?.id]);

  const addConsignee = () => {
    setConsignees([...consignees, { id: Math.random().toString(36).substr(2, 9), name: '', address: '' }]);
  };

  const removeConsignee = (id: string) => {
    setConsignees(consignees.filter(c => c.id !== id));
  };

  const updateConsignee = (id: string, field: keyof Consignee, value: string) => {
    setConsignees(consignees.map(c => {
      if (c.id === id) {
        return { ...c, [field]: value };
      }
      return c;
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const payload: Buyer = isEdit && initialBuyer
        ? {
            ...formData,
            id: initialBuyer.id,
            status: initialBuyer.status,
            consignees: formData.hasConsignee ? consignees : [],
            requestedBy: initialBuyer.requestedBy,
            createdAt: initialBuyer.createdAt,
          }
        : {
            ...formData,
            id: Math.random().toString(36).substr(2, 9),
            status: SupplierStatus.PENDING,
            consignees: formData.hasConsignee ? consignees : [],
            requestedBy: user.name,
            createdAt: new Date().toISOString(),
          };
      await onSubmit(payload);
      if (isEdit && onCancel) onCancel();
      else navigate('/buyers');
    } catch (err) {
      console.error(err);
      alert('Failed to save buyer.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500 pb-24">
      <header>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">{isEdit ? 'Edit Buyer' : 'Onboard Global Buyer'}</h1>
        <p className="text-slate-500 font-medium">{isEdit ? 'Update buyer details and shipping instructions.' : 'Capture international buyer details and shipping instructions.'}</p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 space-y-6">
            <div className="flex items-center gap-3 border-b border-slate-50 pb-4 mb-2">
              <Globe className="text-amber-600" size={20} />
              <h2 className="text-lg font-bold text-slate-900">Buyer Identity & Location</h2>
            </div>
            <div className="grid grid-cols-1 gap-6">
              <div>
                <label className="block text-sm font-bold text-slate-500 uppercase tracking-wide mb-2">Legal Entity Name</label>
                <input required className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-amber-500" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-500 uppercase tracking-wide mb-2">Country</label>
                  <input required className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-amber-500" value={formData.country} onChange={e => setFormData({...formData, country: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-500 uppercase tracking-wide mb-2">Contact Person Name</label>
                  <input required className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-amber-500" value={formData.contactPerson} onChange={e => setFormData({...formData, contactPerson: e.target.value})} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-500 uppercase tracking-wide mb-2">Contact Number</label>
                  <input type="tel" className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-amber-500" value={formData.contactNumber} onChange={e => setFormData({...formData, contactNumber: e.target.value})} placeholder="e.g. +44 20 1234 5678" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-500 uppercase tracking-wide mb-2">Contact Email</label>
                  <input type="email" className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-amber-500" value={formData.contactEmail} onChange={e => setFormData({...formData, contactEmail: e.target.value})} placeholder="contact@buyer.com" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-500 uppercase tracking-wide mb-2">Buyer Address</label>
                <textarea required rows={3} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-amber-500" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
              </div>
            </div>
          </div>

          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 space-y-6">
            <div className="flex items-center gap-3 border-b border-slate-50 pb-4 mb-2">
              <Landmark className="text-amber-600" size={20} />
              <h2 className="text-lg font-bold text-slate-900">Remittance & Banking</h2>
            </div>
            <div className="grid grid-cols-1 gap-6">
              <div>
                <label className="block text-sm font-bold text-slate-500 uppercase tracking-wide mb-2">A/C Holder Name (As per Bank)</label>
                <input required className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-amber-500" value={formData.accountHolderName} onChange={e => setFormData({...formData, accountHolderName: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-500 uppercase tracking-wide mb-2">Bank Name</label>
                  <input required className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-amber-500" value={formData.bankName} onChange={e => setFormData({...formData, bankName: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-500 uppercase tracking-wide mb-2">SWIFT Code</label>
                  <input required className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-amber-500" value={formData.swiftCode} onChange={e => setFormData({...formData, swiftCode: e.target.value})} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-500 uppercase tracking-wide mb-2">Bank Address</label>
                <textarea required rows={3} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-amber-500" value={formData.bankAddress} onChange={e => setFormData({...formData, bankAddress: e.target.value})} />
              </div>
            </div>
          </div>

          <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 space-y-6">
            <div className="flex items-center gap-3 border-b border-slate-50 pb-4 mb-2">
              <Users className="text-amber-600" size={20} />
              <h2 className="text-lg font-bold text-slate-900">Sales Reference</h2>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-slate-500 uppercase tracking-wide mb-2">Sales Person Name</label>
                <input required className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-amber-500" value={formData.salesPersonName} onChange={e => setFormData({...formData, salesPersonName: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-500 uppercase tracking-wide mb-2">Sales Contact</label>
                <input required className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-amber-500" value={formData.salesPersonContact} onChange={e => setFormData({...formData, salesPersonContact: e.target.value})} />
              </div>
            </div>
          </div>

          <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-50 pb-4 mb-2">
               <div className="flex items-center gap-3">
                  <MapPin className="text-amber-600" size={20} />
                  <h2 className="text-lg font-bold text-slate-900">Consignee Details</h2>
               </div>
               <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-400">Add different consignees?</span>
                  <button 
                    type="button"
                    onClick={() => setFormData({...formData, hasConsignee: !formData.hasConsignee})}
                    className={`w-10 h-5 rounded-full transition-colors relative ${formData.hasConsignee ? 'bg-amber-600' : 'bg-slate-200'}`}
                  >
                    <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${formData.hasConsignee ? 'left-6' : 'left-1'}`} />
                  </button>
               </div>
            </div>
            
            {formData.hasConsignee ? (
              <div className="space-y-4">
                {consignees.map((c) => (
                  <div key={c.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 relative group">
                    <button 
                      type="button" 
                      onClick={() => removeConsignee(c.id)}
                      className="absolute top-2 right-2 p-1 text-slate-300 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Consignee Name</label>
                        <input className="w-full px-3 py-1.5 rounded-lg border border-slate-200 outline-none" value={c.name} onChange={e => updateConsignee(c.id, 'name', e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Shipping Address</label>
                        <textarea rows={2} className="w-full px-3 py-1.5 rounded-lg border border-slate-200 outline-none" value={c.address} onChange={e => updateConsignee(c.id, 'address', e.target.value)} />
                      </div>
                    </div>
                  </div>
                ))}
                <button type="button" onClick={addConsignee} className="w-full py-3 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 font-bold hover:border-amber-300 hover:text-amber-500 flex items-center justify-center gap-2 transition-all">
                  <Plus size={18} /> Add Another Consignee
                </button>
              </div>
            ) : (
              <div className="text-center py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <p className="text-sm text-slate-400 italic font-medium">Consignee will be same as Buyer entity.</p>
              </div>
            )}
          </div>
        </div>

        <div className={`fixed bottom-0 right-0 bg-white/80 backdrop-blur-lg border-t border-slate-100 p-6 flex justify-end gap-4 shadow-2xl ${isEdit ? 'left-0' : 'left-64'}`}>
          <button type="button" onClick={isEdit && onCancel ? onCancel : () => navigate('/buyers')} className="px-8 py-3 rounded-2xl font-bold text-slate-500 hover:bg-slate-100 transition-all">
            {isEdit ? 'Cancel' : 'Discard'}
          </button>
          <button type="submit" disabled={isSubmitting} className="px-10 py-3 bg-amber-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-amber-100 hover:bg-amber-700 transition-all flex items-center gap-2 disabled:opacity-50">
            <CheckCircle size={20} />
            {isSubmitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Submit for Audit'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default BuyerRequest;