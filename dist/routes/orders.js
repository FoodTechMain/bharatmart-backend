"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express = require('express');
const router = express.Router();
const express_validator_1 = require("express-validator");
const Order_js_1 = __importDefault(require("../models/Order.js"));
const Product_js_1 = __importDefault(require("../models/Product.js"));
const Shop_js_1 = __importDefault(require("../models/Shop.js"));
const auth_js_1 = require("../middleware/auth.js");
// Get all orders
router.get('/', auth_js_1.authenticateToken, async (req, res) => {
    try {
        const { page = '1', limit = '10', status, shop, customer, startDate, endDate, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
        const query = {};
        if (status)
            query.status = status;
        if (shop)
            query.shop = shop;
        if (customer)
            query.customer = customer;
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate)
                query.createdAt.$gte = new Date(startDate);
            if (endDate)
                query.createdAt.$lte = new Date(endDate);
        }
        // Filter by user role
        if (req.user?.role === 'shop_owner') {
            const userShops = await Shop_js_1.default.find({ owner: req.user?._id }).select('_id');
            const shopIds = userShops.map(shop => shop._id);
            query.shop = { $in: shopIds };
        }
        else if (req.user?.role === 'customer') {
            query.customer = req.user?._id;
        }
        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const orders = await Order_js_1.default.find(query)
            .populate('customer', 'firstName lastName email phone')
            .populate('shop', 'name logo')
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
// Get order by ID
router.get('/:id', auth_js_1.authenticateToken, async (req, res) => {
    try {
        const order = await Order_js_1.default.findById(req.params.id)
            .populate('customer', 'firstName lastName email phone address')
            .populate('shop', 'name logo contactInfo')
            .populate('items.product', 'name price images description');
        if (!order) {
            return res.status(404).json({
                success: false,
                error: 'Order not found'
            });
        }
        // Check if user has access to this order
        if (req.user?.role === 'customer' && order.customer && order.customer._id.toString() !== req.user?._id.toString()) {
            return res.status(403).json({
                success: false,
                error: 'Access denied'
            });
        }
        if (req.user?.role === 'shop_owner') {
            const shop = await Shop_js_1.default.findById(order.shop?._id);
            if (!shop || shop.owner.toString() !== req.user?._id.toString()) {
                return res.status(403).json({
                    success: false,
                    error: 'Access denied'
                });
            }
        }
        res.json({
            success: true,
            data: order
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
// Create new order
router.post('/', [
    auth_js_1.authenticateToken,
    (0, auth_js_1.requirePermission)('order:write'),
    (0, express_validator_1.body)('items').isArray({ min: 1 }).withMessage('At least one item is required'),
    (0, express_validator_1.body)('items.*.product').isMongoId().withMessage('Valid product ID is required'),
    (0, express_validator_1.body)('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
    (0, express_validator_1.body)('shop').isMongoId().withMessage('Valid shop ID is required'),
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
        const { items, shop, ...orderData } = req.body;
        // Check if shop exists
        const shopExists = await Shop_js_1.default.findById(shop);
        if (!shopExists) {
            return res.status(404).json({
                success: false,
                error: 'Shop not found'
            });
        }
        // Validate products and check inventory
        const orderItems = [];
        let subtotal = 0;
        for (const item of items) {
            const product = await Product_js_1.default.findById(item.product);
            if (!product) {
                return res.status(404).json({
                    success: false,
                    error: `Product ${item.product} not found`
                });
            }
            if (!product.isActive) {
                return res.status(400).json({
                    success: false,
                    error: `Product ${product.name} is not available`
                });
            }
            if (product.inventory.quantity < item.quantity) {
                return res.status(400).json({
                    success: false,
                    error: `Insufficient stock for ${product.name}. Available: ${product.inventory.quantity}`
                });
            }
            const itemTotal = product.price.regular * item.quantity;
            subtotal += itemTotal;
            orderItems.push({
                product: product._id,
                quantity: item.quantity,
                price: product.price.regular,
                total: itemTotal
            });
        }
        // Calculate totals
        const tax = subtotal * 0.18; // 18% GST
        const shipping = subtotal > 1000 ? 0 : 100; // Free shipping above ₹1000
        const totalAmount = subtotal + tax + shipping;
        const order = new Order_js_1.default({
            customer: req.user?._id,
            shop,
            items: orderItems,
            subtotal,
            tax: { amount: tax, rate: 18 },
            shipping: { cost: shipping, method: 'standard' },
            totalAmount,
            ...orderData
        });
        await order.save();
        // Update inventory
        for (const item of items) {
            await Product_js_1.default.findByIdAndUpdate(item.product, {
                $inc: { 'inventory.quantity': -item.quantity }
            });
        }
        const populatedOrder = await Order_js_1.default.findById(order._id)
            .populate('customer', 'firstName lastName email')
            .populate('shop', 'name logo')
            .populate('items.product', 'name price images');
        res.status(201).json({
            success: true,
            data: populatedOrder
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
// Update order status
router.patch('/:id/status', [
    auth_js_1.authenticateToken,
    (0, auth_js_1.requirePermission)('order:write'),
    (0, express_validator_1.body)('status').isIn(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled']).withMessage('Invalid status'),
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
        const order = await Order_js_1.default.findById(req.params.id);
        if (!order) {
            return res.status(404).json({
                success: false,
                error: 'Order not found'
            });
        }
        // Check if user has permission to update this order
        if (req.user?.role === 'shop_owner') {
            const shop = await Shop_js_1.default.findById(order.shop);
            if (!shop || shop.owner.toString() !== req.user?._id.toString()) {
                return res.status(403).json({
                    success: false,
                    error: 'Access denied'
                });
            }
        }
        const oldStatus = order.status;
        const newStatus = req.body.status;
        // Validate status transition
        const validTransitions = {
            pending: ['confirmed', 'cancelled'],
            confirmed: ['processing', 'cancelled'],
            processing: ['shipped', 'cancelled'],
            shipped: ['delivered'],
            delivered: [],
            cancelled: []
        };
        if (!validTransitions[oldStatus].includes(newStatus)) {
            return res.status(400).json({
                success: false,
                error: `Invalid status transition from ${oldStatus} to ${newStatus}`
            });
        }
        // Handle cancellation - restore inventory
        if (newStatus === 'cancelled' && oldStatus !== 'cancelled') {
            for (const item of order.items) {
                await Product_js_1.default.findByIdAndUpdate(item.product, {
                    $inc: { 'inventory.quantity': item.quantity }
                });
            }
        }
        await order.updateStatus(newStatus, req.body.notes);
        const updatedOrder = await Order_js_1.default.findById(order._id)
            .populate('customer', 'firstName lastName email')
            .populate('shop', 'name logo')
            .populate('items.product', 'name price images');
        res.json({
            success: true,
            data: updatedOrder
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
// Cancel order (customer only)
router.patch('/:id/cancel', auth_js_1.authenticateToken, async (req, res) => {
    try {
        const order = await Order_js_1.default.findById(req.params.id);
        if (!order) {
            return res.status(404).json({
                success: false,
                error: 'Order not found'
            });
        }
        // Only customer can cancel their own order
        if (!order.customer || order.customer.toString() !== req.user?._id.toString()) {
            return res.status(403).json({
                success: false,
                error: 'Access denied'
            });
        }
        // Only pending orders can be cancelled
        if (order.status !== 'pending') {
            return res.status(400).json({
                success: false,
                error: 'Only pending orders can be cancelled'
            });
        }
        // Restore inventory
        for (const item of order.items) {
            await Product_js_1.default.findByIdAndUpdate(item.product, {
                $inc: { 'inventory.quantity': item.quantity }
            });
        }
        await order.updateStatus('cancelled', 'Cancelled by customer');
        res.json({
            success: true,
            message: 'Order cancelled successfully'
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
// Get order statistics
router.get('/stats/overview', auth_js_1.authenticateToken, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const query = {};
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate)
                query.createdAt.$gte = new Date(startDate);
            if (endDate)
                query.createdAt.$lte = new Date(endDate);
        }
        // Filter by user role
        if (req.user?.role === 'shop_owner') {
            const userShops = await Shop_js_1.default.find({ owner: req.user?._id }).select('_id');
            const shopIds = userShops.map(shop => shop._id);
            query.shop = { $in: shopIds };
        }
        else if (req.user?.role === 'customer') {
            query.customer = req.user?._id;
        }
        const stats = await Order_js_1.default.aggregate([
            { $match: query },
            {
                $group: {
                    _id: null,
                    totalOrders: { $sum: 1 },
                    totalRevenue: { $sum: '$totalAmount' },
                    averageOrderValue: { $avg: '$totalAmount' },
                    pendingOrders: {
                        $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
                    },
                    confirmedOrders: {
                        $sum: { $cond: [{ $eq: ['$status', 'confirmed'] }, 1, 0] }
                    },
                    processingOrders: {
                        $sum: { $cond: [{ $eq: ['$status', 'processing'] }, 1, 0] }
                    },
                    shippedOrders: {
                        $sum: { $cond: [{ $eq: ['$status', 'shipped'] }, 1, 0] }
                    },
                    deliveredOrders: {
                        $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] }
                    },
                    cancelledOrders: {
                        $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
                    }
                }
            }
        ]);
        res.json({
            success: true,
            data: stats[0] || {
                totalOrders: 0,
                totalRevenue: 0,
                averageOrderValue: 0,
                pendingOrders: 0,
                confirmedOrders: 0,
                processingOrders: 0,
                shippedOrders: 0,
                deliveredOrders: 0,
                cancelledOrders: 0
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
exports.default = router;
//# sourceMappingURL=orders.js.map