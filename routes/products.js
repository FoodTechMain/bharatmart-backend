const express = require('express');
const { body, validationResult } = require('express-validator');
const Product = require('../models/Product');
const { authenticateToken, requirePermission } = require('../middleware/auth');

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
        { description: { $regex: search, $options: 'i' } },
        { brand: { $regex: search, $options: 'i' } }
      ];
    }

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const products = await Product.find(query)
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

// Create new product
router.post('/', [
  authenticateToken,
  requirePermission('product:write'),
  body('name').trim().isLength({ min: 3 }).withMessage('Product name must be at least 3 characters'),
  body('description').trim().isLength({ min: 10 }).withMessage('Description must be at least 10 characters'),
  body('price.regular').isFloat({ min: 0 }).withMessage('Regular price must be a positive number'),
  body('price.sale').optional().isFloat({ min: 0 }).withMessage('Sale price must be a positive number'),
  body('price.cost').optional().isFloat({ min: 0 }).withMessage('Cost price must be a positive number'),
  body('category').isString().withMessage('Category is required'),
  body('brand').isString().withMessage('Brand is required'),
  body('sku').optional().isString(),
  body('barcode').optional().isString(),
  body('mrp').isFloat({ min: 0 }).withMessage('MRP is required'),
  body('weight').custom(val => {
    if (!val || typeof val !== 'object' || !val.value || !val.unit) throw new Error('Weight is required');
    if (isNaN(val.value) || val.value <= 0) throw new Error('Weight value must be positive');
    if (typeof val.unit !== 'string') throw new Error('Weight unit is required');
    return true;
  }),
  body('dimensions').optional().custom(val => {
    if (!val) return true;
    if (typeof val !== 'object') throw new Error('Dimensions must be an object');
    if (val.length && (isNaN(val.length) || val.length < 0)) throw new Error('Invalid length');
    if (val.width && (isNaN(val.width) || val.width < 0)) throw new Error('Invalid width');
    if (val.height && (isNaN(val.height) || val.height < 0)) throw new Error('Invalid height');
    if (val.unit && typeof val.unit !== 'string') throw new Error('Invalid unit');
    return true;
  }),
  body('manufacturer').optional().isString(),
  body('hsn').optional().isString(),
  body('gst').optional().isFloat({ min: 0 }),
  body('minOrderQty').optional().isInt({ min: 0 }),
  body('maxOrderQty').optional().isInt({ min: 0 }),
  body('inventory.quantity').isInt({ min: 0 }).withMessage('Quantity must be a non-negative integer'),
  body('inventory.lowStockThreshold').optional().isInt({ min: 0 }),
  body('inventory.trackInventory').optional().isBoolean(),
  body('shortDescription').optional().isString(),
  body('seo').optional().isObject(),
  body('isActive').optional().isBoolean(),
  body('isFeatured').optional().isBoolean(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const product = new Product(req.body);
    await product.save();
    res.status(201).json(product);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update product
router.put('/:id', [
  authenticateToken,
  requirePermission('product:write'),
  body('name').optional().trim().isLength({ min: 3 }).withMessage('Product name must be at least 3 characters'),
  body('description').optional().trim().isLength({ min: 10 }).withMessage('Description must be at least 10 characters'),
  body('price.regular').optional().isFloat({ min: 0 }).withMessage('Regular price must be a positive number'),
  body('price.sale').optional().isFloat({ min: 0 }).withMessage('Sale price must be a positive number'),
  body('price.cost').optional().isFloat({ min: 0 }).withMessage('Cost price must be a positive number'),
  body('category').optional().isString(),
  body('brand').optional().isString(),
  body('sku').optional().isString(),
  body('barcode').optional().isString(),
  body('mrp').optional().isFloat({ min: 0 }),
  body('weight').optional().custom(val => {
    if (!val) return true;
    if (typeof val !== 'object' || !val.value || !val.unit) throw new Error('Weight is required');
    if (isNaN(val.value) || val.value <= 0) throw new Error('Weight value must be positive');
    if (typeof val.unit !== 'string') throw new Error('Weight unit is required');
    return true;
  }),
  body('dimensions').optional().custom(val => {
    if (!val) return true;
    if (typeof val !== 'object') throw new Error('Dimensions must be an object');
    if (val.length && (isNaN(val.length) || val.length < 0)) throw new Error('Invalid length');
    if (val.width && (isNaN(val.width) || val.width < 0)) throw new Error('Invalid width');
    if (val.height && (isNaN(val.height) || val.height < 0)) throw new Error('Invalid height');
    if (val.unit && typeof val.unit !== 'string') throw new Error('Invalid unit');
    return true;
  }),
  body('manufacturer').optional().isString(),
  body('hsn').optional().isString(),
  body('gst').optional().isFloat({ min: 0 }),
  body('minOrderQty').optional().isInt({ min: 0 }),
  body('maxOrderQty').optional().isInt({ min: 0 }),
  body('inventory.quantity').optional().isInt({ min: 0 }).withMessage('Quantity must be a non-negative integer'),
  body('inventory.lowStockThreshold').optional().isInt({ min: 0 }),
  body('inventory.trackInventory').optional().isBoolean(),
  body('shortDescription').optional().isString(),
  body('seo').optional().isObject(),
  body('isActive').optional().isBoolean(),
  body('isFeatured').optional().isBoolean(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    Object.assign(product, req.body);
    await product.save();

    res.json(product);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
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