const express = require('express');
const router = express.Router();
import { body, validationResult } from 'express-validator';
import Order, { IOrder } from '../models/Order.js';
import Product from '../models/Product.js';
import Shop from '../models/Shop.js';
import { authenticateToken, requirePermission } from '../middleware/auth.js';
import { AuthRequest, AuthResponse, PaginatedResponse, ApiResponse } from '../types/routes.js';

interface OrderQuery {
  page?: string;
  limit?: string;
  status?: string;
  shop?: string;
  customer?: string;
  startDate?: string;
  endDate?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

interface OrderStats {
  totalOrders: number;
  totalRevenue: number;
  averageOrderValue: number;
  pendingOrders: number;
  confirmedOrders: number;
  processingOrders: number;
  shippedOrders: number;
  deliveredOrders: number;
  cancelledOrders: number;
}

type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
type UserRole = 'superadmin' | 'admin' | 'user' | 'staff' | 'shop_owner' | 'customer';

interface ValidTransitions {
  [key: string]: OrderStatus[];
}

// Get all orders
router.get('/', authenticateToken, async (req: AuthRequest, res: AuthResponse) => {
  try {
    const { 
      page = '1', 
      limit = '10', 
      status, 
      shop, 
      customer,
      startDate,
      endDate,
      sortBy = 'createdAt', 
      sortOrder = 'desc' 
    } = req.query as OrderQuery;
    
    const query: any = {};
    
    if (status) query.status = status;
    if (shop) query.shop = shop;
    if (customer) query.customer = customer;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    // Filter by user role
    if ((req.user?.role as UserRole) === 'shop_owner') {
      const userShops = await Shop.find({ owner: req.user?._id }).select('_id');
      const shopIds = userShops.map(shop => shop._id);
      query.shop = { $in: shopIds };
    } else if ((req.user?.role as UserRole) === 'customer') {
      query.customer = req.user?._id;
    }

    const sortOptions: { [key: string]: 1 | -1 } = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    const orders = await Order.find(query)
      .populate('customer', 'firstName lastName email phone')
      .populate('shop', 'name logo')
      .populate('items.product', 'name price images')
      .sort(sortOptions)
      .limit(limitNum)
      .skip((pageNum - 1) * limitNum)
      .exec();

    const total = await Order.countDocuments(query);

    const response: PaginatedResponse<IOrder[]> = {
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
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Get order by ID
router.get('/:id', authenticateToken, async (req: AuthRequest, res: AuthResponse) => {
  try {
    const order = await Order.findById(req.params.id)
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
    if ((req.user?.role as UserRole) === 'customer' && order.customer && order.customer._id.toString() !== req.user?._id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    if ((req.user?.role as UserRole) === 'shop_owner') {
      const shop = await Shop.findById(order.shop?._id);
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
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
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
], async (req: AuthRequest, res: AuthResponse) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { items, shop, ...orderData } = req.body;

    // Check if shop exists
    const shopExists = await Shop.findById(shop);
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
      const product = await Product.findById(item.product);
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

      if ((product as any).inventory.quantity < item.quantity) {
        return res.status(400).json({
          success: false,
          error: `Insufficient stock for ${product.name}. Available: ${(product as any).inventory.quantity}`
        });
      }

      const itemTotal = (product as any).price.regular * item.quantity;
      subtotal += itemTotal;

      orderItems.push({
        product: product._id,
        quantity: item.quantity,
        price: (product as any).price.regular,
        total: itemTotal
      });
    }

    // Calculate totals
    const tax = subtotal * 0.18; // 18% GST
    const shipping = subtotal > 1000 ? 0 : 100; // Free shipping above ₹1000
    const totalAmount = subtotal + tax + shipping;

    const order = new Order({
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
      await Product.findByIdAndUpdate(item.product, {
        $inc: { 'inventory.quantity': -item.quantity }
      });
    }

    const populatedOrder = await Order.findById(order._id)
      .populate('customer', 'firstName lastName email')
      .populate('shop', 'name logo')
      .populate('items.product', 'name price images');

    res.status(201).json({
      success: true,
      data: populatedOrder
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Update order status
router.patch('/:id/status', [
  authenticateToken,
  requirePermission('order:write'),
  body('status').isIn(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled']).withMessage('Invalid status'),
  body('notes').optional().trim().isLength({ max: 500 }).withMessage('Notes must be less than 500 characters'),
], async (req: AuthRequest, res: AuthResponse) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    // Check if user has permission to update this order
    if ((req.user?.role as UserRole) === 'shop_owner') {
      const shop = await Shop.findById(order.shop);
      if (!shop || shop.owner.toString() !== req.user?._id.toString()) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }
    }

    const oldStatus = order.status;
    const newStatus = req.body.status as OrderStatus;

    // Validate status transition
    const validTransitions: ValidTransitions = {
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

    res.json({
      success: true,
      data: updatedOrder
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Cancel order (customer only)
router.patch('/:id/cancel', authenticateToken, async (req: AuthRequest, res: AuthResponse) => {
  try {
    const order = await Order.findById(req.params.id);
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
      await Product.findByIdAndUpdate(item.product, {
        $inc: { 'inventory.quantity': item.quantity }
      });
    }

    await order.updateStatus('cancelled', 'Cancelled by customer');

    res.json({
      success: true,
      message: 'Order cancelled successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Get order statistics
router.get('/stats/overview', authenticateToken, async (req: AuthRequest, res: AuthResponse) => {
  try {
    const { startDate, endDate } = req.query as OrderQuery;
    
    const query: any = {};
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    // Filter by user role
    if ((req.user?.role as UserRole) === 'shop_owner') {
      const userShops = await Shop.find({ owner: req.user?._id }).select('_id');
      const shopIds = userShops.map(shop => shop._id);
      query.shop = { $in: shopIds };
    } else if ((req.user?.role as UserRole) === 'customer') {
      query.customer = req.user?._id;
    }

    const stats = await Order.aggregate<OrderStats>([
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
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

export default router;
