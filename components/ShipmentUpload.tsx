import React, { useMemo, useState, useRef } from 'react';
import { Upload, Loader2, FileUp, RefreshCw } from 'lucide-react';
import { api } from '../api';
import { IMPORT_DOCUMENT_CHECKLIST, EXPORT_DOCUMENT_CHECKLIST } from '../types';

export interface ShipmentUploadProps {
  /** Shipment ID to upload files to. */
  shipmentId: string;
  /** True for export shipments: use export document checklist. False for import: use import document checklist. */
  isExport?: boolean;
  /** Called after a successful upload so the parent can refresh the file list. */
  onUploadSuccess?: () => void;
  /** When upload fails with "Shipment not found", call this to sync the shipment to the server. Return true if sync succeeded so upload can retry. */
  onShipmentNotFound?: () => Promise<boolean>;
  /** When document type is BOE or SB, call this with extracted OCR data so parent can show review modal; parent then uploads file and updates shipment on confirm. */
  onOcrDataExtracted?: (payload: { file: File; data: any; docType: 'BOE' | 'SB' }) => void;
}

/**
 * Simple file uploader for a shipment: POSTs to /api/shipments/:id/files using FormData.
 */
export const ShipmentUpload: React.FC<ShipmentUploadProps> = ({ shipmentId, isExport = false, onUploadSuccess, onShipmentNotFound, onOcrDataExtracted }) => {
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showSyncPrompt, setShowSyncPrompt] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [documentType, setDocumentType] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const documentTypeOptions = useMemo(() => {
    const checklist = isExport ? EXPORT_DOCUMENT_CHECKLIST : IMPORT_DOCUMENT_CHECKLIST;
    const list = checklist.map((doc) => ({ value: doc.id, label: doc.label }));
    return [{ value: '', label: 'Select document type' }, ...list, { value: 'Other', label: 'Other' }];
  }, [isExport]);

  const inferDocumentTypeFromFileName = (name: string): string | null => {
    const checklist = isExport ? EXPORT_DOCUMENT_CHECKLIST : IMPORT_DOCUMENT_CHECKLIST;
    const base = (name || '').replace(/\.[^/.]+$/, '').toUpperCase().trim();
    const normalized = base.replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (!base || !normalized) return null;

    // Sort by longest prefix first so LODGE_ADV wins over LODGE.
    const sorted = [...checklist].sort((a, b) => (b.prefix?.length || 0) - (a.prefix?.length || 0));
    for (const doc of sorted) {
      const id = String(doc.id || '').toUpperCase();
      const prefix = String(doc.prefix || `${id}_`).toUpperCase();
      if (!id) continue;
      if (base.startsWith(prefix)) return doc.id;
      if (base === id) return doc.id;
      if (base.startsWith(`${id}_`)) return doc.id;
      if (base.includes(`_${id}_`)) return doc.id;
    }

    const availableIds = new Set(checklist.map((d) => String(d.id || '').toUpperCase()));
    const hasId = (id: string) => availableIds.has(id);
    const hasToken = (token: string) => new RegExp(`(^|_)${token}(_|$)`).test(normalized);
    const hasAnyToken = (tokens: string[]) => tokens.some((t) => hasToken(t));

    if (hasId('LODGE_ADV') && hasAnyToken(['LODGE_ADV', 'LODGEMENT_ADV', 'LODGEMENT_ADVICE', 'LODGEMENT_ADVISE'])) return 'LODGE_ADV';
    if (hasId('LODGE') && hasAnyToken(['LODGE', 'LODGEMENT'])) return 'LODGE';
    if (hasId('COO') && (hasToken('COO') || normalized.includes('CERTIFICATE_OF_ORIGIN') || normalized.includes('CERT_OF_ORIGIN') || normalized.includes('ORIGIN_CERTIFICATE'))) return 'COO';
    if (hasId('INS') && (hasToken('INS') || normalized.includes('INSURANCE') || normalized.includes('POLICY'))) return 'INS';
    if (hasId('EWAY') && (hasToken('EWAY') || normalized.includes('E_WAY') || normalized.includes('EWAY_BILL') || normalized.includes('EWAYBILL'))) return 'EWAY';
    if (hasId('GP') && (hasToken('GP') || normalized.includes('GATE_PASS') || normalized.includes('GATEPASS'))) return 'GP';
    if (hasId('BOE') && (hasToken('BOE') || hasToken('BEO') || normalized.includes('BILL_OF_ENTRY') || normalized.includes('OUT_OF_CHARGE'))) return 'BOE';
    if (hasId('SB') && (hasToken('SB') || normalized.includes('SHIPPING_BILL'))) return 'SB';
    if (hasId('BL') && (hasToken('BL') || normalized.includes('BILL_OF_LADING') || hasToken('BOL'))) return 'BL';
    if (hasId('PL') && (hasToken('PL') || normalized.includes('PACKING_LIST'))) return 'PL';
    if (hasId('PI') && (hasToken('PI') || normalized.includes('PROFORMA_INVOICE') || normalized.includes('PROFORMA'))) return 'PI';
    if (hasId('CI') && (hasToken('CI') || normalized.includes('COMMERCIAL_INVOICE'))) return 'CI';
    if (hasId('SI') && (hasToken('SI') || normalized.includes('SALES_INDENT'))) return 'SI';
    if (hasId('EBRC') && (hasToken('EBRC') || normalized.includes('E_BRC') || normalized.includes('BANK_REALISATION') || normalized.includes('BANK_REALIZATION'))) return 'EBRC';

    return null;
  };

  const showToast = (message: string) => {
    setToast(message);
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  };

  const doUpload = async (file: File, docType?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.shipments.uploadFiles(shipmentId, formData, docType && docType !== 'Other' ? docType : undefined);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const input = inputRef.current;
    const file = input?.files?.[0];
    if (!file) {
      alert('Please select a file.');
      return;
    }
    if (!shipmentId) {
      alert('Shipment ID is missing.');
      return;
    }
    setShowSyncPrompt(false);
    setPendingFile(null);
    const isOcrType = (documentType === 'BOE' || documentType === 'SB') && onOcrDataExtracted;
    if (isOcrType) {
      setUploading(true);
      try {
        const fd = new FormData();
        fd.append('file', file);
        const result = await api.ocr.extract(fd);
        if (result.success && result.data) {
          onOcrDataExtracted({ file, data: result.data, docType: documentType as 'BOE' | 'SB' });
          if (input) input.value = '';
        } else {
          alert(result.error || 'Could not extract data from document.');
        }
      } catch (err: any) {
        alert(err?.message || 'Extraction failed');
      } finally {
        setUploading(false);
      }
      return;
    }
    setUploading(true);
    try {
      const result = await doUpload(file, documentType);
      if (result.success) {
        if (input) input.value = '';
        showToast('File uploaded successfully.');
        onUploadSuccess?.();
      } else {
        if (result.error === 'Shipment not found' && onShipmentNotFound) {
          setPendingFile(file);
          setShowSyncPrompt(true);
        } else {
          const msg = result.error === 'Shipment not found'
            ? 'Shipment not on server yet. Refresh the page to sync, then try again.'
            : (result.error || 'Upload failed');
          alert(msg);
        }
      }
    } catch (err: any) {
      alert(err?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleSyncAndRetry = async () => {
    if (!onShipmentNotFound || !pendingFile) return;
    setSyncing(true);
    try {
      const ok = await onShipmentNotFound();
      if (ok) {
        setShowSyncPrompt(false);
        setPendingFile(null);
        setUploading(true);
        const result = await doUpload(pendingFile, documentType);
        if (result.success) {
          if (inputRef.current) inputRef.current.value = '';
          showToast('File uploaded successfully.');
          onUploadSuccess?.();
        } else {
          alert(result.error || 'Upload failed');
        }
      } else {
        alert('Could not sync shipment to server. Try refreshing the page.');
      }
    } catch (err: any) {
      alert(err?.message || 'Sync failed');
    } finally {
      setSyncing(false);
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      {showSyncPrompt && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 flex flex-wrap items-center gap-2">
          <span>Shipment not on server yet.</span>
          <button
            type="button"
            onClick={handleSyncAndRetry}
            disabled={syncing || uploading}
            className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {syncing || uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {syncing ? 'Syncing…' : uploading ? 'Uploading…' : 'Sync to server and retry'}
          </button>
          <button
            type="button"
            onClick={() => { setShowSyncPrompt(false); setPendingFile(null); }}
            className="text-amber-700 hover:underline text-xs"
          >
            Dismiss
          </button>
        </div>
      )}
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Document type</label>
          <select
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value)}
            className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {documentTypeOptions.map((opt) => (
              <option key={opt.value || 'none'} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Choose file</label>
          <input
            ref={inputRef}
            type="file"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const inferred = inferDocumentTypeFromFileName(file.name);
              if (inferred) setDocumentType(inferred);
            }}
            className="block w-full text-sm text-gray-500 file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"
          />
        </div>
        <button
          type="submit"
          disabled={uploading}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Upload
        </button>
      </form>
      {toast && (
        <div className="flex items-center gap-2 rounded-md bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800">
          <FileUp className="h-4 w-4 text-green-600 flex-shrink-0" />
          {toast}
        </div>
      )}
    </div>
  );
};
