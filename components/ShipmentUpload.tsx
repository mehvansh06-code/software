import React, { useState, useRef } from 'react';
import { Upload, Loader2, FileUp } from 'lucide-react';
import { api } from '../api';

export interface ShipmentUploadProps {
  /** Shipment ID to upload files to. */
  shipmentId: string;
  /** Called after a successful upload so the parent can refresh the file list. */
  onUploadSuccess?: () => void;
}

/**
 * Simple file uploader for a shipment: file input + Upload button.
 * POSTs to /api/shipments/:id/files using FormData.
 */
export const ShipmentUpload: React.FC<ShipmentUploadProps> = ({ shipmentId, onUploadSuccess }) => {
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const showToast = (message: string) => {
    setToast(message);
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
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
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const result = await api.shipments.uploadFiles(shipmentId, formData);
      if (result.success) {
        if (input) input.value = '';
        showToast('File uploaded successfully.');
        onUploadSuccess?.();
      } else {
        alert(result.error || 'Upload failed');
      }
    } catch (err: any) {
      alert(err?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Choose file</label>
          <input
            ref={inputRef}
            type="file"
            disabled={uploading}
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
