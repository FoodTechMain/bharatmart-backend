"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireShopStaff = exports.requireShopOwnership = exports.requirePermission = exports.requireSuperAdmin = exports.requireRole = exports.optionalAuth = exports.authenticateToken = void 0;
const User_js_1 = __importDefault(require("../models/User.js"));
const Shop_js_1 = __importDefault(require("../models/Shop.js"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
// Middleware to authenticate token
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'Access token is required'
            });
        }
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        const user = await User_js_1.default.findById(decoded.userId).select('-password');
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
            const shop = await Shop_js_1.default.findById(decoded.shopId);
            if (shop && shop.isActive) {
                req.shop = shop;
            }
        }
        next();
    }
    catch (error) {
        console.error('Authentication error:', error);
        res.status(401).json({
            success: false,
            error: 'Invalid or expired token'
        });
    }
};
exports.authenticateToken = authenticateToken;
// Optional authentication middleware
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        if (!token) {
            return next();
        }
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        const user = await User_js_1.default.findById(decoded.userId).select('-password');
        if (user && user.isActive) {
            req.user = user;
            if (decoded.shopId) {
                const shop = await Shop_js_1.default.findById(decoded.shopId);
                if (shop && shop.isActive) {
                    req.shop = shop;
                }
            }
        }
        next();
    }
    catch (error) {
        // Don't return error for optional auth
        next();
    }
};
exports.optionalAuth = optionalAuth;
// Middleware to require specific role
const requireRole = (role) => {
    return (req, res, next) => {
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
exports.requireRole = requireRole;
// Middleware to require superadmin role
const requireSuperAdmin = (req, res, next) => {
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
exports.requireSuperAdmin = requireSuperAdmin;
// Middleware to require specific permission
const requirePermission = (permission) => {
    return (req, res, next) => {
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
exports.requirePermission = requirePermission;
// Middleware to require shop ownership
const requireShopOwnership = async (req, res, next) => {
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
        const shop = await Shop_js_1.default.findById(shopId);
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
    }
    catch (error) {
        console.error('Shop ownership check error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
};
exports.requireShopOwnership = requireShopOwnership;
// Middleware to require shop staff role
const requireShopStaff = async (req, res, next) => {
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
        const shop = await Shop_js_1.default.findById(shopId);
        if (!shop) {
            return res.status(404).json({
                success: false,
                error: 'Shop not found'
            });
        }
        // Check if user is owner or staff
        if (!shop.owner.equals(req.user._id) && !shop.staff.some((staff) => staff.user.equals(req.user?._id))) {
            return res.status(403).json({
                success: false,
                error: 'You are not authorized to access this shop'
            });
        }
        req.shop = shop;
        next();
    }
    catch (error) {
        console.error('Shop staff check error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
};
exports.requireShopStaff = requireShopStaff;
//# sourceMappingURL=auth.js.map