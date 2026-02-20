const fs = require('fs');
const path = require('path');
const { AUDIT_EXPORT_DIR, AUDIT_ARCHIVE_DAYS } = require('../config');

/**
 * Central audit logging. Writes to audit_logs (userId, action, targetId, details).
 * Use from routes after successful mutations.
 */

function log(db, userId, action, targetId, details) {
  if (!db) return;
  try {
    const detailsStr = details != null && typeof details === 'object' ? JSON.stringify(details) : (details == null ? null : String(details));
    db.prepare(
      'INSERT INTO audit_logs (userId, action, targetId, details, timestamp) VALUES (?, ?, ?, ?, datetime(\'now\'))'
    ).run(userId || 'system', action, targetId || null, detailsStr);
  } catch (e) {
    console.warn('Audit log insert failed:', e.message);
  }
}

function getUserName(db, userId) {
  if (!db || !userId) return null;
  try {
    const row = db.prepare('SELECT name FROM users WHERE id = ?').get(userId);
    return row && row.name ? row.name : null;
  } catch (_) {
    return null;
  }
}

const ACTION_LABELS = {
  SHIPMENT_CREATED: 'Shipment created',
  SHIPMENT_UPDATED: 'Shipment updated',
  SHIPMENT_DELETED: 'Shipment deleted',
  DOCUMENT_UPLOADED: 'Document uploaded',
  DOCUMENT_DELETED: 'Document deleted',
  SHIPMENTS_IMPORTED: 'Shipments imported',
  USER_CREATED: 'User created',
  USER_UPDATED: 'User updated',
  USER_DELETED: 'User deleted',
  PERMISSIONS_UPDATED: 'Permissions updated',
  SUPPLIER_CREATED: 'Supplier created',
  SUPPLIER_UPDATED: 'Supplier updated',
  SUPPLIER_DELETED: 'Supplier deleted',
  SUPPLIERS_IMPORTED: 'Suppliers imported',
  BUYER_CREATED: 'Buyer created',
  BUYER_UPDATED: 'Buyer updated',
  BUYER_DELETED: 'Buyer deleted',
  BUYERS_IMPORTED: 'Buyers imported',
  LICENCE_CREATED: 'Licence created',
  LICENCE_UPDATED: 'Licence updated',
  LICENCE_DELETED: 'Licence deleted',
  LC_CREATED: 'LC created',
  LC_UPDATED: 'LC updated',
  LC_DELETED: 'LC deleted',
  LOGIN_SUCCESS: 'Login success',
  LOGIN_BLOCKED_ACTIVE_SESSION: 'Login blocked (active session)',
  SESSION_IDLE_TIMEOUT: 'Session timed out (idle)',
  LOGOUT: 'Logout',
  SESSION_UNLOCKED_BY_ADMIN: 'Session unlocked by admin',
  MATERIAL_CREATED: 'Material created',
  MATERIAL_UPDATED: 'Material updated',
  MATERIAL_DELETED: 'Material deleted',
  MATERIALS_IMPORTED: 'Materials imported',
  DOMESTIC_BUYER_CREATED: 'Domestic buyer created',
  DOMESTIC_BUYER_UPDATED: 'Domestic buyer updated',
  DOMESTIC_BUYER_DELETED: 'Domestic buyer deleted',
  DOMESTIC_BUYERS_IMPORTED: 'Domestic buyers imported',
  INDENT_PRODUCT_CREATED: 'Indent product created',
  INDENT_PRODUCT_UPDATED: 'Indent product updated',
  INDENT_PRODUCT_DELETED: 'Indent product deleted',
  INDENT_PRODUCTS_IMPORTED: 'Indent products imported',
};

function getActionLabel(action) {
  return ACTION_LABELS[action] || action.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function detailsToSummary(detailsStr) {
  if (detailsStr == null || detailsStr === '') return '';
  try {
    const d = JSON.parse(detailsStr);
    if (d && typeof d.message === 'string') return d.message;
    if (d && d.invoiceNumber != null) return `Invoice ${d.invoiceNumber}`;
    if (d && d.name != null) return d.name;
    if (d && d.lcNumber != null) return `LC ${d.lcNumber}`;
    if (d && d.filename != null) return d.filename;
    if (d && typeof d.count === 'number') return `${d.count} item(s)`;
    return typeof d === 'object' ? JSON.stringify(d) : String(d);
  } catch (_) {
    return detailsStr;
  }
}

const BATCH_SIZE = 500;

function escapeCsv(val) {
  const s = val == null ? '' : String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function rowToCsvLine(r) {
  const userName = r.userName || r.userId || 'System';
  const actionLabel = getActionLabel(r.action);
  const detailsSummary = detailsToSummary(r.details);
  const summary = `${userName} ${actionLabel}${r.targetId ? ' #' + r.targetId : ''}${detailsSummary ? ': ' + detailsSummary : ''}`;
  return [
    r.id,
    r.timestamp,
    escapeCsv(r.userId),
    escapeCsv(userName),
    escapeCsv(r.action),
    escapeCsv(actionLabel),
    escapeCsv(r.targetId),
    escapeCsv(r.details),
    escapeCsv(summary),
  ].join(',');
}

/**
 * Export audit logs older than olderThanDays to a CSV file and delete them from the DB.
 * Processes rows in batches of 500 to avoid loading tens of thousands of rows into memory.
 * @param {object} db - Database instance
 * @param {{ olderThanDays?: number }} options - optional; olderThanDays defaults to AUDIT_ARCHIVE_DAYS
 * @returns {Promise<{ count: number, filePath: string | null }>} count of rows exported, absolute path of file
 */
function exportAndArchive(db, options = {}) {
  return new Promise((resolve, reject) => {
    const olderThanDays = options.olderThanDays ?? AUDIT_ARCHIVE_DAYS;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);
    const cutoffStr = cutoff.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');

    let rangeRow;
    try {
      rangeRow = db.prepare(`
        SELECT MIN(timestamp) AS firstTs, MAX(timestamp) AS lastTs
        FROM audit_logs WHERE timestamp < ?
      `).get(cutoffStr);
    } catch (e) {
      return reject(e);
    }

    if (!rangeRow || rangeRow.firstTs == null || rangeRow.lastTs == null) {
      return resolve({ count: 0, filePath: null });
    }

    const dateFrom = String(rangeRow.firstTs).slice(0, 10);
    const dateTo = String(rangeRow.lastTs).slice(0, 10);
    const filename = `audit_logs_${dateFrom}_to_${dateTo}.csv`;
    if (!fs.existsSync(AUDIT_EXPORT_DIR)) {
      fs.mkdirSync(AUDIT_EXPORT_DIR, { recursive: true });
    }
    const filePath = path.join(AUDIT_EXPORT_DIR, filename);

    const selectStmt = db.prepare(`
      SELECT a.id, a.userId, a.action, a.targetId, a.details, a.timestamp,
             u.name AS userName
      FROM audit_logs a
      LEFT JOIN users u ON u.id = a.userId
      WHERE a.timestamp < ?
      ORDER BY a.timestamp ASC, a.id ASC
      LIMIT ?
    `);

    const stream = fs.createWriteStream(filePath, { encoding: 'utf8' });
    stream.on('error', reject);

    const header = 'id,timestamp,userId,userName,action,actionLabel,targetId,details,summary';
    stream.write(header + '\n');

    let totalCount = 0;

    function processNextBatch() {
      try {
        const rows = selectStmt.all(cutoffStr, BATCH_SIZE);
        if (rows.length === 0) {
          stream.end();
          return;
        }

        for (const r of rows) {
          stream.write(rowToCsvLine(r) + '\n');
        }

        const ids = rows.map((r) => r.id);
        const placeholders = ids.map(() => '?').join(',');
        db.prepare(`DELETE FROM audit_logs WHERE id IN (${placeholders})`).run(...ids);
        totalCount += rows.length;

        if (rows.length < BATCH_SIZE) {
          stream.end();
          return;
        }

        setImmediate(processNextBatch);
      } catch (e) {
        stream.destroy(e);
        reject(e);
      }
    }

    stream.on('finish', () => resolve({ count: totalCount, filePath }));

    processNextBatch();
  });
}

module.exports = { log, getUserName, exportAndArchive };
