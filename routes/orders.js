const express = require('express');
const { body, validationResult } = require('express-validator');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Shop = require('../models/Shop');
const { authenticateToken, requirePermission } = require('../middleware/auth');

const router = express.Router();

// Get all orders
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      status, 
      shop, 
      customer,
      startDate,
      endDate,
      sortBy = 'createdAt', 
      sortOrder = 'desc' 
    } = req.query;
    
    const query = {};
    
    if (status) query.status = status;
    if (shop) query.shop = shop;
    if (customer) query.customer = customer;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    // Filter by user role
    if (req.user.role === 'shop_owner') {
      const userShops = await Shop.find({ owner: req.user._id }).select('_id');
      const shopIds = userShops.map(shop => shop._id);
      query.shop = { $in: shopIds };
    } else if (req.user.role === 'customer') {
      query.customer = req.user._id;
    }

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const orders = await Order.find(query)
      .populate('customer', 'firstName lastName email phone')
      .populate('shop', 'name logo')
      .populate('items.product', 'name price images')
      .sort(sortOptions)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const total = await Order.countDocuments(query);

    res.json({
      orders,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get order by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('customer', 'firstName lastName email phone address')
      .populate('shop', 'name logo contactInfo')
      .populate('items.product', 'name price images description');
    
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Check if user has access to this order
    if (req.user.role === 'customer' && order.customer._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (req.user.role === 'shop_owner') {
      const shop = await Shop.findById(order.shop._id);
      if (!shop || shop.owner.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    res.json(order);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create new order
router.post('/', [
  authenticateToken,
  requirePermission('order:write'),
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.product').isMongoId().withMessage('Valid product ID is required'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('shop').isMongoId().withMessage('Valid shop ID is required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { items, shop, ...orderData } = req.body;

    // Check if shop exists
    const shopExists = await Shop.findById(shop);
    if (!shopExists) {
      return res.status(404).json({ message: 'Shop not found' });
    }

    // Validate products and check inventory
    const orderItems = [];
    let subtotal = 0;

    for (const item of items) {
      const product = await Product.findById(item.product);
      if (!product) {
        return res.status(404).json({ message: `Product ${item.product} not found` });
      }

      if (!product.isActive) {
        return res.status(400).json({ message: `Product ${product.name} is not available` });
      }

      if (product.inventory.quantity < item.quantity) {
        return res.status(400).json({ 
          message: `Insufficient stock for ${product.name}. Available: ${product.inventory.quantity}` 
        });
      }

      const itemTotal = product.price * item.quantity;
      subtotal += itemTotal;

      orderItems.push({
        product: product._id,
        quantity: item.quantity,
        price: product.price,
        total: itemTotal
      });
    }

    // Calculate totals
    const tax = subtotal * 0.18; // 18% GST
    const shipping = subtotal > 1000 ? 0 : 100; // Free shipping above ₹1000
    const totalAmount = subtotal + tax + shipping;

    const order = new Order({
      customer: req.user._id,
      shop,
      items: orderItems,
      subtotal,
      tax,
      shipping,
      totalAmount,
      ...orderData
    });

    await order.save();

    // Update inventory
    for (const item of items) {
      await Product.findByIdAndUpdate(item.product, {
        $inc: { 'inventory.quantity': -item.quantity }
      });
    }

    const populatedOrder = await Order.findById(order._id)
      .populate('customer', 'firstName lastName email')
      .populate('shop', 'name logo')
      .populate('items.product', 'name price images');

    res.status(201).json(populatedOrder);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update order status
router.patch('/:id/status', [
  authenticateToken,
  requirePermission('order:write'),
  body('status').isIn(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled']).withMessage('Invalid status'),
  body('notes').optional().trim().isLength({ max: 500 }).withMessage('Notes must be less than 500 characters'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Check if user has permission to update this order
    if (req.user.role === 'shop_owner') {
      const shop = await Shop.findById(order.shop);
      if (!shop || shop.owner.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Access denied' });
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
        message: `Invalid status transition from ${oldStatus} to ${newStatus}` 
      });
    }

    // Handle cancellation - restore inventory
    if (newStatus === 'cancelled' && oldStatus !== 'cancelled') {
      for (const item of order.items) {
        await Product.findByIdAndUpdate(item.product, {
          $inc: { 'inventory.quantity': item.quantity }
        });
      }
    }

    await order.updateStatus(newStatus, req.body.notes);

    const updatedOrder = await Order.findById(order._id)
      .populate('customer', 'firstName lastName email')
      .populate('shop', 'name logo')
      .populate('items.product', 'name price images');

    res.json(updatedOrder);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Cancel order (customer only)
router.patch('/:id/cancel', authenticateToken, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Only customer can cancel their own order
    if (order.customer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Only pending orders can be cancelled
    if (order.status !== 'pending') {
      return res.status(400).json({ message: 'Only pending orders can be cancelled' });
    }

    // Restore inventory
    for (const item of order.items) {
      await Product.findByIdAndUpdate(item.product, {
        $inc: { 'inventory.quantity': item.quantity }
      });
    }

    await order.updateStatus('cancelled', 'Cancelled by customer');

    res.json({ message: 'Order cancelled successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get order statistics
router.get('/stats/overview', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const query = {};
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    // Filter by user role
    if (req.user.role === 'shop_owner') {
      const userShops = await Shop.find({ owner: req.user._id }).select('_id');
      const shopIds = userShops.map(shop => shop._id);
      query.shop = { $in: shopIds };
    } else if (req.user.role === 'customer') {
      query.customer = req.user._id;
    }

    const stats = await Order.aggregate([
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

    res.json(stats[0] || {
      totalOrders: 0,
      totalRevenue: 0,
      averageOrderValue: 0,
      pendingOrders: 0,
      confirmedOrders: 0,
      processingOrders: 0,
      shippedOrders: 0,
      deliveredOrders: 0,
      cancelledOrders: 0
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router; 