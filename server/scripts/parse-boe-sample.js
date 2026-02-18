/**
 * Run BOE parser on a sample PDF to see extracted text and parsed result.
 * Use this to verify parsing against your standard Bill of Entry format.
 *
 * Usage:
 *   node server/scripts/parse-boe-sample.js path/to/BE-5066726.pdf
 *   node server/scripts/parse-boe-sample.js
 *     (defaults to server/samples/BE-5066726.pdf if it exists)
 */

const fs = require('fs');
const path = require('path');

const pdfPath = process.argv[2] || path.join(__dirname, '../samples/BE-5066726.pdf');

async function main() {
  if (!fs.existsSync(pdfPath)) {
    console.error('PDF not found:', pdfPath);
    console.error('Place your BOE sample at server/samples/BE-5066726.pdf or pass the path as argument.');
    process.exit(1);
  }

  const { extractTextFromPdf, parseCustomsDocument } = require('../services/ocrService');
  const buffer = fs.readFileSync(pdfPath);
  const { text } = await extractTextFromPdf(buffer);
  const raw = (text || '').replace(/\r\n/g, '\n');

  console.log('--- Raw extracted text (first 6000 chars) ---\n');
  console.log(raw.slice(0, 6000));
  console.log('\n--- End of raw text ---\n');

  const parsed = parseCustomsDocument(raw);
  console.log('--- Parsed BOE result ---');
  console.log(JSON.stringify(parsed, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
