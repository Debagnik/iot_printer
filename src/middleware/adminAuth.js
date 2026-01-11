const User = require('../models/user');

/**
 * Middleware to check if user is authenticated and is an admin
 */
async function requireAdmin(req, res, next) {
  try {
    // Check if user is authenticated
    if (!req.session || !req.session.userId) {
      return res.status(401).render('error', { error: 'Authentication required' });
    }

    // Check if user is admin
    const isUserAdmin = await User.isAdmin(req.session.userId);

    if (!isUserAdmin) {
      return res.status(403).render('error', { error: 'Admin privileges required' });
    }

    next();
  } catch (err) {
    console.error('Admin auth middleware error:', err);
    res.status(500).render('error', { error: 'Authorization check failed' });
  }
}

module.exports = {
  requireAdmin
};
