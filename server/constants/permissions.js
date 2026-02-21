/**
 * Permission system constants.
 * Use string values (e.g. 'shipments.view') for checks; PRESETS map legacy roles to permission arrays.
 */

const PERMISSIONS = {
  // Shipments
  SHIPMENTS_VIEW: 'shipments.view',
  SHIPMENTS_CREATE: 'shipments.create',
  SHIPMENTS_EDIT: 'shipments.edit',
  SHIPMENTS_DELETE: 'shipments.delete',
  SHIPMENTS_EXPORT: 'shipments.export',
  // Payments
  PAYMENTS_VIEW: 'payments.view',
  PAYMENTS_ADD: 'payments.add',
  PAYMENTS_EDIT: 'payments.edit',
  PAYMENTS_DELETE: 'payments.delete',
  // Documents
  DOCUMENTS_VIEW: 'documents.view',
  DOCUMENTS_UPLOAD: 'documents.upload',
  DOCUMENTS_DELETE: 'documents.delete',
  // Licences
  LICENCES_VIEW: 'licences.view',
  LICENCES_CREATE: 'licences.create',
  LICENCES_EDIT: 'licences.edit',
  LICENCES_DELETE: 'licences.delete',
  // LC
  LC_VIEW: 'lc.view',
  LC_CREATE: 'lc.create',
  LC_EDIT: 'lc.edit',
  LC_DELETE: 'lc.delete',
  // Suppliers
  SUPPLIERS_VIEW: 'suppliers.view',
  SUPPLIERS_CREATE: 'suppliers.create',
  SUPPLIERS_EDIT: 'suppliers.edit',
  SUPPLIERS_DELETE: 'suppliers.delete',
  // Buyers
  BUYERS_VIEW: 'buyers.view',
  BUYERS_CREATE: 'buyers.create',
  BUYERS_EDIT: 'buyers.edit',
  BUYERS_DELETE: 'buyers.delete',
  // Materials
  MATERIALS_VIEW: 'materials.view',
  MATERIALS_CREATE: 'materials.create',
  MATERIALS_EDIT: 'materials.edit',
  MATERIALS_DELETE: 'materials.delete',
  // Sales Indent (hub)
  INDENT_VIEW: 'indent.view',
  INDENT_CREATE: 'indent.create',
  INDENT_EDIT: 'indent.edit',
  INDENT_DELETE: 'indent.delete',
  INDENT_GENERATE: 'indent.generate',
  INDENT_DOMESTIC_BUYERS: 'indent.domestic_buyers',
  INDENT_PRODUCTS: 'indent.products',
  INDENT_EXPORT_BUYERS: 'indent.export_buyers',
  // Bank Import Payment Document Generator
  BANK_PAYMENT_DOCS_GENERATE: 'bank_payment_docs.generate',
  // Insurance
  INSURANCE_VIEW: 'insurance.view',
  INSURANCE_CREATE: 'insurance.create',
  INSURANCE_EDIT: 'insurance.edit',
  INSURANCE_DELETE: 'insurance.delete',
  // Reports
  REPORTS_VIEW: 'reports.view',
  REPORTS_EXPORT: 'reports.export',
  // Users
  USERS_VIEW: 'users.view',
  USERS_CREATE: 'users.create',
  USERS_EDIT: 'users.edit',
  USERS_DELETE: 'users.delete',
  USERS_MANAGE_PERMISSIONS: 'users.manage_permissions',
  // System
  SYSTEM_SETTINGS: 'system.settings',
  SYSTEM_AUDIT_LOGS: 'system.audit_logs',
};

const ALL_PERMISSION_VALUES = Object.values(PERMISSIONS);

/** All permissions that are "view" only (for VIEWER preset). */
const ALL_VIEW_PERMISSIONS = ALL_PERMISSION_VALUES.filter((p) => p.endsWith('.view'));

/** VIEWER: All *.view permissions. */
const VIEWER = [...ALL_VIEW_PERMISSIONS];

/** CHECKER: All *.view plus create/edit for Shipments, Payments, Licences, LC, Suppliers, Buyers, Indent. */
const CHECKER = [
  ...ALL_VIEW_PERMISSIONS,
  PERMISSIONS.SHIPMENTS_CREATE,
  PERMISSIONS.SHIPMENTS_EDIT,
  PERMISSIONS.PAYMENTS_ADD,
  PERMISSIONS.PAYMENTS_EDIT,
  PERMISSIONS.LICENCES_CREATE,
  PERMISSIONS.LICENCES_EDIT,
  PERMISSIONS.LC_CREATE,
  PERMISSIONS.LC_EDIT,
  PERMISSIONS.LC_DELETE,
  PERMISSIONS.SUPPLIERS_CREATE,
  PERMISSIONS.SUPPLIERS_EDIT,
  PERMISSIONS.BUYERS_CREATE,
  PERMISSIONS.BUYERS_EDIT,
  PERMISSIONS.INDENT_VIEW,
  PERMISSIONS.INDENT_CREATE,
  PERMISSIONS.INDENT_EDIT,
  PERMISSIONS.INDENT_DELETE,
  PERMISSIONS.INDENT_GENERATE,
  PERMISSIONS.INDENT_DOMESTIC_BUYERS,
  PERMISSIONS.INDENT_PRODUCTS,
  PERMISSIONS.INDENT_EXPORT_BUYERS,
  PERMISSIONS.BANK_PAYMENT_DOCS_GENERATE,
  PERMISSIONS.INSURANCE_CREATE,
  PERMISSIONS.INSURANCE_EDIT,
  PERMISSIONS.MATERIALS_VIEW,
  PERMISSIONS.MATERIALS_CREATE,
  PERMISSIONS.MATERIALS_EDIT,
];

/** MANAGEMENT: All permissions. */
const MANAGEMENT = [...ALL_PERMISSION_VALUES];

const PRESETS = {
  VIEWER,
  CHECKER,
  MANAGEMENT,
  // Legacy role name used in DB
  EXECUTIONER: VIEWER,
};

/** UI grouping for permission matrix. */
const PERMISSION_GROUPS = [
  {
    id: 'shipments',
    label: 'Shipments',
    permissions: [
      PERMISSIONS.SHIPMENTS_VIEW,
      PERMISSIONS.SHIPMENTS_CREATE,
      PERMISSIONS.SHIPMENTS_EDIT,
      PERMISSIONS.SHIPMENTS_DELETE,
      PERMISSIONS.SHIPMENTS_EXPORT,
    ],
  },
  {
    id: 'payments',
    label: 'Payments',
    permissions: [
      PERMISSIONS.PAYMENTS_VIEW,
      PERMISSIONS.PAYMENTS_ADD,
      PERMISSIONS.PAYMENTS_EDIT,
      PERMISSIONS.PAYMENTS_DELETE,
    ],
  },
  {
    id: 'documents',
    label: 'Documents',
    permissions: [
      PERMISSIONS.DOCUMENTS_VIEW,
      PERMISSIONS.DOCUMENTS_UPLOAD,
      PERMISSIONS.DOCUMENTS_DELETE,
    ],
  },
  {
    id: 'licences',
    label: 'Licences',
    permissions: [
      PERMISSIONS.LICENCES_VIEW,
      PERMISSIONS.LICENCES_CREATE,
      PERMISSIONS.LICENCES_EDIT,
      PERMISSIONS.LICENCES_DELETE,
    ],
  },
  {
    id: 'lc',
    label: 'LC',
    permissions: [
      PERMISSIONS.LC_VIEW,
      PERMISSIONS.LC_CREATE,
      PERMISSIONS.LC_EDIT,
      PERMISSIONS.LC_DELETE,
    ],
  },
  {
    id: 'suppliers',
    label: 'Suppliers',
    permissions: [
      PERMISSIONS.SUPPLIERS_VIEW,
      PERMISSIONS.SUPPLIERS_CREATE,
      PERMISSIONS.SUPPLIERS_EDIT,
      PERMISSIONS.SUPPLIERS_DELETE,
    ],
  },
  {
    id: 'buyers',
    label: 'Buyers',
    permissions: [
      PERMISSIONS.BUYERS_VIEW,
      PERMISSIONS.BUYERS_CREATE,
      PERMISSIONS.BUYERS_EDIT,
      PERMISSIONS.BUYERS_DELETE,
    ],
  },
  {
    id: 'materials',
    label: 'Materials',
    permissions: [
      PERMISSIONS.MATERIALS_VIEW,
      PERMISSIONS.MATERIALS_CREATE,
      PERMISSIONS.MATERIALS_EDIT,
      PERMISSIONS.MATERIALS_DELETE,
    ],
  },
  {
    id: 'indent',
    label: 'Sales Indent',
    permissions: [
      PERMISSIONS.INDENT_VIEW,
      PERMISSIONS.INDENT_CREATE,
      PERMISSIONS.INDENT_EDIT,
      PERMISSIONS.INDENT_DELETE,
      PERMISSIONS.INDENT_GENERATE,
      PERMISSIONS.INDENT_DOMESTIC_BUYERS,
      PERMISSIONS.INDENT_PRODUCTS,
      PERMISSIONS.INDENT_EXPORT_BUYERS,
    ],
  },
  {
    id: 'bank_payment_docs',
    label: 'Bank Import Payment Docs',
    permissions: [PERMISSIONS.BANK_PAYMENT_DOCS_GENERATE],
  },
  {
    id: 'insurance',
    label: 'Insurance',
    permissions: [
      PERMISSIONS.INSURANCE_VIEW,
      PERMISSIONS.INSURANCE_CREATE,
      PERMISSIONS.INSURANCE_EDIT,
      PERMISSIONS.INSURANCE_DELETE,
    ],
  },
  {
    id: 'reports',
    label: 'Reports',
    permissions: [PERMISSIONS.REPORTS_VIEW, PERMISSIONS.REPORTS_EXPORT],
  },
  {
    id: 'users',
    label: 'Users',
    permissions: [
      PERMISSIONS.USERS_VIEW,
      PERMISSIONS.USERS_CREATE,
      PERMISSIONS.USERS_EDIT,
      PERMISSIONS.USERS_DELETE,
      PERMISSIONS.USERS_MANAGE_PERMISSIONS,
    ],
  },
  {
    id: 'system',
    label: 'System',
    permissions: [PERMISSIONS.SYSTEM_SETTINGS, PERMISSIONS.SYSTEM_AUDIT_LOGS],
  },
];

module.exports = {
  PERMISSIONS,
  PRESETS,
  PERMISSION_GROUPS,
  ALL_PERMISSION_VALUES,
};
