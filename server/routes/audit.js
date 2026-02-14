const express = require('express');
const db = require('../db');
const { hasPermission } = require('../middleware');

function createRouter() {
  const router = express.Router();

  /**
   * GET /api/audit-logs
   * Query: userId, action, targetId, from, to, limit (default 200, max 500)
   * Requires system.audit_logs permission.
   * Returns rows with id, userId, userName, action, targetId, details, timestamp.
   */
  router.get('/', hasPermission('system.audit_logs'), (req, res) => {
    try {
      const userId = typeof req.query.userId === 'string' ? req.query.userId.trim() : null;
      const action = typeof req.query.action === 'string' ? req.query.action.trim() : null;
      const targetId = typeof req.query.targetId === 'string' ? req.query.targetId.trim() : null;
      const from = typeof req.query.from === 'string' ? req.query.from.trim() : null;
      const to = typeof req.query.to === 'string' ? req.query.to.trim() : null;
      let limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 500);

      let sql = `
        SELECT a.id, a.userId, a.action, a.targetId, a.details, a.timestamp,
               u.name AS userName
        FROM audit_logs a
        LEFT JOIN users u ON u.id = a.userId
        WHERE 1=1
      `;
      const params = [];

      if (userId) {
        params.push(userId);
        sql += ` AND a.userId = ?`;
      }
      if (action) {
        params.push(action);
        sql += ` AND a.action = ?`;
      }
      if (targetId) {
        params.push(targetId);
        sql += ` AND a.targetId = ?`;
      }
      if (from) {
        params.push(from);
        sql += ` AND a.timestamp >= ?`;
      }
      if (to) {
        // If date-only (YYYY-MM-DD), include full day
        const toVal = to.length === 10 ? to + ' 23:59:59' : to;
        params.push(toVal);
        sql += ` AND a.timestamp <= ?`;
      }

      sql += ` ORDER BY a.timestamp DESC LIMIT ?`;
      params.push(limit);

      const rows = db.prepare(sql).all(...params);
      res.json(rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        userName: r.userName || r.userId || 'System',
        action: r.action,
        targetId: r.targetId,
        details: (() => {
          if (r.details == null || r.details === '') return null;
          try {
            return JSON.parse(r.details);
          } catch (_) {
            return { raw: r.details };
          }
        })(),
        timestamp: r.timestamp,
      })));
    } catch (e) {
      console.error('GET /api/audit-logs:', e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  return router;
}

module.exports = createRouter;
