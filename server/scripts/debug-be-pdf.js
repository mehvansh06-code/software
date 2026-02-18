/**
 * One-off debug: extract text from BE PDF and run parser to see raw text and parsed values.
 * Run: node server/scripts/debug-be-pdf.js
 */
const fs = require('fs');
const path = require('path');
const { extractTextFromPdf, parseCustomsDocument } = require('../services/ocrService');

const pdfPath = path.resolve(__dirname, '../../BE-8122770.pdf');

async function main() {
  if (!fs.existsSync(pdfPath)) {
    console.error('PDF not found:', pdfPath);
    process.exit(1);
  }
  const buffer = fs.readFileSync(pdfPath);
  console.log('PDF size:', buffer.length, 'bytes\n');

  const { text } = await extractTextFromPdf(buffer);
  const t = (text || '').replace(/\r\n/g, '\n');
  console.log('--- Raw text length:', t.length, '---\n');

  // Show region around INT / PNLTY / FINE (search for these keywords)
  const intIdx = t.search(/\b(15\.?\s*)?INT\b/i);
  if (intIdx >= 0) {
    const snippet = t.slice(Math.max(0, intIdx - 40), intIdx + 350);
    console.log('--- Snippet around INT/PNLTY/FINE ---');
    console.log(JSON.stringify(snippet));
    console.log('');
  }
  // Show region around exchange rate
  const usdIdx = t.search(/USD|EXCHANGE\s*RATE/i);
  if (usdIdx >= 0) {
    const snippet = t.slice(Math.max(0, usdIdx - 20), usdIdx + 120);
    console.log('--- Snippet around EXCHANGE RATE / USD ---');
    console.log(JSON.stringify(snippet));
    console.log('');
  }

  const parsed = parseCustomsDocument(t);
  console.log('--- Parsed BOE fields ---');
  console.log('beNumber:', parsed.beNumber);
  console.log('date:', parsed.date);
  console.log('portCode:', parsed.portCode);
  console.log('invoiceValue (assessable):', parsed.invoiceValue);
  console.log('dutyBCD:', parsed.dutyBCD);
  console.log('dutySWS:', parsed.dutySWS);
  console.log('dutyINT:', parsed.dutyINT);
  console.log('penalty:', parsed.penalty);
  console.log('fine:', parsed.fine);
  console.log('gst (IGST):', parsed.gst);
  console.log('exchangeRate:', parsed.exchangeRate);
  console.log('incoTerm:', parsed.incoTerm);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
