
import { ShipmentStatus } from './types';

export const COMPANIES = ['GFPL', 'GTEX'] as const;

/** Company options for shipment creation (Import & Export) */
export const COMPANY_OPTIONS = [
  { id: 'GFPL' as const, name: 'Gujarat Flotex Pvt Ltd' },
  { id: 'GTEX' as const, name: 'GTEX Fabrics Pvt Ltd' },
] as const;

/** Display label for company: uses abbreviations GFPL / GTEX */
export function getCompanyName(company: string | undefined): string {
  if (!company) return '—';
  const opt = COMPANY_OPTIONS.find(c => c.id === company);
  return opt ? opt.id : company;
}

/** Import lifecycle order */
export const SHIPMENT_STATUS_ORDER_IMPORT: ShipmentStatus[] = [
  ShipmentStatus.INITIATED,
  ShipmentStatus.LOADING,
  ShipmentStatus.IN_TRANSIT,
  ShipmentStatus.REACHED_PORT,
  ShipmentStatus.REACHED_DRY_PORT,
  ShipmentStatus.REACHED_PLANT,
];

/** Export lifecycle order */
export const SHIPMENT_STATUS_ORDER_EXPORT: ShipmentStatus[] = [
  ShipmentStatus.INITIATED,
  ShipmentStatus.LOADING,
  ShipmentStatus.IN_TRANSIT,
  ShipmentStatus.REACHED_DESTINATION,
];

/** Default order (import) for backward compat */
export const SHIPMENT_STATUS_ORDER: ShipmentStatus[] = SHIPMENT_STATUS_ORDER_IMPORT;

/** Human-readable label for status (Import & Export) */
export function getShipmentStatusLabel(status: string | undefined): string {
  if (!status) return '—';
  const labels: Record<string, string> = {
    ORDERED: 'Initiated',
    INITIATED: 'Initiated',
    LOADING: 'Loading',
    IN_TRANSIT: 'In Transit',
    REACHED_PORT: 'Reached Port',
    REACHED_DRY_PORT: 'Reached Dry Port',
    REACHED_PLANT: 'Reached Plant',
    REACHED_DESTINATION: 'Reached Destination',
  };
  return labels[status] || status.replace(/_/g, ' ');
}

/**
 * Formats a number to currency. Defaults to 0 if input is invalid to prevent React crashes.
 */
export const formatCurrency = (amount: any, currency: string = 'USD') => {
  const numericValue = Number(amount) || 0;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(numericValue);
  } catch (e) {
    return `${currency} ${numericValue.toFixed(2)}`;
  }
};

/**
 * Formats a number to Indian Rupees. Defaults to 0 if input is invalid.
 */
export const formatINR = (amount: any) => {
  const numericValue = Number(amount) || 0;
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
    }).format(numericValue);
  } catch (e) {
    return `₹${numericValue.toLocaleString('en-IN')}`;
  }
};

/**
 * Formats a date string or object to DD-MM-YYYY
 */
export const formatDate = (dateString: string | undefined | null) => {
  if (!dateString) return '---';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  } catch (e) {
    return '---';
  }
};
