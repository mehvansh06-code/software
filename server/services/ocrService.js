/**
 * OCR Service: text extraction from PDFs (text layer first) and images (Tesseract).
 * For computer-generated PDFs: prioritize pdf-parse (1s, 100%); fallback to first-page image + OCR.
 */

const { createWorker } = require('tesseract.js');
const { PDFParse } = require('pdf-parse');

const PDF_MAGIC = Buffer.from('%PDF');
const MIN_TEXT_LENGTH_FOR_LAYER = 40;

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
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @returns {Promise<{ text: string }>} Extracted text or empty if no text layer
 */
async function extractTextFromPdf(pdfBuffer) {
  let parser;
  try {
    parser = new PDFParse({ data: pdfBuffer });
    const result = await parser.getText({ first: 1 });
    await parser.destroy();
    return { text: (result && result.text) ? String(result.text) : '' };
  } catch (e) {
    if (parser && typeof parser.destroy === 'function') await parser.destroy().catch(() => {});
    return { text: '' };
  }
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

  if (!trimmed || isTextGarbled(trimmed)) {
    const firstPageImage = await pdfFirstPageToImage(buffer);
    const { text, confidence } = await extractTextFromImage(firstPageImage);
    const parsed = parseCustomsDocument(text);
    return {
      beNumber: parsed.beNumber || undefined,
      sbNumber: parsed.sbNumber || undefined,
      date: parsed.date || undefined,
      portCode: parsed.portCode || undefined,
      invoiceValue: parsed.invoiceValue || undefined,
      confidence: confidence != null ? Math.round(confidence) : undefined,
      source: 'ocr',
    };
  }

  const parsed = parseCustomsDocument(trimmed);
  return {
    beNumber: parsed.beNumber || undefined,
    sbNumber: parsed.sbNumber || undefined,
    date: parsed.date || undefined,
    portCode: parsed.portCode || undefined,
    invoiceValue: parsed.invoiceValue || undefined,
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
 * @param {Buffer} buffer - Image buffer (PNG, JPEG, etc.)
 * @returns {Promise<{ text: string, confidence?: number }>} Raw OCR text and optional confidence
 */
async function extractTextFromImage(buffer) {
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

  if (isPdf) {
    const { text: pdfText } = await extractTextFromPdf(fileBuffer);
    const trimmed = (pdfText || '').trim();
    if (trimmed.length >= MIN_TEXT_LENGTH_FOR_LAYER) {
      const parsed = parseCustomsDocument(trimmed);
      return {
        beNumber: parsed.beNumber || undefined,
        sbNumber: parsed.sbNumber || undefined,
        date: parsed.date || undefined,
        portCode: parsed.portCode || undefined,
        invoiceValue: parsed.invoiceValue || undefined,
        confidence: 100,
        source: 'text',
      };
    }
    const firstPageImage = await pdfFirstPageToImage(fileBuffer);
    const { text, confidence } = await extractTextFromImage(firstPageImage);
    const parsed = parseCustomsDocument(text);
    return {
      beNumber: parsed.beNumber || undefined,
      sbNumber: parsed.sbNumber || undefined,
      date: parsed.date || undefined,
      portCode: parsed.portCode || undefined,
      invoiceValue: parsed.invoiceValue || undefined,
      confidence: confidence != null ? Math.round(confidence) : undefined,
      source: 'ocr',
    };
  }

  const { text, confidence } = await extractTextFromImage(fileBuffer);
  const parsed = parseCustomsDocument(text);
  return {
    beNumber: parsed.beNumber || undefined,
    sbNumber: parsed.sbNumber || undefined,
    date: parsed.date || undefined,
    portCode: parsed.portCode || undefined,
    invoiceValue: parsed.invoiceValue || undefined,
    confidence: confidence != null ? Math.round(confidence) : undefined,
    source: 'ocr',
  };
}

/**
 * Parse customs document text (BOE / Shipping Bill) using regex patterns.
 * @param {string} text - Raw OCR text
 * @returns {{ beNumber?: string, sbNumber?: string, date?: string, invoiceValue?: string, portCode?: string, rawText: string }}
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

  // Total Invoice Value: "Total Value", "Assessable Value", "Asses. Value" (typo), "Invoice Value"
  const invoiceValuePatterns = [
    /Total\s+Value\s*:?\s*(?:Rs\.?|INR|USD|EUR)?\s*[\d,]+(?:\.\d{2})?/i,
    /Asses\.?\s*Value\s*:?\s*(?:Rs\.?|INR)?\s*[\d,]+(?:\.\d{2})?/i,
    /Assessable\s+Value\s*:?\s*(?:Rs\.?|INR)?\s*[\d,]+(?:\.\d{2})?/i,
    /Invoice\s+Value\s*:?\s*(?:Rs\.?|INR|USD|EUR)?\s*[\d,]+(?:\.\d{2})?/i,
  ];
  const numberInLine = /[\d,]+(?:\.\d{2})?/;
  for (const re of invoiceValuePatterns) {
    const m = t.match(re);
    if (m && m[0]) {
      const numMatch = m[0].match(numberInLine);
      if (numMatch) {
        result.invoiceValue = numMatch[0].replace(/,/g, '');
        break;
      }
    }
  }

  // Port Code: 6-character uppercase like INNSA1, INAMD4 (IN + 3 letters + 1–2 digits)
  const portPattern = /IN[A-Z]{3}\d{1,2}\b/g;
  const portMatch = t.match(portPattern);
  if (portMatch && portMatch.length > 0) {
    result.portCode = portMatch[0];
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
