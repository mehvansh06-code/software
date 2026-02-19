/**
 * OCR Service — ICEGATE Customs Document Parser
 * Extracts data from Indian Customs digital PDFs (Shipping Bills and Bills of Entry).
 * Uses Python pdfplumber for text extraction — fast, 100% accurate, fully private.
 * ALL DATA STAYS ON YOUR COMPUTER. Nothing is sent anywhere.
 */

const { spawnSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const PDF_MAGIC = Buffer.from('%PDF');
const MIN_TEXT_LENGTH_FOR_LAYER = 20;

// ─────────────────────────────────────────────────────────────
// PDF TEXT EXTRACTION via Python pdfplumber
// ─────────────────────────────────────────────────────────────

/**
 * Extract all text from a PDF using Python pdfplumber.
 * Writes the PDF to a temp file, runs Python, reads the output.
 * Returns empty string on any failure so the fallback can take over.
 */
function extractTextWithPdfplumber(pdfBuffer) {
  let tmpFile = null;
  try {
    tmpFile = path.join(
      os.tmpdir(),
      `icegate_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`
    );
    fs.writeFileSync(tmpFile, pdfBuffer);

    const pyScript = [
      'import pdfplumber, sys',
      'try:',
      '    with pdfplumber.open(sys.argv[1]) as pdf:',
      '        pages = []',
      '        for p in pdf.pages:',
      '            t = p.extract_text()',
      '            if t:',
      '                pages.append(t)',
      '        print("\\n".join(pages))',
      'except Exception as e:',
      '    sys.stderr.write(str(e))',
      '    sys.exit(1)',
    ].join('\n');

    // 'python' on Windows, 'python3' on Linux/Mac
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    const result = spawnSync(pythonCmd, ['-c', pyScript, tmpFile], {
      encoding: 'utf8',
      timeout: 15000,
      maxBuffer: 10 * 1024 * 1024,
    });

    if (result.status === 0 && result.stdout && result.stdout.trim().length > 0) {
      return result.stdout;
    }
    return '';
  } catch (err) {
    return '';
  } finally {
    if (tmpFile) {
      try { fs.unlinkSync(tmpFile); } catch (_) {}
    }
  }
}

/**
 * Extract text from a PDF buffer.
 * Tries pdfplumber first, then falls back to Node pdf-parse packages.
 */
async function extractTextFromPdf(pdfBuffer) {
  // Try pdfplumber (best for ICEGATE documents)
  const plumberText = extractTextWithPdfplumber(pdfBuffer);
  if (plumberText && plumberText.trim().length >= MIN_TEXT_LENGTH_FOR_LAYER) {
    return { text: plumberText };
  }
  // Fallback: Node pdf-parse packages
  try {
    const pdfParse = (() => {
      try { return require('pdf-parse-legacy'); } catch (_) {}
      try { return require('pdf-parse'); } catch (_) {}
      return null;
    })();
    if (pdfParse && typeof pdfParse === 'function') {
      const result = await pdfParse(pdfBuffer);
      return { text: (result && result.text) ? String(result.text) : '' };
    }
  } catch (_) {}
  return { text: '' };
}

function isPdfBuffer(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length >= 4 && buffer.subarray(0, 4).equals(PDF_MAGIC);
}

function isTextGarbled(text) {
  const t = (text || '').trim();
  return t.length < MIN_TEXT_LENGTH_FOR_LAYER;
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
  if (d.length === 1) d = '0' + d;
  if (m.length === 1) m = '0' + m;
  const dayNum = parseInt(d, 10);
  const monNum = parseInt(m, 10);
  const yearNum = parseInt(y, 10);
  if (dayNum < 1 || dayNum > 31) return undefined;
  if (monNum < 1 || monNum > 12) return undefined;
  if (yearNum < 2000 || yearNum > 2100) return undefined;
  return `${y}-${m}-${d}`;
}

/** Convert "14-AUG-25" style date to YYYY-MM-DD */
function normalizeDateDdMonYy(strOrDay, monthStr, yearTwo) {
  const months = {
    JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
    JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
  };
  // If called with a single string like "14-AUG-25"
  if (monthStr === undefined) {
    const m = (strOrDay || '').match(/(\d{1,2})[\/\-]([A-Z]{3})[\/\-](\d{2,4})/i);
    if (!m) return undefined;
    const d = m[1].padStart(2, '0');
    const mon = months[(m[2] || '').toUpperCase().slice(0, 3)];
    if (!mon) return undefined;
    const y = m[3].length === 2 ? '20' + m[3] : m[3];
    return `${y}-${mon}-${d}`;
  }
  // If called with separate day, month, year arguments (legacy usage)
  const mon = (monthStr || '').toUpperCase().slice(0, 3);
  const monVal = months[mon];
  if (!monVal) return undefined;
  const y = (yearTwo || '').length === 2 ? '20' + yearTwo : yearTwo;
  const d = (strOrDay || '').length === 1 ? '0' + strOrDay : strOrDay;
  return `${y}-${monVal}-${d}`;
}

// ─────────────────────────────────────────────────────────────
// HELPER FUNCTIONS (used by parseCustomsDocument)
// ─────────────────────────────────────────────────────────────

/** Extract first number (with optional decimals) from a line/string */
function extractNumberFromLine(str) {
  if (!str || typeof str !== 'string') return undefined;
  const m = str.match(/[\d,\s]+(?:\.\d+)?/);
  return m ? m[0].replace(/[,\s]/g, '').replace(/^0+(\d)/, '$1') : undefined;
}

/** Match label then value using two regexes */
function valueAfterLabel(text, labelRegex, valueRegex) {
  if (!text || typeof text !== 'string') return null;
  const re = new RegExp(labelRegex.source + '[\\s\\n]*' + valueRegex.source, 'im');
  const m = text.match(re);
  return m && m[1] ? m[1].trim() : null;
}

/** Find first number after a keyword within maxChars */
function numberAfterKeyword(text, keywordRegex, maxChars) {
  if (!text || typeof text !== 'string') return null;
  const m = text.match(keywordRegex);
  if (!m) return null;
  const start = m.index + m[0].length;
  const chunk = text.slice(start, start + (maxChars || 400));
  const numMatch = chunk.match(/[\d,]+(?:\.\d+)?/);
  return numMatch ? numMatch[0].replace(/[,]/g, '') : null;
}

/** First number after keyword that is an amount (not column index 1-19) */
function amountAfterKeyword(text, keywordRegex, maxChars) {
  if (!text || typeof text !== 'string') return null;
  const m = text.match(keywordRegex);
  if (!m) return null;
  const start = m.index + m[0].length;
  const chunk = text.slice(start, start + (maxChars || 500));
  const re = /[\d,]+(?:\.\d+)?/g;
  let numMatch;
  while ((numMatch = re.exec(chunk)) !== null) {
    const numStr = numMatch[0].replace(/,/g, '').trim();
    if (!numStr) continue;
    const nextChar = chunk[numMatch.index + numMatch[0].length];
    if (nextChar === '.') continue;
    if (/^INR/i.test(chunk.slice(numMatch.index + numMatch[0].length))) continue;
    const n = parseFloat(numStr);
    if (numStr === '0') return '0';
    if (Number.isInteger(n) && n >= 1 && n <= 19) continue;
    return numStr;
  }
  return null;
}

/** First number after keyword; skips N.LABEL patterns only */
function firstNumberAfterKeyword(text, keywordRegex, maxChars) {
  if (!text || typeof text !== 'string') return null;
  const m = text.match(keywordRegex);
  if (!m) return null;
  const start = m.index + m[0].length;
  const chunk = text.slice(start, start + (maxChars || 500));
  const re = /[\d,]+(?:\.\d+)?/g;
  let numMatch;
  while ((numMatch = re.exec(chunk)) !== null) {
    const numStr = numMatch[0].replace(/,/g, '').trim();
    if (!numStr) continue;
    const nextStart = numMatch.index + numMatch[0].length;
    const nextChar = chunk[nextStart];
    if (nextChar === '.' && numStr.length <= 3) continue;
    if (/^INR/i.test(chunk.slice(nextStart))) continue;
    return numStr;
  }
  return null;
}

/** First duty value after a label — accepts 0, decimals, integers >= 1000 */
function dutyValueAfterLabel(text, labelRegex, maxChars) {
  if (!text || typeof text !== 'string') return null;
  const m = text.match(labelRegex);
  if (!m) return null;
  const start = m.index + m[0].length;
  const chunk = text.slice(start, start + (maxChars || 500));
  const re = /[\d,]+(?:\.\d+)?/g;
  let numMatch;
  while ((numMatch = re.exec(chunk)) !== null) {
    const numStr = numMatch[0].replace(/,/g, '').trim();
    if (!numStr) continue;
    const nextStart = numMatch.index + numMatch[0].length;
    const nextChar = chunk[nextStart];
    if (nextChar === '.' && numStr.length <= 3) continue;
    if (/^INR/i.test(chunk.slice(nextStart))) continue;
    const n = parseFloat(numStr);
    if (Number.isInteger(n) && n >= 1 && n <= 19) continue;
    return numStr;
  }
  return null;
}

/** Find first number after a label, skipping a set of specific numbers */
function valueAfterLabelSkipColumnNumbers(text, labelRegex, skipNumbers, maxChars) {
  if (!text || typeof text !== 'string') return null;
  const m = text.match(labelRegex);
  if (!m) return null;
  const start = m.index + m[0].length;
  const chunk = text.slice(start, start + (maxChars != null ? maxChars : 2200));
  const skipSet = new Set((skipNumbers || []).map(Number));
  const re = /[\d,]+(?:\.\d+)?/g;
  let numMatch;
  while ((numMatch = re.exec(chunk)) !== null) {
    const numStr = numMatch[0].replace(/,/g, '').trim();
    if (!numStr) continue;
    if (numStr === '0') return '0';
    const n = parseFloat(numStr);
    if (skipSet.has(n)) continue;
    const nextStart = numMatch.index + numMatch[0].length;
    const nextChar = chunk[nextStart];
    if (nextChar === '.') continue;
    if (/^INR/i.test(chunk.slice(nextStart))) continue;
    if (n >= 1000000 && Number.isInteger(n)) continue;
    return numStr;
  }
  if (/\b0\b/.test(chunk)) return '0';
  return null;
}

/** Find FOB/CIF/etc after a keyword within maxChars */
function incoTermAfterKeyword(text, keywordRegex, maxChars) {
  if (!text || typeof text !== 'string') return null;
  const m = text.match(keywordRegex);
  if (!m) return null;
  const start = m.index + m[0].length;
  const chunk = text.slice(start, start + (maxChars || 200));
  const termMatch = chunk.match(/\b(FOB|CIF|EXW|DDP|CFR|DAP|DPU|C\s*&\s*F)\b/i);
  return termMatch ? termMatch[1].replace(/\s+/g, '').toUpperCase() : null;
}

// ─────────────────────────────────────────────────────────────
// SHIPPING BILL PARSER (pdfplumber-verified patterns)
// ─────────────────────────────────────────────────────────────
/**
 * ICEGATE Shipping Bill — exact field locations verified from real PDFs:
 *
 * Header: "Port Code  SB No  SB Date"
 *         "INDIAN CUSTOMS EDI SYSTEM  INSAU6  4440602  14-AUG-25"
 *
 * FOB INR: "1.FOB VALUE 2.FREIGHT 3.INSURANC..."
 *          "23898  2173  0  0"   ← first number = FOB INR
 *
 * FOB FC:  "1.INVOICE VALUE 2.FOB VALUE ... 9.EXCHANGE RATE"
 *          "49639  49339  ...  1 USD INR 86.9"
 *           invoice   fob fc      exchange rate
 *
 * RODTEP:  "5.RODTEP AMT  6.ROSCTL AMT  21437  0"
 * DBK:     "1.DBK CLAIM  3.CESS AMT" then next line "0"
 * INVTERM: row "1  EX/040/25-26  13/08/2025  CIF"
 */
function parseShippingBill(text) {
  const result = {};

  // Port Code, SB Number, SB Date
  const headerMatch = text.match(
    /Port Code\s+SB No\s+SB Date\s*\n[^\n]*(IN[A-Z]{3}\d{1,2})\s+(\d{4,10})\s+(\d{1,2}-(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)-\d{2,4})/i
  );
  if (headerMatch) {
    result.portCode = headerMatch[1].toUpperCase();
    result.sbNumber = headerMatch[2];
    result.date     = normalizeDateDdMonYy(headerMatch[3]);
  }
  if (!result.portCode) {
    const pm = text.match(/Port\s+Code\s*[\s\n]*([A-Z]{2}[A-Z]{3}\d{1,2})/i);
    if (pm && /^IN/i.test(pm[1])) result.portCode = pm[1].toUpperCase();
  }
  if (!result.portCode) {
    const pm = text.match(/\b(IN[A-Z]{3}\d{1,2})\b/);
    if (pm) result.portCode = pm[1].toUpperCase();
  }
  if (!result.sbNumber) {
    const sbm = text.match(/SB\s+No\s*[\s\n]*(\d{4,10})/i);
    if (sbm) result.sbNumber = sbm[1];
  }

  // FOB Value INR — first number after "1.FOB VALUE 2.FREIGHT ..." header
  const fobInrMatch = text.match(/1\.FOB VALUE 2\.FREIGHT[^\n]*\n(\d[\d,]*)/i);
  if (fobInrMatch) result.fobValueINR = fobInrMatch[1].replace(/,/g, '');

  // FOB FC and Invoice FC
  const valLineMatch = text.match(/1\.INVOICE VALUE 2\.FOB VALUE[^\n]*\n(\d[\d,]*)\s+(\d[\d,]*)/i);
  if (valLineMatch) {
    result.invoiceValue = valLineMatch[1].replace(/,/g, '');
    result.fobValueFC   = valLineMatch[2].replace(/,/g, '');
  }

  // Exchange Rate: "1 USD INR 86.9" or "1 USD=91.35INR"
  const exchMatch =
    text.match(/1\s*(USD|GBP|EUR|CNY|JPY)\s+INR\s+([\d.]+)/i) ||
    text.match(/1\s*(USD|GBP|EUR|CNY|JPY)\s*=\s*([\d.]+)\s*INR/i);
  if (exchMatch) result.exchangeRate = exchMatch[2];

  // Fallback exchange rate patterns
  if (!result.exchangeRate) {
    const ratePatterns = [
      /1\s*USD\s*=\s*([\d.]+)\s*INR/i,
      /1\s*USD\s*=\s*([\d.]+)INR/i,
      /1\s*GBP\s*=\s*([\d.]+)\s*INR/i,
      /1\s*EUR\s*=\s*([\d.]+)\s*INR/i,
    ];
    for (const re of ratePatterns) {
      const m = text.match(re);
      if (m && m[1]) {
        const n = parseFloat(m[1]);
        if (!isNaN(n) && n > 0) { result.exchangeRate = m[1]; break; }
      }
    }
  }

  // Inco Term (INVTERM)
  const invtermMatch =
    text.match(/7\.INVTERM\s*\n.*?\n\s*\d+\s+\S+\s+[\d\/]+\s+(FOB|CIF|EXW|DDP|CFR|C&F|DAP|DPU)/i) ||
    text.match(/15\.Term\s*(FOB|CIF|EXW|DDP|CFR|DAP|DPU)/i) ||
    text.match(/INVTERM\s*[\s\n]*(FOB|CIF|EXW|DDP|CFR|DAP|DPU)/i);
  if (invtermMatch) result.incoTerm = invtermMatch[1].toUpperCase();
  if (!result.incoTerm) {
    const tNorm = text.replace(/\s+/g, ' ');
    const m = tNorm.match(/INVTERM\s+(FOB|CIF|EXW|DDP|CFR|DAP|DPU)/i);
    if (m) result.incoTerm = m[1].toUpperCase();
  }
  if (!result.incoTerm) {
    const term = incoTermAfterKeyword(text, /INVTERM/i, 150);
    if (term) result.incoTerm = term;
  }

  // RODTEP: "5.RODTEP AMT  6.ROSCTL AMT  21437  0"
  const rodtepMatch = text.match(/5\.RODTEP\s+AMT\s+6\.ROSCTL\s+AMT\s+([\d]+)/i);
  if (rodtepMatch) result.rodtep = rodtepMatch[1];
  if (!result.rodtep) {
    const num = numberAfterKeyword(text, /RODTEP/i, 100);
    if (num) result.rodtep = num;
  }

  // DBK: "1.DBK CLAIM  3.CESS AMT" then next line value
  const dbkMatch = text.match(/1\.DBK\s+CLAIM[^\n]*\n([\d.]+)/i);
  if (dbkMatch) {
    result.dbk = dbkMatch[1];
  } else {
    const tNorm = text.replace(/\s+/g, ' ');
    const dbkInline = tNorm.match(/DBK\s+CLAIM\s+([\d.]+)/i);
    if (dbkInline) result.dbk = dbkInline[1];
  }
  if (result.dbk === undefined) {
    const num = numberAfterKeyword(text, /DBK\s+CLAIM/i, 80);
    if (num !== null) result.dbk = num;
  }

  return result;
}

// ─────────────────────────────────────────────────────────────
// BILL OF ENTRY PARSER (pdfplumber-verified patterns)
// ─────────────────────────────────────────────────────────────
/**
 * ICEGATE Bill of Entry — exact field locations verified from real PDFs:
 *
 * Header: "Port Code  BE No  BE Date  BE Type"
 *         "INSBI6  7508429  13/02/2026  H"
 *
 * Duty row 1: "1.BCD  2.ACD  3.SWS  4.NCCD  5.ADD  C6.CVD  7.IGST  8.G.CESS  18.TOT.ASS VAL"
 *             "127828.2  0  12782.8  0  0  134859  0  2556563"
 *              pos[0]       pos[2]              pos[5]          pos[7]=AssVal
 *
 * Duty row 2: "...14.TOTAL DUTY  15.INT  16.PNLTY  17.FINE  19.TOT. AMOUNT"
 *             "275470  113  0  5000  280583"
 *              pos[0]  [1]  [2]  [3]    [4]
 *
 * Exchange: "1 USD=91.35INR"
 * Inco Term: "15.TermFOB" on page 2
 */
function parseBillOfEntry(text) {
  const result = {};

  // BE Number, Date, Port Code from header
  const headerMatch = text.match(
    /Port Code\s+BE No\s+BE Date\s+BE Type\s*\n(\w+)\s+(\d{4,10})\s+(\d{1,2}\/\d{2}\/\d{4})/i
  );
  if (headerMatch) {
    result.portCode = headerMatch[1].toUpperCase();
    result.beNumber = headerMatch[2];
    result.date     = normalizeDate(headerMatch[3]);
  }

  // Fallback BE No and Date: concatenated at start of doc e.g. "750842913/02/2026"
  if (!result.beNumber) {
    const beDateAtStart = text.match(/^(\d{6,7})(\d{2}[\/\-]\d{2}[\/\-]\d{2,4})/m);
    if (beDateAtStart) {
      result.beNumber = beDateAtStart[1].trim();
      if (!result.date) result.date = normalizeDate(beDateAtStart[2]);
    }
  }
  if (!result.beNumber) {
    for (const re of [
      /Bill\s+of\s+Entry\s+No\.?\s*:?\s*(\d{4,})/i,
      /B\.?E\.?\s*No\.?\s*:?\s*(\d{4,})/i,
      /\bBE\s*:?\s*(\d{6,})/i,
    ]) {
      const m = text.match(re);
      if (m && m[1]) { result.beNumber = m[1].trim(); break; }
    }
  }

  // Fallback date
  if (!result.date) {
    const dm = text.match(/(?:BE\s+Date|Date|Dated)\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);
    if (dm) result.date = normalizeDate(dm[1]);
  }
  if (!result.date) {
    const ddmon = text.match(/\b(\d{1,2}-(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)-\d{2,4})\b/i);
    if (ddmon) result.date = normalizeDateDdMonYy(ddmon[1]);
  }
  if (!result.date) {
    const allDates = [...text.matchAll(/\b(\d{2}[\/\-]\d{2}[\/\-]\d{4})\b/g)];
    if (allDates.length > 0) result.date = normalizeDate(allDates[0][1]);
  }

  // Port Code
  if (!result.portCode) {
    const pm = text.match(/\b(IN[A-Z]{3}\d{1,2})\b/);
    if (pm) result.portCode = pm[1].toUpperCase();
  }

  // Duty row 1: BCD, SWS, IGST, Assessable Value
  // "1.BCD  2.ACD  3.SWS ... 7.IGST  8.G.CESS  18.TOT.ASS VAL"
  // "127828.2  0  12782.8  0  0  134859  0  2556563"
  const dutyRow1Match = text.match(
    /1\.BCD\s+2\.ACD\s+3\.SWS[^\n]*18\.TOT\.ASS VAL\s*\n([\d.\s]+)/i
  );
  if (dutyRow1Match) {
    const nums = dutyRow1Match[1].trim().split(/\s+/).filter(n => /^[\d.]+$/.test(n));
    if (nums[0]) result.dutyBCD      = nums[0]; // 1.BCD
    if (nums[2]) result.dutySWS      = nums[2]; // 3.SWS
    if (nums[5]) result.gst          = nums[5]; // 7.IGST
    if (nums[7]) result.invoiceValue = nums[7]; // 18.TOT.ASS VAL
  }

  // Duty row 2: INT, PNLTY, FINE
  // "...14.TOTAL DUTY  15.INT  16.PNLTY  17.FINE  19.TOT. AMOUNT"
  // "275470  113  0  5000  280583"
  const dutyRow2Match = text.match(
    /14\.TOTAL DUTY\s+15\.INT\s+16\.PNLTY\s+17\.FINE[^\n]*\n([\d.\s]+)/i
  );
  if (dutyRow2Match) {
    const nums = dutyRow2Match[1].trim().split(/\s+/).filter(n => /^[\d.]+$/.test(n));
    if (nums[1]) result.dutyINT = nums[1]; // 15.INT
    if (nums[2]) result.penalty = nums[2]; // 16.PNLTY
    if (nums[3]) result.fine    = nums[3]; // 17.FINE
  }

  // Fallback assessable value patterns
  if (!result.invoiceValue) {
    const avm =
      text.match(/(?:^|[^\d])18\.?\s*TOT\.?\s*ASS\.?\s*VAL[^\d]*([\d,]+(?:\.\d{1,2})?)/im) ||
      text.match(/14\.ASS\.\s*VALUE\s*\n([\d,]+(?:\.\d{1,2})?)/i) ||
      text.match(/29\.ASSESS VALUE\s+30\.\s*TOTAL DUTY\s*\n([\d,]+(?:\.\d{1,2})?)/i) ||
      text.match(/TOT\.?\s*ASS\.?\s*VAL[^\d]*([\d,]+(?:\.\d{1,2})?)/i) ||
      text.match(/Assessable\s+Value[^\d]*([\d,]+(?:\.\d{1,2})?)/i);
    if (avm) {
      const v = avm[1].replace(/,/g, '');
      if (parseFloat(v) >= 1000) result.invoiceValue = v;
    }
  }

  // Exchange Rate: "1 USD=91.35INR"
  const exchPatterns = [
    /1\s*USD\s*=\s*([\d.]+)\s*INR/i,
    /1\s*USD\s*=\s*([\d.]+)INR/i,
    /1\s*GBP\s*=\s*([\d.]+)\s*INR/i,
    /1\s*EUR\s*=\s*([\d.]+)\s*INR/i,
    /USD\s*[=:]\s*([\d.]+)\s*INR/i,
    /Exchange\s*Rate\s*:?\s*([\d.]+)/i,
  ];
  for (const re of exchPatterns) {
    const m = text.match(re);
    if (m && m[1]) {
      const n = parseFloat(m[1]);
      if (!isNaN(n) && n > 1 && n < 200) { result.exchangeRate = m[1]; break; }
    }
  }

  // Inco Term — "15.TermFOB" on page 2
  const incoMatch =
    text.match(/15\.Term\s*(FOB|CIF|EXW|DDP|CFR|C&F|DAP|DPU)/i) ||
    text.match(/(?:Inco\s*Term|Incoterm|(?:7\.\s*)?INVTERM)\s*:?\s*(FOB|CIF|EXW|DDP|CFR|C\s*&\s*F|DAP|DPU)/i) ||
    text.match(/\b(FOB|CIF|EXW|DDP|CFR|DAP|DPU)\b/i);
  if (incoMatch) result.incoTerm = incoMatch[1].replace(/\s+/g, '').toUpperCase();
  if (!result.incoTerm) {
    const incoAfter = incoTermAfterKeyword(text, /(?:Inco\s*Term|INVTERM|Term)\s*:?/i, 250);
    if (incoAfter) result.incoTerm = incoAfter;
  }

  // Individual fallbacks for duty fields
  if (!result.dutyBCD) {
    const v = dutyValueAfterLabel(text, /(?:1\.?\s*)?BCD\b/i, 800);
    if (v) result.dutyBCD = v;
  }
  if (!result.dutySWS) {
    const v = dutyValueAfterLabel(text, /(?:3\.?\s*)?SWS\b/i, 800);
    if (v) result.dutySWS = v;
  }
  if (!result.gst) {
    const v = dutyValueAfterLabel(text, /(?:IGST|Integrated\s+Tax|GST)\s*:?/i, 800);
    if (v) result.gst = v;
  }
  // INT, PNLTY, FINE individual fallbacks
  if (!result.dutyINT) {
    const v = firstNumberAfterKeyword(text, /15\.?\s*INT\b/i, 400);
    if (v) result.dutyINT = v;
  }
  if (!result.penalty) {
    const v = firstNumberAfterKeyword(text, /16\.?\s*PNLTY\b/i, 400);
    if (v) result.penalty = v;
  }
  if (!result.fine) {
    const v = firstNumberAfterKeyword(text, /17\.?\s*FINE\b/i, 400);
    if (v) result.fine = v;
  }

  return result;
}

// ─────────────────────────────────────────────────────────────
// DOCUMENT TYPE DETECTION
// ─────────────────────────────────────────────────────────────

function detectDocumentType(text) {
  const isSB  = /Shipping\s+Bill/i.test(text) ||
                (/SB\s+No/i.test(text) && /FOB\s+VALUE|RODTEP|INVTERM/i.test(text));
  const isBOE = /Bill\s+of\s+Entry/i.test(text) ||
                (/BE\s+No/i.test(text) && /BCD|SWS|IGST/i.test(text));
  if (isSB && !isBOE) return 'SB';
  if (isBOE && !isSB) return 'BOE';
  if (/RODTEP|FOB\s+VALUE/.test(text)) return 'SB';
  if (/BCD|15\.INT|16\.PNLTY/.test(text)) return 'BOE';
  return 'UNKNOWN';
}

// ─────────────────────────────────────────────────────────────
// parseCustomsDocument — legacy wrapper kept for compatibility
// ─────────────────────────────────────────────────────────────

function parseCustomsDocument(text) {
  const t = (text || '').replace(/\r\n/g, '\n');
  const docType = detectDocumentType(t);

  if (docType === 'BOE') {
    const r = parseBillOfEntry(t);
    return { ...r, rawText: t };
  }
  if (docType === 'SB') {
    const r = parseShippingBill(t);
    return { ...r, rawText: t };
  }
  // Unknown: try both, return whichever got more fields
  const sb  = parseShippingBill(t);
  const boe = parseBillOfEntry(t);
  const sbScore  = [sb.sbNumber,  sb.portCode, sb.date, sb.fobValueINR].filter(Boolean).length;
  const boeScore = [boe.beNumber, boe.portCode, boe.date, boe.dutyBCD].filter(Boolean).length;
  return sbScore >= boeScore ? { ...sb, rawText: t } : { ...boe, rawText: t };
}

// ─────────────────────────────────────────────────────────────
// OUTPUT SHAPE FOR FRONTEND
// ─────────────────────────────────────────────────────────────

function toFrontendShape(parsed) {
  const p = parsed || {};
  return {
    beNumber:      p.beNumber      || undefined,
    sbNumber:      p.sbNumber      || undefined,
    date:          p.date          || undefined,
    portCode:      p.portCode      || undefined,
    invoiceValue:  p.invoiceValue  || undefined,
    exchangeRate:  p.exchangeRate  || undefined,
    incoTerm:      p.incoTerm      || undefined,
    containerNumber: p.containerNumber || undefined,
    blNumber:      p.blNumber      || undefined,
    blDate:        p.blDate        || undefined,
    shippingLine:  p.shippingLine  || undefined,
    dutyBCD:       p.dutyBCD       || undefined,
    dutySWS:       p.dutySWS       || undefined,
    dutyINT:       p.dutyINT       || undefined,
    penalty:       p.penalty       || undefined,
    fine:          p.fine          || undefined,
    gst:           p.gst           || undefined,
    fobValueINR:   p.fobValueINR   || undefined,
    fobValueFC:    p.fobValueFC    || undefined,
    dbk:           p.dbk           || undefined,
    rodtep:        p.rodtep        || undefined,
  };
}

// ─────────────────────────────────────────────────────────────
// MAIN PUBLIC API
// ─────────────────────────────────────────────────────────────

async function extractDataFromPDF(buffer) {
  const { text: pdfText } = await extractTextFromPdf(buffer);
  const trimmed = (pdfText || '').trim();

  if (!trimmed || isTextGarbled(trimmed)) {
    let ocrText = '';
    let confidence = null;
    try {
      const firstPageImage = await pdfFirstPageToImage(buffer);
      const out = await extractTextFromImage(firstPageImage);
      ocrText = out.text || '';
      confidence = out.confidence;
    } catch (imgErr) {
      ocrText = trimmed || '';
    }
    const parsed = parseCustomsDocument(ocrText);
    return {
      ...toFrontendShape(parsed),
      confidence: confidence != null ? Math.round(confidence) : undefined,
      source: 'ocr',
    };
  }

  const parsed = parseCustomsDocument(trimmed);
  return {
    ...toFrontendShape(parsed),
    confidence: 100,
    source: 'text',
  };
}

async function scanAndParse(fileBuffer, opts = {}) {
  const mime  = (opts && opts.mimeType) || '';
  const isPdf = mime === 'application/pdf' || isPdfBuffer(fileBuffer);

  if (!isPdf) {
    const { text, confidence } = await extractTextFromImage(fileBuffer);
    const parsed = parseCustomsDocument(text);
    return {
      ...toFrontendShape(parsed),
      confidence: confidence != null ? Math.round(confidence) : undefined,
      source: 'ocr',
    };
  }

  const { text: pdfText } = await extractTextFromPdf(fileBuffer);
  const trimmed = (pdfText || '').trim();

  if (trimmed.length < MIN_TEXT_LENGTH_FOR_LAYER) {
    console.warn('PDF text extraction returned no usable text.');
    return {
      confidence: 0,
      source: 'text',
      error: 'Could not read text from this PDF. Please upload the original digital PDF from ICEGATE, not a printed and scanned copy.',
    };
  }

  const parsed = parseCustomsDocument(trimmed);
  return {
    ...toFrontendShape(parsed),
    confidence: 100,
    source: 'text',
  };
}

// ─────────────────────────────────────────────────────────────
// IMAGE OCR (Tesseract — fallback for non-PDF image files)
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

// ─────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────

module.exports = {
  extractTextFromImage,
  extractTextFromPdf,
  extractDataFromPDF,
  pdfFirstPageToImage,
  parseCustomsDocument,
  scanAndParse,
};
