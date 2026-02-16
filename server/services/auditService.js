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

/**
 * Export audit logs older than olderThanDays to a CSV file and delete them from the DB.
 * @param {object} db - Database instance
 * @param {{ olderThanDays?: number }} options - optional; olderThanDays defaults to AUDIT_ARCHIVE_DAYS
 * @returns {{ count: number, filePath: string }} count of rows exported, absolute path of file
 */
function exportAndArchive(db, options = {}) {
  const olderThanDays = options.olderThanDays ?? AUDIT_ARCHIVE_DAYS;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - olderThanDays);
  const cutoffStr = cutoff.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');

  const rows = db.prepare(`
    SELECT a.id, a.userId, a.action, a.targetId, a.details, a.timestamp,
           u.name AS userName
    FROM audit_logs a
    LEFT JOIN users u ON u.id = a.userId
    WHERE a.timestamp < ?
    ORDER BY a.timestamp ASC
  `).all(cutoffStr);

  if (rows.length === 0) {
    return { count: 0, filePath: null };
  }

  const firstTs = rows[0].timestamp || '';
  const lastTs = rows[rows.length - 1].timestamp || '';
  const dateFrom = firstTs.slice(0, 10);
  const dateTo = lastTs.slice(0, 10);
  const filename = `audit_logs_${dateFrom}_to_${dateTo}.csv`;
  if (!fs.existsSync(AUDIT_EXPORT_DIR)) {
    fs.mkdirSync(AUDIT_EXPORT_DIR, { recursive: true });
  }
  const filePath = path.join(AUDIT_EXPORT_DIR, filename);

  function escapeCsv(val) {
    const s = val == null ? '' : String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  const header = 'id,timestamp,userId,userName,action,actionLabel,targetId,details,summary';
  const lines = [header];
  for (const r of rows) {
    const userName = r.userName || r.userId || 'System';
    const actionLabel = getActionLabel(r.action);
    const detailsSummary = detailsToSummary(r.details);
    const summary = `${userName} ${actionLabel}${r.targetId ? ' #' + r.targetId : ''}${detailsSummary ? ': ' + detailsSummary : ''}`;
    lines.push([
      r.id,
      r.timestamp,
      escapeCsv(r.userId),
      escapeCsv(userName),
      escapeCsv(r.action),
      escapeCsv(actionLabel),
      escapeCsv(r.targetId),
      escapeCsv(r.details),
      escapeCsv(summary),
    ].join(','));
  }

  const ids = rows.map((r) => r.id);
  db.transaction(() => {
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`DELETE FROM audit_logs WHERE id IN (${placeholders})`).run(...ids);
  })();

  return { count: rows.length, filePath };
}

module.exports = { log, getUserName, exportAndArchive };
