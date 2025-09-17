const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware to verify JWT token
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ 
        message: 'Access token is required',
        code: 'TOKEN_MISSING'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('+password');

    if (!user) {
      return res.status(401).json({ 
        message: 'Invalid token - user not found',
        code: 'USER_NOT_FOUND'
      });
    }

    if (!user.isActive) {
      return res.status(401).json({ 
        message: 'Account is deactivated',
        code: 'ACCOUNT_DEACTIVATED'
      });
    }

    if (user.isLocked) {
      return res.status(401).json({ 
        message: 'Account is temporarily locked due to multiple failed login attempts',
        code: 'ACCOUNT_LOCKED'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        message: 'Invalid token',
        code: 'INVALID_TOKEN'
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        message: 'Token has expired',
        code: 'TOKEN_EXPIRED'
      });
    }
    
    console.error('Auth middleware error:', error);
    return res.status(500).json({ 
      message: 'Authentication error',
      code: 'AUTH_ERROR'
    });
  }
};

// Middleware to check if user has specific permission
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        message: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    if (!req.user.hasPermission(permission)) {
      return res.status(403).json({ 
        message: 'Insufficient permissions',
        code: 'INSUFFICIENT_PERMISSIONS',
        requiredPermission: permission,
        userRole: req.user.role
      });
    }

    next();
  };
};

// Middleware to check if user has any of the specified permissions
const requireAnyPermission = (permissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        message: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    const hasAnyPermission = permissions.some(permission => 
      req.user.hasPermission(permission)
    );

    if (!hasAnyPermission) {
      return res.status(403).json({ 
        message: 'Insufficient permissions',
        code: 'INSUFFICIENT_PERMISSIONS',
        requiredPermissions: permissions,
        userRole: req.user.role
      });
    }

    next();
  };
};

// Middleware to check if user has all specified permissions
const requireAllPermissions = (permissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        message: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    const hasAllPermissions = permissions.every(permission => 
      req.user.hasPermission(permission)
    );

    if (!hasAllPermissions) {
      return res.status(403).json({ 
        message: 'Insufficient permissions',
        code: 'INSUFFICIENT_PERMISSIONS',
        requiredPermissions: permissions,
        userRole: req.user.role
      });
    }

    next();
  };
};

// Middleware to check if user has specific role
const requireRole = (roles) => {
  const roleArray = Array.isArray(roles) ? roles : [roles];
  
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        message: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    if (!roleArray.includes(req.user.role)) {
      return res.status(403).json({ 
        message: 'Insufficient role permissions',
        code: 'INSUFFICIENT_ROLE',
        requiredRoles: roleArray,
        userRole: req.user.role
      });
    }

    next();
  };
};

// Middleware to check if user is superadmin
const requireSuperAdmin = (req, res, next) => {
  return requireRole('superadmin')(req, res, next);
};

// Middleware to check if user is shop owner
const requireShopOwner = (req, res, next) => {
  return requireRole(['superadmin', 'shop_owner'])(req, res, next);
};

// Middleware to check if user owns the shop
const requireShopOwnership = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ 
        message: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    const shopId = req.params.shopId || req.body.shopId || req.query.shopId;
    
    if (!shopId) {
      return res.status(400).json({ 
        message: 'Shop ID is required',
        code: 'SHOP_ID_REQUIRED'
      });
    }

    const Shop = require('../models/Shop');
    const shop = await Shop.findById(shopId);

    if (!shop) {
      return res.status(404).json({ 
        message: 'Shop not found',
        code: 'SHOP_NOT_FOUND'
      });
    }

    // Superadmin can access any shop
    if (req.user.role === 'superadmin') {
      req.shop = shop;
      return next();
    }

    // Shop owner can only access their own shop
    if (req.user.role === 'shop_owner' && shop.owner.toString() === req.user._id.toString()) {
      req.shop = shop;
      return next();
    }

    return res.status(403).json({ 
      message: 'Access denied - you can only access your own shop',
      code: 'SHOP_ACCESS_DENIED'
    });

  } catch (error) {
    console.error('Shop ownership check error:', error);
    return res.status(500).json({ 
      message: 'Error checking shop ownership',
      code: 'SHOP_OWNERSHIP_ERROR'
    });
  }
};

// Optional authentication middleware (doesn't fail if no token)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId);
      
      if (user && user.isActive && !user.isLocked) {
        req.user = user;
      }
    }
    
    next();
  } catch (error) {
    // Continue without authentication if token is invalid
    next();
  }
};

module.exports = {
  authenticateToken,
  requirePermission,
  requireAnyPermission,
  requireAllPermissions,
  requireRole,
  requireSuperAdmin,
  requireShopOwner,
  requireShopOwnership,
  optionalAuth
}; 