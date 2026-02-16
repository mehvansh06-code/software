import React, { useState, useMemo, useEffect } from 'react';
import { X, ExternalLink, CheckCircle, AlertCircle } from 'lucide-react';

export interface OcrReviewData {
  beNumber?: string | null;
  sbNumber?: string | null;
  date?: string | null;
  portCode?: string | null;
  invoiceValue?: string | null;
  exchangeRate?: string | null;
  incoTerm?: string | null;
  containerNumber?: string | null;
  blNumber?: string | null;
  blDate?: string | null;
  shippingLine?: string | null;
  dutyBCD?: string | null;
  dutySWS?: string | null;
  dutyINT?: string | null;
  penalty?: string | null;
  fine?: string | null;
  gst?: string | null;
  /** SB only */
  fobValueFC?: string | null;
  fobValueINR?: string | null;
  dbk?: string | null;
  rodtep?: string | null;
  source?: string | null;
  confidence?: number | null;
}

/**
 * BOE (import only) and SB (export only) each contain only their own section data.
 * Bill of Lading details (container, BL no/date, shipping line) and Invoice details are separate headers — not part of BOE/SB.
 */
export interface OcrReviewedPayload {
  number: string;
  date: string;
  portCode: string;
  invoiceValue: string;
  /** BOE only */
  exchangeRate?: string;
  incoTerm?: string;
  dutyBCD?: string;
  dutySWS?: string;
  dutyINT?: string;
  penalty?: string;
  fine?: string;
  gst?: string;
  /** SB only */
  fobValueINR?: string;
  dbk?: string;
  rodtep?: string;
}

export interface OcrReviewModalProps {
  open: boolean;
  isExport: boolean;
  initialData: OcrReviewData;
  viewFile?: File | null;
  onConfirm: (reviewed: OcrReviewedPayload) => void;
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
  const getStr = (k: keyof OcrReviewData) => (initialData[k] as string) || '';
  const [number, setNumber] = useState(getStr(numberKey));
  const [date, setDate] = useState(getStr('date'));
  const [portCode, setPortCode] = useState(getStr('portCode'));
  const [invoiceValue, setInvoiceValue] = useState(getStr('invoiceValue'));
  const [dutyBCD, setDutyBCD] = useState(getStr('dutyBCD'));
  const [dutySWS, setDutySWS] = useState(getStr('dutySWS'));
  const [dutyINT, setDutyINT] = useState(getStr('dutyINT'));
  const [penalty, setPenalty] = useState(getStr('penalty'));
  const [fine, setFine] = useState(getStr('fine'));
  const [gst, setGst] = useState(getStr('gst'));
  const [exchangeRate, setExchangeRate] = useState(getStr('exchangeRate'));
  const [incoTerm, setIncoTerm] = useState(getStr('incoTerm'));
  const [fobValueINR, setFobValueINR] = useState(getStr('fobValueINR'));
  const [dbk, setDbk] = useState(getStr('dbk'));
  const [rodtep, setRodtep] = useState(getStr('rodtep'));
  const [touched, setTouched] = useState({ number: false, portCode: false });

  useEffect(() => {
    if (open) {
      const d = initialData;
      const num = (d[numberKey as keyof OcrReviewData] as string) || '';
      setNumber(num);
      setDate((d.date as string) || '');
      setPortCode((d.portCode as string) || '');
      setInvoiceValue((isExport ? (d.fobValueFC as string) : (d.invoiceValue as string)) || (d.invoiceValue as string) || '');
      setDutyBCD((d.dutyBCD as string) || '');
      setDutySWS((d.dutySWS as string) || '');
      setDutyINT((d.dutyINT as string) || '');
      setPenalty((d.penalty as string) || '');
      setFine((d.fine as string) || '');
      setGst((d.gst as string) || '');
      setExchangeRate((d.exchangeRate as string) || '');
      setIncoTerm((d.incoTerm as string) || '');
      setFobValueINR((d.fobValueINR as string) || '');
      setDbk((d.dbk as string) || '');
      setRodtep((d.rodtep as string) || '');
      setTouched({ number: false, portCode: false });
    }
  }, [open, isExport, initialData, numberKey]);

  const highConfidence = initialData.source === 'text';

  const numberValidation = useMemo(() => validateNumber(number), [number]);
  const portCodeValidation = useMemo(() => validatePortCode(portCode), [portCode]);
  const canConfirm = numberValidation.valid && portCodeValidation.valid;

  const trim = (s: string) => (s || '').trim();
  const handleConfirm = () => {
    if (!canConfirm) return;
    const payload: OcrReviewedPayload = {
      number: trim(number),
      date: trim(date),
      portCode: (portCode || '').trim().toUpperCase(),
      invoiceValue: trim(invoiceValue),
    };
    if (!isExport) {
      payload.exchangeRate = trim(exchangeRate);
      payload.incoTerm = trim(incoTerm);
      payload.dutyBCD = trim(dutyBCD);
      payload.dutySWS = trim(dutySWS);
      payload.dutyINT = trim(dutyINT);
      payload.penalty = trim(penalty);
      payload.fine = trim(fine);
      payload.gst = trim(gst);
    } else {
      payload.exchangeRate = trim(exchangeRate);
      payload.incoTerm = trim(incoTerm);
      payload.fobValueINR = trim(fobValueINR);
      payload.dbk = trim(dbk);
      payload.rodtep = trim(rodtep);
    }
    onConfirm(payload);
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
          <h2 className="text-lg font-bold text-slate-900">{isExport ? 'Shipping Bill' : 'Bill of Entry'} — Review & Confirm</h2>
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

        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              {isExport ? 'Shipping Bill No.' : 'Bill of Entry No.'}
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
              {isExport ? 'FOB Value (Foreign Currency)' : 'Assessable Value'}
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={invoiceValue}
              onChange={(e) => setInvoiceValue(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              placeholder={isExport ? 'e.g. 50000 USD' : 'e.g. 50000'}
            />
          </div>

          {isExport && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">FOB Value (INR)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={fobValueINR}
                  onChange={(e) => setFobValueINR(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="e.g. 4200000"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Exchange Rate</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={exchangeRate}
                  onChange={(e) => setExchangeRate(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="e.g. 84"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Inco Term</label>
                <input
                  type="text"
                  value={incoTerm}
                  onChange={(e) => setIncoTerm(e.target.value.toUpperCase())}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none uppercase"
                  placeholder="e.g. FOB, CIF"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">DBK</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={dbk}
                  onChange={(e) => setDbk(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="Rs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">RODTEP</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={rodtep}
                  onChange={(e) => setRodtep(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="Rs"
                />
              </div>
            </>
          )}

          {!isExport && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Exchange Rate</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={exchangeRate}
                  onChange={(e) => setExchangeRate(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="e.g. 83.75"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Inco Term</label>
                <input
                  type="text"
                  value={incoTerm}
                  onChange={(e) => setIncoTerm(e.target.value.toUpperCase())}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none uppercase"
                  placeholder="e.g. FOB, CIF"
                />
              </div>
            </>
          )}

          {/* Bill of Entry (import) only: duty fields (BCD, SWS, 15.INT / 16.PNLTY / 17.FINE, IGST). */}
          {!isExport && (
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <p className="text-[10px] font-bold uppercase text-slate-400">Duty: BCD, SWS, Interest / Penalty / Fine, IGST</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">BCD</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={dutyBCD}
                    onChange={(e) => setDutyBCD(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="Rs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">SWS</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={dutySWS}
                    onChange={(e) => setDutySWS(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="Rs"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">15. INT</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={dutyINT}
                    onChange={(e) => setDutyINT(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">16. PNLTY</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={penalty}
                    onChange={(e) => setPenalty(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">17. FINE</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={fine}
                    onChange={(e) => setFine(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="0"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">IGST</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={gst}
                  onChange={(e) => setGst(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="Rs"
                />
              </div>
            </div>
          )}

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
