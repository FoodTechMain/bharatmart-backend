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
  body("bharatmartProduct")
    .isMongoId()
    .withMessage("Valid main product ID is required"),

  body("franchise")
    .isMongoId()
    .withMessage("Valid franchise ID is required"),

  body("stock")
    .isInt({ min: 0 })
    .withMessage("Stock must be a non-negative integer"),

  body("minStock")
    .isInt({ min: 0 })
    .withMessage("Min stock must be a non-negative integer"),

  body("sellingPrice")
    .isFloat({ min: 0 })
    .withMessage("Selling price must be a non-negative number"),
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
    
    if (lowStock === 'true') {
      query.$expr = { $lte: ['$stock', '$minStock'] };
    }
    
    if (isActive !== undefined && isActive !== '') {
      query.isActive = isActive === 'true';
    }

    // Sort options
    const sortOptions: { [key: string]: 1 | -1 } = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    // First, get all franchise products with populated main product data
    let products = await FranchiseProduct.find(query)
      .populate({
        path: 'franchise',
        select: 'name industry'
      })
      .populate({
        path: 'bharatmartProduct',
        select: 'name description sku category brand images costPrice stock'
      })
      .sort(sortOptions)
      .lean()
      .exec();

    // Apply search filter on populated product data if search term exists
    if (search && search.trim() !== '') {
      const searchTerm = search.toLowerCase().trim();
      products = products.filter((product: any) => {
        const mainProduct = product.bharatmartProduct;
        if (!mainProduct) return false;
        
        return (
          (mainProduct.name && mainProduct.name.toLowerCase().includes(searchTerm)) ||
          (mainProduct.sku && mainProduct.sku.toLowerCase().includes(searchTerm)) ||
          (mainProduct.description && mainProduct.description.toLowerCase().includes(searchTerm)) ||
          (mainProduct.category?.name && mainProduct.category.name.toLowerCase().includes(searchTerm)) ||
          (mainProduct.brand?.name && mainProduct.brand.name.toLowerCase().includes(searchTerm))
        );
      });
    }

    // Apply category filter
    if (category && category.trim() !== '') {
      const categoryTerm = category.toLowerCase();
      products = products.filter((product: any) => {
        const mainProduct = product.bharatmartProduct;
        return mainProduct?.category?.name && 
               mainProduct.category.name.toLowerCase().includes(categoryTerm);
      });
    }

    // Apply brand filter
    if (brand && brand.trim() !== '') {
      const brandTerm = brand.toLowerCase();
      products = products.filter((product: any) => {
        const mainProduct = product.bharatmartProduct;
        return mainProduct?.brand?.name && 
               mainProduct.brand.name.toLowerCase().includes(brandTerm);
      });
    }

    // Apply price filter
    if (minPrice || maxPrice) {
      products = products.filter((product: any) => {
        const price = product.sellingPrice;
        if (minPrice && price < parseFloat(minPrice)) return false;
        if (maxPrice && price > parseFloat(maxPrice)) return false;
        return true;
      });
    }

    // Get total count after filtering
    const total = products.length;

    // Apply pagination
    const startIndex = (pageNum - 1) * limitNum;
    const paginatedProducts = products.slice(startIndex, startIndex + limitNum);

    // Calculate stats from filtered products
    const stats = {
      totalProducts: total,
      totalValue: products.reduce((sum: number, p: any) => sum + (p.stock * p.sellingPrice), 0),
      avgPrice: total > 0 ? products.reduce((sum: number, p: any) => sum + p.sellingPrice, 0) / total : 0,
      lowStockCount: products.filter((p: any) => p.stock <= p.minStock).length
    };

    const response: PaginatedResponse<IFranchiseProduct[]> = {
      success: true,
      data: paginatedProducts,
      pagination: {
        total,
        currentPage: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      },
      stats: stats
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
      .populate('franchise', 'name industry contactPerson email')
      .populate('bharatmartProduct', 'name description sku category brand images costPrice stock');
    
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
  ...validateProduct
], async (req: AuthRequest, res: AuthResponse) => {
  try {
    console.log('=== Create Franchise Product Request ===');
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

    // Check if this franchise already has this product
    const existingProduct = await FranchiseProduct.findOne({ 
      bharatmartProduct: req.body.bharatmartProduct,
      franchise: req.body.franchise
    });
    
    if (existingProduct) {
      return res.status(400).json({
        success: false,
        error: 'This product already exists for this franchise'
      });
    }

    // Verify the main product exists
    const mainProduct = await Product.findById(req.body.bharatmartProduct);
    if (!mainProduct) {
      return res.status(404).json({
        success: false,
        error: 'Main product not found'
      });
    }

    const product = new FranchiseProduct(req.body);
    await product.save();

    // Populate the response
    const populatedProduct = await FranchiseProduct.findById(product._id)
      .populate('franchise', 'name industry')
      .populate('bharatmartProduct', 'name description sku category brand images costPrice stock');

    res.status(201).json({
      success: true,
      data: populatedProduct
    });
  } catch (error) {
    console.error('Create franchise product error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Update product (only franchise-specific fields)
router.put('/:id', [
  authenticateAdminOrFranchise,
  param('id').isMongoId().withMessage('Invalid product ID'),
  body("stock").optional().isInt({ min: 0 }).withMessage("Stock must be a non-negative integer"),
  body("minStock").optional().isInt({ min: 0 }).withMessage("Min stock must be a non-negative integer"),
  body("sellingPrice").optional().isFloat({ min: 0 }).withMessage("Selling price must be a non-negative number"),
  body("isActive").optional().isBoolean().withMessage("isActive must be a boolean")
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

    // Only update allowed fields
    const allowedUpdates = ['stock', 'minStock', 'sellingPrice', 'isActive'];
    const updates: any = {};
    
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    Object.assign(product, updates);
    await product.save();

    // Populate the response
    const populatedProduct = await FranchiseProduct.findById(product._id)
      .populate('franchise', 'name industry')
      .populate('bharatmartProduct', 'name description sku category brand images costPrice stock');

    res.json({
      success: true,
      data: populatedProduct
    });
  } catch (error) {
    console.error('Update franchise product error:', error);
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
    const skus = validProducts.map((p: any) => p.sku);
    const existingProducts = await FranchiseProduct.find({
      franchise: franchise
    }).populate('bharatmartProduct', 'sku name');

    if (existingProducts.length > 0) {
      const existingSkus = existingProducts
        .map((p: any) => p.bharatmartProduct?.sku)
        .filter(Boolean);
      const duplicateSkus = skus.filter((sku: string) => existingSkus.includes(sku));
      
      if (duplicateSkus.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Duplicate SKUs found',
          details: {
            duplicateSkus,
            existingProducts: existingProducts
              .filter((p: any) => duplicateSkus.includes(p.bharatmartProduct?.sku))
              .map((p: any) => ({ 
                sku: p.bharatmartProduct?.sku, 
                name: p.bharatmartProduct?.name 
              }))
          }
        });
      }
    }

    // Add franchise and import batch to each product
    const productsToInsert = validProducts.map((product: any) => ({
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

// Get franchises with their products grouped
router.get('/grouped/by-franchise', [
  authenticateAdminOrFranchise,
  query('search').optional().isString(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
], async (req: AuthRequest, res: AuthResponse) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const searchTerm = req.query.search as string || '';

    // Build franchise filter
    const franchiseFilter: any = { isActive: true };
    if (searchTerm) {
      franchiseFilter.name = { $regex: searchTerm, $options: 'i' };
    }

    // Get all franchises with pagination
    const franchises = await Franchise.find(franchiseFilter)
      .select('_id name industry email phone address isActive createdAt')
      .sort({ name: 1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const totalFranchises = await Franchise.countDocuments(franchiseFilter);

    // For each franchise, get their products with statistics
    const franchisesWithProducts = await Promise.all(
      franchises.map(async (franchise) => {
        // Get products for this franchise
        const products = await FranchiseProduct.find({ franchise: franchise._id })
          .populate({
            path: 'bharatmartProduct',
            select: 'name sku description category brand images costPrice stock',
            populate: [
              { path: 'category', select: 'name slug' },
              { path: 'brand', select: 'name logo' }
            ]
          })
          .sort({ createdAt: -1 })
          .limit(100); // Limit products per franchise to avoid overload

        // Calculate statistics for this franchise
        const stats = {
          totalProducts: products.length,
          activeProducts: products.filter(p => p.isActive).length,
          lowStockProducts: products.filter(p => p.stock <= p.minStock).length,
          totalValue: products.reduce((sum, p) => sum + (p.sellingPrice * p.stock), 0),
          totalStock: products.reduce((sum, p) => sum + p.stock, 0)
        };

        return {
          _id: franchise._id,
          name: franchise.name,
          industry: franchise.industry,
          email: franchise.email,
          phone: franchise.phone,
          address: franchise.address,
          isActive: franchise.isActive,
          createdAt: franchise.createdAt,
          products: products,
          stats: stats
        };
      })
    );

    res.json({
      success: true,
      data: franchisesWithProducts,
      pagination: {
        page,
        limit,
        total: totalFranchises,
        totalPages: Math.ceil(totalFranchises / limit)
      }
    });
  } catch (error) {
    console.error('Get franchises with products error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

export default router;
