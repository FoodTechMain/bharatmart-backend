import { AuthRequest, AuthResponse, AuthNextFunction } from '../types/express.js';
import User from '../models/User.js';
import Shop, { IShopStaffMember } from '../models/Shop.js';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';

interface JwtPayload {
  userId: string;
  shopId?: string;
  role?: string;
  permissions?: string[];
}

// Middleware to authenticate token
export const authenticateToken = async (req: AuthRequest, res: AuthResponse, next: AuthNextFunction) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access token is required'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key') as JwtPayload;
    
    const user = await User.findById(decoded.userId).select('-password');
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User not found'
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        error: 'User account is inactive'
      });
    }

    req.user = user;

    // If shopId is in token, attach shop to request
    if (decoded.shopId) {
      const shop = await Shop.findById(decoded.shopId);
      if (shop && shop.isActive) {
        req.shop = shop;
      }
    }

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({
      success: false,
      error: 'Invalid or expired token'
    });
  }
};

// Optional authentication middleware
export const optionalAuth = async (req: AuthRequest, res: AuthResponse, next: AuthNextFunction) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key') as JwtPayload;
    
    const user = await User.findById(decoded.userId).select('-password');
    if (user && user.isActive) {
      req.user = user;

      if (decoded.shopId) {
        const shop = await Shop.findById(decoded.shopId);
        if (shop && shop.isActive) {
          req.shop = shop;
        }
      }
    }

    next();
  } catch (error) {
    // Don't return error for optional auth
    next();
  }
};

// Middleware to require specific role
export const requireRole = (role: string) => {
  return (req: AuthRequest, res: AuthResponse, next: AuthNextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    if (req.user.role !== role && req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        error: 'Insufficient role permissions'
      });
    }

    next();
  };
};

// Middleware to require superadmin role
export const requireSuperAdmin = (req: AuthRequest, res: AuthResponse, next: AuthNextFunction) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }

  if (req.user.role !== 'superadmin') {
    return res.status(403).json({
      success: false,
      error: 'Superadmin access required'
    });
  }

  next();
};

// Middleware to require specific permission
export const requirePermission = (permission: string) => {
  return (req: AuthRequest, res: AuthResponse, next: AuthNextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    if (req.user.role === 'superadmin') {
      return next();
    }

    if (!req.user.permissions.includes(permission)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions'
      });
    }

    next();
  };
};

// Middleware to require shop ownership
export const requireShopOwnership = async (req: AuthRequest, res: AuthResponse, next: AuthNextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const shopId = req.params.shopId || req.body.shopId;
    if (!shopId) {
      return res.status(400).json({
        success: false,
        error: 'Shop ID is required'
      });
    }

    // Superadmin can access any shop
    if (req.user.role === 'superadmin') {
      return next();
    }

    const shop = await Shop.findById(shopId);
    if (!shop) {
      return res.status(404).json({
        success: false,
        error: 'Shop not found'
      });
    }

    if (!shop.owner.equals(req.user._id)) {
      return res.status(403).json({
        success: false,
        error: 'You do not own this shop'
      });
    }

    req.shop = shop;
    next();
  } catch (error) {
    console.error('Shop ownership check error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
};

// Middleware to require shop staff role
export const requireShopStaff = async (req: AuthRequest, res: AuthResponse, next: AuthNextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const shopId = req.params.shopId || req.body.shopId;
    if (!shopId) {
      return res.status(400).json({
        success: false,
        error: 'Shop ID is required'
      });
    }

    // Superadmin can access any shop
    if (req.user.role === 'superadmin') {
      return next();
    }

    const shop = await Shop.findById(shopId);
    if (!shop) {
      return res.status(404).json({
        success: false,
        error: 'Shop not found'
      });
    }

    // Check if user is owner or staff
    if (!shop.owner.equals(req.user._id) && !shop.staff.some((staff: IShopStaffMember) => staff.user.equals(req.user?._id))) {
      return res.status(403).json({
        success: false,
        error: 'You are not authorized to access this shop'
      });
    }

    req.shop = shop;
    next();
  } catch (error) {
    console.error('Shop staff check error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
};