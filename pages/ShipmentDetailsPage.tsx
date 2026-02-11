import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Loader2, Download } from 'lucide-react';
import { api } from '../api';
import { ShipmentForm } from '../components/ShipmentForm';
import { ShipmentUpload } from '../components/ShipmentUpload';
import type { Shipment } from '../types';

/**
 * Standalone shipment details page: Form (left), Documents upload + file list (right).
 * Route: /shipments/:id
 */
const ShipmentDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<Array<{ name: string } | string>>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);

  const fetchShipment = useCallback(async (shipmentId: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.shipments.get(shipmentId);
      setShipment(data as Shipment);
    } catch (e: any) {
      setError(e?.message || 'Failed to load shipment');
      setShipment(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchFiles = useCallback(async (shipmentId: string) => {
    setLoadingFiles(true);
    try {
      const res = await api.shipments.getDocumentsFolderFiles(shipmentId);
      setFiles(Array.isArray(res.files) ? res.files : []);
    } catch {
      setFiles([]);
    } finally {
      setLoadingFiles(false);
    }
  }, []);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setError('Missing shipment ID');
      return;
    }
    fetchShipment(id);
  }, [id, fetchShipment]);

  useEffect(() => {
    if (!id || !shipment) return;
    fetchFiles(id);
  }, [id, shipment?.id, fetchFiles]);

  const handleUploadSuccess = useCallback(() => {
    if (id) fetchFiles(id);
  }, [id, fetchFiles]);

  const handleDownload = useCallback(
    async (filename: string) => {
      if (!id) return;
      const name = typeof filename === 'string' ? filename : (filename as { name: string }).name;
      try {
        const blob = await api.shipments.downloadFile(id, name);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (e: any) {
        alert(e?.message || 'Download failed');
      }
    },
    [id]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[320px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error || !shipment) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </button>
        <div className="rounded-md bg-red-50 border border-red-200 p-4 text-red-800">
          {error || 'Shipment not found'}
        </div>
      </div>
    );
  }

  const fileList = files.map((f, i) => (typeof f === 'string' ? f : f.name));

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="mb-6">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 font-medium"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left: Shipment form */}
        <section className="lg:col-span-1">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Shipment details</h2>
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <ShipmentForm
              shipment={shipment}
              onSuccess={(updated) => setShipment(updated)}
            />
          </div>
        </section>

        {/* Right: Documents */}
        <section className="lg:col-span-1">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Documents</h2>
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm space-y-6">
            <ShipmentUpload
              shipmentId={shipment.id}
              onUploadSuccess={handleUploadSuccess}
            />

            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Existing files</h3>
              {loadingFiles ? (
                <div className="flex items-center gap-2 text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading…
                </div>
              ) : fileList.length === 0 ? (
                <p className="text-sm text-gray-500">No files yet. Upload one above.</p>
              ) : (
                <ul className="space-y-2">
                  {fileList.map((name) => (
                    <li
                      key={name}
                      className="flex items-center justify-between gap-3 py-2 px-3 rounded-md bg-gray-50 hover:bg-gray-100"
                    >
                      <span className="flex items-center gap-2 text-sm text-gray-800 truncate min-w-0">
                        <FileText className="h-4 w-4 text-gray-400 flex-shrink-0" />
                        {name}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDownload(name)}
                        className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 flex-shrink-0"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Download
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default ShipmentDetailsPage;
