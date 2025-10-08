const express = require('express');
const { body, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const Product = require('../models/Product');
const Manufacturer = require('../models/Manufacturer');
const ProductCategory = require('../models/ProductCategory');

const router = express.Router();

// Get all products
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      category, 
      search, 
      minPrice, 
      maxPrice,
      inStock,
      sortBy = 'createdAt', 
      sortOrder = 'desc' 
    } = req.query;
    
    const query = { isActive: true };
    
    if (category) query.category = category;
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = parseFloat(minPrice);
      if (maxPrice) query.price.$lte = parseFloat(maxPrice);
    }
    if (inStock === 'true') query['inventory.quantity'] = { $gt: 0 };
    if (inStock === 'false') query['inventory.quantity'] = { $lte: 0 };
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const products = await Product.find(query)
      .sort(sortOptions)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('manufacturer')
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

// Get product by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    // Increment view count
    await product.incrementViews();
    res.json(product);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create new product (minimal required fields: name, category, manufacturer)
router.post('/', [
  authenticateToken,
  requirePermission('product:write'),
  body('name').trim().isLength({ min: 3 }).withMessage('Product name must be at least 3 characters'),
  body('category').trim().isLength({ min: 1 }).withMessage('Category is required'),
  body('manufacturer').custom((val, { req }) => {
    // allow manufacturer to be a string id/name or an object with _id or name
    if (!val && !req.body.customManufacturer) {
      throw new Error('Manufacturer is required');
    }
    return true;
  }),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Log incoming payload for debugging
    console.log('POST /api/products payload:', JSON.stringify(req.body, null, 2));

    const payload = { ...req.body };

    // Normalize manufacturer if object (frontend may send object)
    if (payload.manufacturer && typeof payload.manufacturer === 'object') {
      if (payload.manufacturer._id) payload.manufacturer = String(payload.manufacturer._id);
      else if (payload.manufacturer.name) payload.manufacturer = String(payload.manufacturer.name);
      else payload.manufacturer = '';
    }

    // normalize numeric fields and defaults so Product schema required fields are satisfied
    payload.mrp = payload.mrp !== undefined ? Number(payload.mrp) : 0;
    payload.price = payload.price || {};
    payload.price.regular = payload.price.regular !== undefined ? Number(payload.price.regular) : payload.mrp || 0;
    if (payload.price.sale !== undefined) payload.price.sale = Number(payload.price.sale);
    if (payload.price.cost !== undefined) payload.price.cost = Number(payload.price.cost);

    // weight default (schema requires value and unit)
    if (!payload.weight || typeof payload.weight !== 'object') {
      payload.weight = { value: 0, unit: 'g' };
    } else {
      payload.weight.value = Number(payload.weight.value || 0);
      payload.weight.unit = payload.weight.unit || 'g';
    }

    // dimensions optional - normalize numbers
    if (payload.dimensions && typeof payload.dimensions === 'object') {
      if (payload.dimensions.length !== undefined) payload.dimensions.length = Number(payload.dimensions.length);
      if (payload.dimensions.width !== undefined) payload.dimensions.width = Number(payload.dimensions.width);
      if (payload.dimensions.height !== undefined) payload.dimensions.height = Number(payload.dimensions.height);
    }

    // inventory defaults
    payload.inventory = payload.inventory || {};
    payload.inventory.quantity = payload.inventory.quantity !== undefined ? Number(payload.inventory.quantity) : 0;
    payload.inventory.lowStockThreshold = payload.inventory.lowStockThreshold !== undefined ? Number(payload.inventory.lowStockThreshold) : 10;
    payload.inventory.trackInventory = payload.inventory.trackInventory !== undefined ? !!payload.inventory.trackInventory : true;

    // Ensure required string fields have safe defaults
    if (payload.description === undefined || payload.description === null) payload.description = '';

    // If manufacturer is a name (not an ObjectId), upsert and replace with _id
    if (payload.manufacturer && !mongoose.Types.ObjectId.isValid(payload.manufacturer)) {
      const name = String(payload.manufacturer).trim();
      let existing = await Manufacturer.findOne({ name });
      if (!existing) {
        existing = new Manufacturer({
          name,
          contactPerson: 'Default Contact',
          phone: '0000000000',
          email: 'default@example.com'
        });
        await existing.save();
      }
      payload.manufacturer = existing._id;
    }

    // Ensure product category exists in ProductCategory collection (upsert)
    if (payload.category) {
      await ProductCategory.updateOne({ name: payload.category }, { name: payload.category }, { upsert: true });
    }

    const product = new Product(payload);
    await product.save();
    res.status(201).json(product);
  } catch (error) {
    console.error('POST /api/products error:', error);
    res.status(500).json({ message: 'Server error', error: process.env.NODE_ENV === 'development' ? error.stack : error.message });
  }
});

// Update product
router.put('/:id', [
  authenticateToken,
  requirePermission('product:write'),
  body('name').optional().trim().isLength({ min: 3 }).withMessage('Product name must be at least 3 characters'),
  body('category').optional().isString(),
  body('manufacturer').optional().trim(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    console.log('PUT /api/products payload:', JSON.stringify(req.body, null, 2));

    // If manufacturer provided as name (not ObjectId), upsert and replace with id
    if (req.body.manufacturer && !mongoose.Types.ObjectId.isValid(req.body.manufacturer)) {
      const name = req.body.manufacturer.trim();
      let existing = await Manufacturer.findOne({ name });
      if (!existing) {
        existing = new Manufacturer({ name });
        await existing.save();
      }
      req.body.manufacturer = existing._id;
    }

    // If category provided, ensure it exists in ProductCategory
    if (req.body.category) {
      await ProductCategory.updateOne({ name: req.body.category }, { name: req.body.category }, { upsert: true });
    }

    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    Object.assign(product, req.body);
    await product.save();

    res.json(product);
  } catch (error) {
    console.error('PUT /api/products error:', error);
    res.status(500).json({ message: 'Server error', error: process.env.NODE_ENV === 'development' ? error.stack : error.message });
  }
});

// Delete product
router.delete('/:id', authenticateToken, requirePermission('product:delete'), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    await Product.findByIdAndDelete(req.params.id);
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Toggle product active status
router.patch('/:id/toggle-status', authenticateToken, requirePermission('product:write'), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    product.isActive = !product.isActive;
    await product.save();

    res.json({ 
      message: `Product ${product.isActive ? 'activated' : 'deactivated'} successfully`,
      isActive: product.isActive 
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Toggle product featured status
router.patch('/:id/toggle-featured', authenticateToken, requirePermission('product:write'), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    product.isFeatured = !product.isFeatured;
    await product.save();

    res.json({ 
      message: `Product ${product.isFeatured ? 'featured' : 'unfeatured'} successfully`,
      isFeatured: product.isFeatured 
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get featured products
router.get('/featured/list', async (req, res) => {
  try {
    const products = await Product.find({ 
      isActive: true, 
      isFeatured: true 
    })
    .populate('shop', 'name logo')
    .populate('category', 'name')
    .sort({ createdAt: -1 })
    .limit(10);

    res.json(products);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get product statistics
router.get('/stats/overview', authenticateToken, requirePermission('product:read'), async (req, res) => {
  try {
    const stats = await Product.aggregate([
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

    res.json(stats[0] || {
      totalProducts: 0,
      activeProducts: 0,
      featuredProducts: 0,
      onSaleProducts: 0,
      outOfStockProducts: 0,
      lowStockProducts: 0,
      totalViews: 0,
      totalSales: 0,
      totalRevenue: 0
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Bulk update product status
router.patch('/bulk/status', authenticateToken, requirePermission('product:write'), async (req, res) => {
  try {
    const { productIds, isActive } = req.body;
    
    if (!Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ message: 'Product IDs array is required' });
    }

    const result = await Product.updateMany(
      { _id: { $in: productIds } },
      { isActive }
    );

    res.json({ 
      message: `${result.modifiedCount} products ${isActive ? 'activated' : 'deactivated'} successfully`,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get products by category
router.get('/category/:categoryId', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    
    const query = { 
      category: req.params.categoryId,
      isActive: true 
    };

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const products = await Product.find(query)
      .populate('shop', 'name logo')
      .populate('category', 'name')
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

module.exports = router;