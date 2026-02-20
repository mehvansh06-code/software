/**
 * Test OCR/parsing accuracy on all PDFs in C:\software\SB and C:\software\BE.
 * Reports extracted vs missing fields and dumps raw snippets for parser tuning.
 * Run: node server/scripts/test-sb-be-accuracy.js
 */
const fs = require('fs');
const path = require('path');
const { extractTextFromPdf, parseCustomsDocument } = require('../services/ocrService');

const SB_DIR = path.resolve(__dirname, '../../SB');
const BE_DIR = path.resolve(__dirname, '../../BE');
const SNIPPET_LEN = 180;

function getSnippet(t, keywordRegex, before = 40, after = SNIPPET_LEN) {
  const m = t.match(keywordRegex);
  if (!m) return null;
  const start = Math.max(0, m.index - before);
  const end = Math.min(t.length, m.index + m[0].length + after);
  return t.slice(start, end).replace(/\n/g, '\\n ');
}

function getChunkAfter(t, keywordRegex, afterChars = 500) {
  const m = t.match(keywordRegex);
  if (!m) return null;
  return t.slice(m.index + m[0].length, Math.min(t.length, m.index + m[0].length + afterChars));
}

async function processPdf(filePath) {
  const buffer = fs.readFileSync(filePath);
  const { text } = await extractTextFromPdf(buffer);
  const t = (text || '').replace(/\r\n/g, '\n');
  const parsed = parseCustomsDocument(t);
  return { text: t, parsed };
}

// SB expected fields
const SB_FIELDS = ['portCode', 'sbNumber', 'date', 'fobValueINR', 'invoiceValue', 'fobValueFC', 'exchangeRate', 'incoTerm', 'rodtep', 'dbk'];
// BE expected fields
const BE_FIELDS = ['portCode', 'beNumber', 'date', 'invoiceValue', 'exchangeRate', 'incoTerm', 'dutyBCD', 'dutySWS', 'gst', 'dutyINT', 'penalty', 'fine'];

function runDir(dir, label, fields) {
  return fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.pdf')).map((f) => path.join(dir, f))
    : [];
}

async function main() {
  const sbFiles = runDir(SB_DIR, 'SB', SB_FIELDS);
  const beFiles = runDir(BE_DIR, 'BE', BE_FIELDS);

  console.log('SB folder:', SB_DIR, '->', sbFiles.length, 'PDFs');
  console.log('BE folder:', BE_DIR, '->', beFiles.length, 'PDFs\n');

  const sbResults = [];
  const beResults = [];

  for (const filePath of sbFiles) {
    const name = path.basename(filePath);
    try {
      const { text, parsed } = await processPdf(filePath);
      const filled = SB_FIELDS.filter((f) => parsed[f] != null && String(parsed[f]).trim() !== '');
      const missing = SB_FIELDS.filter((f) => !filled.includes(f));
      sbResults.push({ name, parsed, filled, missing, textLength: text.length });
    } catch (err) {
      sbResults.push({ name, error: err.message });
    }
  }

  for (const filePath of beFiles) {
    const name = path.basename(filePath);
    try {
      const { text, parsed } = await processPdf(filePath);
      const filled = BE_FIELDS.filter((f) => parsed[f] != null && String(parsed[f]).trim() !== '');
      const missing = BE_FIELDS.filter((f) => !filled.includes(f));
      beResults.push({ name, parsed, filled, missing, textLength: text.length });
    } catch (err) {
      beResults.push({ name, error: err.message });
    }
  }

  console.log('=== SHIPPING BILLS (SB) ===\n');
  console.log('File\t' + SB_FIELDS.join('\t'));
  for (const r of sbResults) {
    if (r.error) {
      console.log(r.name + '\tERROR: ' + r.error);
      continue;
    }
    const row = SB_FIELDS.map((f) => (r.parsed[f] != null ? String(r.parsed[f]) : ''));
    console.log(r.name + '\t' + row.join('\t'));
  }

  console.log('\n=== BILLS OF ENTRY (BE) ===\n');
  console.log('File\t' + BE_FIELDS.join('\t'));
  for (const r of beResults) {
    if (r.error) {
      console.log(r.name + '\tERROR: ' + r.error);
      continue;
    }
    const row = BE_FIELDS.map((f) => (r.parsed[f] != null ? String(r.parsed[f]) : ''));
    console.log(r.name + '\t' + row.join('\t'));
  }

  // Snippets from first SB and first BE for tuning
  if (sbResults.length > 0 && !sbResults[0].error) {
    const firstSbPath = path.join(SB_DIR, sbResults[0].name);
    const { text: t1 } = await processPdf(firstSbPath);
    console.log('\n--- SB SNIPPETS (first file) for parser tuning ---');
    const sbLabels = [
      { k: 'Port Code SB', re: /Port\s*Code\s*SB\s*No\s*SB\s*Date/i },
      { k: 'FOB VALUE', re: /1\.\s*FOB\s*VALUE|1\.FOB\s*VALUE/i },
      { k: 'INVOICE VALUE FOB', re: /1\.\s*INVOICE\s*VALUE\s*2\.\s*FOB\s*VALUE|1\.INVOICE\s*VALUE/i },
      { k: 'Exchange', re: /1\s*USD\s*INR|Exchange\s*Rate/i },
      { k: 'INVTERM', re: /INVTERM|7\.INVTERM/i },
      { k: 'RODTEP', re: /RODTEP\s*AMT|5\.RODTEP/i },
      { k: 'DBK CLAIM', re: /DBK\s*CLAIM/i },
    ];
    for (const { k, re } of sbLabels) {
      const s = getSnippet(t1, re);
      if (s) console.log('[' + k + '] ' + s);
    }
    const afterFob = getChunkAfter(t1, /1\.FOB\s*VALUE\s*2\.FREIGHT|1\.\s*FOB\s*VALUE\s*2\.\s*FREIGHT/i, 120);
    if (afterFob) console.log('\n[After FOB VALUE line (raw)]:\n' + afterFob.replace(/\n/g, '\n'));
  }

  if (beResults.length > 0 && !beResults[0].error) {
    const firstBePath = path.join(BE_DIR, beResults[0].name);
    const { text: t2 } = await processPdf(firstBePath);
    console.log('\n--- BE SNIPPETS (first file) for parser tuning ---');
    const beLabels = [
      { k: 'Port BE No Date', re: /Port\s*Code|BE\s*No\s*BE\s*Date/i },
      { k: '1.BCD', re: /1\.\s*BCD|1\.BCD/i },
      { k: 'TOT.ASS VAL', re: /TOT\.?\s*ASS\.?\s*VAL|18\.\s*TOT/i },
      { k: '14.TOTAL DUTY', re: /14\.\s*TOTAL\s*DUTY|15\.\s*INT/i },
      { k: 'Exchange', re: /1\s*USD\s*=|Exchange\s*Rate/i },
      { k: 'ASSESS VALUE', re: /ASS\.?\s*VALUE|29\.\s*ASSESS/i },
    ];
    for (const { k, re } of beLabels) {
      const s = getSnippet(t2, re);
      if (s) console.log('[' + k + '] ' + s);
    }
    const afterBcd = getChunkAfter(t2, /1\.\s*BCD\s*2\.\s*ACD|1\.BCD\s*2\.ACD/i, 400);
    if (afterBcd) console.log('\n[After BCD row (raw)]:\n' + afterBcd.slice(0, 400).replace(/\n/g, '\n'));
  }

  const sbOk = sbResults.filter((r) => !r.error).length;
  const beOk = beResults.filter((r) => !r.error).length;
  const sbMissing = sbResults.filter((r) => !r.error && r.missing && r.missing.length > 0);
  const beMissing = beResults.filter((r) => !r.error && r.missing && r.missing.length > 0);
  console.log('\n--- SUMMARY ---');
  console.log('SB: ' + sbOk + ' processed. Files with missing fields: ' + sbMissing.length);
  console.log('BE: ' + beOk + ' processed. Files with missing fields: ' + beMissing.length);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
