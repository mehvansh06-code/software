/**
 * One-off script: run OCR on BILL OF ENTRY.pdf and print extracted data + accuracy.
 * Run from project root: node test-ocr-boe.js
 */

const path = require('path');
const fs = require('fs');

const pdfPath = path.join(__dirname, 'BILL OF ENTRY.pdf');

if (!fs.existsSync(pdfPath)) {
  console.error('File not found:', pdfPath);
  console.error('Please ensure BILL OF ENTRY.pdf is in the project root (same folder as package.json).');
  process.exit(1);
}

const buffer = fs.readFileSync(pdfPath);
const { extractDataFromPDF, extractTextFromPdf, parseCustomsDocument } = require('./server/services/ocrService');

async function main() {
  console.log('--- BILL OF ENTRY OCR Test ---\n');
  console.log('File:', pdfPath);
  console.log('Size:', (buffer.length / 1024).toFixed(1), 'KB\n');

  try {
    // 1) Full extraction (text layer or OCR fallback)
    console.log('Running extractDataFromPDF (text layer first, then OCR fallback)...\n');
    const start = Date.now();
    const parsed = await extractDataFromPDF(buffer);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log('Extraction took', elapsed, 'seconds.');
    console.log('Source:', parsed.source || 'unknown'); // 'text' = PDF text layer, 'ocr' = Tesseract
    console.log('Confidence:', parsed.confidence != null ? parsed.confidence + '%' : 'N/A');
    console.log('\n--- Extracted data ---');
    const fields = [
      'beNumber',
      'sbNumber',
      'date',
      'portCode',
      'invoiceValue',
      'containerNumber',
      'blNumber',
      'blDate',
      'shippingLine',
      'dutyBCD',
      'dutySWS',
      'dutyINT',
      'gst',
    ];
    for (const f of fields) {
      const v = parsed[f];
      console.log('  ' + f + ':', v == null ? '(not found)' : v);
    }

    // 2) Raw text preview (first 1500 chars) for manual accuracy check
    const { text: rawText } = await extractTextFromPdf(buffer);
    const preview = (rawText || '').trim().slice(0, 1500);
    console.log('\n--- Raw text preview (first 1500 chars) ---');
    console.log(preview || '(empty - likely used OCR path)');
    if (preview.length >= 1500) console.log('... [truncated]');

    console.log('\n--- Accuracy check ---');
    console.log('Compare the "Extracted data" above with the actual PDF.');
    console.log('Key fields: BE No, SB No, Date, Port Code, Invoice/Assessable Value.');
    console.log('If source=text: digital PDF text was used (usually 100% accurate).');
    console.log('If source=ocr: first page was converted to image and Tesseract was used (check for misreads).');
  } catch (err) {
    console.error('Error:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  }
}

main();
