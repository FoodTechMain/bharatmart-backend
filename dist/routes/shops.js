"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express = require('express');
const router = express.Router();
const express_validator_1 = require("express-validator");
const Shop_js_1 = __importDefault(require("../models/Shop.js"));
const Category_js_1 = __importDefault(require("../models/Category.js"));
const Product_js_1 = __importDefault(require("../models/Product.js"));
const Order_js_1 = __importDefault(require("../models/Order.js"));
const auth_js_1 = require("../middleware/auth.js");
// Get all shops
router.get('/', auth_js_1.authenticateToken, async (req, res) => {
    try {
        const { page = '1', limit = '10', owner, category, isVerified, isActive, search, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
        const query = {};
        if (owner)
            query.owner = owner;
        if (category)
            query.categories = category;
        if (isVerified !== undefined)
            query.isVerified = isVerified === 'true';
        if (isActive !== undefined)
            query.isActive = isActive === 'true';
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }
        // Filter by user role
        if (req.user?.role === 'shop_owner') {
            query.owner = req.user?._id;
        }
        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const shops = await Shop_js_1.default.find(query)
            .populate('owner', 'firstName lastName email phone')
            .populate('categories', 'name slug')
            .sort(sortOptions)
            .limit(limitNum)
            .skip((pageNum - 1) * limitNum)
            .exec();
        const total = await Shop_js_1.default.countDocuments(query);
        const response = {
            success: true,
            data: shops,
            pagination: {
                total,
                currentPage: pageNum,
                totalPages: Math.ceil(total / limitNum),
                limit: limitNum,
                hasNext: pageNum * limitNum < total,
                hasPrev: pageNum > 1
            }
        };
        res.json(response);
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
});
// Get shop by ID
router.get('/:id', auth_js_1.authenticateToken, async (req, res) => {
    try {
        const shop = await Shop_js_1.default.findById(req.params.id)
            .populate('owner', 'firstName lastName email phone address')
            .populate('categories', 'name slug description');
        if (!shop) {
            return res.status(404).json({
                success: false,
                error: 'Shop not found'
            });
        }
        // Check if user has access to this shop
        if (req.user?.role === 'shop_owner' && shop.owner._id.toString() !== req.user?._id.toString()) {
            return res.status(403).json({
                success: false,
                error: 'Access denied'
            });
        }
        res.json({
            success: true,
            data: shop
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
});
// Create new shop
router.post('/', [
    auth_js_1.authenticateToken,
    (0, express_validator_1.body)('name').trim().isLength({ min: 3 }).withMessage('Shop name must be at least 3 characters'),
    (0, express_validator_1.body)('description').trim().isLength({ min: 10 }).withMessage('Description must be at least 10 characters'),
    (0, express_validator_1.body)('categories').isArray({ min: 1 }).withMessage('At least one category is required'),
    (0, express_validator_1.body)('categories.*').isMongoId().withMessage('Valid category ID is required'),
    (0, express_validator_1.body)('contactInfo.email').optional().isEmail().withMessage('Valid email is required'),
    (0, express_validator_1.body)('contactInfo.phone').optional().isMobilePhone('any').withMessage('Valid phone number is required'),
], async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array()
            });
        }
        const { categories, ...shopData } = req.body;
        // Check if categories exist
        const categoryIds = await Category_js_1.default.find({ _id: { $in: categories } }).select('_id');
        if (categoryIds.length !== categories.length) {
            return res.status(400).json({
                success: false,
                error: 'One or more categories not found'
            });
        }
        // Check if user already has a shop (for shop_owner role)
        if (req.user?.role === 'shop_owner' && req.user?._id) {
            const existingShop = await Shop_js_1.default.findOne({ owner: req.user._id });
            if (existingShop) {
                return res.status(400).json({
                    success: false,
                    error: 'You already have a shop registered'
                });
            }
        }
        const shop = new Shop_js_1.default({
            ...shopData,
            owner: req.user?._id || '',
            categories: categoryIds.map(cat => cat._id)
        });
        await shop.save();
        const populatedShop = await Shop_js_1.default.findById(shop._id)
            .populate('owner', 'firstName lastName email')
            .populate('categories', 'name slug');
        res.status(201).json({
            success: true,
            data: populatedShop
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
});
// Update shop
router.put('/:id', [
    auth_js_1.authenticateToken,
    (0, express_validator_1.body)('name').optional().trim().isLength({ min: 3 }).withMessage('Shop name must be at least 3 characters'),
    (0, express_validator_1.body)('description').optional().trim().isLength({ min: 10 }).withMessage('Description must be at least 10 characters'),
    (0, express_validator_1.body)('categories').optional().isArray({ min: 1 }).withMessage('At least one category is required'),
    (0, express_validator_1.body)('categories.*').optional().isMongoId().withMessage('Valid category ID is required'),
    (0, express_validator_1.body)('contactInfo.email').optional().isEmail().withMessage('Valid email is required'),
    (0, express_validator_1.body)('contactInfo.phone').optional().isMobilePhone('any').withMessage('Valid phone number is required'),
], async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array()
            });
        }
        const shop = await Shop_js_1.default.findById(req.params.id);
        if (!shop) {
            return res.status(404).json({
                success: false,
                error: 'Shop not found'
            });
        }
        // Check if user has permission to update this shop
        if (req.user?.role === 'shop_owner' && shop.owner.toString() !== req.user?._id?.toString()) {
            return res.status(403).json({
                success: false,
                error: 'Access denied'
            });
        }
        const { categories, ...updateData } = req.body;
        // Check if categories exist
        if (categories) {
            const categoryIds = await Category_js_1.default.find({ _id: { $in: categories } }).select('_id');
            if (categoryIds.length !== categories.length) {
                return res.status(400).json({
                    success: false,
                    error: 'One or more categories not found'
                });
            }
            updateData.categories = categoryIds.map(cat => cat._id);
        }
        Object.assign(shop, updateData);
        await shop.save();
        const updatedShop = await Shop_js_1.default.findById(shop._id)
            .populate('owner', 'firstName lastName email')
            .populate('categories', 'name slug');
        res.json({
            success: true,
            data: updatedShop
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
});
// Delete shop (Superadmin only)
router.delete('/:id', auth_js_1.authenticateToken, auth_js_1.requireSuperAdmin, async (req, res) => {
    try {
        const shop = await Shop_js_1.default.findById(req.params.id);
        if (!shop) {
            return res.status(404).json({
                success: false,
                error: 'Shop not found'
            });
        }
        // Check if shop has products
        const productsCount = await Product_js_1.default.countDocuments({ shop: req.params.id });
        if (productsCount > 0) {
            return res.status(400).json({
                success: false,
                error: `Cannot delete shop with ${productsCount} products. Please delete products first.`
            });
        }
        // Check if shop has orders
        const ordersCount = await Order_js_1.default.countDocuments({ shop: req.params.id });
        if (ordersCount > 0) {
            return res.status(400).json({
                success: false,
                error: `Cannot delete shop with ${ordersCount} orders. Please handle orders first.`
            });
        }
        await Shop_js_1.default.findByIdAndDelete(req.params.id);
        res.json({
            success: true,
            message: 'Shop deleted successfully'
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
});
// Toggle shop active status
router.patch('/:id/toggle-status', auth_js_1.authenticateToken, auth_js_1.requireSuperAdmin, async (req, res) => {
    try {
        const shop = await Shop_js_1.default.findById(req.params.id);
        if (!shop) {
            return res.status(404).json({
                success: false,
                error: 'Shop not found'
            });
        }
        shop.isActive = !shop.isActive;
        await shop.save();
        res.json({
            success: true,
            message: `Shop ${shop.isActive ? 'activated' : 'deactivated'} successfully`,
            data: { isActive: shop.isActive }
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
});
// Toggle shop verification status (Superadmin only)
router.patch('/:id/toggle-verification', auth_js_1.authenticateToken, auth_js_1.requireSuperAdmin, async (req, res) => {
    try {
        const shop = await Shop_js_1.default.findById(req.params.id);
        if (!shop) {
            return res.status(404).json({
                success: false,
                error: 'Shop not found'
            });
        }
        shop.isVerified = !shop.isVerified;
        shop.verificationStatus = shop.isVerified ? 'approved' : 'pending';
        await shop.save();
        res.json({
            success: true,
            message: `Shop ${shop.isVerified ? 'verified' : 'unverified'} successfully`,
            data: {
                isVerified: shop.isVerified,
                verificationStatus: shop.verificationStatus
            }
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
});
// Update shop verification status (Superadmin only)
router.patch('/:id/verification-status', [
    auth_js_1.authenticateToken,
    auth_js_1.requireSuperAdmin,
    (0, express_validator_1.body)('status').isIn(['pending', 'verified', 'rejected']).withMessage('Invalid verification status'),
    (0, express_validator_1.body)('notes').optional().trim().isLength({ max: 500 }).withMessage('Notes must be less than 500 characters'),
], async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array()
            });
        }
        const shop = await Shop_js_1.default.findById(req.params.id);
        if (!shop) {
            return res.status(404).json({
                success: false,
                error: 'Shop not found'
            });
        }
        const status = req.body.status;
        shop.verificationStatus = status;
        shop.isVerified = status === 'approved';
        if (req.body.notes) {
            shop.verificationNotes = req.body.notes;
        }
        await shop.save();
        res.json({
            success: true,
            message: `Shop verification status updated to ${status}`,
            data: {
                verificationStatus: shop.verificationStatus,
                isVerified: shop.isVerified
            }
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
});
// Get shop statistics
router.get('/:id/stats', auth_js_1.authenticateToken, async (req, res) => {
    try {
        const shop = await Shop_js_1.default.findById(req.params.id);
        if (!shop) {
            return res.status(404).json({
                success: false,
                error: 'Shop not found'
            });
        }
        // Check if user has access to this shop
        if (req.user?.role === 'shop_owner' && shop.owner.toString() !== req.user?._id?.toString()) {
            return res.status(403).json({
                success: false,
                error: 'Access denied'
            });
        }
        const stats = await shop.updateStats();
        res.json({
            success: true,
            data: stats
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
});
// Get shop products
router.get('/:id/products', auth_js_1.authenticateToken, async (req, res) => {
    try {
        const shop = await Shop_js_1.default.findById(req.params.id);
        if (!shop) {
            return res.status(404).json({
                success: false,
                error: 'Shop not found'
            });
        }
        const { page = '1', limit = '10', category, search, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
        const query = { shop: req.params.id, isActive: true };
        if (category)
            query.category = category;
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }
        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const products = await Product_js_1.default.find(query)
            .populate('category', 'name slug')
            .sort(sortOptions)
            .limit(limitNum)
            .skip((pageNum - 1) * limitNum)
            .exec();
        const total = await Product_js_1.default.countDocuments(query);
        const response = {
            success: true,
            data: products,
            pagination: {
                total,
                currentPage: pageNum,
                totalPages: Math.ceil(total / limitNum),
                limit: limitNum,
                hasNext: pageNum * limitNum < total,
                hasPrev: pageNum > 1
            }
        };
        res.json(response);
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
});
// Get shop orders
router.get('/:id/orders', auth_js_1.authenticateToken, async (req, res) => {
    try {
        const shop = await Shop_js_1.default.findById(req.params.id);
        if (!shop) {
            return res.status(404).json({
                success: false,
                error: 'Shop not found'
            });
        }
        // Check if user has access to this shop
        if (req.user?.role === 'shop_owner' && shop.owner.toString() !== req.user?._id?.toString()) {
            return res.status(403).json({
                success: false,
                error: 'Access denied'
            });
        }
        const { page = '1', limit = '10', status, startDate, endDate, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
        const query = { shop: req.params.id };
        if (status)
            query.status = status;
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate)
                query.createdAt.$gte = new Date(startDate);
            if (endDate)
                query.createdAt.$lte = new Date(endDate);
        }
        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const orders = await Order_js_1.default.find(query)
            .populate('customer', 'firstName lastName email phone')
            .populate('items.product', 'name price images')
            .sort(sortOptions)
            .limit(limitNum)
            .skip((pageNum - 1) * limitNum)
            .exec();
        const total = await Order_js_1.default.countDocuments(query);
        const response = {
            success: true,
            data: orders,
            pagination: {
                total,
                currentPage: pageNum,
                totalPages: Math.ceil(total / limitNum),
                limit: limitNum,
                hasNext: pageNum * limitNum < total,
                hasPrev: pageNum > 1
            }
        };
        res.json(response);
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
});
// Get verified shops
router.get('/verified/list', async (_req, res) => {
    try {
        const shops = await Shop_js_1.default.find({
            isActive: true,
            isVerified: true
        })
            .populate('owner', 'firstName lastName')
            .populate('categories', 'name slug')
            .sort({ rating: -1, name: 1 })
            .limit(10);
        res.json({
            success: true,
            data: shops
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
});
exports.default = router;
//# sourceMappingURL=shops.js.map