const express = require('express');
const { body, validationResult } = require('express-validator');
const Product = require('../models/Product');
const Shop = require('../models/Shop');
const Category = require('../models/Category');
const { authenticateToken, requirePermission, requireShopOwnership } = require('../middleware/auth');

const router = express.Router();

// Get all products
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      shop, 
      category, 
      search, 
      minPrice, 
      maxPrice,
      inStock,
      sortBy = 'createdAt', 
      sortOrder = 'desc' 
    } = req.query;
    
    const query = { isActive: true };
    
    if (shop) query.shop = shop;
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
        { brand: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

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

// Get product by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('shop', 'name logo contactInfo')
      .populate('category', 'name')
      .populate('subcategory', 'name');
    
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
  // Accept shop and category as string (shop1, category2, etc.)
  body('shop').isString().withMessage('Shop is required'),
  body('category').isString().withMessage('Category is required'),
  body('inventory.quantity').isInt({ min: 0 }).withMessage('Quantity must be a non-negative integer'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Skip shop/category existence check for now
    // const shop = await Shop.findById(req.body.shop);
    // if (!shop) {
    //   return res.status(404).json({ message: 'Shop not found' });
    // }
    // const category = await Category.findById(req.body.category);
    // if (!category) {
    //   return res.status(404).json({ message: 'Category not found' });
    // }

    const product = new Product(req.body);
    await product.save();

    // No population since shop/category are not ObjectIDs
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
  body('inventory.quantity').optional().isInt({ min: 0 }).withMessage('Quantity must be a non-negative integer'),
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

    // Check if user has permission to update this product
    if (req.user.role === 'shop_owner') {
      const shop = await Shop.findById(product.shop);
      if (!shop || shop.owner.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    Object.assign(product, req.body);
    await product.save();

    const updatedProduct = await Product.findById(product._id)
      .populate('shop', 'name logo')
      .populate('category', 'name');

    res.json(updatedProduct);
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

    // Check if user has permission to delete this product
    if (req.user.role === 'shop_owner') {
      const shop = await Shop.findById(product.shop);
      if (!shop || shop.owner.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Access denied' });
      }
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

    // Check if user has permission to update this product
    if (req.user.role === 'shop_owner') {
      const shop = await Shop.findById(product.shop);
      if (!shop || shop.owner.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Access denied' });
      }
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