/**
 * Test that produces a docx that OPENS and is FILLED — no loop.
 *
 * We use a template created in code (test-14-gfpl-tags.docx) where every
 * placeholder is in a single XML run. No merge step, no Word-edited file.
 * So: no blank (single-run tags), no corruption (no merge).
 *
 * Run: node server/scripts/test-gfpl-data-on-10placeholder-template.js
 */
const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');

const { createMinimalDocx } = require('./create-minimal-docx');

const TEMPLATES_DIR = path.join(__dirname, '../templates/bank-payment');
const TEMPLATE_14_NAME = 'test-14-gfpl-tags.docx';
const TEST_OUTPUT_DIR = path.join(TEMPLATES_DIR, 'test-output');

const GFPL_TAGS_DATA = {
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
  if (!fs.existsSync(TEST_OUTPUT_DIR)) {
    fs.mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
  }

  console.log('Creating 14-tag template in code (each tag in one run — no Word, no merge)...');
  createMinimalDocx(true);

  const templatePath = path.join(TEMPLATES_DIR, TEMPLATE_14_NAME);
  console.log('Loading', TEMPLATE_14_NAME);
  console.log('Filling with 14 GFPL-tag data...\n');

  try {
    const content = fs.readFileSync(templatePath, 'binary');
    const zip = new PizZip(content);

    const doc = new Docxtemplater(zip, {
      delimiters: { start: '{', end: '}' },
      paragraphLoop: true,
      linebreaks: true,
      nullGetter: () => '',
    });
    doc.render(GFPL_TAGS_DATA);

    const buffer = doc.getZip().generate({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    const outPath = path.join(TEST_OUTPUT_DIR, 'test-10placeholder-template-with-GFPL-data.docx');
    fs.writeFileSync(outPath, buffer);
    console.log('Written:', outPath);
    console.log('This file should OPEN in Word and show all 14 fields filled.');
  } catch (err) {
    console.error('Error:', err.message || err);
    if (err.properties && err.properties.explanation) {
      console.error('Details:', err.properties.explanation);
    }
    process.exit(1);
  }
}

run();
