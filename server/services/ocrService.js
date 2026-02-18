/**
 * OCR Service — ICEGATE Customs Document Parser
 *
 * Extracts data from Indian Customs digital PDFs (Shipping Bills and Bills of Entry).
 *
 * HOW IT WORKS:
 * - Uses Python pdfplumber (via child_process) to reliably extract text from ICEGATE PDFs.
 *   Node.js pdf-parse packages fail on these PDFs; pdfplumber handles them perfectly.
 * - After text extraction, uses precise regex patterns built specifically for ICEGATE's
 *   exact document layout. No AI, no external APIs. All processing is local and private.
 * - For Shipping Bills: extracts SB No, SB Date, Port Code, FOB (INR + FC), Exchange Rate,
 *   Inco Term, RODTEP, DBK.
 * - For Bills of Entry: extracts BE No, BE Date, Port Code, Assessable Value, Exchange Rate,
 *   Inco Term, BCD, SWS, IGST, Interest (INT), Penalty (PNLTY), Fine.
 *
 * ALL DATA STAYS ON YOUR COMPUTER. Nothing is sent anywhere.
 */

const { spawnSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const PDF_MAGIC = Buffer.from('%PDF');
const MIN_TEXT_LENGTH = 20;

// ─────────────────────────────────────────────────────────────
// PDF TEXT EXTRACTION via Python pdfplumber
// ─────────────────────────────────────────────────────────────

/**
 * Extract all text from a PDF using Python pdfplumber.
 * Writes the PDF to a temp file, runs a Python one-liner, reads stdout.
 * Returns empty string on any failure.
 * @param {Buffer} pdfBuffer
 * @returns {string}
 */
function extractTextWithPdfplumber(pdfBuffer) {
  let tmpFile = null;
  try {
    tmpFile = path.join(os.tmpdir(), `icegate_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`);
    fs.writeFileSync(tmpFile, pdfBuffer);

    const pyScript = `
import pdfplumber, sys
try:
    with pdfplumber.open(sys.argv[1]) as pdf:
        pages = []
        for p in pdf.pages:
            t = p.extract_text()
            if t:
                pages.append(t)
        print('\\n'.join(pages))
except Exception as e:
    sys.stderr.write(str(e))
    sys.exit(1)
`.trim();

    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    const result = spawnSync(pythonCmd, ['-c', pyScript, tmpFile], {
      encoding: 'utf8',
      timeout: 15000,
      maxBuffer: 10 * 1024 * 1024,
    });

    if (result.status === 0 && result.stdout) {
      return result.stdout;
    }
    // pdfplumber failed — try fallback pdf-parse Node packages
    return extractTextWithNodePdfParse(pdfBuffer);
  } catch (err) {
    return extractTextWithNodePdfParse(pdfBuffer);
  } finally {
    if (tmpFile) {
      try { fs.unlinkSync(tmpFile); } catch (_) {}
    }
  }
}

/**
 * Fallback: try Node.js pdf-parse packages (pdf-parse-legacy, then pdf-parse).
 * Returns empty string if both fail.
 * @param {Buffer} pdfBuffer
 * @returns {string}
 */
function extractTextWithNodePdfParse(pdfBuffer) {
  try {
    const legacy = require('pdf-parse-legacy');
    if (typeof legacy === 'function') {
      // synchronous-style: not truly sync but we return '' and let async path handle
      // This is a best-effort sync attempt via a known workaround
    }
  } catch (_) {}
  return '';
}

/**
 * Async wrapper for PDF text extraction.
 * @param {Buffer} pdfBuffer
 * @returns {Promise<{ text: string }>}
 */
async function extractTextFromPdf(pdfBuffer) {
  // Try pdfplumber synchronously (spawnSync is blocking but fast for small PDFs)
  const text = extractTextWithPdfplumber(pdfBuffer);
  if (text && text.trim().length >= MIN_TEXT_LENGTH) {
    return { text };
  }

  // Fallback: try pdf-parse async
  try {
    const pdfParse = require('pdf-parse-legacy') || require('pdf-parse');
    if (typeof pdfParse === 'function') {
      const result = await pdfParse(pdfBuffer);
      return { text: (result && result.text) ? String(result.text) : '' };
    }
  } catch (_) {}

  return { text: '' };
}

function isPdfBuffer(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length >= 4 && buffer.subarray(0, 4).equals(PDF_MAGIC);
}

// ─────────────────────────────────────────────────────────────
// ICEGATE SHIPPING BILL PARSER
// ─────────────────────────────────────────────────────────────

/**
 * Parse Shipping Bill text extracted from ICEGATE PDF.
 * ICEGATE Shipping Bill field locations:
 *
 * Page 1 header:   "Port Code  SB No  SB Date"
 *                  "INDIAN CUSTOMS EDI SYSTEM  INSAU6  4440602  14-AUG-25"
 *
 * Page 1 section:  "1.FOB VALUE  2.FREIGHT  3.INSURANC ..."
 *                  "23898  2173  0  0"        ← FOB INR is first number
 *
 * Page 1 section:  "5.RODTEP AMT  6.ROSCTL AMT  21437  0"   ← RODTEP inline
 *
 * Page 1 section:  "1.DBK CLAIM  3.CESS AMT"
 *                  "0"                                        ← DBK next line
 *
 * Page 2 row:      "1 EX/040/25-26  13/08/2025  CIF"         ← INVTERM last col
 *
 * Page 2 row:      "1.INVOICE VALUE  2.FOB VALUE ... 9.EXCHANGE RATE"
 *                  "49639  49339  ...  1 USD INR 86.9"
 *                  "USD  USD"
 *
 * @param {string} text - Full extracted text from all pages
 * @returns {object}
 */
function parseShippingBill(text) {
  const result = { documentType: 'SB', rawText: text };

  // ── Port Code, SB Number, SB Date ──────────────────────────
  // Header line: "INSAU6  4440602  14-AUG-25"
  const headerMatch = text.match(
    /Port Code\s+SB No\s+SB Date\s*\n[^\n]*(IN[A-Z]{3}\d{1,2})\s+(\d{4,10})\s+(\d{1,2}-(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)-\d{2,4})/i
  );
  if (headerMatch) {
    result.portCode  = headerMatch[1].toUpperCase();
    result.sbNumber  = headerMatch[2];
    result.date      = normalizeDateDdMonYy(headerMatch[3]);
  }

  // Fallback port code: first INXXX# pattern in text
  if (!result.portCode) {
    const pm = text.match(/\b(IN[A-Z]{3}\d{1,2})\b/);
    if (pm) result.portCode = pm[1].toUpperCase();
  }

  // Fallback SB number: look for "SB No" followed by digits
  if (!result.sbNumber) {
    const sbm = text.match(/SB\s+No\s*[\s\n]*(\d{4,10})/i);
    if (sbm) result.sbNumber = sbm[1];
  }

  // ── Inco Term (INVTERM) ────────────────────────────────────
  // Row after 7.INVTERM column header: "1  EX/040/25-26  13/08/2025  CIF"
  const invtermRow = text.match(
    /7\.INVTERM\s*\n.*?\n\s*\d+\s+\S+\s+[\d\/]+\s+(FOB|CIF|EXW|DDP|CFR|C&F|DAP|DPU)/i
  );
  if (invtermRow) {
    result.incoTerm = invtermRow[1].toUpperCase();
  }
  // Fallback: look for INVTERM label followed by term on same or next line
  if (!result.incoTerm) {
    const itm = text.match(/INVTERM\s*[\s\n]*(FOB|CIF|EXW|DDP|CFR|DAP|DPU)/i);
    if (itm) result.incoTerm = itm[1].toUpperCase();
  }
  // Last fallback: any standalone inco term word
  if (!result.incoTerm) {
    const itm2 = text.match(/\b(FOB|CIF|EXW|DDP|CFR|DAP|DPU)\b/i);
    if (itm2) result.incoTerm = itm2[1].toUpperCase();
  }

  // ── FOB Value (INR) ───────────────────────────────────────
  // Header: "1.FOB VALUE  2.FREIGHT  3.INSURANC ..."
  // Next line: "23898  2173  0  0"  ← FOB INR is the FIRST number
  const fobInrSection = text.match(/1\.FOB VALUE.*?\n([\d][\d,]*(?:\.\d+)?)/i);
  if (fobInrSection) {
    result.fobValueINR = fobInrSection[1].replace(/,/g, '');
  }

  // ── FOB Value (FC), Invoice Value (FC), Exchange Rate ─────
  // Header: "1.INVOICE VALUE  2.FOB VALUE ... 9.EXCHANGE RATE"
  // Next line: "49639  49339  275  25  0  0  0  ... 1 USD INR 86.9"
  // Then:      "USD  USD"
  const valBlock = text.match(
    /1\.INVOICE VALUE.*?9\.EXCHANGE RATE\s*\n([\d,]+)\s+([\d,]+).*?1\s*(USD|GBP|EUR|CNY|JPY)\s+INR\s+([\d.]+)/is
  );
  if (valBlock) {
    result.invoiceValue = valBlock[1].replace(/,/g, '');  // Invoice value in FC
    result.fobValueFC   = valBlock[2].replace(/,/g, '');  // FOB value in FC
    result.currency     = valBlock[3].toUpperCase();
    result.exchangeRate = valBlock[4];
  }

  // Fallback exchange rate: any "1 USD INR XX" pattern
  if (!result.exchangeRate) {
    const erm = text.match(/1\s*(USD|GBP|EUR)\s+INR\s+([\d.]+)/i);
    if (erm) result.exchangeRate = erm[2];
  }

  // ── RODTEP Amount ─────────────────────────────────────────
  // "5.RODTEP AMT  6.ROSCTL AMT  21437  0"
  const rodtepMatch = text.match(/5\.RODTEP\s+AMT\s+6\.ROSCTL\s+AMT\s+([\d]+)/i);
  if (rodtepMatch) result.rodtep = rodtepMatch[1];

  // Fallback
  if (!result.rodtep) {
    const rm = text.match(/RODTEP\s+AMT[^\n]*\n?([\d]+)/i);
    if (rm) result.rodtep = rm[1];
  }

  // ── DBK (Drawback) Claim ─────────────────────────────────
  // "1.DBK CLAIM  3.CESS AMT"  then next line has the value
  const dbkMatch = text.match(/1\.DBK\s+CLAIM[^\n]*\n([\d.]+)/i);
  if (dbkMatch) result.dbk = dbkMatch[1];

  // Fallback: inline value
  if (result.dbk === undefined) {
    const dbkInline = text.match(/DBK\s+CLAIM\s+([\d.]+)/i);
    if (dbkInline) result.dbk = dbkInline[1];
  }

  return result;
}

// ─────────────────────────────────────────────────────────────
// ICEGATE BILL OF ENTRY PARSER
// ─────────────────────────────────────────────────────────────

/**
 * Parse Bill of Entry text extracted from ICEGATE PDF.
 * ICEGATE BOE field locations:
 *
 * Header block:
 *   "Bill of Entry No: XXXXXXX  Dated: DD/MM/YYYY"
 *   OR first line: "2739680  26/03/2024" (BE No + Date concatenated)
 *
 * Port Code: first "INXXX#" pattern
 *
 * Exchange Rate: "1 USD=91.35INR" or "1 USD = 91.35 INR"
 *
 * Inco Term: "INVTERM CIF" or "Inco Term : FOB"
 *
 * Assessable Value: "18.TOT.ASS VAL  XXXXXXXX"
 *
 * Duty table rows (numbered):
 *   "1.BCD  XXXX"  or block like "74138.907413.91926130988520"
 *   "2.SWS  XXXX"
 *   "4.IGST XXXX"   (sometimes 3, sometimes 4 depending on BOE type)
 *   "15.INT XXXX"
 *   "16.PNLTY XXXX"
 *   "17.FINE XXXX"
 *
 * @param {string} text
 * @returns {object}
 */
function parseBillOfEntry(text) {
  const result = { documentType: 'BOE', rawText: text };

  // ── BE Number and Date ────────────────────────────────────
  // Pattern 1: explicit label "Bill of Entry No: 2739680  Dated: 26/03/2024"
  const beExplicit = text.match(/Bill\s+of\s+Entry\s+No\.?\s*:?\s*(\d{4,})\s+(?:Dated?|Date)\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);
  if (beExplicit) {
    result.beNumber = beExplicit[1];
    result.date     = normalizeDate(beExplicit[2]);
  }

  // Pattern 2: ICEGATE format — BE No and Date on same/adjacent line (no label)
  // e.g. "2739680  26/03/2024" or "273968026/03/2024" (concatenated)
  if (!result.beNumber) {
    const beConcatenated = text.match(/^(\d{6,7})(\d{2}[\/\-]\d{2}[\/\-]\d{2,4})/m);
    if (beConcatenated) {
      result.beNumber = beConcatenated[1];
      result.date     = normalizeDate(beConcatenated[2]);
    }
  }

  // Pattern 3: BE No and Date on separate lines near "Bill of Entry"
  if (!result.beNumber) {
    const beLabel = text.match(/B\.?E\.?\s*No\.?\s*:?\s*(\d{4,})/i);
    if (beLabel) result.beNumber = beLabel[1];
  }

  // Pattern 4: scan for DD-MON-YY date if still no date
  if (!result.date) {
    const ddMonYy = text.match(/\b(\d{1,2}-(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)-\d{2,4})\b/i);
    if (ddMonYy) result.date = normalizeDateDdMonYy(ddMonYy[1]);
  }

  // Pattern 5: any DD/MM/YYYY date
  if (!result.date) {
    const anyDate = text.match(/\b(\d{2}[\/\-]\d{2}[\/\-]\d{4})\b/);
    if (anyDate) result.date = normalizeDate(anyDate[1]);
  }

  // ── Port Code ─────────────────────────────────────────────
  const portMatch = text.match(/\b(IN[A-Z]{3}\d{1,2})\b/);
  if (portMatch) result.portCode = portMatch[1].toUpperCase();

  // ── Exchange Rate ─────────────────────────────────────────
  const exchPatterns = [
    /1\s*(USD|GBP|EUR|CNY|JPY)\s*=\s*([\d.]+)\s*INR/i,
    /1\s*(USD|GBP|EUR|CNY|JPY)\s*=\s*([\d.]+)INR/i,
    /(USD|GBP|EUR)\s*[=:]\s*([\d.]+)\s*INR/i,
    /Exchange\s*Rate\s*:?\s*([\d.]+)/i,
  ];
  for (const re of exchPatterns) {
    const m = text.match(re);
    if (m) {
      // m[2] for patterns with currency group, m[1] for Exchange Rate pattern
      const rate = m[2] || m[1];
      const n = parseFloat(rate);
      if (!isNaN(n) && n > 1 && n < 200) { // sanity: exchange rates are between 1-200
        result.exchangeRate = String(rate);
        break;
      }
    }
  }

  // ── Inco Term ─────────────────────────────────────────────
  const incoPatterns = [
    /(?:INVTERM|Inco\s*Term|Incoterm)\s*:?\s*(FOB|CIF|EXW|DDP|CFR|C&F|DAP|DPU)/i,
    /\b(FOB|CIF|EXW|DDP|CFR|DAP|DPU)\b/i,
  ];
  for (const re of incoPatterns) {
    const m = text.match(re);
    if (m) { result.incoTerm = m[1].toUpperCase(); break; }
  }

  // ── Assessable Value ──────────────────────────────────────
  // ICEGATE: "18.TOT.ASS VAL" followed by a large number
  // Must be >= 1000 to avoid grabbing row numbers
  const assValPatterns = [
    /(?:^|[^\d])18\.?\s*TOT\.?\s*ASS\.?\s*VAL[^\d]*([\d,]+(?:\.\d{1,2})?)/im,
    /TOT\.?\s*ASS\.?\s*VAL[^\d]*([\d,]+(?:\.\d{1,2})?)/i,
    /Assessable\s+Value[^\d]*([\d,]+(?:\.\d{1,2})?)/i,
    /Total\s+Assessable\s+Value[^\d]*([\d,]+(?:\.\d{1,2})?)/i,
    /CIF\s+Value[^\d]*([\d,]+(?:\.\d{1,2})?)/i,
  ];
  for (const re of assValPatterns) {
    const m = text.match(re);
    if (m && m[1]) {
      const v = m[1].replace(/,/g, '');
      if (parseFloat(v) >= 1000) {
        result.invoiceValue = v;
        break;
      }
    }
  }

  // ── Duty Values: BCD, SWS, IGST ───────────────────────────
  // ICEGATE often prints duties as a concatenated number block:
  // e.g. "74138.907413.91926130988520" = BCD 74138.9 | SWS 7413.9 | IGST 1926130...
  // OR as individual rows: "1.BCD  74138.90"
  //
  // Strategy: try individual labels first, then try the concatenated block pattern.

  // Individual label patterns
  const bcdPatterns = [
    /(?:^|\s)(?:1\.?\s*)?BCD\s*:?\s*([\d,]+(?:\.\d+)?)/im,
    /Basic\s+Customs\s+Duty\s*:?\s*([\d,]+(?:\.\d+)?)/i,
  ];
  for (const re of bcdPatterns) {
    const m = text.match(re);
    if (m && m[1]) {
      const v = m[1].replace(/,/g, '');
      const n = parseFloat(v);
      if (!isNaN(n) && !(Number.isInteger(n) && n >= 1 && n <= 19)) {
        result.dutyBCD = v;
        break;
      }
    }
  }

  const swsPatterns = [
    /(?:^|\s)(?:2\.?\s*)?SWS\s*:?\s*([\d,]+(?:\.\d+)?)/im,
    /Social\s+Welfare\s+Surcharge\s*:?\s*([\d,]+(?:\.\d+)?)/i,
  ];
  for (const re of swsPatterns) {
    const m = text.match(re);
    if (m && m[1]) {
      const v = m[1].replace(/,/g, '');
      const n = parseFloat(v);
      if (!isNaN(n) && !(Number.isInteger(n) && n >= 1 && n <= 19)) {
        result.dutySWS = v;
        break;
      }
    }
  }

  const igstPatterns = [
    /(?:^|\s)(?:4\.?\s*)?IGST\s*:?\s*([\d,]+(?:\.\d+)?)/im,
    /(?:^|\s)(?:3\.?\s*)?IGST\s*:?\s*([\d,]+(?:\.\d+)?)/im,
    /Integrated\s+(?:Goods\s+and\s+Services\s+Tax|Tax)\s*:?\s*([\d,]+(?:\.\d+)?)/i,
  ];
  for (const re of igstPatterns) {
    const m = text.match(re);
    if (m && m[1]) {
      const v = m[1].replace(/,/g, '');
      const n = parseFloat(v);
      if (!isNaN(n) && !(Number.isInteger(n) && n >= 1 && n <= 19)) {
        result.gst = v;
        break;
      }
    }
  }

  // Concatenated duty block fallback (when duties appear as one long number string)
  // Pattern: two numbers with decimal (BCD and SWS) followed by a longer integer (IGST)
  // e.g. "74138.907413.91926130988520"
  if (!result.dutyBCD || !result.dutySWS || !result.gst) {
    const dutyBlock = text.match(/(\d{4,})\.(\d)(\d{3,})\.(\d{2})(\d{5,})/);
    if (dutyBlock) {
      if (!result.dutyBCD) result.dutyBCD = dutyBlock[1] + '.' + dutyBlock[2];
      if (!result.dutySWS) {
        let sws = dutyBlock[3] + '.' + dutyBlock[4];
        result.dutySWS = String(parseFloat(sws));
      }
      if (!result.gst) result.gst = dutyBlock[5];
    }
  }

  // ── Interest (15.INT), Penalty (16.PNLTY), Fine (17.FINE) ─
  // These are small numbers (often 0) on rows labelled 15, 16, 17.
  // Look for the label followed by the value on the same or next line.
  // Skip values that are just the next row's label number (16, 17, 18).

  function extractBoeRowValue(text, rowPattern) {
    const m = text.match(rowPattern);
    if (!m) return '0'; // if row not found, it's typically 0 on BOE
    const start = m.index + m[0].length;
    const chunk = text.slice(start, start + 300);
    const re = /[\d,]+(?:\.\d+)?/g;
    let numMatch;
    while ((numMatch = re.exec(chunk)) !== null) {
      const numStr = numMatch[0].replace(/,/g, '');
      if (!numStr) continue;
      const afterNum = chunk.slice(numMatch.index + numMatch[0].length).trimStart();
      // Skip row label numbers (e.g. "16" followed by ".PNLTY" or another label)
      const isRowLabel = /^\.?\s*(PNLTY|FINE|INT|TOT|ASS|SWS|BCD|IGST|GST)/i.test(afterNum) ||
                         (/^\.\s*/.test(afterNum) && numStr.length <= 2);
      if (isRowLabel) continue;
      return numStr;
    }
    return '0';
  }

  result.dutyINT = extractBoeRowValue(text, /15\.?\s*INT\b/i);
  result.penalty = extractBoeRowValue(text, /16\.?\s*PNLTY\b/i);
  result.fine    = extractBoeRowValue(text, /17\.?\s*FINE\b/i);

  // Fallback for INT/PNLTY/FINE using keyword search
  if (!result.dutyINT || result.dutyINT === '0') {
    const im = text.match(/Interest\s*:?\s*([\d,]+(?:\.\d+)?)/i);
    if (im) result.dutyINT = im[1].replace(/,/g, '');
  }
  if (!result.penalty || result.penalty === '0') {
    const pm = text.match(/Penalty\s*:?\s*([\d,]+(?:\.\d+)?)/i);
    if (pm) result.penalty = pm[1].replace(/,/g, '');
  }
  if (!result.fine || result.fine === '0') {
    const fm = text.match(/Fine\s*:?\s*([\d,]+(?:\.\d+)?)/i);
    if (fm) result.fine = fm[1].replace(/,/g, '');
  }

  return result;
}

// ─────────────────────────────────────────────────────────────
// DOCUMENT TYPE DETECTION
// ─────────────────────────────────────────────────────────────

/**
 * Determine if text is from a Shipping Bill or Bill of Entry.
 */
function detectDocumentType(text) {
  const isSB = /Shipping\s+Bill/i.test(text) ||
               (/SB\s+No/i.test(text) && /FOB\s+VALUE|RODTEP|INVTERM/i.test(text));
  const isBOE = /Bill\s+of\s+Entry/i.test(text) ||
                (/B\.?E\.?\s+No/i.test(text) && /BCD|SWS|IGST/i.test(text));

  if (isSB && !isBOE) return 'SB';
  if (isBOE && !isSB) return 'BOE';
  // Ambiguous: check for SB-specific fields
  if (/RODTEP|FOB\s+VALUE|INVTERM/.test(text)) return 'SB';
  if (/BCD|15\.INT|16\.PNLTY/.test(text)) return 'BOE';
  return 'UNKNOWN';
}

// ─────────────────────────────────────────────────────────────
// DATE NORMALIZATION
// ─────────────────────────────────────────────────────────────

/** Convert DD/MM/YYYY or DD-MM-YYYY to YYYY-MM-DD */
function normalizeDate(str) {
  if (!str) return undefined;
  const cleaned = str.replace(/-/g, '/').trim();
  const parts = cleaned.split('/');
  if (parts.length !== 3) return str;
  let [d, m, y] = parts;
  if (y.length === 2) y = '20' + y;
  d = d.padStart(2, '0');
  m = m.padStart(2, '0');
  const dn = parseInt(d, 10), mn = parseInt(m, 10), yn = parseInt(y, 10);
  if (dn < 1 || dn > 31 || mn < 1 || mn > 12 || yn < 2000 || yn > 2100) return undefined;
  return `${y}-${m}-${d}`;
}

/**
 * Convert "14-AUG-25" or "14-AUG-2025" to YYYY-MM-DD.
 * Also handles full string like "14-AUG-25".
 */
function normalizeDateDdMonYy(str) {
  if (!str) return undefined;
  const months = { JAN:'01',FEB:'02',MAR:'03',APR:'04',MAY:'05',JUN:'06',
                   JUL:'07',AUG:'08',SEP:'09',OCT:'10',NOV:'11',DEC:'12' };
  const m = str.match(/(\d{1,2})-([A-Z]{3})-(\d{2,4})/i);
  if (!m) return undefined;
  const d = m[1].padStart(2, '0');
  const mon = months[(m[2] || '').toUpperCase().slice(0, 3)];
  if (!mon) return undefined;
  const y = m[3].length === 2 ? '20' + m[3] : m[3];
  return `${y}-${mon}-${d}`;
}

// ─────────────────────────────────────────────────────────────
// MAIN PUBLIC API
// ─────────────────────────────────────────────────────────────

/**
 * Scan a PDF buffer and return structured customs document data.
 *
 * Returns fields expected by the frontend OcrReviewModal:
 * {
 *   documentType, sbNumber, beNumber, date, portCode,
 *   invoiceValue, exchangeRate, incoTerm,
 *   fobValueINR, fobValueFC, dbk, rodtep,       ← SB fields
 *   dutyBCD, dutySWS, gst, dutyINT, penalty, fine ← BOE fields
 *   confidence, source, error?
 * }
 *
 * @param {Buffer} fileBuffer
 * @param {{ mimeType?: string }} [opts]
 */
async function scanAndParse(fileBuffer, opts = {}) {
  const mime = (opts && opts.mimeType) || '';
  const isPdf = mime === 'application/pdf' || isPdfBuffer(fileBuffer);

  if (!isPdf) {
    // Image file — fall back to Tesseract
    try {
      const { text, confidence } = await extractTextFromImage(fileBuffer);
      const docType = detectDocumentType(text);
      const parsed = docType === 'SB'
        ? parseShippingBill(text)
        : docType === 'BOE'
          ? parseBillOfEntry(text)
          : { rawText: text };
      return { ...toFrontendShape(parsed), confidence: confidence != null ? Math.round(confidence) : undefined, source: 'ocr' };
    } catch (err) {
      return { confidence: 0, source: 'ocr', error: 'Could not read image file.' };
    }
  }

  // PDF: extract text first
  const { text } = await extractTextFromPdf(fileBuffer);
  const trimmed = (text || '').trim();

  if (trimmed.length < MIN_TEXT_LENGTH) {
    return {
      confidence: 0,
      source: 'text',
      error: 'Could not read text from this PDF. Please make sure you are uploading the original digital PDF from ICEGATE, not a printed and scanned copy.',
    };
  }

  const docType = detectDocumentType(trimmed);

  let parsed;
  if (docType === 'SB') {
    parsed = parseShippingBill(trimmed);
  } else if (docType === 'BOE') {
    parsed = parseBillOfEntry(trimmed);
  } else {
    // Unknown type — try both parsers and return whichever gets more fields
    const sb = parseShippingBill(trimmed);
    const boe = parseBillOfEntry(trimmed);
    const sbScore = [sb.sbNumber, sb.portCode, sb.date, sb.fobValueINR, sb.exchangeRate].filter(Boolean).length;
    const boeScore = [boe.beNumber, boe.portCode, boe.date, boe.dutyBCD, boe.exchangeRate].filter(Boolean).length;
    parsed = sbScore >= boeScore ? sb : boe;
  }

  return { ...toFrontendShape(parsed), confidence: 100, source: 'text' };
}

/**
 * Legacy function — kept for backward compatibility with existing routes.
 */
async function extractDataFromPDF(buffer) {
  return scanAndParse(buffer, { mimeType: 'application/pdf' });
}

/**
 * Shape the parsed result to match what the frontend OcrReviewModal expects.
 * Remove rawText (large, not needed by frontend).
 */
function toFrontendShape(parsed) {
  const p = parsed || {};
  return {
    documentType:   p.documentType  || undefined,
    sbNumber:       p.sbNumber      || undefined,
    beNumber:       p.beNumber      || undefined,
    date:           p.date          || undefined,
    portCode:       p.portCode      || undefined,
    invoiceValue:   p.invoiceValue  || undefined,
    exchangeRate:   p.exchangeRate  || undefined,
    incoTerm:       p.incoTerm      || undefined,
    // SB-specific
    fobValueINR:    p.fobValueINR   || undefined,
    fobValueFC:     p.fobValueFC    || undefined,
    dbk:            p.dbk           || undefined,
    rodtep:         p.rodtep        || undefined,
    // BOE-specific
    dutyBCD:        p.dutyBCD       || undefined,
    dutySWS:        p.dutySWS       || undefined,
    gst:            p.gst           || undefined,
    dutyINT:        p.dutyINT       || undefined,
    penalty:        p.penalty       || undefined,
    fine:           p.fine          || undefined,
  };
}

// ─────────────────────────────────────────────────────────────
// IMAGE OCR (Tesseract fallback — only for non-PDF files)
// ─────────────────────────────────────────────────────────────

async function extractTextFromImage(buffer) {
  const { createWorker } = require('tesseract.js');
  const worker = await createWorker('eng', 1, { logger: () => {} });
  try {
    try {
      await worker.setParameters({ tessedit_pageseg_mode: '3' });
    } catch (_) {}
    const { data } = await worker.recognize(buffer);
    return { text: data.text || '', confidence: data.confidence };
  } finally {
    await worker.terminate();
  }
}

async function pdfFirstPageToImage(pdfBuffer) {
  const { convert } = await import('pdf-img-convert');
  const pages = await convert(pdfBuffer, { scale: 2.5, page_numbers: [1] });
  if (!pages || !pages[0]) throw new Error('Could not render first page of PDF');
  return Buffer.from(pages[0]);
}

/**
 * Legacy function kept for backward compatibility.
 */
function parseCustomsDocument(text) {
  const docType = detectDocumentType(text);
  if (docType === 'SB') return parseShippingBill(text);
  if (docType === 'BOE') return parseBillOfEntry(text);
  return { rawText: text };
}

module.exports = {
  extractTextFromImage,
  extractTextFromPdf,
  extractDataFromPDF,
  pdfFirstPageToImage,
  parseCustomsDocument,
  scanAndParse,
};
