import React, { useState, useMemo, useEffect } from 'react';
import { X, ExternalLink, CheckCircle, AlertCircle } from 'lucide-react';

export interface OcrReviewData {
  beNumber?: string | null;
  sbNumber?: string | null;
  date?: string | null;
  portCode?: string | null;
  invoiceValue?: string | null;
  source?: string | null;
  confidence?: number | null;
}

export interface OcrReviewModalProps {
  open: boolean;
  isExport: boolean;
  initialData: OcrReviewData;
  viewFile?: File | null;
  onConfirm: (reviewed: { number: string; date: string; portCode: string; invoiceValue: string }) => void;
  onCancel: () => void;
}

const PORT_CODE_REGEX = /^IN[A-Z]{3}\d{1,2}$/i;
const MIN_BE_DIGITS = 7;

function validateNumber(value: string): { valid: boolean; message?: string } {
  const digits = (value || '').replace(/\D/g, '');
  if (digits.length < MIN_BE_DIGITS) {
    return { valid: false, message: `Must contain at least ${MIN_BE_DIGITS} digits` };
  }
  return { valid: true };
}

function validatePortCode(value: string): { valid: boolean; message?: string } {
  const v = (value || '').trim().toUpperCase();
  if (!v) return { valid: true };
  if (!PORT_CODE_REGEX.test(v)) {
    return { valid: false, message: 'Must match pattern IN + 3 letters + 1–2 digits (e.g. INNSA1)' };
  }
  return { valid: true };
}

const OcrReviewModal: React.FC<OcrReviewModalProps> = ({
  open,
  isExport,
  initialData,
  viewFile,
  onConfirm,
  onCancel,
}) => {
  const numberKey = isExport ? 'sbNumber' : 'beNumber';
  const initialNumber = (initialData[numberKey as keyof OcrReviewData] as string) || '';
  const [number, setNumber] = useState(initialNumber);
  const [date, setDate] = useState((initialData.date as string) || '');
  const [portCode, setPortCode] = useState((initialData.portCode as string) || '');
  const [invoiceValue, setInvoiceValue] = useState((initialData.invoiceValue as string) || '');
  const [touched, setTouched] = useState({ number: false, portCode: false });

  useEffect(() => {
    if (open) {
      const num = (initialData[numberKey as keyof OcrReviewData] as string) || '';
      setNumber(num);
      setDate((initialData.date as string) || '');
      setPortCode((initialData.portCode as string) || '');
      setInvoiceValue((initialData.invoiceValue as string) || '');
      setTouched({ number: false, portCode: false });
    }
  }, [open, isExport, initialData, numberKey]);

  const highConfidence = initialData.source === 'text';

  const numberValidation = useMemo(() => validateNumber(number), [number]);
  const portCodeValidation = useMemo(() => validatePortCode(portCode), [portCode]);
  const canConfirm = numberValidation.valid && portCodeValidation.valid;

  const handleConfirm = () => {
    if (!canConfirm) return;
    const normalizedPort = (portCode || '').trim().toUpperCase();
    onConfirm({
      number: number.trim(),
      date: (date || '').trim(),
      portCode: normalizedPort,
      invoiceValue: (invoiceValue || '').trim(),
    });
  };

  const handleViewOriginal = () => {
    if (!viewFile) return;
    const url = URL.createObjectURL(viewFile);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  if (!open) return null;

  const docNumberPlaceholder = isExport ? 'e.g. SB1234567' : 'e.g. 1234567 (BE)';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onCancel}>
      <div
        className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Review & Confirm</h2>
          {highConfidence && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 text-xs font-bold uppercase tracking-wide border border-emerald-200">
              <CheckCircle size={12} /> High Confidence (Digital PDF)
            </span>
          )}
          <button
            type="button"
            onClick={onCancel}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Document Number (BE/SB)
            </label>
            <input
              type="text"
              value={number}
              onChange={(e) => { setNumber(e.target.value); setTouched((t) => ({ ...t, number: true })); }}
              onBlur={() => setTouched((t) => ({ ...t, number: true }))}
              className={`w-full px-4 py-3 rounded-xl border text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none ${
                touched.number && !numberValidation.valid ? 'border-red-300 bg-red-50/50' : 'border-slate-200'
              }`}
              placeholder={docNumberPlaceholder}
            />
            {touched.number && !numberValidation.valid && (
              <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
                <AlertCircle size={12} /> {numberValidation.message}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Port Code
            </label>
            <input
              type="text"
              value={portCode}
              onChange={(e) => { setPortCode(e.target.value.toUpperCase()); setTouched((t) => ({ ...t, portCode: true })); }}
              onBlur={() => setTouched((t) => ({ ...t, portCode: true }))}
              className={`w-full px-4 py-3 rounded-xl border text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none uppercase ${
                touched.portCode && !portCodeValidation.valid ? 'border-red-300 bg-red-50/50' : 'border-slate-200'
              }`}
              placeholder="e.g. INNSA1"
            />
            {touched.portCode && !portCodeValidation.valid && (
              <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
                <AlertCircle size={12} /> {portCodeValidation.message}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Invoice Value
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={invoiceValue}
              onChange={(e) => setInvoiceValue(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              placeholder="e.g. 50000"
            />
          </div>

          {viewFile && (
            <button
              type="button"
              onClick={handleViewOriginal}
              className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-800"
            >
              <ExternalLink size={14} /> View Original Document
            </button>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-medium hover:bg-slate-50"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Confirm & Apply
          </button>
        </div>
      </div>
    </div>
  );
};

export default OcrReviewModal;
