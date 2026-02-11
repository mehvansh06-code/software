
export enum UserRole {
  MANAGEMENT = 'MANAGEMENT',
  CHECKER = 'CHECKER',
  EXECUTIONER = 'EXECUTIONER'
}

export enum AppDomain {
  IMPORT = 'IMPORT',
  EXPORT = 'EXPORT'
}

export interface User {
  id: string;
  username: string;
  role: UserRole;
  name: string;
}

export enum SupplierStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED'
}

export enum ProductType {
  RAW_MATERIAL = 'RAW_MATERIAL',
  CAPITAL_GOOD = 'CAPITAL_GOOD'
}

export interface MasterProduct {
  id: string;
  name: string;
  hsnCode: string;
  baseRate: number;
  category: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  hsnCode: string;
  unit: string;
  type: ProductType;
}

export interface ShipmentItem {
  productId: string;
  productName: string;
  description?: string;
  hsnCode: string;
  quantity: number;
  unit: string;
  rate: number;
  amount: number;
  productType?: ProductType;
}

export interface Supplier {
  id: string;
  name: string;
  address: string;
  country: string;
  bankName: string;
  accountHolderName: string;
  swiftCode: string;
  bankAddress: string;
  contactPerson: string;
  contactDetails?: string;
  contactNumber?: string;
  contactEmail?: string;
  status: SupplierStatus;
  products: Product[];
  requestedBy: string;
  createdAt: string;
  hasIntermediaryBank?: boolean;
  intermediaryBankName?: string;
  intermediaryAccountHolderName?: string;
  intermediarySwiftCode?: string;
  intermediaryBankAddress?: string;
}

export interface Consignee {
  id: string;
  name: string;
  address: string;
}

export interface Buyer {
  id: string;
  name: string;
  address: string;
  country: string;
  bankName: string;
  accountHolderName: string;
  swiftCode: string;
  bankAddress: string;
  contactPerson: string;
  contactDetails?: string;
  contactNumber?: string;
  contactEmail?: string;
  salesPersonName: string;
  salesPersonContact: string;
  hasConsignee: boolean;
  consignees: Consignee[];
  status: SupplierStatus; 
  requestedBy: string;
  createdAt: string;
}

export enum ShipmentStatus {
  /** Legacy; treated as Initiated in UI */
  ORDERED = 'ORDERED',
  INITIATED = 'INITIATED',
  LOADING = 'LOADING',
  IN_TRANSIT = 'IN_TRANSIT',
  REACHED_PORT = 'REACHED_PORT',
  REACHED_DRY_PORT = 'REACHED_DRY_PORT',
  REACHED_PLANT = 'REACHED_PLANT',
  REACHED_DESTINATION = 'REACHED_DESTINATION'
}

export interface ShipmentHistory {
  status: ShipmentStatus;
  date: string;
  location: string;
  remarks?: string;
  updatedBy?: string;
}

export interface PaymentLog {
  id: string;
  date: string;
  amount: number;
  currency: string;
  reference: string;
  mode: string;
  adviceUploaded: boolean;
  /** True when this payment has been received (e.g. LC honoured) */
  received?: boolean;
  /** Link to LC id when payment is via LC */
  linkedLcId?: string;
}

export interface Material {
  id: string;
  name: string;
  description?: string;
  hsnCode?: string;
  unit: string;
  type?: string;
}

export interface Shipment {
  id: string;
  supplierId?: string;
  buyerId?: string;
  items: ShipmentItem[]; // Support for multiple products
  productId?: string; // Legacy support
  rate: number;
  quantity: number;
  amount: number;
  currency: string;
  exchangeRate: number;
  incoTerm: string;
  invoiceNumber: string;
  invoiceFile?: string;
  company: 'GFPL' | 'GTEX';
  expectedShipmentDate: string;
  expectedArrivalDate?: string;
  createdAt: string;
  
  // FOB Fields
  fobValueFC: number;
  fobValueINR: number;
  
  // LC Integration Fields (import: our LC to pay supplier; export: buyer's LC)
  isUnderLC: boolean;
  lcNumber?: string;
  lcAmount?: number;
  lcDate?: string;
  /** When payment against LC is received, user can mark LC as settled (export/import) */
  lcSettled?: boolean;
  /** Export: linked LC id for payment tracking (if app has export LC entity) */
  linkedLcId?: string; 

  // Logistics Fields
  containerNumber?: string;
  blNumber?: string;
  blDate?: string;
  beNumber?: string;
  beDate?: string;
  portCode?: string;
  portOfLoading?: string;
  portOfDischarge?: string;
  shippingLine?: string;
  trackingUrl?: string;
  
  // Duties & Taxes
  assessedValue: number;
  dutyBCD: number;
  dutySWS: number;
  dutyINT: number;
  gst: number;
  
  invoiceValueINR: number;
  paymentDueDate?: string;
  invoiceDate?: string;
  freightCharges?: number;
  otherCharges?: number;
  
  // Licence Obligation Fields
  isUnderLicence: boolean;
  linkedLicenceId?: string;
  licenceObligationAmount?: number;
  
  status: ShipmentStatus;
  history: ShipmentHistory[];
  documents: {
    [key: string]: boolean;
  };
  /** Local folder path for this shipment's documents (SupplierName_InvoiceNo or BuyerName_InvoiceNo) */
  documentsFolderPath?: string;
  /** Export: bank lodgement number */
  lodgement?: string;
  /** Export: date of lodgement with bank */
  lodgementDate?: string;
  /** Editable remarks in inbound/outbound ledger */
  remarks?: string;
  /** Manual file status: pending, clearing, ok */
  fileStatus?: 'pending' | 'clearing' | 'ok';
  /** Export: selected consignee id (from buyer.consignees) */
  consigneeId?: string;
  attachments?: {
    [key: string]: string; // Base64 or local URL
  };
  payments: PaymentLog[];
}

export enum LicenceType {
  EPCG = 'EPCG',
  ADVANCE = 'ADVANCE'
}

export interface Licence {
  id: string;
  number: string;
  type: LicenceType;
  issueDate: string;
  expiryDate: string;
  dutySaved: number;
  eoRequired: number;
  eoFulfilled: number;
  company: 'GFPL' | 'GTEX';
  status: 'ACTIVE' | 'CLOSED' | 'EXPIRED';
}

export enum LCStatus {
  DRAFT = 'DRAFT',
  OPEN = 'OPEN',
  PAID = 'PAID',
  HONORED = 'HONORED',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED'
}

export interface LetterOfCredit {
  id: string;
  lcNumber: string;
  issuingBank: string;
  /** Import: beneficiary (supplier we pay). Export: not set. */
  supplierId?: string;
  /** Export: applicant (buyer from whom we receive payment). Import: not set. */
  buyerId?: string;
  amount: number;
  /** Remaining balance after linking shipments (amount minus sum of linked shipment values). */
  balanceAmount?: number;
  currency: string;
  issueDate: string;
  expiryDate: string;
  maturityDate: string;
  company: 'GFPL' | 'GTEX';
  status: LCStatus;
  remarks?: string;
  /** Shipment IDs linked to this LC. */
  shipments?: string[];
}

/** Transaction record when an LC is honored (settled). Import = DEBIT, Export = CREDIT. */
export interface LCTransaction {
  id: string;
  lcId: string;
  amount: number;
  currency: string;
  date: string;
  type: 'DEBIT' | 'CREDIT';
  shipmentId?: string;
  createdAt: string;
}

export const DOCUMENT_TYPES = [
  { id: 'PI', label: 'Proforma Invoice', prefix: 'PI_' },
  { id: 'CI', label: 'Commercial Invoice', prefix: 'CI_' },
  { id: 'PL', label: 'Packing List', prefix: 'PL_' },
  { id: 'BL', label: 'Bill of Lading', prefix: 'BL_' },
  { id: 'BE_O', label: 'Bill of Entry (Out of Charge)', prefix: 'BEO_' },
  { id: 'INS', label: 'Insurance', prefix: 'INS_' },
  { id: 'EWAY', label: 'E-Way Bill', prefix: 'EWAY_' },
  { id: 'GP', label: 'Gate Pass', prefix: 'GP_' },
  { id: 'COO', label: 'Certificate of Origin', prefix: 'COO_' }
];

/** Document checker: expected file name = prefix + invoiceRef (e.g. CI_245). Payment Advise = PAY_ADV_{amount}_{currency} per lodged payment. */
export const IMPORT_DOCUMENT_CHECKLIST = [
  { id: 'CI', label: 'Commercial Invoice', prefix: 'CI_' },
  { id: 'PL', label: 'Packing List', prefix: 'PL_' },
  { id: 'BL', label: 'Bill of Lading', prefix: 'BL_' },
  { id: 'BOE', label: 'Bill of Entry', prefix: 'BOE_' },
  { id: 'COO', label: 'COO (if any)', prefix: 'COO_' },
  { id: 'EWAY', label: 'E-Way Bill', prefix: 'EWAY_' },
  { id: 'GP', label: 'Gate Pass', prefix: 'GP_' },
  { id: 'INS', label: 'Insurance', prefix: 'INS_' },
];

/** Payment Advise: one expected file per lodged payment — PAY_ADV_{amount}_{currency} (e.g. PAY_ADV_2000_USD). */
export const EXPORT_DOCUMENT_CHECKLIST = [
  { id: 'SI', label: 'Sales Indent', prefix: 'SI_' },
  { id: 'CI', label: 'Commercial Invoice', prefix: 'CI_' },
  { id: 'PL', label: 'Packing List', prefix: 'PL_' },
  { id: 'SB', label: 'Shipping Bill', prefix: 'SB_' },
  { id: 'BL', label: 'Bill of Lading', prefix: 'BL_' },
  { id: 'LODGE', label: 'Lodgement', prefix: 'LODGE_' },
];

export const STANDARDISED_UNITS = [
  'KGS', 'MT', 'METER', 'ROLLS', 'PCS', 'NOS', 'SQM', 'SET', 'PKG', 'DRUM'
];
