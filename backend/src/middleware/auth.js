const jwt = require('jsonwebtoken');
const Customer = require('../models/Customer');
const config = require('../utils/config');

/**
 * JWT Authentication Middleware
 * Verifies Bearer token and attaches req.user (Customer document without password)
 */
const protect = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    const decoded = jwt.verify(token, config.SECRET_KEY);
    const user = await Customer.findById(decoded.id).select('-password');

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token or inactive user account.'
      });
    }

    req.user = user;
    req.customer = user; // Backwards compatibility
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token.'
    });
  }
};

/**
 * Strict Role-Based Access Control (RBAC) Middleware
 * Checks if req.user.role matches allowed roles, otherwise returns 403 Forbidden
 */
const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: Role '${req.user?.role || 'unknown'}' is not authorized to access this resource.`
      });
    }
    next();
  };
};

// Aliases for compatibility
const authenticate = protect;
const authorize = authorizeRoles;
const isAdmin = authorizeRoles('admin');

module.exports = {
  protect,
  authenticate,
  authorizeRoles,
  authorize,
  isAdmin
};
