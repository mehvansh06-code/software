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

/** Lazy-load PDF parser: try pdf-parse v2 (PDFParse), fall back to pdf-parse-legacy (Node-safe) on load error. */
function getPdfParser() {
  if (_pdfParseV2 === undefined) {
    try {
      _pdfParseV2 = require('pdf-parse');
    } catch {
      _pdfParseV2 = null;
    }
  }
  if (_pdfParseLegacy === undefined) {
    try {
      _pdfParseLegacy = require('pdf-parse-legacy');
    } catch {
      _pdfParseLegacy = null;
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
 * Uses pdf-parse v2 when available; falls back to pdf-parse-legacy (Node-safe) otherwise.
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @returns {Promise<{ text: string }>} Extracted text or empty if no text layer
 */
async function extractTextFromPdf(pdfBuffer) {
  const { v2, legacy } = getPdfParser();
  if (v2 && v2.PDFParse) {
    let parser;
    try {
      parser = new v2.PDFParse({ data: pdfBuffer });
      const result = await parser.getText({ first: 1 });
      await parser.destroy();
      return { text: (result && result.text) ? String(result.text) : '' };
    } catch (e) {
      if (parser && typeof parser.destroy === 'function') await parser.destroy().catch(() => {});
      return { text: '' };
    }
  }
  if (legacy && typeof legacy === 'function') {
    try {
      const result = await legacy(pdfBuffer);
      return { text: (result && result.text) ? String(result.text) : '' };
    } catch (e) {
      return { text: '' };
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
    const firstPageImage = await pdfFirstPageToImage(buffer);
    const { text, confidence } = await extractTextFromImage(firstPageImage);
    const parsed = parseCustomsDocument(text);
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
 * Uses pdf-img-convert (PDF.js-based, no Ghostscript).
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @returns {Promise<Buffer>} PNG image buffer of first page
 */
async function pdfFirstPageToImage(pdfBuffer) {
  const { convert } = await import('pdf-img-convert');
  const pages = await convert(pdfBuffer, {
    scale: 2,
    page_numbers: [1],
  });
  if (!pages || !pages[0]) throw new Error('Could not render first page of PDF');
  return Buffer.from(pages[0]);
}

/**
 * Extract raw text from an image buffer using Tesseract.js in a worker (non-blocking).
 * Tesseract is lazy-loaded so the OCR module can load in Node without browser APIs.
 * @param {Buffer} buffer - Image buffer (PNG, JPEG, etc.)
 * @returns {Promise<{ text: string, confidence?: number }>} Raw OCR text and optional confidence
 */
async function extractTextFromImage(buffer) {
  const { createWorker } = require('tesseract.js');
  const worker = await createWorker('eng', 1, {
    logger: () => {}, // suppress logs in production
  });
  try {
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
    const firstPageImage = await pdfFirstPageToImage(fileBuffer);
    const { text, confidence } = await extractTextFromImage(firstPageImage);
    const parsed = parseCustomsDocument(text);
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

/** Extract first number (with optional decimals) from a line/string; returns string without commas. */
function extractNumberFromLine(str) {
  if (!str || typeof str !== 'string') return undefined;
  const m = str.match(/[\d,]+(?:\.\d{2})?/);
  return m ? m[0].replace(/,/g, '') : undefined;
}

/**
 * Parse customs document text (BOE / Shipping Bill) using regex patterns.
 * Extracts all columns that appear on BOE/SB and map to shipment fields.
 * @param {string} text - Raw OCR text
 * @returns {{ beNumber?, sbNumber?, date?, invoiceValue?, portCode?, containerNumber?, blNumber?, blDate?, shippingLine?, dutyBCD?, dutySWS?, dutyINT?, gst?, rawText }}
 */
function parseCustomsDocument(text) {
  const result = { rawText: text || '' };
  const t = (result.rawText || '').replace(/\r\n/g, '\n');

  // Bill of Entry (BE): "Bill of Entry No" followed by digits (ICEGATE style)
  const bePatterns = [
    /Bill\s+of\s+Entry\s+No\.?\s*:?\s*(\d+)/i,
    /B\.?E\.?\s*No\.?\s*:?\s*(\d+)/i,
    /B\/E\s*No\.?\s*:?\s*(\d+)/i,
  ];
  for (const re of bePatterns) {
    const m = t.match(re);
    if (m && m[1]) {
      result.beNumber = m[1].trim();
      break;
    }
  }

  // Shipping Bill (SB): "Shipping Bill No" or "S/B No"
  const sbPatterns = [
    /Shipping\s+Bill\s+No\.?\s*:?\s*(\d+[\w\-]*)/i,
    /S\/B\s+No\.?\s*:?\s*(\d+[\w\-]*)/i,
    /S\.?B\.?\s*No\.?\s*:?\s*(\d+[\w\-]*)/i,
  ];
  for (const re of sbPatterns) {
    const m = t.match(re);
    if (m && m[1]) {
      result.sbNumber = m[1].trim();
      break;
    }
  }

  // Date: "Date" or "Dated" then capture DD/MM/YYYY
  const dateKeywordPattern = /(?:Date|Dated)\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i;
  const dateOnlyPattern = /\b(\d{2}[\/\-]\d{2}[\/\-]\d{4})\b/g;
  let dateMatch = t.match(dateKeywordPattern);
  if (dateMatch && dateMatch[1]) {
    result.date = normalizeDate(dateMatch[1]);
  } else {
    const allDates = [...t.matchAll(dateOnlyPattern)];
    if (allDates.length > 0) {
      result.date = normalizeDate(allDates[0][1]);
    }
  }

  // Total Invoice Value / Assessable Value
  const invoiceValuePatterns = [
    /Total\s+Value\s*:?\s*(?:Rs\.?|INR|USD|EUR)?\s*[\d,]+(?:\.\d{2})?/i,
    /Asses\.?\s*Value\s*:?\s*(?:Rs\.?|INR)?\s*[\d,]+(?:\.\d{2})?/i,
    /Assessable\s+Value\s*:?\s*(?:Rs\.?|INR)?\s*[\d,]+(?:\.\d{2})?/i,
    /Invoice\s+Value\s*:?\s*(?:Rs\.?|INR|USD|EUR)?\s*[\d,]+(?:\.\d{2})?/i,
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

  // Duty BCD (Basic Customs Duty)
  const dutyBcdPatterns = [
    /(?:BCD|Basic\s+Customs\s+Duty)\s*:?\s*(?:Rs\.?|INR)?\s*[\d,]+(?:\.\d{2})?/i,
    /Duty\s*:?\s*(?:Rs\.?|INR)?\s*[\d,]+(?:\.\d{2})?/i,
  ];
  for (const re of dutyBcdPatterns) {
    const m = t.match(re);
    if (m && m[0]) {
      const num = extractNumberFromLine(m[0]);
      if (num) {
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
    if (num) result.dutySWS = num;
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
      if (num) {
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
      if (num) result.dutyINT = num;
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
