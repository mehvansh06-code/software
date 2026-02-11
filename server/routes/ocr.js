/**
 * OCR API: extract text and (optional) upload-and-scan with filing to Z: Drive.
 * POST /api/ocr/extract - multipart, OCR only.
 * POST /api/ocr/upload-and-scan - multipart, OCR + save file to documents folder + record in DB.
 */

const path = require('path');
const express = require('express');
const multer = require('multer');
const fse = require('fs-extra');
const { scanAndParse, extractDataFromPDF, extractTextFromImage, parseCustomsDocument } = require('../services/ocrService');

function isPdfBuffer(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length >= 4 && buffer.subarray(0, 4).toString() === '%PDF';
}
const { DOCUMENTS_BASE } = require('../config');
const db = require('../db');

const router = express.Router();

function sanitizeFolderName(str) {
  if (!str || typeof str !== 'string') return 'Unknown';
  return str.replace(/[/\\:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim() || 'Unknown';
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only images (JPEG, PNG, WebP) and PDF are supported.'));
    }
  },
});

/**
 * POST /api/ocr/extract
 * Body: multipart/form-data, field name "file" (single file). Accepts .pdf, .jpg, .png.
 * If PDF: runs extractDataFromPDF (text extraction with OCR fallback).
 * If image: runs existing Tesseract OCR.
 * Returns: { success, data: { beNumber, sbNumber, date, invoiceValue, portCode, confidence, source } }
 */
router.post('/extract', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, error: err.message || 'Invalid file.' });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, error: 'No file uploaded. Use field name "file".' });
    }

    const buffer = req.file.buffer;
    const mimeType = (req.file.mimetype || '').toLowerCase();
    const isPdf = mimeType === 'application/pdf' || isPdfBuffer(buffer);

    let parsed;
    if (isPdf) {
      parsed = await extractDataFromPDF(buffer);
    } else {
      const { text, confidence } = await extractTextFromImage(buffer);
      const p = parseCustomsDocument(text);
      parsed = {
        beNumber: p.beNumber || undefined,
        sbNumber: p.sbNumber || undefined,
        date: p.date || undefined,
        portCode: p.portCode || undefined,
        invoiceValue: p.invoiceValue || undefined,
        confidence: confidence != null ? Math.round(confidence) : undefined,
        source: 'ocr',
      };
    }

    const data = {
      beNumber: parsed.beNumber || null,
      sbNumber: parsed.sbNumber || null,
      date: parsed.date || null,
      invoiceValue: parsed.invoiceValue || null,
      portCode: parsed.portCode || null,
      confidence: parsed.confidence ?? null,
      source: parsed.source || null,
    };

    res.json({ success: true, data });
  } catch (err) {
    console.error('OCR extract error:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'OCR extraction failed.',
    });
  }
});

/**
 * POST /api/ocr/upload-and-scan
 * Hybrid: 1) Run OCR, 2) Save file to documents/[InvoiceNumber]/Scanned_Docs/, 3) Record in documents table.
 * Body: multipart/form-data, field "file". Optional: "docType" = "BOE" | "SB", "company" for future use.
 * Returns: { success, data: { beNumber, sbNumber, date, portCode, invoiceValue, savedPath, filePath, confidence } }
 */
router.post('/upload-and-scan', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, error: err.message || 'Invalid file.' });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, error: 'No file uploaded. Use field name "file".' });
    }

    const buffer = req.file.buffer;
    const originalName = req.file.originalname || 'scanned-document';
    const mimeType = (req.file.mimetype || '').toLowerCase();
    const docType = (req.body && req.body.docType) === 'SB' ? 'SB' : 'BOE';
    const isPdf = mimeType === 'application/pdf' || isPdfBuffer(buffer);

    // 1) PDF: extractDataFromPDF (text first, OCR fallback); Image: Tesseract OCR
    const parsed = isPdf ? await extractDataFromPDF(buffer) : await scanAndParse(buffer, { mimeType });

    // 2) File it: documents/[InvoiceNumber]/Scanned_Docs/
    const invoiceRef = parsed.beNumber || parsed.sbNumber || 'Unknown';
    const safeRef = sanitizeFolderName(String(invoiceRef));
    const scannedDir = path.join(DOCUMENTS_BASE, safeRef, 'Scanned_Docs');
    await fse.ensureDir(scannedDir);

    const ext = path.extname(originalName) || (mimeType === 'application/pdf' ? '.pdf' : '.jpg');
    const baseName = path.basename(originalName, ext);
    const safeName = sanitizeFolderName(baseName) + '_' + Date.now() + ext;
    const filePath = path.join(scannedDir, safeName);
    await fse.writeFile(filePath, buffer);

    // 3) Record in documents table
    const docId = 'doc_' + Math.random().toString(36).substr(2, 9);
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO documents (id, invoiceNumber, docType, fileName, filePath, createdAt) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(docId, invoiceRef, docType, safeName, filePath, now);

    res.json({
      success: true,
      data: {
        beNumber: parsed.beNumber || null,
        sbNumber: parsed.sbNumber || null,
        date: parsed.date || null,
        portCode: parsed.portCode || null,
        invoiceValue: parsed.invoiceValue || null,
        confidence: parsed.confidence ?? null,
        source: parsed.source || null,
        savedPath: filePath,
        filePath,
        fileName: safeName,
      },
    });
  } catch (err) {
    console.error('OCR upload-and-scan error:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Upload and scan failed.',
    });
  }
});

module.exports = router;
