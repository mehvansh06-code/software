/**
 * Log full docxtemplater error (properties.errors) to fix template.
 * Run: node server/scripts/debug-bank-payment-error.js
 */
const path = require('path');
const { generateBankPaymentDocBuffer } = require('../bankPaymentDocGenerator');

const payload = {
  company_choice: 'Gujarat Flotex Pvt Ltd',
  date: '17-02-2026',
  invoice_no: 'INV/TEST/001',
  invoice_date: '01-02-2026',
  shipment_date: '15-02-2026',
  currency: 'USD',
  raw_amount: '10000',
  invoice_amount: '10,000.00',
  quantity: '500 KGS',
  beneficiary_name: 'Test Supplier Ltd',
  beneficiary_address: '123 Export Street',
  beneficiary_country: 'China',
  beneficiary_account: 'ACC123456',
  bank_name: 'Test Bank',
  bank_swift: 'SWIFT123',
  bank_address: 'Shanghai',
  port_loading: 'Shanghai',
  port_discharge: 'Mundra',
  purpose: 'PAYMENT FOR PURCHASE OF PVC RESIN',
  goods_desc: 'PVC Resin',
  hsn_code: '3902',
  term: 'CIF',
  mode_shipment: 'SEA',
  document_list: '1. REQUEST LETTER\n',
  items: [{ description: 'PVC Resin', hsn_code: '3902', quantity: 500, unit: 'KGS', amount: 10000 }],
};

(async () => {
  try {
    await generateBankPaymentDocBuffer(payload);
    console.log('OK');
  } catch (err) {
    console.error('Error name:', err.name);
    console.error('Error message:', err.message);
    if (err.properties && err.properties.errors && Array.isArray(err.properties.errors)) {
      console.error('Sub-errors:');
      err.properties.errors.forEach((e, i) => {
        console.error(`  [${i}]`, e.message, e.properties || '');
      });
    }
    if (err.stack) console.error('Stack:', err.stack);
  }
})();
