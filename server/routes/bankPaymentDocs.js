const express = require('express');
const db = require('../db');
const { hasPermission } = require('../middleware');
const { generateBankPaymentDocBuffer } = require('../bankPaymentDocGenerator');

const REQUIRED_FIELDS = [
  'company_choice',
  'invoice_no',
  'invoice_date',
  'shipment_date',
  'currency',
  'raw_amount',
  'beneficiary_name',
  'beneficiary_address',
  'beneficiary_country',
  'beneficiary_account',
  'bank_name',
  'bank_swift',
  'bank_address',
  'port_loading',
  'port_discharge',
  'goods_desc',
  'hsn_code',
  'term',
  'mode_shipment',
];

const FIELD_LABELS = {
  company_choice: 'Importer (Company)',
  invoice_no: 'Invoice Number',
  invoice_date: 'Invoice Date',
  shipment_date: 'Shipment Date',
  currency: 'Currency',
  raw_amount: 'Remittance Amount',
  beneficiary_name: 'Supplier Name',
  beneficiary_address: 'Supplier Address',
  beneficiary_country: 'Supplier Country',
  beneficiary_account: 'Account Number',
  bank_name: 'Bank Name',
  bank_swift: 'SWIFT Code',
  bank_address: 'Bank Branch Address',
  port_loading: 'Port of Loading',
  port_discharge: 'Port of Discharge',
  goods_desc: 'Goods Description',
  hsn_code: 'HSN Code',
  term: 'IncoTerm',
  mode_shipment: 'Shipment Mode',
};

function parsePositiveAmount(value) {
  const cleaned = String(value == null ? '' : value).replace(/,/g, '').trim();
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function normalizeCurrency(value) {
  return String(value == null ? '' : value).trim().toUpperCase();
}

function safeParseJson(raw, fallback) {
  if (raw == null || raw === '') return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed != null ? parsed : fallback;
  } catch (_) {
    return fallback;
  }
}

function amountToCurrency(amount, fromCurrency, toCurrency, exchangeRate) {
  const val = Number(amount) || 0;
  const from = normalizeCurrency(fromCurrency);
  const to = normalizeCurrency(toCurrency);
  const fx = Number(exchangeRate) || 1;
  if (!val) return 0;
  if (from === to) return val;
  if (from === 'INR' && to !== 'INR') return val / fx;
  if (to === 'INR' && from !== 'INR') return val * fx;
  return val;
}

function resolveCompanyCode(companyChoice) {
  const s = String(companyChoice == null ? '' : companyChoice).trim().toUpperCase();
  if (!s) return null;
  if (s === 'GFPL' || s.includes('GUJARAT') || s.includes('FLOTEX')) return 'GFPL';
  if (s === 'GTEX' || s.includes('GTEX')) return 'GTEX';
  return null;
}

function getShipmentRowsByIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  return db.prepare(`
    SELECT id, invoiceNumber, supplierId, company, currency, amount, exchangeRate, payments_json
    FROM shipments
    WHERE id IN (${placeholders})
  `).all(...ids);
}

function validateBaseBody(data) {
  if (!data || typeof data !== 'object') return 'Request body required.';
  for (const key of REQUIRED_FIELDS) {
    const val = data[key];
    const str = String(val == null ? '' : val).trim();
    if (!str) return `MISSING: '${FIELD_LABELS[key] || key}' is empty.`;
    if (str.includes('Select')) return `INVALID: Please select a valid '${FIELD_LABELS[key] || key}'.`;
  }
  const amt = parsePositiveAmount(data.raw_amount);
  if (amt == null) return 'ERROR: Amount must be a valid number greater than 0.';
  const qty = String(data.quantity == null ? '' : data.quantity).trim();
  if (!qty) return "MISSING: 'Quantity' value is required.";

  const hasAllocations = Array.isArray(data.allocations) && data.allocations.length > 0;
  if (!hasAllocations) {
    const parts = qty.split(/\s+/).filter(Boolean);
    if (parts.length < 2 || !parts[0]) return "MISSING: 'Quantity' value is required.";
    if (parts[1] && parts[1].includes('Select')) return "INVALID: Please select a valid Quantity Unit.";
    const invoiceAmountRaw = String(data.invoice_amount == null ? '' : data.invoice_amount).trim();
    if (invoiceAmountRaw) {
      const invoiceAmount = parsePositiveAmount(invoiceAmountRaw);
      if (invoiceAmount == null) return 'ERROR: Invoice amount must be a valid number greater than 0.';
      if (amt > invoiceAmount) return 'ERROR: Remittance amount cannot be more than invoice amount.';
    }
  }
  return null;
}

function validateAllocations(data, expectedTotal) {
  const rowsRaw = Array.isArray(data?.allocations) ? data.allocations : [];
  if (rowsRaw.length === 0) {
    return { error: 'At least one allocation row is required.' };
  }

  const parsedRows = [];
  const shipmentIds = [];
  for (let i = 0; i < rowsRaw.length; i++) {
    const row = rowsRaw[i] || {};
    const shipmentId = String(row.shipmentId == null ? '' : row.shipmentId).trim();
    if (!shipmentId) return { error: `Allocation row ${i + 1}: Shipment is required.` };
    const allocationType = row.allocationType === 'Advance' ? 'Advance' : row.allocationType === 'Balance' ? 'Balance' : '';
    if (!allocationType) return { error: `Allocation row ${i + 1}: Type must be Advance or Balance.` };
    const amount = parsePositiveAmount(row.amount);
    if (amount == null) return { error: `Allocation row ${i + 1}: Amount must be greater than 0.` };
    const currency = normalizeCurrency(row.currency || data.currency);
    if (!currency) return { error: `Allocation row ${i + 1}: Currency is required.` };
    parsedRows.push({ shipmentId, allocationType, amount, currency, index: i });
    shipmentIds.push(shipmentId);
  }

  const shipmentRows = getShipmentRowsByIds([...new Set(shipmentIds)]);
  const shipmentById = new Map(shipmentRows.map((r) => [r.id, r]));
  if (shipmentRows.length !== new Set(shipmentIds).size) {
    const missing = [...new Set(shipmentIds)].filter((id) => !shipmentById.has(id));
    return { error: `Shipment not found for allocation: ${missing.join(', ')}` };
  }

  const expectedCompany = resolveCompanyCode(data.company_choice);
  const expectedCurrency = normalizeCurrency(data.currency);
  const supplierSet = new Set();
  const companySet = new Set();
  const currencySet = new Set();
  const typeSet = new Set();
  const perShipmentTotals = new Map();
  const normalizedRows = [];
  let sum = 0;

  for (const row of parsedRows) {
    const sh = shipmentById.get(row.shipmentId);
    if (!sh) return { error: `Shipment ${row.shipmentId} not found.` };
    if (!sh.supplierId) return { error: `Shipment ${sh.invoiceNumber || sh.id} is not an import shipment.` };

    supplierSet.add(String(sh.supplierId));
    companySet.add(String(sh.company || ''));
    currencySet.add(normalizeCurrency(sh.currency));
    typeSet.add(row.allocationType);

    if (expectedCompany && String(sh.company || '') !== expectedCompany) {
      return { error: `Allocation row ${row.index + 1}: Shipment ${sh.invoiceNumber || sh.id} belongs to a different company.` };
    }
    if (row.currency !== expectedCurrency) {
      return { error: `Allocation row ${row.index + 1}: Currency mismatch. All rows must use ${expectedCurrency}.` };
    }
    if (normalizeCurrency(sh.currency) !== expectedCurrency) {
      return { error: `Allocation row ${row.index + 1}: Shipment ${sh.invoiceNumber || sh.id} currency is ${sh.currency}, not ${expectedCurrency}.` };
    }

    const invoiceAmount = Number(sh.amount) || 0;
    const payments = safeParseJson(sh.payments_json, []);
    const paid = Array.isArray(payments)
      ? payments.reduce((acc, p) => acc + amountToCurrency(p?.amount, p?.currency || sh.currency, sh.currency, sh.exchangeRate), 0)
      : 0;
    const pending = Math.max(0, invoiceAmount - paid);

    if (row.amount > pending + 0.0001) {
      const over = (row.amount - pending).toFixed(2);
      return { error: `Allocation for invoice ${sh.invoiceNumber || sh.id} exceeds pending by ${sh.currency} ${over}.` };
    }
    const current = Number(perShipmentTotals.get(sh.id) || 0);
    const next = current + row.amount;
    if (next > pending + 0.0001) {
      const over = (next - pending).toFixed(2);
      return { error: `Total allocation for invoice ${sh.invoiceNumber || sh.id} exceeds pending by ${sh.currency} ${over}.` };
    }
    perShipmentTotals.set(sh.id, next);
    sum += row.amount;

    normalizedRows.push({
      shipmentId: sh.id,
      invoiceNo: sh.invoiceNumber || '',
      allocationType: row.allocationType,
      amount: Number(row.amount.toFixed(2)),
      currency: expectedCurrency,
      pendingAmountSnapshot: Number(pending.toFixed(2)),
      supplierId: sh.supplierId,
      company: sh.company,
    });
  }

  if (supplierSet.size !== 1) return { error: 'All allocation rows must belong to one supplier only.' };
  if (companySet.size !== 1) return { error: 'All allocation rows must belong to one company only.' };
  if (currencySet.size !== 1) return { error: 'All allocation rows must have the same shipment currency.' };
  if (typeSet.size > 1) return { error: 'You cannot mix Advance and Balance in one remittance.' };
  const paymentModeRaw = String(data.payment_mode || '').trim();
  if (paymentModeRaw) {
    const paymentMode = paymentModeRaw === 'Advance' ? 'Advance' : paymentModeRaw === 'Balance' ? 'Balance' : '';
    if (!paymentMode) return { error: 'Invalid payment mode. Use Advance or Balance.' };
    const onlyType = typeSet.values().next().value;
    if (onlyType && onlyType !== paymentMode) {
      return { error: `All allocation rows must be ${paymentMode}.` };
    }
  }
  if (expectedTotal != null && Math.abs(sum - expectedTotal) > 0.01) {
    return { error: `Allocation total (${sum.toFixed(2)}) must equal remittance amount (${expectedTotal.toFixed(2)}).` };
  }

  return {
    error: null,
    allocations: normalizedRows,
    total: Number(sum.toFixed(2)),
  };
}

function createRouter(broadcast) {
  const router = express.Router();

  router.post('/generate', hasPermission('bank_payment_docs.generate'), async (req, res) => {
    try {
      const data = req.body;
      const baseErr = validateBaseBody(data);
      if (baseErr) return res.status(400).json({ success: false, error: baseErr });

      const hasAllocations = Array.isArray(data.allocations) && data.allocations.length > 0;
      if (hasAllocations) {
        const expectedTotal = parsePositiveAmount(data.raw_amount);
        const allocCheck = validateAllocations(data, expectedTotal);
        if (allocCheck.error) return res.status(400).json({ success: false, error: allocCheck.error });
        data.allocations = allocCheck.allocations.map((row) => ({
          shipmentId: row.shipmentId,
          invoiceNo: row.invoiceNo,
          allocationType: row.allocationType,
          amount: row.amount,
          currency: row.currency,
          pendingAmountSnapshot: row.pendingAmountSnapshot,
        }));
      }

      const buffer = await generateBankPaymentDocBuffer(data);
      const invoiceNoRaw = String(data.invoice_no || 'doc');
      const invoiceNo = invoiceNoRaw.replace(/[/\\?*:"]/g, '_').slice(0, 120) || 'doc';
      const currency = (data.currency || 'USD').trim();
      const filename = `${invoiceNo}_${currency}.docx`;

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (err) {
      console.error('Bank payment doc generate error:', err);
      const raw = err != null && (err.message !== undefined || err.reason !== undefined)
        ? String(err.message != null ? err.message : err.reason)
        : 'Failed to generate document';
      const hasPropErrors = err && err.properties && Array.isArray(err.properties.errors);
      const hasErrors = err && Array.isArray(err.errors);
      const isMultiError = err && (err.name === 'MultiError' || (err.properties && err.properties.id === 'multi_error'));
      const messageLooksTemplate = /Multi error|TemplateError|Duplicate (open|close) tag|Unclosed tag|No tag .* was found/i.test(raw) || (err && err.stack && /docxtemplater|XmlTemplater|lexer/.test(err.stack));
      const isTemplateError = isMultiError || hasPropErrors || hasErrors || messageLooksTemplate || (raw && /multi\s*error/i.test(raw));
      const friendly = isTemplateError
        ? 'Document generation failed due to a template formatting issue. Try selecting the other company (e.g. GTEX instead of GFPL, or vice versa), or contact support.'
        : raw;
      try {
        if (!res.headersSent) res.status(500).json({ success: false, error: friendly });
      } catch (sendErr) {
        console.error('Failed to send error response:', sendErr);
      }
    }
  });

  router.post('/post-allocations', hasPermission('bank_payment_docs.generate'), (req, res) => {
    try {
      const data = req.body || {};
      const batchId = String(data.batchId || '').trim();
      if (!batchId) return res.status(400).json({ success: false, error: 'batchId is required.' });

      const paymentDate = String(data.paymentDate || '').trim() || new Date().toISOString().slice(0, 10);
      const expectedTotal = parsePositiveAmount(data.raw_amount);
      if (expectedTotal == null) return res.status(400).json({ success: false, error: 'raw_amount is required and must be greater than 0.' });

      const allocCheck = validateAllocations(data, expectedTotal);
      if (allocCheck.error) return res.status(400).json({ success: false, error: allocCheck.error });
      const normalized = allocCheck.allocations;

      const now = new Date().toISOString();
      const userId = req.user && req.user.id ? String(req.user.id) : null;

      const tx = db.transaction(() => {
        const existing = db.prepare('SELECT id FROM bank_payment_postings WHERE batchId = ?').get(batchId);
        if (existing) {
          return { alreadyPosted: true, postedCount: 0 };
        }

        const getShipment = db.prepare('SELECT id, payments_json, version FROM shipments WHERE id = ?');
        const updateShipment = db.prepare('UPDATE shipments SET payments_json = ?, version = COALESCE(version, 0) + 1 WHERE id = ?');
        let postedCount = 0;

        normalized.forEach((row, idx) => {
          const reference = `BATCH/${batchId}/ROW/${idx + 1}`;
          const shipmentRow = getShipment.get(row.shipmentId);
          if (!shipmentRow) throw new Error(`Shipment not found while posting: ${row.shipmentId}`);
          const payments = safeParseJson(shipmentRow.payments_json, []);
          const exists = Array.isArray(payments) && payments.some((p) => String(p?.reference || '') === reference);
          if (exists) return;

          const payment = {
            id: `${Date.now()}_${Math.random().toString(36).slice(2, 10)}_${idx + 1}`,
            date: paymentDate,
            amount: row.amount,
            currency: row.currency,
            reference,
            mode: row.allocationType === 'Advance' ? 'ADVANCE' : 'BALANCE',
            adviceUploaded: false,
            received: false,
          };
          const nextPayments = Array.isArray(payments) ? [...payments, payment] : [payment];
          updateShipment.run(JSON.stringify(nextPayments), row.shipmentId);
          postedCount += 1;
        });

        db.prepare('INSERT INTO bank_payment_postings (id, batchId, payload_json, createdBy, createdAt) VALUES (?, ?, ?, ?, ?)')
          .run(
            `BPP_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            batchId,
            JSON.stringify({
              batchId,
              paymentDate,
              raw_amount: expectedTotal,
              currency: normalizeCurrency(data.currency),
              allocations: normalized,
            }),
            userId,
            now
          );

        return { alreadyPosted: false, postedCount };
      });

      const result = tx();
      if (!result.alreadyPosted && typeof broadcast === 'function' && result.postedCount > 0) {
        try { broadcast(); } catch (_) {}
      }

      return res.json({
        success: true,
        alreadyPosted: !!result.alreadyPosted,
        batchId,
        postedCount: result.postedCount,
        totalAmount: expectedTotal,
      });
    } catch (err) {
      console.error('Bank payment allocation post error:', err);
      return res.status(500).json({ success: false, error: err && err.message ? err.message : 'Failed to post allocations.' });
    }
  });

  return router;
}

module.exports = createRouter;
