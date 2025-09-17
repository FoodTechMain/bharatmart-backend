const express = require('express');
const { body, validationResult } = require('express-validator');
const Shop = require('../models/Shop');
const User = require('../models/User');
const Category = require('../models/Category');
const { authenticateToken, requireSuperAdmin, requireShopOwnership } = require('../middleware/auth');

const router = express.Router();

// Get all shops
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      owner, 
      category,
      isVerified,
      isActive,
      search,
      sortBy = 'createdAt', 
      sortOrder = 'desc' 
    } = req.query;
    
    const query = {};
    
    if (owner) query.owner = owner;
    if (category) query.categories = category;
    if (isVerified !== undefined) query.isVerified = isVerified === 'true';
    if (isActive !== undefined) query.isActive = isActive === 'true';
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    // Filter by user role
    if (req.user.role === 'shop_owner') {
      query.owner = req.user._id;
    }

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const shops = await Shop.find(query)
      .populate('owner', 'firstName lastName email phone')
      .populate('categories', 'name slug')
      .sort(sortOptions)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const total = await Shop.countDocuments(query);

    res.json({
      shops,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get shop by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const shop = await Shop.findById(req.params.id)
      .populate('owner', 'firstName lastName email phone address')
      .populate('categories', 'name slug description');
    
    if (!shop) {
      return res.status(404).json({ message: 'Shop not found' });
    }

    // Check if user has access to this shop
    if (req.user.role === 'shop_owner' && shop.owner._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(shop);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create new shop
router.post('/', [
  authenticateToken,
  body('name').trim().isLength({ min: 3 }).withMessage('Shop name must be at least 3 characters'),
  body('description').trim().isLength({ min: 10 }).withMessage('Description must be at least 10 characters'),
  body('categories').isArray({ min: 1 }).withMessage('At least one category is required'),
  body('categories.*').isMongoId().withMessage('Valid category ID is required'),
  body('contactInfo.email').optional().isEmail().withMessage('Valid email is required'),
  body('contactInfo.phone').optional().isMobilePhone().withMessage('Valid phone number is required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { categories, ...shopData } = req.body;

    // Check if categories exist
    const categoryIds = await Category.find({ _id: { $in: categories } }).select('_id');
    if (categoryIds.length !== categories.length) {
      return res.status(400).json({ message: 'One or more categories not found' });
    }

    // Check if user already has a shop (for shop_owner role)
    if (req.user.role === 'shop_owner') {
      const existingShop = await Shop.findOne({ owner: req.user._id });
      if (existingShop) {
        return res.status(400).json({ message: 'You already have a shop registered' });
      }
    }

    const shop = new Shop({
      ...shopData,
      owner: req.user._id,
      categories: categoryIds.map(cat => cat._id)
    });

    await shop.save();

    const populatedShop = await Shop.findById(shop._id)
      .populate('owner', 'firstName lastName email')
      .populate('categories', 'name slug');

    res.status(201).json(populatedShop);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update shop
router.put('/:id', [
  authenticateToken,
  body('name').optional().trim().isLength({ min: 3 }).withMessage('Shop name must be at least 3 characters'),
  body('description').optional().trim().isLength({ min: 10 }).withMessage('Description must be at least 10 characters'),
  body('categories').optional().isArray({ min: 1 }).withMessage('At least one category is required'),
  body('categories.*').optional().isMongoId().withMessage('Valid category ID is required'),
  body('contactInfo.email').optional().isEmail().withMessage('Valid email is required'),
  body('contactInfo.phone').optional().isMobilePhone().withMessage('Valid phone number is required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const shop = await Shop.findById(req.params.id);
    if (!shop) {
      return res.status(404).json({ message: 'Shop not found' });
    }

    // Check if user has permission to update this shop
    if (req.user.role === 'shop_owner' && shop.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { categories, ...updateData } = req.body;

    // Check if categories exist
    if (categories) {
      const categoryIds = await Category.find({ _id: { $in: categories } }).select('_id');
      if (categoryIds.length !== categories.length) {
        return res.status(400).json({ message: 'One or more categories not found' });
      }
      updateData.categories = categoryIds.map(cat => cat._id);
    }

    Object.assign(shop, updateData);
    await shop.save();

    const updatedShop = await Shop.findById(shop._id)
      .populate('owner', 'firstName lastName email')
      .populate('categories', 'name slug');

    res.json(updatedShop);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete shop (Superadmin only)
router.delete('/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const shop = await Shop.findById(req.params.id);
    if (!shop) {
      return res.status(404).json({ message: 'Shop not found' });
    }

    // Check if shop has products
    const Product = require('../models/Product');
    const productsCount = await Product.countDocuments({ shop: req.params.id });
    if (productsCount > 0) {
      return res.status(400).json({ 
        message: `Cannot delete shop with ${productsCount} products. Please delete products first.` 
      });
    }

    // Check if shop has orders
    const Order = require('../models/Order');
    const ordersCount = await Order.countDocuments({ shop: req.params.id });
    if (ordersCount > 0) {
      return res.status(400).json({ 
        message: `Cannot delete shop with ${ordersCount} orders. Please handle orders first.` 
      });
    }

    await Shop.findByIdAndDelete(req.params.id);
    res.json({ message: 'Shop deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Toggle shop active status
router.patch('/:id/toggle-status', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const shop = await Shop.findById(req.params.id);
    if (!shop) {
      return res.status(404).json({ message: 'Shop not found' });
    }

    shop.isActive = !shop.isActive;
    await shop.save();

    res.json({ 
      message: `Shop ${shop.isActive ? 'activated' : 'deactivated'} successfully`,
      isActive: shop.isActive 
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Toggle shop verification status (Superadmin only)
router.patch('/:id/toggle-verification', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const shop = await Shop.findById(req.params.id);
    if (!shop) {
      return res.status(404).json({ message: 'Shop not found' });
    }

    shop.isVerified = !shop.isVerified;
    shop.verificationStatus = shop.isVerified ? 'verified' : 'pending';
    await shop.save();

    res.json({ 
      message: `Shop ${shop.isVerified ? 'verified' : 'unverified'} successfully`,
      isVerified: shop.isVerified,
      verificationStatus: shop.verificationStatus
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update shop verification status (Superadmin only)
router.patch('/:id/verification-status', [
  authenticateToken,
  requireSuperAdmin,
  body('status').isIn(['pending', 'verified', 'rejected']).withMessage('Invalid verification status'),
  body('notes').optional().trim().isLength({ max: 500 }).withMessage('Notes must be less than 500 characters'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const shop = await Shop.findById(req.params.id);
    if (!shop) {
      return res.status(404).json({ message: 'Shop not found' });
    }

    shop.verificationStatus = req.body.status;
    shop.isVerified = req.body.status === 'verified';
    if (req.body.notes) {
      shop.verificationNotes = req.body.notes;
    }
    await shop.save();

    res.json({ 
      message: `Shop verification status updated to ${req.body.status}`,
      verificationStatus: shop.verificationStatus,
      isVerified: shop.isVerified
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get shop statistics
router.get('/:id/stats', authenticateToken, async (req, res) => {
  try {
    const shop = await Shop.findById(req.params.id);
    if (!shop) {
      return res.status(404).json({ message: 'Shop not found' });
    }

    // Check if user has access to this shop
    if (req.user.role === 'shop_owner' && shop.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const stats = await shop.updateStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get shop products
router.get('/:id/products', authenticateToken, async (req, res) => {
  try {
    const shop = await Shop.findById(req.params.id);
    if (!shop) {
      return res.status(404).json({ message: 'Shop not found' });
    }

    const { page = 1, limit = 10, category, search, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    
    const query = { shop: req.params.id, isActive: true };
    
    if (category) query.category = category;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const Product = require('../models/Product');
    const products = await Product.find(query)
      .populate('category', 'name slug')
      .sort(sortOptions)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const total = await Product.countDocuments(query);

    res.json({
      products,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get shop orders
router.get('/:id/orders', authenticateToken, async (req, res) => {
  try {
    const shop = await Shop.findById(req.params.id);
    if (!shop) {
      return res.status(404).json({ message: 'Shop not found' });
    }

    // Check if user has access to this shop
    if (req.user.role === 'shop_owner' && shop.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { page = 1, limit = 10, status, startDate, endDate, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    
    const query = { shop: req.params.id };
    
    if (status) query.status = status;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const Order = require('../models/Order');
    const orders = await Order.find(query)
      .populate('customer', 'firstName lastName email phone')
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

// Get verified shops
router.get('/verified/list', async (req, res) => {
  try {
    const shops = await Shop.find({ 
      isActive: true, 
      isVerified: true 
    })
    .populate('owner', 'firstName lastName')
    .populate('categories', 'name slug')
    .sort({ rating: -1, name: 1 })
    .limit(10);

    res.json(shops);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router; 