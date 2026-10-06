/**
 * RBAC Authorization Middleware
 * 
 * Usage: router.get('/admin-only', authenticateToken, authorize('admin'), handler)
 * 
 * Roles (in ascending privilege): 'patient', 'admin'
 */

const ROLE_HIERARCHY = { patient: 0, admin: 1 };

/**
 * Returns middleware that checks req.user.role against allowed roles.
 * @param {...string} allowedRoles - e.g. authorize('admin') or authorize('admin', 'patient')
 */
function authorize(...allowedRoles) {
  return (req, res, next) => {
    const userRole = req.user?.role || 'patient';

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        error: `Access denied. Required role: ${allowedRoles.join(' or ')}. Your role: ${userRole}.`
      });
    }

    next();
  };
}

module.exports = authorize;
