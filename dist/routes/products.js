"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express = require('express');
const router = express.Router();
const express_validator_1 = require("express-validator");
const mongoose_1 = require("mongoose");
const auth_js_1 = require("../middleware/auth.js");
const Product_js_1 = __importDefault(require("../models/Product.js"));
const Manufacturer_js_1 = __importDefault(require("../models/Manufacturer.js"));
const ProductCategory_js_1 = __importDefault(require("../models/ProductCategory.js"));
// Get all products
router.get('/', auth_js_1.authenticateToken, async (req, res) => {
    try {
        const { page = '1', limit = '10', category, manufacturer, search, minPrice, maxPrice, inStock, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
        const query = { isActive: true };
        if (category)
            query.category = category;
        if (manufacturer)
            query.manufacturer = manufacturer;
        if (minPrice || maxPrice) {
            query.price = {};
            if (minPrice)
                query.price.$gte = parseFloat(minPrice);
            if (maxPrice)
                query.price.$lte = parseFloat(maxPrice);
        }
        if (inStock === 'true')
            query['inventory.quantity'] = { $gt: 0 };
        if (inStock === 'false')
            query['inventory.quantity'] = { $lte: 0 };
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
            .sort(sortOptions)
            .limit(limitNum)
            .skip((pageNum - 1) * limitNum)
            .populate('manufacturer')
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
// Get product by ID
router.get('/:id', auth_js_1.authenticateToken, async (req, res) => {
    try {
        const product = await Product_js_1.default.findById(req.params.id);
        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'Product not found'
            });
        }
        // Increment view count
        await product.incrementViews();
        res.json({
            success: true,
            data: product
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
// Create new product
router.post('/', [
    auth_js_1.authenticateToken,
    (0, auth_js_1.requirePermission)('product:write'),
    (0, express_validator_1.body)('name').trim().isLength({ min: 3 }).withMessage('Product name must be at least 3 characters'),
    (0, express_validator_1.body)('category').trim().isLength({ min: 1 }).withMessage('Category is required'),
    (0, express_validator_1.body)('manufacturer').custom((val, { req }) => {
        if (!val && !req.body.customManufacturer) {
            throw new Error('Manufacturer is required');
        }
        return true;
    }),
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
        console.log('POST /api/products payload:', JSON.stringify(req.body, null, 2));
        const payload = { ...req.body };
        // Normalize manufacturer if object
        if (payload.manufacturer && typeof payload.manufacturer === 'object') {
            if (payload.manufacturer._id)
                payload.manufacturer = String(payload.manufacturer._id);
            else if (payload.manufacturer.name)
                payload.manufacturer = String(payload.manufacturer.name);
            else
                payload.manufacturer = '';
        }
        // Normalize numeric fields and defaults
        payload.mrp = payload.mrp !== undefined ? Number(payload.mrp) : 0;
        payload.price = payload.price || {};
        payload.price.regular = payload.price.regular !== undefined ? Number(payload.price.regular) : payload.mrp || 0;
        if (payload.price.sale !== undefined)
            payload.price.sale = Number(payload.price.sale);
        if (payload.price.cost !== undefined)
            payload.price.cost = Number(payload.price.cost);
        if (payload.price.wholesale !== undefined)
            payload.price.wholesale = Number(payload.price.wholesale);
        // Weight default
        if (!payload.weight || typeof payload.weight !== 'object') {
            payload.weight = { value: 0, unit: 'g' };
        }
        else {
            payload.weight.value = Number(payload.weight.value || 0);
            payload.weight.unit = payload.weight.unit || 'g';
        }
        // Inventory defaults
        payload.inventory = payload.inventory || {};
        payload.inventory.quantity = payload.inventory.quantity !== undefined ? Number(payload.inventory.quantity) : 0;
        payload.inventory.lowStockThreshold = payload.inventory.lowStockThreshold !== undefined ? Number(payload.inventory.lowStockThreshold) : 10;
        payload.inventory.trackInventory = payload.inventory.trackInventory !== undefined ? !!payload.inventory.trackInventory : true;
        // Ensure required string fields have safe defaults
        if (payload.description === undefined || payload.description === null)
            payload.description = '';
        if (payload.batchNo !== undefined && payload.batchNo !== null)
            payload.batchNo = String(payload.batchNo).trim();
        // If manufacturer is a name (not an ObjectId), upsert and replace with _id
        if (payload.manufacturer && !mongoose_1.Types.ObjectId.isValid(payload.manufacturer)) {
            const name = String(payload.manufacturer).trim();
            let existing = await Manufacturer_js_1.default.findOne({ name });
            if (!existing) {
                existing = new Manufacturer_js_1.default({
                    name,
                    contactPerson: 'Default Contact',
                    phone: '0000000000',
                    email: 'default@example.com'
                });
                await existing.save();
            }
            payload.manufacturer = existing._id;
        }
        // Ensure product category exists
        if (payload.category) {
            await ProductCategory_js_1.default.updateOne({ name: payload.category }, { name: payload.category }, { upsert: true });
        }
        // Ensure SKU uniqueness
        if (payload.sku) {
            const existingSku = await Product_js_1.default.findOne({ sku: payload.sku }).collation({ locale: 'en', strength: 2 });
            if (existingSku) {
                return res.status(400).json({
                    success: false,
                    error: 'SKU must be unique. Another product with this SKU already exists.'
                });
            }
        }
        const product = new Product_js_1.default(payload);
        await product.save();
        res.status(201).json({
            success: true,
            data: product
        });
    }
    catch (error) {
        console.error('POST /api/products error:', error);
        if (error.errors && error.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                error: 'Validation error',
                details: error.message
            });
        }
        if (error.code === 11000) {
            const dupKey = Object.keys(error.keyValue || {})[0] || 'field';
            return res.status(409).json({
                success: false,
                error: `${dupKey} already exists and must be unique.`
            });
        }
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: process.env.NODE_ENV === 'development' ? error.stack : error.message
        });
    }
});
// Update product
router.put('/:id', [
    auth_js_1.authenticateToken,
    (0, auth_js_1.requirePermission)('product:write'),
    (0, express_validator_1.body)('name').optional().trim().isLength({ min: 3 }).withMessage('Product name must be at least 3 characters'),
    (0, express_validator_1.body)('category').optional().isString(),
    (0, express_validator_1.body)('manufacturer').optional().trim(),
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
        console.log('PUT /api/products payload:', JSON.stringify(req.body, null, 2));
        // If manufacturer provided as name, upsert and replace with id
        if (req.body.manufacturer && !mongoose_1.Types.ObjectId.isValid(req.body.manufacturer)) {
            const name = req.body.manufacturer.trim();
            let existing = await Manufacturer_js_1.default.findOne({ name });
            if (!existing) {
                existing = new Manufacturer_js_1.default({ name });
                await existing.save();
            }
            req.body.manufacturer = existing._id;
        }
        // Ensure category exists
        if (req.body.category) {
            await ProductCategory_js_1.default.updateOne({ name: req.body.category }, { name: req.body.category }, { upsert: true });
        }
        // Normalize fields
        if (req.body.batchNo !== undefined && req.body.batchNo !== null)
            req.body.batchNo = String(req.body.batchNo).trim();
        if (req.body.price) {
            if (req.body.price.retail !== undefined)
                req.body.price.retail = Number(req.body.price.retail);
            if (req.body.price.wholesale !== undefined)
                req.body.price.wholesale = Number(req.body.price.wholesale);
        }
        // Check SKU uniqueness
        if (req.body.sku) {
            const existing = await Product_js_1.default.findOne({ sku: req.body.sku }).collation({ locale: 'en', strength: 2 });
            if (existing && String(existing._id) !== String(req.params.id)) {
                return res.status(400).json({
                    success: false,
                    error: 'SKU must be unique. Another product with this SKU already exists.'
                });
            }
        }
        const product = await Product_js_1.default.findById(req.params.id);
        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'Product not found'
            });
        }
        Object.assign(product, req.body);
        await product.save();
        res.json({
            success: true,
            data: product
        });
    }
    catch (error) {
        console.error('PUT /api/products error:', error);
        if (error.code === 11000) {
            const dupKey = Object.keys(error.keyValue || {})[0] || 'field';
            return res.status(409).json({
                success: false,
                error: `${dupKey} already exists and must be unique.`
            });
        }
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: process.env.NODE_ENV === 'development' ? error.stack : error.message
        });
    }
});
// Delete product
router.delete('/:id', auth_js_1.authenticateToken, (0, auth_js_1.requirePermission)('product:delete'), async (req, res) => {
    try {
        const product = await Product_js_1.default.findById(req.params.id);
        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'Product not found'
            });
        }
        await Product_js_1.default.findByIdAndDelete(req.params.id);
        res.json({
            success: true,
            message: 'Product deleted successfully'
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
// Toggle product active status
router.patch('/:id/toggle-status', auth_js_1.authenticateToken, (0, auth_js_1.requirePermission)('product:write'), async (req, res) => {
    try {
        const product = await Product_js_1.default.findById(req.params.id);
        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'Product not found'
            });
        }
        product.isActive = !product.isActive;
        await product.save();
        res.json({
            success: true,
            message: `Product ${product.isActive ? 'activated' : 'deactivated'} successfully`,
            data: { isActive: product.isActive }
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
// Toggle product featured status
router.patch('/:id/toggle-featured', auth_js_1.authenticateToken, (0, auth_js_1.requirePermission)('product:write'), async (req, res) => {
    try {
        const product = await Product_js_1.default.findById(req.params.id);
        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'Product not found'
            });
        }
        product.isFeatured = !product.isFeatured;
        await product.save();
        res.json({
            success: true,
            message: `Product ${product.isFeatured ? 'featured' : 'unfeatured'} successfully`,
            data: { isFeatured: product.isFeatured }
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
// Get featured products
router.get('/featured/list', async (_req, res) => {
    try {
        const products = await Product_js_1.default.find({
            isActive: true,
            isFeatured: true
        })
            .populate('shop', 'name logo')
            .populate('category', 'name')
            .sort({ createdAt: -1 })
            .limit(10);
        res.json({
            success: true,
            data: products
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
// Get product statistics
router.get('/stats/overview', auth_js_1.authenticateToken, (0, auth_js_1.requirePermission)('product:read'), async (_req, res) => {
    try {
        const stats = await Product_js_1.default.aggregate([
            {
                $group: {
                    _id: null,
                    totalProducts: { $sum: 1 },
                    activeProducts: { $sum: { $cond: ['$isActive', 1, 0] } },
                    featuredProducts: { $sum: { $cond: ['$isFeatured', 1, 0] } },
                    onSaleProducts: { $sum: { $cond: ['$isOnSale', 1, 0] } },
                    outOfStockProducts: { $sum: { $cond: [{ $lte: ['$inventory.quantity', 0] }, 1, 0] } },
                    lowStockProducts: { $sum: { $cond: [{ $and: [{ $gt: ['$inventory.quantity', 0] }, { $lte: ['$inventory.quantity', '$inventory.lowStockThreshold'] }] }, 1, 0] } },
                    totalViews: { $sum: '$stats.views' },
                    totalSales: { $sum: '$stats.sales' },
                    totalRevenue: { $sum: '$stats.revenue' }
                }
            }
        ]);
        res.json({
            success: true,
            data: stats[0] || {
                totalProducts: 0,
                activeProducts: 0,
                featuredProducts: 0,
                onSaleProducts: 0,
                outOfStockProducts: 0,
                lowStockProducts: 0,
                totalViews: 0,
                totalSales: 0,
                totalRevenue: 0
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
// Bulk update product status
router.patch('/bulk/status', auth_js_1.authenticateToken, (0, auth_js_1.requirePermission)('product:write'), async (req, res) => {
    try {
        const { productIds, isActive } = req.body;
        if (!Array.isArray(productIds) || productIds.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Product IDs array is required'
            });
        }
        const result = await Product_js_1.default.updateMany({ _id: { $in: productIds } }, { isActive });
        res.json({
            success: true,
            message: `${result.modifiedCount} products ${isActive ? 'activated' : 'deactivated'} successfully`,
            data: { modifiedCount: result.modifiedCount }
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
// Get products by category
router.get('/category/:categoryId', auth_js_1.authenticateToken, async (req, res) => {
    try {
        const { page = '1', limit = '10', sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
        const query = {
            category: req.params.categoryId,
            isActive: true
        };
        const sortOptions = {};
        sortOptions[sortBy || 'createdAt'] = sortOrder === 'desc' ? -1 : 1;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const products = await Product_js_1.default.find(query)
            .populate('shop', 'name logo')
            .populate('category', 'name')
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
exports.default = router;
//# sourceMappingURL=products.js.map