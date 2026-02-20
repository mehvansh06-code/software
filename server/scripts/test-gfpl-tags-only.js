/**
 * Test GFPL template with ONLY the 14 tags that exist in the current one-page template.
 * Uses raw PizZip + Docxtemplater (no bankPaymentDocGenerator XML changes) so the
 * output file should open in Word. If this works, the full generator can be aligned later.
 *
 * Run from repo root: node server/scripts/test-gfpl-tags-only.js
 */
const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');

const TEMPLATES_DIR = path.join(__dirname, '../templates/bank-payment');
const GFPL_TEMPLATE = 'ZHEJIANG FUSHENGDA.docx';
const TEST_OUTPUT_DIR = path.join(TEMPLATES_DIR, 'test-output');

// Only the 14 tags present in your one-page template (from the Request for Remittance form)
const GFPL_TAGS_ONLY = {
  currency_and_amount: 'USD 10,000.00',
  beneficiary_name: 'Test Supplier Ltd',
  beneficiary_address: '123 Export Street, Shanghai',
  beneficiary_country: 'China',
  iban: 'CN98 1234 5678 9012 3456 78',
  beneficiary_account: 'ACC123456',
  bank_swift: 'SWIFT123',
  bank_name: 'Test Bank',
  bank_address: 'Bank Branch, Shanghai',
  purpose: 'PAYMENT FOR PURCHASE OF GOODS',
  port_loading: 'Shanghai',
  port_discharge: 'Mundra',
  hsn_code: '3902',
  document_list: '1. REQUEST LETTER\n2. FORM A1',
};

function run() {
  const templatePath = path.join(TEMPLATES_DIR, GFPL_TEMPLATE);
  if (!fs.existsSync(templatePath)) {
    console.error('GFPL template not found:', templatePath);
    process.exit(1);
  }

  if (!fs.existsSync(TEST_OUTPUT_DIR)) {
    fs.mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
  }

  console.log('Testing GFPL template with 14 tags only (no generator XML changes)...\n');

  try {
    const content = fs.readFileSync(templatePath, 'binary');
    const zip = new PizZip(content);

    const doc = new Docxtemplater(zip, {
      delimiters: { start: '{', end: '}' },
      paragraphLoop: true,
      linebreaks: true,
      nullGetter: () => '', // any other tag in template stays blank
    });
    doc.render(GFPL_TAGS_ONLY);

    const buffer = doc.getZip().generate({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    const outPath = path.join(TEST_OUTPUT_DIR, 'GFPL-tags-only-test.docx');
    fs.writeFileSync(outPath, buffer);
    console.log('Written:', outPath);
    console.log('\nTags filled:', Object.keys(GFPL_TAGS_ONLY).join(', '));
    console.log('Open the file in Word. If it opens and shows the sample data, we can switch the main generator to this simple flow.');
  } catch (err) {
    console.error('Error:', err.message || err);
    if (err.properties && err.properties.explanation) {
      console.error('Details:', err.properties.explanation);
    }
    process.exit(1);
  }
}

run();
