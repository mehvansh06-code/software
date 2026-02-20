/**
 * Test import payment document generation with a minimal template (10 placeholders only).
 * Placeholder names match README.txt in server/templates/bank-payment/.
 * 1. Creates test-10-placeholders.docx with 10 real tags (each in one run).
 * 2. Runs docxtemplater with sample data and writes output to test-output/.
 *
 * Run from repo root: node server/scripts/test-10-placeholders.js
 */
const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');

const { createMinimalDocx, TEMPLATE_NAME, OUT_DIR } = require('./create-minimal-docx');

const TEST_OUTPUT_DIR = path.join(__dirname, '../templates/bank-payment/test-output');

// Sample data for the 10 placeholders (names from README.txt)
const TEN_PLACEHOLDER_DATA = {
  date: '19-02-2026',
  beneficiary_name: 'Test Supplier Ltd',
  beneficiary_address: '123 Export Street, Shanghai',
  beneficiary_country: 'China',
  beneficiary_account: 'ACC123456',
  bank_name: 'Test Bank',
  bank_swift: 'SWIFT123',
  invoice_no: 'INV/TEST/001',
  amount: '10,000.00',
  amount_in_words: 'Ten Thousand Dollars Only',
};

function loadTemplateZip(templatePath) {
  const content = fs.readFileSync(templatePath, 'binary');
  return new PizZip(content);
}

function generateWithDocxtemplater(zip, context) {
  const doc = new Docxtemplater(zip, {
    delimiters: { start: '{', end: '}' },
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => '',
  });
  doc.render(context);
  return doc.getZip().generate({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

async function run() {
  console.log('Test: 10-placeholder import payment document generation\n');

  // 1. Always regenerate template so placeholders are correct (no spaces in braces)
  const templatePath = path.join(OUT_DIR, TEMPLATE_NAME);
  console.log('Creating/updating minimal template...');
  createMinimalDocx();

  if (!fs.existsSync(TEST_OUTPUT_DIR)) {
    fs.mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
  }

  try {
    const zip = loadTemplateZip(templatePath);
    console.log('Rendering with 10 placeholder values...');
    const buffer = generateWithDocxtemplater(zip, TEN_PLACEHOLDER_DATA);

    const outPath = path.join(TEST_OUTPUT_DIR, 'test-10-placeholders-output.docx');
    let writtenPath = outPath;
    try {
      fs.writeFileSync(outPath, buffer);
    } catch (writeErr) {
      if (writeErr.code === 'EBUSY') {
        writtenPath = path.join(TEST_OUTPUT_DIR, 'test-10-placeholders-output-new.docx');
        fs.writeFileSync(writtenPath, buffer);
      } else {
        throw writeErr;
      }
    }
    console.log('Written:', writtenPath);
    console.log('\nPlaceholders (from README.txt): date, beneficiary_name, beneficiary_address, beneficiary_country, beneficiary_account, bank_name, bank_swift, invoice_no, amount, amount_in_words');
    console.log('Open the file and confirm all 10 fields show the sample data.');
    console.log('If correct, use these exact tag names in your main template (one run per placeholder).');
  } catch (err) {
    console.error('Error:', err.message || err);
    if (err.properties && err.properties.explanation) {
      console.error('Details:', err.properties.explanation);
    }
    process.exit(1);
  }
}

run();
