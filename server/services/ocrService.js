/**
 * OCR Service: text extraction from PDFs (text layer first) and images (Tesseract).
 * For computer-generated PDFs: prioritize pdf-parse (1s, 100%); fallback to first-page image + OCR.
 * Node-safe: lazy-loads PDF parser (tries v2, falls back to pdf-parse-legacy) and Tesseract to avoid
 * startup crashes from browser-only APIs (e.g. DOMMatrix).
 */

const PDF_MAGIC = Buffer.from('%PDF');
const MIN_TEXT_LENGTH_FOR_LAYER = 40;

let _pdfParseV2 = undefined;
let _pdfParseLegacy = undefined;

/** Lazy-load PDF parser. In Node, pdf-parse v2 throws (DOMMatrix); use pdf-parse-legacy first for reliable text extraction. */
function getPdfParser() {
  if (_pdfParseLegacy === undefined) {
    try {
      _pdfParseLegacy = require('pdf-parse-legacy');
    } catch {
      _pdfParseLegacy = null;
    }
  }
  if (_pdfParseV2 === undefined) {
    try {
      _pdfParseV2 = require('pdf-parse');
    } catch {
      _pdfParseV2 = null;
    }
  }
  return { v2: _pdfParseV2, legacy: _pdfParseLegacy };
}

function isPdfBuffer(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length >= 4 && buffer.subarray(0, 4).equals(PDF_MAGIC);
}

/** Heuristic: true if text looks like a scan (empty or garbled) rather than digital PDF text. */
function isTextGarbled(text) {
  const t = (text || '').trim();
  if (t.length < MIN_TEXT_LENGTH_FOR_LAYER) return true;
  const hasDigits = /\d/.test(t);
  const hasCustomsKeywords = /Bill\s+of\s+Entry|Shipping\s+Bill|S\/B\s+No|Date|Dated|IN[A-Z]{3}\d/i.test(t);
  if (!hasDigits && !hasCustomsKeywords) return true;
  return false;
}

/**
 * Extract text from PDF using its text layer (fast, 100% for digital PDFs).
 * Prefers pdf-parse-legacy (Node-safe); uses pdf-parse v2 only when legacy unavailable (v2 often throws DOMMatrix in Node).
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @returns {Promise<{ text: string }>} Extracted text or empty if no text layer
 */
async function extractTextFromPdf(pdfBuffer) {
  const { v2, legacy } = getPdfParser();
  // Legacy first: works in Node; v2 throws DOMMatrix in Node
  if (legacy && typeof legacy === 'function') {
    try {
      const result = await legacy(pdfBuffer);
      const text = (result && result.text) ? String(result.text) : '';
      if (text.trim().length > 0) return { text };
    } catch (e) {
      // fall through to v2 or empty
    }
  }
  const PDFParseClass = v2 && (v2.PDFParse || (v2.default && v2.default.PDFParse));
  if (PDFParseClass) {
    let parser;
    try {
      parser = new PDFParseClass({ data: pdfBuffer });
      const result = await parser.getText({ first: 1 });
      if (parser && typeof parser.destroy === 'function') await parser.destroy().catch(() => {});
      return { text: (result && result.text) ? String(result.text) : '' };
    } catch (e) {
      if (parser && typeof parser.destroy === 'function') await parser.destroy().catch(() => {});
    }
  }
  return { text: '' };
}

/**
 * Extract data from a PDF buffer (ICEGATE / digital customs docs).
 * 1) Try pdf-parse text extraction.
 * 2) If text is empty or garbled (scan), fallback to first-page image + Tesseract OCR.
 * 3) If text is found, parse with Indian Customs patterns (BE, SB, Port, Date, Total/Assessable Value).
 * @param {Buffer} buffer - PDF file buffer
 * @returns {Promise<{ beNumber?: string, sbNumber?: string, date?: string, portCode?: string, invoiceValue?: string, confidence?: number, source?: 'text'|'ocr' }>}
 */
async function extractDataFromPDF(buffer) {
  const { text: pdfText } = await extractTextFromPdf(buffer);
  const trimmed = (pdfText || '').trim();

  const spreadParsed = (p) => ({
    beNumber: p.beNumber || undefined,
    sbNumber: p.sbNumber || undefined,
    date: p.date || undefined,
    portCode: p.portCode || undefined,
    invoiceValue: p.invoiceValue || undefined,
    containerNumber: p.containerNumber || undefined,
    blNumber: p.blNumber || undefined,
    blDate: p.blDate || undefined,
    shippingLine: p.shippingLine || undefined,
    dutyBCD: p.dutyBCD || undefined,
    dutySWS: p.dutySWS || undefined,
    dutyINT: p.dutyINT || undefined,
    gst: p.gst || undefined,
  });

  if (!trimmed || isTextGarbled(trimmed)) {
    let ocrText = '';
    let confidence = null;
    try {
      const firstPageImage = await pdfFirstPageToImage(buffer);
      const out = await extractTextFromImage(firstPageImage);
      ocrText = out.text || '';
      confidence = out.confidence;
    } catch (imgErr) {
      // pdf-img-convert can throw in Node (e.g. DOMMatrix/canvas); still try parsing trimmed text
      ocrText = trimmed || '';
    }
    const parsed = parseCustomsDocument(ocrText);
    return {
      ...spreadParsed(parsed),
      confidence: confidence != null ? Math.round(confidence) : undefined,
      source: 'ocr',
    };
  }

  const parsed = parseCustomsDocument(trimmed);
  return {
    ...spreadParsed(parsed),
    confidence: 100,
    source: 'text',
  };
}

/**
 * Convert first page of PDF to high-resolution image buffer (for OCR fallback).
 * Uses pdf-img-convert (PDF.js-based). In some Node environments this may throw (e.g. canvas/DOMMatrix); caller should catch.
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @returns {Promise<Buffer>} PNG image buffer of first page
 */
async function pdfFirstPageToImage(pdfBuffer) {
  const { convert } = await import('pdf-img-convert');
  const pages = await convert(pdfBuffer, {
    scale: 2.5,
    page_numbers: [1],
  });
  if (!pages || !pages[0]) throw new Error('Could not render first page of PDF');
  return Buffer.from(pages[0]);
}

/**
 * Extract raw text from an image buffer using Tesseract.js.
 * PSM 6 = single uniform block (good for forms/BOE); OEM 3 = LSTM + legacy for better retrieval.
 * @param {Buffer} buffer - Image buffer (PNG, JPEG, etc.)
 * @returns {Promise<{ text: string, confidence?: number }>} Raw OCR text and optional confidence
 */
async function extractTextFromImage(buffer) {
  const { createWorker } = require('tesseract.js');
  const worker = await createWorker('eng', 1, {
    logger: () => {},
  });
  try {
    try {
      await worker.setParameters({ tessedit_pageseg_mode: '6' }); // PSM 6: single block (forms/invoices)
    } catch {
      // ignore if setParameters not supported
    }
    const { data } = await worker.recognize(buffer);
    return { text: data.text || '', confidence: data.confidence };
  } finally {
    await worker.terminate();
  }
}

/**
 * Scan file buffer (PDF or image) and parse into clean JSON.
 * PDF: 1) Try text extraction (pdf-parse); if meaningful text, parse and return (100%).
 *      2) Else convert first page to image and run Tesseract.
 * Image: Run Tesseract only.
 * @param {Buffer} fileBuffer - PDF or image buffer
 * @param {{ mimeType?: string }} [opts] - Optional mimeType (e.g. 'application/pdf')
 * @returns {Promise<{ beNumber?: string, sbNumber?: string, date?: string, portCode?: string, invoiceValue?: string, confidence?: number, source?: 'text'|'ocr' }>}
 */
async function scanAndParse(fileBuffer, opts = {}) {
  const mime = (opts && opts.mimeType) || '';
  const isPdf = mime === 'application/pdf' || isPdfBuffer(fileBuffer);

  const spreadParsed = (p) => ({
    beNumber: p.beNumber || undefined,
    sbNumber: p.sbNumber || undefined,
    date: p.date || undefined,
    portCode: p.portCode || undefined,
    invoiceValue: p.invoiceValue || undefined,
    containerNumber: p.containerNumber || undefined,
    blNumber: p.blNumber || undefined,
    blDate: p.blDate || undefined,
    shippingLine: p.shippingLine || undefined,
    dutyBCD: p.dutyBCD || undefined,
    dutySWS: p.dutySWS || undefined,
    dutyINT: p.dutyINT || undefined,
    gst: p.gst || undefined,
  });

  if (isPdf) {
    const { text: pdfText } = await extractTextFromPdf(fileBuffer);
    const trimmed = (pdfText || '').trim();
    if (trimmed.length >= MIN_TEXT_LENGTH_FOR_LAYER) {
      const parsed = parseCustomsDocument(trimmed);
      return { ...spreadParsed(parsed), confidence: 100, source: 'text' };
    }
    let ocrText = '';
    let confidence = null;
    try {
      const firstPageImage = await pdfFirstPageToImage(fileBuffer);
      const out = await extractTextFromImage(firstPageImage);
      ocrText = out.text || '';
      confidence = out.confidence;
    } catch {
      ocrText = trimmed || '';
    }
    const parsed = parseCustomsDocument(ocrText);
    return {
      ...spreadParsed(parsed),
      confidence: confidence != null ? Math.round(confidence) : undefined,
      source: 'ocr',
    };
  }

  const { text, confidence } = await extractTextFromImage(fileBuffer);
  const parsed = parseCustomsDocument(text);
  return {
    ...spreadParsed(parsed),
    confidence: confidence != null ? Math.round(confidence) : undefined,
    source: 'ocr',
  };
}

/** Extract first number (with optional decimals) from a line/string; returns string without commas or spaces. */
function extractNumberFromLine(str) {
  if (!str || typeof str !== 'string') return undefined;
  const m = str.match(/[\d,\s]+(?:\.\d{2})?/);
  return m ? m[0].replace(/[,\s]/g, '') : undefined;
}

/**
 * Parse customs document text (BOE / Shipping Bill) using regex patterns.
 * BOE (Bill of Entry) = import only: BE No, BE Date, port, BCD, SWS, IGST, total assessable value.
 *   BOE does NOT contain: SB number, container number, BL number, BL date, shipping line (those are on export/shipment docs).
 * SB (Shipping Bill) = export only: SB number and optionally BL/container/shipping fields.
 * @param {string} text - Raw OCR text
 * @returns {{ beNumber?, sbNumber?, date?, invoiceValue?, portCode?, containerNumber?, blNumber?, blDate?, shippingLine?, dutyBCD?, dutySWS?, dutyINT?, gst?, rawText }}
 */
function parseCustomsDocument(text) {
  const result = { rawText: text || '' };
  const t = (result.rawText || '').replace(/\r\n/g, '\n');

  const isBOE = /Bill\s+of\s+Entry/i.test(t) && !/Shipping\s+Bill\s+No\.?\s*:?\s*\d/i.test(t);
  const isSB = /Shipping\s+Bill/i.test(t);

  // Bill of Entry (import only): never has SB number, container, BL, or shipping line — do not extract them.
  if (isBOE) {
    result.sbNumber = undefined;
    result.containerNumber = undefined;
    result.blNumber = undefined;
    result.blDate = undefined;
    result.shippingLine = undefined;

    // BE No + BE Date at start of doc (ICEGATE): e.g. "273968026/03/2024" -> BE No 2739680, BE Date 26/03/2024
    const beDateAtStart = t.match(/^(\d{6,7})(\d{2}[\/\-]\d{2}[\/\-]\d{2,4})/m);
    if (beDateAtStart && beDateAtStart[1] && beDateAtStart[2]) {
      result.beNumber = beDateAtStart[1].trim();
      result.date = normalizeDate(beDateAtStart[2]);
    }
    if (!result.beNumber) {
      const bePatterns = [
        /Bill\s+of\s+Entry\s+No\.?\s*:?\s*(\d{4,})/i,
        /B\.?E\.?\s*No\.?\s*:?\s*(\d{4,})/i,
        /\bBE\s*:?\s*(\d{6,})/i,
      ];
      for (const re of bePatterns) {
        const m = t.match(re);
        if (m && m[1]) {
          result.beNumber = m[1].trim();
          break;
        }
      }
    }
    if (!result.date) {
      const dateKeywordPattern = /(?:BE\s+Date|Date|Dated)\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i;
      const dateMatch = t.match(dateKeywordPattern);
      if (dateMatch && dateMatch[1]) result.date = normalizeDate(dateMatch[1]);
      else {
        const allDates = [...t.matchAll(/\b(\d{2}[\/\-]\d{2}[\/\-]\d{4})\b/g)];
        if (allDates.length > 0) result.date = normalizeDate(allDates[0][1]);
      }
    }

    // ICEGATE duty block: "74138.907413.91926130988520" -> BCD 74138.9, SWS 7413.9, IGST 192613, Total assessable 988520 (SWS decimal "9" then IGST then assessable; optional trailing digit)
    const dutyBlock = t.match(/(\d{5})\.(\d)(\d{4,5})\.(\d)(\d{6})(\d{6,7})/);
    if (dutyBlock) {
      const bcd = dutyBlock[1] + '.' + dutyBlock[2];
      let sws = dutyBlock[3] + '.' + dutyBlock[4];
      if (sws.startsWith('0')) sws = String(parseFloat(sws)); // 07413.9 -> 7413.9
      let assessable = dutyBlock[6];
      if (assessable.startsWith('0')) assessable = String(parseInt(assessable, 10)); // 0988520 -> 988520
      result.dutyBCD = bcd;
      result.dutySWS = sws;
      result.gst = dutyBlock[5];   // 192613
      result.invoiceValue = assessable;
    }

    // Fallbacks for labelled values if block not found
    if (!result.invoiceValue) {
      const invoiceValuePatterns = [
        /Total\s+Assessable\s+Value\s*:?\s*(?:Rs\.?|INR)?\s*[\d,\s]+(?:\.\d{2})?/i,
        /Assessable\s+Value\s*:?\s*(?:Rs\.?|INR)?\s*[\d,\s]+(?:\.\d{2})?/i,
        /Total\s+Value\s*:?\s*(?:Rs\.?|INR)?\s*[\d,\s]+(?:\.\d{2})?/i,
      ];
      for (const re of invoiceValuePatterns) {
        const m = t.match(re);
        if (m && m[0]) {
          const num = extractNumberFromLine(m[0]);
          if (num) {
            result.invoiceValue = num;
            break;
          }
        }
      }
    }
    if (!result.dutyBCD) {
      const bcdMatch = t.match(/(?:BCD|Basic\s+Customs\s+Duty)\s*:?\s*(?:Rs\.?|INR)?\s*[\d,]+(?:\.\d)?/i);
      if (bcdMatch && bcdMatch[0]) {
        const num = extractNumberFromLine(bcdMatch[0]);
        if (num && num.length >= 2) result.dutyBCD = num;
      }
    }
    if (!result.dutySWS) {
      const swsMatch = t.match(/(?:SWS|Social\s+Welfare\s+Surcharge)\s*:?\s*(?:Rs\.?|INR)?\s*[\d,]+(?:\.\d)?/i);
      if (swsMatch && swsMatch[0]) {
        const num = extractNumberFromLine(swsMatch[0]);
        if (num && num.length >= 2) result.dutySWS = num;
      }
    }
    if (!result.gst) {
      const igstMatch = t.match(/(?:IGST|Integrated\s+Tax)\s*:?\s*(?:Rs\.?|INR)?\s*[\d,]+/i);
      if (igstMatch && igstMatch[0]) {
        const num = extractNumberFromLine(igstMatch[0]);
        if (num && num.length >= 2) result.gst = num;
      }
    }

    // Port Code (BOE)
    const portPattern = /IN[A-Z]{3}\d{1,2}\b/g;
    const portMatch = t.match(portPattern);
    if (portMatch && portMatch.length > 0) result.portCode = portMatch[0];

    return result;
  }

  // ----- Shipping Bill (export only): extract SB number and SB-related fields. Do NOT extract BE. -----
  if (isSB) {
    result.beNumber = undefined;
  }

  // BE number (only when not already set by BOE path; e.g. generic or SB doc might still have BE in text - prefer not to set for SB)
  if (!result.beNumber && !isSB) {
    const bePatterns = [
      /Bill\s+of\s+Entry\s+No\.?\s*:?\s*(\d{4,})/i,
      /B\.?E\.?\s*No\.?\s*:?\s*(\d{4,})/i,
      /\bBE\s*:?\s*(\d{6,})/i,
    ];
    for (const re of bePatterns) {
      const m = t.match(re);
      if (m && m[1]) {
        result.beNumber = m[1].trim();
        break;
      }
    }
  }

  // Shipping Bill (SB) number - only for export / SB documents
  if (!isBOE) {
    const sbPatterns = [
      /Shipping\s+Bill\s+No\.?\s*:?\s*(\d{3,}[\w\-]*)/i,
      /S\/B\s+No\.?\s*:?\s*(\d{3,}[\w\-]*)/i,
      /SB\s*:?\s*(\d{3,}[\w\-]*)/i,
    ];
    for (const re of sbPatterns) {
      const m = t.match(re);
      if (m && m[1]) {
        result.sbNumber = m[1].trim();
        break;
      }
    }
  }

  // Date (for non-BOE or when not set)
  if (!result.date) {
    const dateKeywordPattern = /(?:Date|Dated)\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i;
    const dateMatch = t.match(dateKeywordPattern);
    if (dateMatch && dateMatch[1]) {
      result.date = normalizeDate(dateMatch[1]);
    } else {
      const allDates = [...t.matchAll(/\b(\d{2}[\/\-]\d{2}[\/\-]\d{4})\b/g)];
      if (allDates.length > 0) result.date = normalizeDate(allDates[0][1]);
    }
  }

  // Total Invoice / Assessable Value (for non-BOE or fallback)
  if (!result.invoiceValue) {
    const invoiceValuePatterns = [
      /Total\s+Value\s*:?\s*(?:Rs\.?|INR|USD|EUR)?\s*[\d,\s]+(?:\.\d{2})?/i,
      /Assessable\s+Value\s*:?\s*(?:Rs\.?|INR)?\s*[\d,\s]+(?:\.\d{2})?/i,
      /Invoice\s+Value\s*:?\s*(?:Rs\.?|INR|USD|EUR)?\s*[\d,\s]+(?:\.\d{2})?/i,
      /Total\s+Assessable\s+Value\s*:?\s*(?:Rs\.?|INR)?\s*[\d,\s]+(?:\.\d{2})?/i,
      /CIF\s+Value\s*:?\s*(?:Rs\.?|INR)?\s*[\d,\s]+(?:\.\d{2})?/i,
    ];
    for (const re of invoiceValuePatterns) {
      const m = t.match(re);
      if (m && m[0]) {
        const num = extractNumberFromLine(m[0]);
        if (num) {
          result.invoiceValue = num;
          break;
        }
      }
    }
  }

  // Port Code: IN + 3 letters + 1–2 digits (e.g. INNSA1)
  const portPattern = /IN[A-Z]{3}\d{1,2}\b/g;
  const portMatch = t.match(portPattern);
  if (portMatch && portMatch.length > 0) {
    result.portCode = portMatch[0];
  }

  // Container Number (e.g. ABCD1234567, MSCU1234567)
  const containerPatterns = [
    /Container\s*(?:No\.?|Number)\s*:?\s*([A-Z]{4}\d{7})/i,
    /Container\s*:?\s*([A-Z]{4}\d{7})/i,
    /(?:Container\s*No\.?|Cntr)\s*:?\s*([A-Z0-9]{10,12})/i,
  ];
  for (const re of containerPatterns) {
    const m = t.match(re);
    if (m && m[1]) {
      result.containerNumber = m[1].trim();
      break;
    }
  }

  // Bill of Lading number and date
  const blPatterns = [
    /B\.?L\.?\s*No\.?\s*:?\s*([A-Z0-9\-]+)/i,
    /Bill\s+of\s+Lading\s*(?:No\.?)?\s*:?\s*([A-Z0-9\-]+)/i,
    /B\/L\s*:?\s*([A-Z0-9\-]+)/i,
  ];
  for (const re of blPatterns) {
    const m = t.match(re);
    if (m && m[1]) {
      result.blNumber = m[1].trim();
      break;
    }
  }
  const blDatePattern = /(?:B\.?L\.?\s*Date|Bill\s+of\s+Lading\s*Date)\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i;
  const blDateMatch = t.match(blDatePattern);
  if (blDateMatch && blDateMatch[1]) {
    result.blDate = normalizeDate(blDateMatch[1]);
  }

  // Shipping Line / Steamer / Vessel
  const shippingLinePatterns = [
    /Shipping\s+Line\s*:?\s*([^\n]+?)(?=\n|$)/i,
    /Steamer\s*:?\s*([^\n]+?)(?=\n|$)/i,
    /Vessel\s*:?\s*([^\n]+?)(?=\n|$)/i,
    /Carrier\s*:?\s*([^\n]+?)(?=\n|$)/i,
  ];
  for (const re of shippingLinePatterns) {
    const m = t.match(re);
    if (m && m[1]) {
      const line = m[1].trim().replace(/\s+/g, ' ').slice(0, 200);
      if (line.length > 0) {
        result.shippingLine = line;
        break;
      }
    }
  }

  // Helper: only accept extracted number if it looks like an amount (avoid single digits from list numbers like "1.BCD")
  function acceptAmount(numStr) {
    if (!numStr || typeof numStr !== 'string') return false;
    const n = numStr.replace(/[,\s]/g, '');
    return n.length >= 2 || (n.includes('.') && n.replace('.', '').length >= 1);
  }

  // Duty BCD (Basic Customs Duty)
  const dutyBcdPatterns = [
    /(?:BCD|Basic\s+Customs\s+Duty)\s*:?\s*(?:Rs\.?|INR)?\s*[\d,]+(?:\.\d{2})?/i,
    /Duty\s*:?\s*(?:Rs\.?|INR)?\s*[\d,]+(?:\.\d{2})?/i,
  ];
  for (const re of dutyBcdPatterns) {
    const m = t.match(re);
    if (m && m[0]) {
      const num = extractNumberFromLine(m[0]);
      if (num && acceptAmount(num)) {
        result.dutyBCD = num;
        break;
      }
    }
  }

  // SWS (Social Welfare Surcharge)
  const swsPattern = /(?:SWS|Social\s+Welfare\s+Surcharge)\s*:?\s*(?:Rs\.?|INR)?\s*[\d,]+(?:\.\d{2})?/i;
  const swsMatch = t.match(swsPattern);
  if (swsMatch && swsMatch[0]) {
    const num = extractNumberFromLine(swsMatch[0]);
    if (num && acceptAmount(num)) result.dutySWS = num;
  }

  // IGST / Integrated Tax / dutyINT
  const igstPatterns = [
    /(?:IGST|Integrated\s+Tax|INT)\s*:?\s*(?:Rs\.?|INR)?\s*[\d,]+(?:\.\d{2})?/i,
    /GST\s*:?\s*(?:Rs\.?|INR)?\s*[\d,]+(?:\.\d{2})?/i,
  ];
  for (const re of igstPatterns) {
    const m = t.match(re);
    if (m && m[0]) {
      const num = extractNumberFromLine(m[0]);
      if (num && acceptAmount(num)) {
        result.gst = num;
        break;
      }
    }
  }
  if (result.gst == null) {
    const dutyIntPattern = /(?:Duty\s+INT|Integrated)\s*:?\s*(?:Rs\.?|INR)?\s*[\d,]+(?:\.\d{2})?/i;
    const dutyIntMatch = t.match(dutyIntPattern);
    if (dutyIntMatch && dutyIntMatch[0]) {
      const num = extractNumberFromLine(dutyIntMatch[0]);
      if (num && acceptAmount(num)) result.dutyINT = num;
    }
  }

  return result;
}

/** Normalize date string to YYYY-MM-DD for form inputs. */
function normalizeDate(str) {
  if (!str) return undefined;
  const cleaned = str.replace(/-/g, '/').trim();
  const parts = cleaned.split('/');
  if (parts.length !== 3) return str;
  let [d, m, y] = parts;
  if (y.length === 2) y = '20' + y;
  if (d.length === 1) d = '0' + d;
  if (m.length === 1) m = '0' + m;
  return `${y}-${m}-${d}`;
}

module.exports = {
  extractTextFromImage,
  extractTextFromPdf,
  extractDataFromPDF,
  pdfFirstPageToImage,
  parseCustomsDocument,
  scanAndParse,
};
