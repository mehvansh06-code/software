/**
 * OCR Service — ICEGATE Customs Document Parser
 * Extracts data from Indian Customs digital PDFs (Shipping Bills and Bills of Entry).
 * Uses Python pdfplumber for text extraction — fast, 100% accurate, fully private.
 * ALL DATA STAYS ON YOUR COMPUTER. Nothing is sent anywhere.
 */

const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const fsp = fs.promises;

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
function runPythonExtract(pyScript, tmpFile) {
  return new Promise((resolve, reject) => {
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    const child = spawn(pythonCmd, ['-c', pyScript, tmpFile], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timeoutId = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch (_) {}
      reject(new Error('Python OCR timed out'));
    }, 15000);

    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    child.on('error', (err) => {
      clearTimeout(timeoutId);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timeoutId);
      if (code === 0) return resolve(stdout);
      return reject(new Error(stderr || `Python exited with code ${code}`));
    });
  });
}

async function extractTextWithPdfplumber(pdfBuffer) {
  let tmpFile = null;
  try {
    tmpFile = path.join(
      os.tmpdir(),
      `icegate_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`
    );
    await fsp.writeFile(tmpFile, pdfBuffer);

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

    const stdout = await runPythonExtract(pyScript, tmpFile);
    if (stdout && stdout.trim().length > 0) {
      return stdout;
    }
    return '';
  } catch (err) {
    return '';
  } finally {
    if (tmpFile) {
      try { await fsp.unlink(tmpFile); } catch (_) {}
    }
  }
}

/**
 * Extract text from a PDF buffer.
 * Tries pdfplumber first, then falls back to Node pdf-parse packages.
 */
async function extractTextFromPdf(pdfBuffer) {
  // Try pdfplumber (best for ICEGATE documents)
  const plumberText = await extractTextWithPdfplumber(pdfBuffer);
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

/**
 * Extract document number (SB/BE) from nearby label context.
 * Avoids picking unrelated 7-digit numbers that may exist elsewhere in the PDF.
 */
function extractDocNumberByLabel(text, label) {
  if (!text || !label) return null;
  const direct = text.match(new RegExp(`\\b${label}\\s*No\\.?\\s*[:\\-]?\\s*(\\d{7,10})\\b`, 'i'));
  if (direct && direct[1]) return direct[1];

  const inHeader = text.match(
    new RegExp(`\\bPort\\s*Code\\s+${label}\\s*No\\.?\\s+${label}\\s*Date[\\s\\S]{0,140}?\\bIN[A-Z]{3}\\d{1,2}\\s+(\\d{7,10})\\b`, 'i')
  );
  if (inHeader && inHeader[1]) return inHeader[1];

  return null;
}

/**
 * Return first real amount after a duty label, skipping serial numbers.
 */
function numericAfterLabel(text, labelRegex, maxChars = 1200) {
  if (!text || typeof text !== 'string') return null;
  const m = text.match(labelRegex);
  if (!m) return null;
  const start = m.index + m[0].length;
  const chunk = text.slice(start, start + maxChars);
  const nums = [...chunk.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((x) => x[0].replace(/,/g, ''));
  for (const raw of nums) {
    const n = Number(raw);
    if (!Number.isFinite(n)) continue;
    if (Number.isInteger(n) && n >= 1 && n <= 20) continue;
    return raw;
  }
  return null;
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
  
  // Clean text: remove quotes and normalize multiple spaces/newlines
  const normText = (text || '').replace(/["']/g, '').replace(/,+/g, ' ');
  const toNumStr = (v) => String(v || '').replace(/,/g, '').trim();
  const numbersFromLine = (line) =>
    (line.match(/\d[\d,]*(?:\.\d+)?/g) || []).map(toNumStr).filter((n) => /^\d+(?:\.\d+)?$/.test(n));
  const firstNumericDataLineAfter = (labelRegex, opts = {}) => {
    const { maxChars = 700, minNums = 1 } = opts;
    const m = normText.match(labelRegex);
    if (!m) return null;
    const start = m.index + m[0].length;
    const chunk = normText.slice(start, start + maxChars);
    const lines = chunk.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const headerLike = /(FOB|FREIGHT|INSUR|DISCO|COMM|IGST|INVOICE|VALUE|EXCHANGE|INV AMT|AMOUNT|ITEMSNO|HS CD|DESCRIPTION|QUANTITY|UQC|RATE)/i;
    for (const line of lines) {
      const nums = numbersFromLine(line);
      if (nums.length < minNums) continue;
      if (headerLike.test(line)) continue;
      if ((line.match(/\b\d+\s*\./g) || []).length >= 2) continue;
      // Ignore short serial-like-only lines such as "1." / "2."
      if (nums.length === 1 && parseFloat(nums[0]) < 10 && /\.\s*$/.test(line)) continue;
      if (!nums.some((n) => parseFloat(n) > 9)) continue;
      return nums;
    }
    return null;
  };

  // 1. Port Code (IN + 3 Letters + 1/2 Digits)
  const portMatch = normText.match(/\b(IN[A-Z]{3}\d{1,2})\b/);
  if (portMatch) result.portCode = portMatch[1].toUpperCase();

  // 2. SB Number from label context (avoid accidental 7-digit matches elsewhere)
  const sbNo = extractDocNumberByLabel(normText, 'SB');
  if (sbNo) result.sbNumber = sbNo;

  // 3. SB Date (DD-MON-YY or DD-MON-YYYY)
  const dateMatch = normText.match(/\b(\d{1,2}-(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)-\d{2,4})\b/i);
  if (dateMatch) result.date = normalizeDateDdMonYy(dateMatch[1]);

  // 4. FOB Value INR
  // Read first numeric line after "1.FOB VALUE ..." header; first number is FOB INR.
  const fobRowNums = firstNumericDataLineAfter(/1\.?\s*FOB\s*VALUE/i, { maxChars: 700, minNums: 1 });
  if (fobRowNums && fobRowNums.length > 0) result.fobValueINR = fobRowNums[0];
  
  // Fallback for FOB INR
  if (!result.fobValueINR) {
    const fallbackFob = amountAfterKeyword(normText, /1\.FOB VALUE/i, 200);
    if (fallbackFob) result.fobValueINR = fallbackFob;
  }

  // 5. Invoice Value, FOB FC and Exchange Rate from the valuation row.
  // Typical row: "19633.33 19183.33 1 USD INR 89.65"
  const invFobFxMatch = normText.match(
    /\b([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s+\d+\s*(USD|GBP|EUR|CNY|JPY)\s+INR\s+([\d.]+)/i
  );
  if (invFobFxMatch) {
    result.invoiceValue = toNumStr(invFobFxMatch[1]);
    result.fobValueFC = toNumStr(invFobFxMatch[2]);
    result.exchangeRate = toNumStr(invFobFxMatch[4]);
  }

  // Fallback for invoice/fob FC when valuation row is OCR-distorted.
  if (!result.invoiceValue || !result.fobValueFC) {
    const invFobRowNums = firstNumericDataLineAfter(/1\.?\s*INVOICE\s*VALUE/i, { maxChars: 1000, minNums: 2 });
    if (invFobRowNums && invFobRowNums.length >= 2) {
      if (!result.invoiceValue) result.invoiceValue = invFobRowNums[0];
      if (!result.fobValueFC) result.fobValueFC = invFobRowNums[1];
    }
  }

  // 6. Exchange Rate fallback
  if (!result.exchangeRate) {
    const exchMatch = normText.match(/1\s*(USD|GBP|EUR|CNY|JPY)\s+(?:INR|=)\s*([\d.]+)/i);
    if (exchMatch) result.exchangeRate = exchMatch[2];
  }

  // 7. Inco Term
  const invtermMatch = normText.match(/\b(FOB|CIF|EXW|DDP|CFR|C&F|DAP|DPU)\b/i);
  if (invtermMatch) result.incoTerm = invtermMatch[1].toUpperCase();

  // 8. RODTEP
  // Skip nearby column serials like "6.ROSCTL" and pick the actual amount.
  const rodtepVal = valueAfterLabelSkipColumnNumbers(
    normText,
    /(?:\d+\.?\s*)?RODTEP\s*AMT/i,
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    900
  );
  if (rodtepVal != null && rodtepVal !== '') result.rodtep = rodtepVal;

  // 9. DBK Claim
  // Skip column labels like "3.CESS AMT" and capture the numeric DBK value.
  const dbkVal = valueAfterLabelSkipColumnNumbers(
    normText,
    /(?:\d+\.?\s*)?DBK\s*CLAIM/i,
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    1200
  );
  if (dbkVal != null && dbkVal !== '') result.dbk = dbkVal;

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

  // Clean text: remove quotes and replace commas to fix pdfplumber tabular artifacts
  const normText = (text || '').replace(/["']/g, '').replace(/,+/g, ' ');

  // 1. Port Code
  const portMatch = normText.match(/\b(IN[A-Z]{3}\d{1,2})\b/);
  if (portMatch) result.portCode = portMatch[1].toUpperCase();

  // 2. BE Number from label context (avoid accidental 7-digit matches elsewhere)
  const beNo = extractDocNumberByLabel(normText, 'BE');
  if (beNo) result.beNumber = beNo;

  // 3. BE Date (DD/MM/YYYY or similar)
  const dateMatch = normText.match(/\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/);
  if (dateMatch) result.date = normalizeDate(dateMatch[1]);

  // Fallback DD-MON-YY date for BE
  if (!result.date) {
    const ddmon = normText.match(/\b(\d{1,2}-(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)-\d{2,4})\b/i);
    if (ddmon) result.date = normalizeDateDdMonYy(ddmon[1]);
  }

  // 4. Duty Row 1: BCD, SWS, IGST, Assessable Value
  // Parse from the numeric row immediately after:
  // "1.BCD ... 7.IGST ... 18.TOT.ASS VAL"
  const dutyHeaderMatch = normText.match(/1\.?\s*BCD[\s\S]{0,220}?7\.?\s*IGST[\s\S]{0,180}?18\.?\s*TOT\.?\s*ASS\.?\s*VAL/i);
  if (dutyHeaderMatch) {
    const afterHeader = normText.slice(dutyHeaderMatch.index + dutyHeaderMatch[0].length, dutyHeaderMatch.index + dutyHeaderMatch[0].length + 500);
    const lines = afterHeader.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const rowLine = lines.find((line) => {
      const nums = (line.match(/\d[\d,]*(?:\.\d+)?/g) || []).map((n) => n.replace(/,/g, ''));
      return nums.length >= 8;
    });
    if (rowLine) {
      const nums = (rowLine.match(/\d[\d,]*(?:\.\d+)?/g) || [])
        .map((n) => n.replace(/,/g, ''))
        .filter((n) => /^\d+(?:\.\d+)?$/.test(n));
      if (nums.length >= 8) {
        result.dutyBCD = nums[0];
        result.dutySWS = nums[2];
        // Some documents output 8 columns, others 9 (with CVD column explicit).
        // When 9 columns are present, IGST is index 6; otherwise index 5.
        result.gst = nums.length >= 9 ? nums[6] : nums[5];
        // Assessable value is always the last value in this row.
        if (!result.invoiceValue) result.invoiceValue = nums[nums.length - 1];
      }
    }
  }

  // Robust duty field fallbacks based on specific labels
  if (!result.dutyBCD) {
    const v = numericAfterLabel(normText, /(?:^|\s)1\.?\s*BCD\b/i, 1400) || dutyValueAfterLabel(normText, /(?:1\.?\s*)?BCD\b/i, 800);
    if (v) result.dutyBCD = v;
  }
  if (!result.dutySWS) {
    const v = numericAfterLabel(normText, /(?:^|\s)3\.?\s*SWS\b/i, 1400) || dutyValueAfterLabel(normText, /(?:3\.?\s*)?SWS\b/i, 800);
    if (v) result.dutySWS = v;
  }
  if (!result.gst) {
    const v = numericAfterLabel(normText, /(?:^|\s)7\.?\s*IGST\b/i, 1600) || valueAfterLabelSkipColumnNumbers(
      normText,
      /(?:IGST|Integrated\s+Tax|7\.?\s*IGST)\s*:?/i,
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
      1200
    );
    if (v) result.gst = v;
  }
  if (!result.invoiceValue) {
    const v = numericAfterLabel(normText, /(?:^|\s)18\.?\s*TOT\.?\s*ASS\.?\s*VAL\b/i, 1400) || dutyValueAfterLabel(normText, /18\.?\s*TOT\.?\s*ASS\.?\s*VAL/i, 800);
    if (v) result.invoiceValue = v;
  }

  // 5. Duty Row 2: INT, PNLTY/PENALTY, FINE
  // Typical header: "14.TOTAL DUTY 15.INT 16.PNLTY 17.FINE 19.TOT. AMOUNT"
  const dutyHeader2 = normText.match(
    /(?:14\.?\s*TOTAL\s*DUTY[\s\S]{0,120}?)?15\.?\s*INT[\s\S]{0,80}?16\.?\s*(?:PNLTY|PENALTY)[\s\S]{0,80}?17\.?\s*FINE/i
  );
  if (dutyHeader2) {
    const afterHeader = normText.slice(
      dutyHeader2.index + dutyHeader2[0].length,
      dutyHeader2.index + dutyHeader2[0].length + 500
    );
    const lines = afterHeader.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const rowLine = lines.find((line) => {
      const nums = (line.match(/\d[\d,]*(?:\.\d+)?/g) || []).map((n) => n.replace(/,/g, ''));
      return nums.length >= 3;
    });
    if (rowLine) {
      const nums = (rowLine.match(/\d[\d,]*(?:\.\d+)?/g) || []).map((n) => n.replace(/,/g, ''));
      if (nums.length >= 5) {
        // [totalDuty, int, penalty, fine, totalAmount]
        result.dutyINT = nums[1];
        result.penalty = nums[2];
        result.fine = nums[3];
      } else if (nums.length >= 3) {
        // [int, penalty, fine] fallback variant
        result.dutyINT = nums[0];
        result.penalty = nums[1];
        result.fine = nums[2];
      }
    }
  }

  // Fallbacks for variant BOE layouts (strict label-value only, avoids column drift)
  if (!result.dutyINT) {
    const v = numericAfterLabel(normText, /(?:^|\s)15\.?\s*INT(?:EREST)?\b/i, 1000);
    if (v) result.dutyINT = v;
  }
  if (!result.penalty) {
    const v = numericAfterLabel(normText, /(?:^|\s)16\.?\s*(?:PNLTY|PENALTY)\b/i, 1000);
    if (v) result.penalty = v;
  }
  if (!result.fine) {
    const v = numericAfterLabel(normText, /(?:^|\s)17\.?\s*FINE\b/i, 1000);
    if (v) result.fine = v;
  }

  // 6. Exchange Rate (supports: "1 USD=91.35INR", "1 USD INR 91.35", "Exchange Rate 91.35")
  let exch = null;
  const exchPatterns = [
    /(?:\b1\s*)?(USD|GBP|EUR|CNY|JPY)\s*=\s*([\d]+(?:\.\d+)?)\s*INR/i,
    /(?:\b1\s*)?(USD|GBP|EUR|CNY|JPY)\s+(?:INR|RS|RUPEES?)\s*[:=]?\s*([\d]+(?:\.\d+)?)/i,
    /EXCHANGE\s*RATE[^\d]{0,20}([\d]+(?:\.\d+)?)/i,
    /(?:\b1\s*)?(USD|GBP|EUR|CNY|JPY)\s+INR\s+([\d]+(?:\.\d+)?)/i,
  ];
  for (const re of exchPatterns) {
    const m = normText.match(re);
    if (!m) continue;
    const candidate = m[2] != null ? m[2] : m[1];
    const n = parseFloat(String(candidate));
    if (!Number.isNaN(n) && n > 0 && n < 10000) {
      exch = String(n);
      break;
    }
  }
  if (exch) result.exchangeRate = exch;

  // 7. Inco Term
  const incoMatch = normText.match(/\b(FOB|CIF|EXW|DDP|CFR|C&F|DAP|DPU)\b/i);
  if (incoMatch) result.incoTerm = incoMatch[1].toUpperCase();

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
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const canvasLib = require('@napi-rs/canvas');
  const { createCanvas, DOMMatrix, ImageData, Path2D } = canvasLib;
  if (DOMMatrix && typeof global.DOMMatrix === 'undefined') global.DOMMatrix = DOMMatrix;
  if (ImageData && typeof global.ImageData === 'undefined') global.ImageData = ImageData;
  if (Path2D && typeof global.Path2D === 'undefined') global.Path2D = Path2D;
  const verbosityLevel = pdfjs?.VerbosityLevel?.ERRORS != null ? pdfjs.VerbosityLevel.ERRORS : 0;

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdfBuffer),
    useSystemFonts: true,
    isEvalSupported: false,
    disableFontFace: true,
    verbosity: verbosityLevel,
  });

  let doc = null;
  let page = null;
  try {
    doc = await loadingTask.promise;
    page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: 2.5 });
    const canvas = createCanvas(Math.max(1, Math.ceil(viewport.width)), Math.max(1, Math.ceil(viewport.height)));
    const ctx = canvas.getContext('2d');
    const renderTask = page.render({ canvasContext: ctx, viewport });
    await renderTask.promise;
    const image = canvas.toBuffer('image/png');
    if (!Buffer.isBuffer(image) || image.length === 0) {
      throw new Error('Rendered PDF page produced empty image');
    }
    return image;
  } finally {
    try { if (page && typeof page.cleanup === 'function') page.cleanup(); } catch (_) {}
    try { if (doc && typeof doc.cleanup === 'function') doc.cleanup(); } catch (_) {}
    try { if (doc && typeof doc.destroy === 'function') await doc.destroy(); } catch (_) {}
    try { if (loadingTask && typeof loadingTask.destroy === 'function') await loadingTask.destroy(); } catch (_) {}
  }
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
