/**
 * Authentication middleware to protect routes
 */

/**
 * Middleware to check if user is authenticated
 * Redirects to login if not authenticated
 */
function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.redirect('/login');
  }
  next();
}

/**
 * Middleware to check if user is already logged in
 * Redirects to dashboard if already authenticated
 */
function requireGuest(req, res, next) {
  if (req.session && req.session.userId) {
    return res.redirect('/dashboard');
  }
  next();
}

module.exports = {
  requireAuth,
  requireGuest
};
