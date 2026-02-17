const express = require('express');
const { hasPermission } = require('../middleware');
const { generateBankPaymentDocBuffer } = require('../bankPaymentDocGenerator');

const REQUIRED_FIELDS = [
  'company_choice',
  'invoice_no',
  'invoice_date',
  'shipment_date',
  'currency',
  'raw_amount',
  'beneficiary_name',
  'beneficiary_address',
  'beneficiary_country',
  'beneficiary_account',
  'bank_name',
  'bank_swift',
  'bank_address',
  'port_loading',
  'port_discharge',
  'goods_desc',
  'hsn_code',
  'term',
  'mode_shipment',
];

const FIELD_LABELS = {
  company_choice: 'Importer (Company)',
  invoice_no: 'Invoice Number',
  invoice_date: 'Invoice Date',
  shipment_date: 'Shipment Date',
  currency: 'Currency',
  raw_amount: 'Remittance Amount',
  beneficiary_name: 'Supplier Name',
  beneficiary_address: 'Supplier Address',
  beneficiary_country: 'Supplier Country',
  beneficiary_account: 'Account Number',
  bank_name: 'Bank Name',
  bank_swift: 'SWIFT Code',
  bank_address: 'Bank Branch Address',
  port_loading: 'Port of Loading',
  port_discharge: 'Port of Discharge',
  goods_desc: 'Goods Description',
  hsn_code: 'HSN Code',
  term: 'IncoTerm',
  mode_shipment: 'Shipment Mode',
};

function validateBody(data) {
  if (!data || typeof data !== 'object') return 'Request body required.';
  for (const key of REQUIRED_FIELDS) {
    const val = data[key];
    const str = typeof val === 'string' ? val.trim() : '';
    if (!str) return `MISSING: '${FIELD_LABELS[key] || key}' is empty.`;
    if (str.includes('Select')) return `INVALID: Please select a valid '${FIELD_LABELS[key] || key}'.`;
  }
  const qty = (data.quantity || '').trim();
  const parts = qty.split(/\s+/).filter(Boolean);
  if (parts.length < 2 || !parts[0]) return "MISSING: 'Quantity' value is required.";
  if (parts[1] && parts[1].includes('Select')) return "INVALID: Please select a valid Quantity Unit.";
  const amt = parseFloat(data.raw_amount);
  if (Number.isNaN(amt) || amt <= 0) return 'ERROR: Amount must be greater than 0.';
  return null;
}

function createRouter() {
  const router = express.Router();

  router.post('/generate', hasPermission('bank_payment_docs.generate'), async (req, res) => {
    try {
      const data = req.body;
      const err = validateBody(data);
      if (err) return res.status(400).json({ success: false, error: err });

      const buffer = await generateBankPaymentDocBuffer(data);
      const invoiceNo = (data.invoice_no || 'doc').replace(/[/\\?*:"]/g, '_');
      const currency = (data.currency || 'USD').trim();
      const filename = `${invoiceNo}_${currency}.docx`;

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (err) {
      console.error('Bank payment doc generate error:', err);
      const raw = err.message || 'Failed to generate document';
      const friendly = (raw === 'Multi error' || String(raw).includes('Multi error'))
        ? 'One or more required fields are missing or invalid. Please check all fields (company, supplier, invoice, bank details, shipment & goods) and try again.'
        : raw;
      res.status(500).json({ success: false, error: friendly });
    }
  });

  return router;
}

module.exports = createRouter;
