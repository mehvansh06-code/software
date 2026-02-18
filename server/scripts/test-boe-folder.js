/**
 * Test OCR on all Bill of Entry PDFs in C:\software\BOE.
 * Extracts text, runs parser, and collects snippets around key labels to tune patterns.
 * Run: node server/scripts/test-boe-folder.js
 */
const fs = require('fs');
const path = require('path');
const { extractTextFromPdf, parseCustomsDocument } = require('../services/ocrService');

const BOE_DIR = path.resolve(__dirname, '../../BOE');
const SNIPPET_LEN = 120;

function getSnippet(t, keywordRegex, before = 30, after = SNIPPET_LEN) {
  const m = t.match(keywordRegex);
  if (!m) return null;
  const start = Math.max(0, m.index - before);
  const end = Math.min(t.length, m.index + m[0].length + after);
  return t.slice(start, end).replace(/\n/g, '\\n ');
}

/** Get a larger chunk after a label (for tuning assessable value extraction). */
function getChunkAfter(t, keywordRegex, afterChars = 600) {
  const m = t.match(keywordRegex);
  if (!m) return null;
  const start = m.index + m[0].length;
  const end = Math.min(t.length, start + afterChars);
  return t.slice(start, end);
}

async function processPdf(filePath, options = {}) {
  const buffer = fs.readFileSync(filePath);
  const { text } = await extractTextFromPdf(buffer);
  const t = (text || '').replace(/\r\n/g, '\n');
  const parsed = parseCustomsDocument(t);

  const snippets = {};
  const labels = [
    { key: 'assessable', re: /Assessable|Total\s+Value|CIF\s+Value|Duty\s+Payable/i },
    { key: 'bcd', re: /1\.\s*BCD|BCD|Basic\s+Customs/i },
    { key: 'sws', re: /2\.\s*SWS|SWS|Social\s+Welfare/i },
    { key: 'int', re: /15\.\s*INT|\.INT\b/i },
    { key: 'pnlty', re: /16\.\s*PNLTY|PNLTY/i },
    { key: 'fine', re: /17\.\s*FINE|\.FINE\b/i },
    { key: 'igst', re: /IGST|Integrated\s+Tax|GST\b/i },
    { key: 'exchange', re: /Exchange\s*Rate|1\s*USD\s*=|1\s*GBP\s*=|1\s*EUR\s*=/i },
  ];
  for (const { key, re } of labels) {
    const s = getSnippet(t, re);
    if (s) snippets[key] = s;
  }

  const out = { parsed, snippets, textLength: t.length };
  if (options.dumpAssessable) {
    out.assessableDump = {
      afterTotAssVal: getChunkAfter(t, /TOT\.?\s*ASS\.?\s*VAL/i, 1200),
      afterAssessable: getChunkAfter(t, /Assessable\s+Value/i, 400),
      afterTotalValue: getChunkAfter(t, /Total\s+Value\s*:?/i, 400),
    };
  }
  return out;
}

async function main() {
  if (!fs.existsSync(BOE_DIR)) {
    console.error('BOE folder not found:', BOE_DIR);
    process.exit(1);
  }

  const files = fs.readdirSync(BOE_DIR).filter((f) => f.toLowerCase().endsWith('.pdf'));
  console.log('Found', files.length, 'PDFs in', BOE_DIR, '\n');

  const results = [];
  const allSnippets = {}; // key -> set of unique snippet starts (for pattern diversity)
  const assessableDumps = []; // raw text after TOT.ASS VAL / Assessable for first 2 BOEs

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const filePath = path.join(BOE_DIR, f);
    process.stderr.write(`Processing ${i + 1}/${files.length} ${f}...\n`);
    try {
      const dumpAssessable = i < 2;
      const data = await processPdf(filePath, { dumpAssessable });
      const { parsed, snippets } = data;
      results.push({ file: f, parsed });
      if (data.assessableDump) assessableDumps.push({ file: f, ...data.assessableDump });
      for (const [key, text] of Object.entries(snippets)) {
        if (!allSnippets[key]) allSnippets[key] = [];
        const short = text.slice(0, 100);
        if (!allSnippets[key].some((s) => s.slice(0, 60) === short.slice(0, 60))) allSnippets[key].push(short);
      }
    } catch (err) {
      results.push({ file: f, error: err.message });
    }
  }

  // Summary table
  console.log('\n--- PARSED RESULTS (all BOEs) ---\n');
  const fields = ['beNumber', 'date', 'portCode', 'invoiceValue', 'exchangeRate', 'incoTerm', 'dutyBCD', 'dutySWS', 'dutyINT', 'penalty', 'fine', 'gst'];
  console.log('File\t' + fields.join('\t'));
  for (const r of results) {
    if (r.error) {
      console.log(r.file + '\tERROR: ' + r.error);
      continue;
    }
    const row = fields.map((f) => (r.parsed[f] != null ? String(r.parsed[f]) : ''));
    console.log(r.file + '\t' + row.join('\t'));
  }

  // Raw text after TOT.ASS VAL / Assessable (first 2 BOEs) — to tune assessable value extraction
  console.log('\n--- RAW TEXT AFTER ASSESSABLE LABELS (first 2 BOEs, ~600 chars) ---\n');
  for (const d of assessableDumps) {
    console.log('--- ' + d.file + ' ---');
    if (d.afterTotAssVal) {
      console.log('\n[After "TOT.ASS VAL"] (newlines as \\n):\n' + d.afterTotAssVal.replace(/\n/g, '\\n\n') + '\n');
    } else console.log('\n[After "TOT.ASS VAL"]: (not found)\n');
    if (d.afterAssessable) {
      console.log('[After "Assessable Value"]:\n' + d.afterAssessable.replace(/\n/g, '\\n\n') + '\n');
    }
    if (d.afterTotalValue && !d.afterAssessable) {
      console.log('[After "Total Value"]:\n' + d.afterTotalValue.replace(/\n/g, '\\n\n') + '\n');
    }
  }

  // Sample snippets to tune parser (from first few PDFs that have each label)
  console.log('\n--- SAMPLE TEXT SNIPPETS (for pattern tuning) ---\n');
  for (const [label, arr] of Object.entries(allSnippets)) {
    if (arr.length === 0) continue;
    console.log('[' + label.toUpperCase() + '] (first 3 variants)');
    arr.slice(0, 3).forEach((s, i) => console.log('  ' + (i + 1) + ': ' + JSON.stringify(s)));
    console.log('');
  }

  // Count extraction success per field
  const counts = {};
  for (const f of fields) counts[f] = 0;
  for (const r of results) {
    if (r.error) continue;
    for (const f of fields) if (r.parsed[f] != null && String(r.parsed[f]).trim() !== '') counts[f]++;
  }
  console.log('--- EXTRACTION RATE (filled / ' + results.filter((r) => !r.error).length + ' BOEs) ---');
  for (const f of fields) console.log(f + ': ' + counts[f]);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
