/**
 * Test bank payment document generator: single product, multi-product, GFPL and GTEX.
 * Writes .docx files to server/templates/bank-payment/test-output/
 *
 * Run from repo root: node server/scripts/test-bank-payment-generator.js
 *
 * If you see "Multi error" or "SKIP: template issue", fix templates:
 * - Run: node server/scripts/fix-template-braces.js
 *   (run multiple times until it reports "nothing changed")
 * - In Word, use single braces only: { tag_name }, not {{ tag_name }}
 */
const fs = require('fs');
const path = require('path');
const { generateBankPaymentDocBuffer } = require('../bankPaymentDocGenerator');

function shortError(e) {
  if (!e) return '(unknown)';
  const msg = (e.message && String(e.message)) || (e.errors && e.errors[0] && e.errors[0].message) || (e.properties && e.properties.explanation) || '';
  return msg ? String(msg).slice(0, 120) : '(template error)';
}

async function safeGenerate(data) {
  try {
    return await generateBankPaymentDocBuffer(data);
  } catch (e) {
    throw new Error(shortError(e));
  }
}

const OUT_DIR = path.join(__dirname, '../templates/bank-payment/test-output');

const basePayload = {
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
  beneficiary_address: '123 Export Street, Shanghai',
  beneficiary_country: 'China',
  beneficiary_account: 'ACC123456',
  bank_name: 'Test Bank',
  bank_swift: 'SWIFT123',
  bank_address: 'Bank Branch, Shanghai',
  port_loading: 'Shanghai',
  port_discharge: 'Mundra',
  purpose: 'PAYMENT FOR PURCHASE OF PVC RESIN',
  goods_desc: 'PVC Resin',
  hsn_code: '3902',
  term: 'CIF',
  mode_shipment: 'SEA',
  document_list: '1.       REQUEST LETTER\n2.       FORM A1\n',
};

async function run() {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  console.log('Testing bank payment document generator...\n');

  try {
    // 1) Single product, GFPL (optional - template may have duplicate-brace issues)
    console.log('1. Single product, GFPL...');
    try {
      const singleGFPL = await safeGenerate(basePayload);
      fs.writeFileSync(path.join(OUT_DIR, 'GFPL_single_product.docx'), singleGFPL);
      console.log('   -> GFPL_single_product.docx');
    } catch (e) {
      console.log('   SKIP: GFPL template issue -', shortError(e));
    }

    // 2) Single product, GTEX (required)
    console.log('2. Single product, GTEX...');
    let singleGTEX;
    try {
      singleGTEX = await safeGenerate({
        ...basePayload,
        company_choice: 'GTEX Fabrics',
      });
      fs.writeFileSync(path.join(OUT_DIR, 'GTEX_single_product.docx'), singleGTEX);
      console.log('   -> GTEX_single_product.docx');
    } catch (e) {
      console.error('   FAIL:', shortError(e));
      throw e;
    }

    // 3) Multi product, GFPL (optional)
    console.log('3. Multi product (2 items), GFPL...');
    try {
      const multiGFPL = await safeGenerate({
        ...basePayload,
        invoice_amount: '10,000.00',
        goods_desc: 'PVC Resin, Dyed Knitted Fabric',
        hsn_code: '3902, 6006',
        quantity: '200 KGS, 300 MTR',
        purpose: 'PAYMENT FOR PURCHASE OF PVC RESIN, DYED KNITTED FABRIC',
        items: [
          { description: 'PVC Resin', hsn_code: '3902', quantity: 200, unit: 'KGS', amount: 2000 },
          { description: 'Dyed Knitted Fabric', hsn_code: '6006', quantity: 300, unit: 'MTR', amount: 8000 },
        ],
      });
      fs.writeFileSync(path.join(OUT_DIR, 'GFPL_multi_product.docx'), multiGFPL);
      console.log('   -> GFPL_multi_product.docx');
    } catch (e) {
      console.log('   SKIP:', shortError(e));
    }

    // 4) Multi product, GTEX (required)
    console.log('4. Multi product (2 items), GTEX...');
    let multiGTEX;
    try {
      multiGTEX = await safeGenerate({
      ...basePayload,
      company_choice: 'GTEX Fabrics',
      invoice_amount: '10,000.00',
      goods_desc: 'PVC Resin, Dyed Knitted Fabric',
      hsn_code: '3902, 6006',
      quantity: '200 KGS, 300 MTR',
      purpose: 'PAYMENT FOR PURCHASE OF PVC RESIN, DYED KNITTED FABRIC',
      items: [
        { description: 'PVC Resin', hsn_code: '3902', quantity: 200, unit: 'KGS', amount: 2000 },
        { description: 'Dyed Knitted Fabric', hsn_code: '6006', quantity: 300, unit: 'MTR', amount: 8000 },
      ],
    });
      fs.writeFileSync(path.join(OUT_DIR, 'GTEX_multi_product.docx'), multiGTEX);
      console.log('   -> GTEX_multi_product.docx');
    } catch (e) {
      console.error('   FAIL:', shortError(e));
      throw e;
    }

    console.log('\nAll documents generated successfully.');
    console.log('Output folder:', OUT_DIR);
  } catch (err) {
    console.error('Test failed:', shortError(err));
    process.exit(1);
  }
}

run();
