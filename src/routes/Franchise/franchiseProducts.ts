import express from 'express';
import type { Request as CoreRequest } from 'express-serve-static-core';
const router = express.Router();
import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import { body, validationResult, param, query } from 'express-validator';
import FranchiseProduct, { IFranchiseProduct } from '../../models/Franchise/FranchiseProduct';
import Product from '../../models/Product/Product';
import Franchise from '../../models/Franchise/Franchise';
import ExcelProcessor from '../../utils/excelProcessor';
import { authenticateAdminOrFranchise } from '../../middleware/franchiseAuth';
import slugify from 'slugify';
import XLSX from 'xlsx';
import fs from 'fs/promises';
import { AuthRequest, AuthResponse, PaginatedResponse } from '../../types/routes';
import { Types } from 'mongoose';

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (_req: CoreRequest, _file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
    cb(null, 'uploads/temp/');
  },
  filename: (_req: CoreRequest, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `products-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

interface MulterRequest extends CoreRequest {
  file?: Express.Multer.File;
}

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (_req: CoreRequest, file: Express.Multer.File, cb: FileFilterCallback) => {
    const allowedTypes = ['.xlsx', '.xls', '.csv'];
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files (.xlsx, .xls) and CSV files are allowed'));
    }
  }
});

// Interfaces
interface ProductQuery {
  franchise?: string;
  page?: string;
  limit?: string;
  search?: string;
  category?: string;
  brand?: string;
  minPrice?: string;
  maxPrice?: string;
  lowStock?: string;
  isActive?: string;
  isFeatured?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

interface ProductStats {
  _id: null;
  totalProducts: number;
  activeProducts: number;
  featuredProducts: number;
  totalValue: number;
  avgPrice: number;
  lowStockCount: number;
  totalStock: number;
}

interface CategoryStats {
  _id: string;
  count: number;
  totalValue: number;
  avgPrice: number;
}

interface IBulkUpdateOperation {
  _id: string;
  data: {
    [key: string]: any;
  };
}

interface IBulkUpdateOperationWithObjectId {
  _id: Types.ObjectId;
  data: {
    [key: string]: any;
  };
}

interface BulkUpdateRequest {
  updates: IBulkUpdateOperation[];
  franchise: string;
}

interface BulkDeleteRequest {
  productIds: string[];
  franchise: string;
}

interface BulkOperationResult {
  modifiedCount: number;
  matchedCount?: number;
  deletedCount?: number;
}

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

  body("price")
    .isFloat({ min: 0 })
    .withMessage("Price must be a non-negative number"),

  body("stock")
    .optional()
    .isInt({ min: 0 })
    .withMessage("Stock must be a non-negative integer"),

  body("minStock")
    .optional()
    .isInt({ min: 0 })
    .withMessage("Min stock must be a non-negative integer"),

  body("category")
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Category must be between 2 and 100 characters"),

  body("franchise")
    .isMongoId()
    .withMessage("Valid franchise ID is required"),
];

// Get all franchise products with advanced filtering
router.get('/', [
  authenticateAdminOrFranchise
], async (req: AuthRequest, res: AuthResponse) => {
  try {
    const {
      franchise,
      page = '1',
      limit = '20',
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
    } = req.query as ProductQuery;

    // Build query
    const query: any = {};
    
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
      query.price = {};
      if (minPrice) query.price.$gte = parseFloat(minPrice);
      if (maxPrice) query.price.$lte = parseFloat(maxPrice);
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
    const sortOptions: { [key: string]: 1 | -1 } = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    const products = await FranchiseProduct.find(query)
      .populate('franchise', 'name industry')
      .sort(sortOptions)
      .limit(limitNum)
      .skip((pageNum - 1) * limitNum)
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
          totalValue: { $sum: { $multiply: ['$stock', '$price'] } },
          avgPrice: { $avg: '$price' },
          lowStockCount: {
            $sum: {
              $cond: [{ $lte: ['$stock', '$minStock'] }, 1, 0]
            }
          }
        }
      }
    ]);

    const response: PaginatedResponse<IFranchiseProduct[]> = {
      success: true,
      data: products,
      pagination: {
        total,
        currentPage: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      },
      stats: stats[0] || {
        totalProducts: 0,
        totalValue: 0,
        avgPrice: 0,
        lowStockCount: 0
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Get franchise products error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Get product by ID
router.get('/:id', [
  authenticateAdminOrFranchise,
  param('id').isMongoId().withMessage('Invalid product ID')
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

    const product = await FranchiseProduct.findById(req.params.id)
      .populate('franchise', 'name industry contactPerson email');
    
    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    res.json({
      success: true,
      data: product
    });
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Create new product
router.post('/', [
  authenticateAdminOrFranchise,
  body("bharatmartProductId").optional().isMongoId().withMessage("Valid main product ID is required if provided"),
  ...validateProduct
], async (req: AuthRequest, res: AuthResponse) => {
  try {
    console.log('=== Create Product Request ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error('=== Validation Errors ===');
      console.error('Errors:', JSON.stringify(errors.array(), null, 2));
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    // Check if SKU already exists
    const existingProduct = await FranchiseProduct.findOne({ 
      sku: req.body.sku,
      franchise: req.body.franchise
    });
    
    if (existingProduct) {
      return res.status(400).json({
        success: false,
        error: 'Product with this SKU already exists for this franchise'
      });
    }

    // If bharatmartProductId is provided, verify the main product exists
    if (req.body.bharatmartProductId) {
      const mainProduct = await Product.findById(req.body.bharatmartProductId);
      if (!mainProduct) {
        return res.status(404).json({
          success: false,
          error: 'Main product not found'
        });
      }
    }

    const product = new FranchiseProduct(req.body);
    await product.save();

    res.status(201).json({
      success: true,
      data: product
    });
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Update product
router.put('/:id', [
  authenticateAdminOrFranchise,
  param('id').isMongoId().withMessage('Invalid product ID'),
  ...validateProduct
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

    const product = await FranchiseProduct.findById(req.params.id);
    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
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
          success: false,
          error: 'Product with this SKU already exists for this franchise'
        });
      }
    }

    Object.assign(product, req.body);
    await product.save();

    res.json({
      success: true,
      data: product
    });
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Delete product
router.delete('/:id', [
  authenticateAdminOrFranchise,
  param('id').isMongoId().withMessage('Invalid product ID')
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

    const product = await FranchiseProduct.findById(req.params.id);
    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    await FranchiseProduct.findByIdAndDelete(req.params.id);
    res.json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Bulk import from Excel
router.post('/bulk/import', [
  authenticateAdminOrFranchise,
  upload.single('file'),
  body('franchise').isMongoId().withMessage('Valid franchise ID is required')
], async (req: AuthRequest & MulterRequest, res: AuthResponse) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Excel file is required'
      });
    }

    const { franchise } = req.body;
    const importBatch = `batch_${Date.now()}`;

    // Verify franchise exists
    const franchiseExists = await Franchise.findById(franchise);
    if (!franchiseExists) {
      return res.status(404).json({
        success: false,
        error: 'Franchise not found'
      });
    }

    // Parse Excel file
    const products = await ExcelProcessor.parseExcelFile(req.file.path);
    
    // Validate products
    const { validProducts, errors: validationErrors } = ExcelProcessor.validateProducts(products);
    
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Validation errors found',
        details: {
          errors: validationErrors,
          validCount: validProducts.length,
          errorCount: validationErrors.length
        }
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
        success: false,
        error: 'Duplicate SKUs found',
        details: {
          duplicateSkus,
          existingProducts: existingProducts.map(p => ({ sku: p.sku, name: p.name }))
        }
      });
    }

    // Add franchise and import batch to each product
    const productsToInsert = validProducts.map(product => ({
      ...product,
      franchise: franchise,
      importBatch: importBatch,
      slug: slugify(product.name || '', { lower: true, strict: true })
    }));

    // Bulk insert using Mongoose insertMany
    const insertedProducts = await FranchiseProduct.insertMany(productsToInsert);

    // Clean up temp file
    await fs.unlink(req.file.path);

    res.json({
      success: true,
      message: `${insertedProducts.length} products imported successfully`,
      data: {
        importBatch,
        importedCount: insertedProducts.length,
        products: insertedProducts
      }
    });
  } catch (error) {
    console.error('Bulk import error:', error);
    
    // Clean up temp file on error
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (cleanupError) {
        console.error('File cleanup error:', cleanupError);
      }
    }
    
    res.status(500).json({
      success: false,
      error: 'Import failed',
      details: (error as Error).message
    });
  }
});

// Bulk export to Excel
router.get('/bulk/export', [
  authenticateAdminOrFranchise,
  query('franchise').optional().isMongoId().withMessage('Invalid franchise ID'),
  query('format').optional().isIn(['xlsx', 'csv']).withMessage('Format must be xlsx or csv')
], async (req: AuthRequest, res: AuthResponse) => {
  try {
    const { franchise, format = 'xlsx' } = req.query;
    
    // Build query
    const query: any = {};
    if (franchise) {
      query.franchise = franchise;
    }

    // Get products
    const products = await FranchiseProduct.find(query)
      .populate('franchise', 'name industry')
      .sort({ createdAt: -1 })
      .lean();

    if (products.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No products found to export'
      });
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
    res.status(500).json({
      success: false,
      error: 'Export failed',
      details: (error as Error).message
    });
  }
});

// Download Excel template
router.get('/template/download', [
  authenticateAdminOrFranchise
], async (_req: AuthRequest, res: AuthResponse) => {
  try {
    const workbook = ExcelProcessor.generateTemplate();
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="franchise_products_template.xlsx"');
    
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.send(buffer);
  } catch (error) {
    console.error('Template download error:', error);
    res.status(500).json({
      success: false,
      error: 'Template download failed',
      details: (error as Error).message
    });
  }
});

// Bulk update products
router.put('/bulk/update', [
  authenticateAdminOrFranchise,
  body('updates').isArray().withMessage('Updates must be an array'),
  body('updates.*._id').isMongoId().withMessage('Invalid product ID'),
  body('franchise').isMongoId().withMessage('Valid franchise ID is required')
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

    const { updates, franchise } = req.body as BulkUpdateRequest;

    // Validate all products belong to the franchise
    const productIds = updates.map(u => u._id);
    const existingProducts = await FranchiseProduct.find({
      _id: { $in: productIds },
      franchise: franchise
    });

    if (existingProducts.length !== productIds.length) {
      return res.status(400).json({
        success: false,
        error: 'Some products not found or do not belong to the specified franchise'
      });
    }

    // Perform bulk update
    const result = await FranchiseProduct.bulkUpdate(
      updates.map(u => ({ _id: new Types.ObjectId(u._id), data: u.data } as IBulkUpdateOperationWithObjectId)),
      new Types.ObjectId(franchise)
    );

    res.json({
      success: true,
      message: `${result.modifiedCount} products updated successfully`,
      data: {
        modifiedCount: result.modifiedCount,
        matchedCount: result.matchedCount
      }
    });
  } catch (error) {
    console.error('Bulk update error:', error);
    res.status(500).json({
      success: false,
      error: 'Bulk update failed',
      details: (error as Error).message
    });
  }
});

// Bulk delete products
router.delete('/bulk/delete', [
  authenticateAdminOrFranchise,
  body('productIds').isArray().withMessage('Product IDs must be an array'),
  body('productIds.*').isMongoId().withMessage('Invalid product ID'),
  body('franchise').isMongoId().withMessage('Valid franchise ID is required')
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

    const { productIds, franchise } = req.body as BulkDeleteRequest;

    const result = await FranchiseProduct.deleteMany({
      _id: { $in: productIds },
      franchise: franchise
    });

    res.json({
      success: true,
      message: `${result.deletedCount} products deleted successfully`,
      data: {
        deletedCount: result.deletedCount
      }
    });
  } catch (error) {
    console.error('Bulk delete error:', error);
    res.status(500).json({
      success: false,
      error: 'Bulk delete failed',
      details: (error as Error).message
    });
  }
});

// Get product statistics
router.get('/stats/overview', [
  authenticateAdminOrFranchise,
  query('franchise').optional().isMongoId().withMessage('Invalid franchise ID')
], async (req: AuthRequest, res: AuthResponse) => {
  try {
    const { franchise } = req.query;
    
    const matchStage = franchise ? { franchise } : {};
    
    const stats = await FranchiseProduct.aggregate<ProductStats>([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          activeProducts: { $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] } },
          featuredProducts: { $sum: { $cond: [{ $eq: ['$isFeatured', true] }, 1, 0] } },
          totalValue: { $sum: { $multiply: ['$stock', '$price'] } },
          avgPrice: { $avg: '$price' },
          lowStockCount: { $sum: { $cond: [{ $lte: ['$stock', '$minStock'] }, 1, 0] } },
          totalStock: { $sum: '$stock' }
        }
      }
    ]);

    const categoryStats = await FranchiseProduct.aggregate<CategoryStats>([
      { $match: matchStage },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          totalValue: { $sum: { $multiply: ['$stock', '$price'] } },
          avgPrice: { $avg: '$price' }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    res.json({
      success: true,
      data: {
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
      }
    });
  } catch (error) {
    console.error('Get product stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

export default router;
