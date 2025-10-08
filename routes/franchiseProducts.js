const express = require('express');
const multer = require('multer');
const path = require('path');
const { body, validationResult, param, query } = require('express-validator');
const FranchiseProduct = require('../models/FranchiseProduct');
const Franchise = require('../models/Franchise');
const ExcelProcessor = require('../utils/excelProcessor');
const { authenticateToken, requireSuperAdmin, requirePermission } = require('../middleware/auth');
const slugify = require('slugify');
const XLSX = require('xlsx');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/temp/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `products-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.xlsx', '.xls', '.csv'];
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files (.xlsx, .xls) and CSV files are allowed'));
    }
  }
});

// Validation middleware
const validateProduct = [
  body("name")
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage("Product name must be between 2 and 200 characters"),

  body("description")
    .trim()
    .isLength({ min: 10, max: 1000 })
    .withMessage("Description must be between 10 and 1000 characters"),

  body("sku")
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage("SKU must be between 3 and 50 characters"),

  body("stock")
    .optional()
    .isInt({ min: 0 })
    .withMessage("Stock must be a non-negative integer"),

  body("category")
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Category must be between 2 and 100 characters"),
];


// Get all franchise products with advanced filtering
router.get('/', [
  authenticateToken,
  requirePermission('franchise_products:read')
], async (req, res) => {
  try {
    const {
      franchise,
      page = 1,
      limit = 20,
      search,
      category,
      brand,
      minPrice,
      maxPrice,
      lowStock,
      isActive,
      isFeatured,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build query
    const query = {};
    
    if (franchise) {
      query.franchise = franchise;
    }
    
    if (search && search.trim() !== '') {
      query.$text = { $search: search };
    }
    
    if (category && category.trim() !== '') {
      query.category = { $regex: category, $options: 'i' };
    }
    
    if (brand && brand.trim() !== '') {
      query.brand = { $regex: brand, $options: 'i' };
    }
    
    if (minPrice || maxPrice) {
      query.sellingPrice = {};
      if (minPrice) query.sellingPrice.$gte = parseFloat(minPrice);
      if (maxPrice) query.sellingPrice.$lte = parseFloat(maxPrice);
    }
    
    if (lowStock === 'true') {
      query.$expr = { $lte: ['$stock', '$minStock'] };
    }
    
    if (isActive !== undefined && isActive !== '') {
      query.isActive = isActive === 'true';
    }
    
    if (isFeatured !== undefined && isFeatured !== '') {
      query.isFeatured = isFeatured === 'true';
    }

    // Sort options
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Execute query with pagination
    const products = await FranchiseProduct.find(query)
      .populate('franchise', 'name industry')
      .sort(sortOptions)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean()
      .exec();

    const total = await FranchiseProduct.countDocuments(query);

    // Get aggregation stats
    const stats = await FranchiseProduct.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          totalValue: { $sum: { $multiply: ['$stock', '$sellingPrice'] } },
          avgPrice: { $avg: '$sellingPrice' },
          lowStockCount: {
            $sum: {
              $cond: [{ $lte: ['$stock', '$minStock'] }, 1, 0]
            }
          }
        }
      }
    ]);

    res.json({
      products,
      pagination: {
        totalPages: Math.ceil(total / limit),
        currentPage: parseInt(page),
        total,
        limit: parseInt(limit)
      },
      stats: stats[0] || {
        totalProducts: 0,
        totalValue: 0,
        avgPrice: 0,
        lowStockCount: 0
      }
    });
  } catch (error) {
    console.error('Get franchise products error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get product by ID
router.get('/:id', [
  authenticateToken,
  requirePermission('franchise_products:read'),
  param('id').isMongoId().withMessage('Invalid product ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const product = await FranchiseProduct.findById(req.params.id)
      .populate('franchise', 'name industry contactPerson email');
    
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.json(product);
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create new product
router.post('/', [
  authenticateToken,
  requirePermission('franchise_products:create'),
  ...validateProduct
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Check if SKU already exists
    const existingProduct = await FranchiseProduct.findOne({ 
      sku: req.body.sku,
      franchise: req.body.franchise
    });
    
    if (existingProduct) {
      return res.status(400).json({ 
        message: 'Product with this SKU already exists for this franchise' 
      });
    }

    const product = new FranchiseProduct(req.body);
    await product.save();

    res.status(201).json(product);
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update product
router.put('/:id', [
  authenticateToken,
  requirePermission('franchise_products:update'),
  param('id').isMongoId().withMessage('Invalid product ID'),
  ...validateProduct
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const product = await FranchiseProduct.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Check SKU uniqueness if changing
    if (req.body.sku && req.body.sku !== product.sku) {
      const existingProduct = await FranchiseProduct.findOne({ 
        sku: req.body.sku,
        franchise: product.franchise,
        _id: { $ne: req.params.id }
      });
      
      if (existingProduct) {
        return res.status(400).json({ 
          message: 'Product with this SKU already exists for this franchise' 
        });
      }
    }

    Object.assign(product, req.body);
    await product.save();

    res.json(product);
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete product
router.delete('/:id', [
  authenticateToken,
  requirePermission('franchise_products:delete'),
  param('id').isMongoId().withMessage('Invalid product ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const product = await FranchiseProduct.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    await FranchiseProduct.findByIdAndDelete(req.params.id);
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Bulk import from Excel
router.post('/bulk/import', [
  authenticateToken,
  requirePermission('franchise_products:create'),
  upload.single('file'),
  body('franchise').isMongoId().withMessage('Valid franchise ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'Excel file is required' });
    }

    const { franchise } = req.body;
    const importBatch = `batch_${Date.now()}`;

    // Verify franchise exists
    const franchiseExists = await Franchise.findById(franchise);
    if (!franchiseExists) {
      return res.status(404).json({ message: 'Franchise not found' });
    }

    // Parse Excel file
    const products = await ExcelProcessor.parseExcelFile(req.file.path);
    
    // Validate products
    const { validProducts, errors: validationErrors } = ExcelProcessor.validateProducts(products);
    
    if (validationErrors.length > 0) {
      return res.status(400).json({
        message: 'Validation errors found',
        errors: validationErrors,
        validCount: validProducts.length,
        errorCount: validationErrors.length
      });
    }

    // Check for duplicate SKUs
    const skus = validProducts.map(p => p.sku);
    const existingProducts = await FranchiseProduct.find({
      sku: { $in: skus },
      franchise: franchise
    });

    if (existingProducts.length > 0) {
      const duplicateSkus = existingProducts.map(p => p.sku);
      return res.status(400).json({
        message: 'Duplicate SKUs found',
        duplicateSkus,
        existingProducts: existingProducts.map(p => ({ sku: p.sku, name: p.name }))
      });
    }

    // Add franchise and import batch to each product
    const productsToInsert = validProducts.map(product => ({
      ...product,
      franchise: franchise,
      importBatch: importBatch,
      slug: slugify(product.name, { lower: true, strict: true })
    }));

    // Bulk insert using Mongoose insertMany
    const insertedProducts = await FranchiseProduct.insertMany(productsToInsert);

    // Clean up temp file
    await require('fs').promises.unlink(req.file.path);

    res.json({
      message: `${insertedProducts.length} products imported successfully`,
      importBatch,
      importedCount: insertedProducts.length,
      products: insertedProducts
    });
  } catch (error) {
    console.error('Bulk import error:', error);
    
    // Clean up temp file on error
    if (req.file) {
      try {
        await require('fs').promises.unlink(req.file.path);
      } catch (cleanupError) {
        console.error('File cleanup error:', cleanupError);
      }
    }
    
    res.status(500).json({ message: 'Import failed', error: error.message });
  }
});

// Bulk export to Excel
router.get('/bulk/export', [
  authenticateToken,
  requirePermission('franchise_products:read'),
  query('franchise').optional().isMongoId().withMessage('Invalid franchise ID'),
  query('format').optional().isIn(['xlsx', 'csv']).withMessage('Format must be xlsx or csv')
], async (req, res) => {
  try {
    const { franchise, format = 'xlsx' } = req.query;
    
    // Build query
    const query = {};
    if (franchise) {
      query.franchise = franchise;
    }

    // Get products
    const products = await FranchiseProduct.find(query)
      .populate('franchise', 'name industry')
      .sort({ createdAt: -1 })
      .lean();

    if (products.length === 0) {
      return res.status(404).json({ message: 'No products found to export' });
    }

    // Generate Excel file
    const workbook = ExcelProcessor.exportToExcel(products);
    
    // Set response headers
    const filename = `franchise_products_${Date.now()}.${format}`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    // Send file
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: format });
    res.send(buffer);
  } catch (error) {
    console.error('Bulk export error:', error);
    res.status(500).json({ message: 'Export failed', error: error.message });
  }
});

// Download Excel template
router.get('/template/download', [
  authenticateToken,
  requirePermission('franchise_products:create')
], async (req, res) => {
  try {
    const workbook = ExcelProcessor.generateTemplate();
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="franchise_products_template.xlsx"');
    
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.send(buffer);
  } catch (error) {
    console.error('Template download error:', error);
    res.status(500).json({ message: 'Template download failed', error: error.message });
  }
});

// Bulk update products
router.put('/bulk/update', [
  authenticateToken,
  requirePermission('franchise_products:update'),
  body('updates').isArray().withMessage('Updates must be an array'),
  body('updates.*._id').isMongoId().withMessage('Invalid product ID'),
  body('franchise').isMongoId().withMessage('Valid franchise ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { updates, franchise } = req.body;

    // Validate all products belong to the franchise
    const productIds = updates.map(u => u._id);
    const existingProducts = await FranchiseProduct.find({
      _id: { $in: productIds },
      franchise: franchise
    });

    if (existingProducts.length !== productIds.length) {
      return res.status(400).json({ 
        message: 'Some products not found or do not belong to the specified franchise' 
      });
    }

    // Perform bulk update
    const result = await FranchiseProduct.bulkUpdate(updates, franchise);

    res.json({
      message: `${result.modifiedCount} products updated successfully`,
      modifiedCount: result.modifiedCount,
      matchedCount: result.matchedCount
    });
  } catch (error) {
    console.error('Bulk update error:', error);
    res.status(500).json({ message: 'Bulk update failed', error: error.message });
  }
});

// Bulk delete products
router.delete('/bulk/delete', [
  authenticateToken,
  requirePermission('franchise_products:delete'),
  body('productIds').isArray().withMessage('Product IDs must be an array'),
  body('productIds.*').isMongoId().withMessage('Invalid product ID'),
  body('franchise').isMongoId().withMessage('Valid franchise ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { productIds, franchise } = req.body;

    const result = await FranchiseProduct.deleteMany({
      _id: { $in: productIds },
      franchise: franchise
    });

    res.json({
      message: `${result.deletedCount} products deleted successfully`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Bulk delete error:', error);
    res.status(500).json({ message: 'Bulk delete failed', error: error.message });
  }
});

// Get product statistics
router.get('/stats/overview', [
  authenticateToken,
  requirePermission('franchise_products:read'),
  query('franchise').optional().isMongoId().withMessage('Invalid franchise ID')
], async (req, res) => {
  try {
    const { franchise } = req.query;
    
    const matchStage = franchise ? { franchise: franchise } : {};
    
    const stats = await FranchiseProduct.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          activeProducts: { $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] } },
          featuredProducts: { $sum: { $cond: [{ $eq: ['$isFeatured', true] }, 1, 0] } },
          totalValue: { $sum: { $multiply: ['$stock', '$sellingPrice'] } },
          avgPrice: { $avg: '$sellingPrice' },
          lowStockCount: { $sum: { $cond: [{ $lte: ['$stock', '$minStock'] }, 1, 0] } },
          totalStock: { $sum: '$stock' }
        }
      }
    ]);

    const categoryStats = await FranchiseProduct.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          totalValue: { $sum: { $multiply: ['$stock', '$sellingPrice'] } },
          avgPrice: { $avg: '$sellingPrice' }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    res.json({
      overview: stats[0] || {
        totalProducts: 0,
        activeProducts: 0,
        featuredProducts: 0,
        totalValue: 0,
        avgPrice: 0,
        lowStockCount: 0,
        totalStock: 0
      },
      categoryBreakdown: categoryStats
    });
  } catch (error) {
    console.error('Get product stats error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
