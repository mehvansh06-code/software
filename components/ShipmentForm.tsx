import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, RefreshCw, Loader2, Save } from 'lucide-react';
import { api } from '../api';
import type { Shipment } from '../types';

export interface ShipmentFormProps {
  /** Current shipment (must include version from server). */
  shipment: Shipment;
  /** Called after a successful PUT with the updated shipment (use to update parent state). */
  onSuccess?: (updated: Shipment) => void;
  /** Optional custom form content. If not provided, a minimal set of fields is rendered. */
  children?: (props: {
    formData: Partial<Shipment>;
    setFormData: React.Dispatch<React.SetStateAction<Partial<Shipment>>>;
    disabled: boolean;
    isSubmitting: boolean;
  }) => React.ReactNode;
}

/**
 * Form that tracks version for optimistic locking and handles 409 Conflict:
 * on 409, disables inputs and shows a "Discard & Refresh" flow.
 */
export const ShipmentForm: React.FC<ShipmentFormProps> = ({ shipment, onSuccess, children }) => {
  const [formData, setFormData] = useState<Partial<Shipment>>(() => ({ ...shipment }));
  const [version, setVersion] = useState<number>(shipment.version ?? 1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [conflict, setConflict] = useState(false);

  useEffect(() => {
    setFormData({ ...shipment });
    setVersion(shipment.version ?? 1);
    setConflict(false);
  }, [shipment.id, shipment.version]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!shipment.id || conflict) return;
      setIsSubmitting(true);
      setConflict(false);
      try {
        const payload = { ...formData, id: shipment.id, version };
        const { status, data } = await api.shipments.updateWithResponse(shipment.id, payload);
        if (status === 409) {
          setConflict(true);
          return;
        }
        if (status !== 200) {
          const msg = data?.error || 'Update failed';
          alert(msg);
          return;
        }
        const newVersion = data?.version;
        if (typeof newVersion === 'number') setVersion(newVersion);
        const updated = { ...formData, version: newVersion ?? version + 1 } as Shipment;
        onSuccess?.(updated);
      } catch (err: any) {
        alert(err?.message || 'Request failed');
      } finally {
        setIsSubmitting(false);
      }
    },
    [shipment.id, formData, version, conflict, onSuccess]
  );

  const handleDiscardAndRefresh = useCallback(async () => {
    if (!shipment.id) return;
    setIsSubmitting(true);
    try {
      const fresh = await api.shipments.get(shipment.id);
      setFormData({ ...fresh });
      setVersion(fresh.version ?? 1);
      setConflict(false);
      onSuccess?.(fresh as Shipment);
    } catch (err: any) {
      alert(err?.message || 'Could not refresh');
    } finally {
      setIsSubmitting(false);
    }
  }, [shipment.id, onSuccess]);

  const disabled = conflict;
  const formContent = children
    ? children({ formData, setFormData, disabled, isSubmitting })
    : (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Invoice number</label>
            <input
              type="text"
              value={formData.invoiceNumber ?? ''}
              onChange={(e) => setFormData((p) => ({ ...p, invoiceNumber: e.target.value }))}
              disabled={disabled}
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <input
              type="text"
              value={formData.status ?? ''}
              onChange={(e) => setFormData((p) => ({ ...p, status: e.target.value as any }))}
              disabled={disabled}
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Remarks</label>
            <input
              type="text"
              value={formData.remarks ?? ''}
              onChange={(e) => setFormData((p) => ({ ...p, remarks: e.target.value }))}
              disabled={disabled}
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
            />
          </div>
          <button
            type="submit"
            disabled={disabled || isSubmitting}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </button>
        </div>
      );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {conflict && (
        <div className="rounded-md bg-red-50 border border-red-200 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-800">Data modified by another user.</p>
            <p className="text-sm text-red-700 mt-1">Discard your changes and refresh to get the latest data.</p>
            <button
              type="button"
              onClick={handleDiscardAndRefresh}
              disabled={isSubmitting}
              className="mt-3 inline-flex items-center gap-2 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Discard & Refresh
            </button>
          </div>
        </div>
      )}
      {formContent}
    </form>
  );
};
