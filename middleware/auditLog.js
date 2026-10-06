/**
 * Audit Log Middleware
 * 
 * Logs all write operations (POST, PUT, DELETE) to the audit_log table.
 * Fire-and-forget — never blocks the response or throws on failure.
 * 
 * Schema: audit_log(id, user_id, route, action, ip, timestamp)
 */
const { dbQuery } = require('../database');

const WRITE_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

function auditLog(req, res, next) {
  // Only log write operations on API routes
  if (!WRITE_METHODS.has(req.method) || !req.path.startsWith('/')) {
    return next();
  }

  // Capture response finish to know the outcome
  res.on('finish', () => {
    // Only log if we have a user (authenticated request)
    const userId = req.user?.id || null;
    if (!userId) return;

    const action = `${req.method} ${req.route?.path || req.path}`;
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    const routePath = req.originalUrl;

    // Fire-and-forget — don't await, don't crash on failure
    dbQuery.run(
      `INSERT INTO audit_log (user_id, route, action, ip, timestamp) VALUES (?, ?, ?, ?, ?)`,
      [userId, routePath, action, ip, new Date().toISOString()]
    ).catch(err => {
      console.error('[auditLog] Failed to write audit entry:', err.message);
    });
  });

  next();
}

module.exports = auditLog;
