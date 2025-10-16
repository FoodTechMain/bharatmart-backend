import express from 'express';
import { body, validationResult } from 'express-validator';
import { Types } from 'mongoose';
import { authenticateToken, requirePermission } from '../middleware/auth';
import Product, { IProduct } from '../models/Product';
import ProductCategory from '../models/ProductCategory';
import { AuthRequest, AuthResponse, PaginatedResponse } from '../types/routes';

const router = express.Router();

// For both POST and PUT handlers, add this helper function
function cleanFormData(data: any): any {
  const cleanData = { ...data };

  // Handle empty ObjectId fields
  if (cleanData.brand === '') {
    delete cleanData.brand;
  }

  return cleanData;
}

// Get all products
router.get('/', authenticateToken, async (req: AuthRequest, res: AuthResponse) => {
  try {
    const { page = '1', limit = '10', category, brand, search, sortBy = 'name', sortOrder = 'asc' } = req.query;
    const query: any = { isActive: true };

    if (category) query.category = category;
    if (brand) query.brand = brand;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const sortOptions: { [key: string]: 1 | -1 } = {};
    sortOptions[sortBy as string] = sortOrder === 'desc' ? -1 : 1;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);

    const products = await Product.find(query)
      .populate('category', 'name')
      .populate('brand', 'name')
      .sort(sortOptions)
      .limit(limitNum)
      .skip((pageNum - 1) * limitNum)
      .exec();

    const total = await Product.countDocuments(query);

    const response: PaginatedResponse<IProduct[]> = {
      success: true,
      data: products,
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

// Get product by ID
router.get('/:id', authenticateToken, async (req: AuthRequest, res: AuthResponse) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('category', 'name')
      .populate('brand', 'name');
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
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Create new product
router.post(
  '/',
  [
    authenticateToken,
    requirePermission('product:write'),
    body('name').trim().isLength({ min: 2 }).withMessage('Product name must be at least 2 characters'),
    body('description').trim().isLength({ min: 10 }).withMessage('Description must be at least 10 characters'),
    body('category').notEmpty().withMessage('Category is required'),
    body('stock').isInt({ min: 0 }).withMessage('Stock must be a non-negative integer'),
    body('minStock').isInt({ min: 0 }).withMessage('minStock must be a non-negative integer'),
    body('images').isArray().withMessage('Images must be an array'),
    body('isActive').optional().isBoolean()
  ],
  async (req: AuthRequest, res: AuthResponse) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const cleanedData = cleanFormData(req.body);

      // Ensure product category exists
      if (cleanedData.category) {
        await ProductCategory.updateOne(
          { _id: cleanedData.category },
          {},
          { upsert: false }
        );
      }

      // Ensure SKU uniqueness if provided
      if (cleanedData.sku) {
        const existingSku = await Product.findOne({ sku: cleanedData.sku });
        if (existingSku) {
          return res.status(400).json({
            success: false,
            error: 'SKU must be unique. Another product with this SKU already exists.'
          });
        }
      }

      const product = new Product(cleanedData);
      await product.save();
      res.status(201).json({
        success: true,
        data: product
      });
    } catch (error) {
      if ((error as any).code === 11000) {
        const dupKey = Object.keys((error as any).keyValue || {})[0] || 'field';
        return res.status(409).json({
          success: false,
          error: `${dupKey} already exists and must be unique.`
        });
      }
      res.status(500).json({
        success: false,
        error: 'Server error',
        details: (error as Error).message
      });
    }
  }
);

// Update product
router.put(
  '/:id',
  [
    authenticateToken,
    requirePermission('product:write'),
    body('name').optional().trim().isLength({ min: 2 }),
    body('description').optional().trim().isLength({ min: 10 }),
    body('category').optional(),
    body('brand').optional(),
    body('stock').optional().isInt({ min: 0 }),
    body('minStock').optional().isInt({ min: 0 }),
    body('images').optional().isArray(),
    body('isActive').optional().isBoolean()
  ],
  async (req: AuthRequest, res: AuthResponse) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const cleanedData = cleanFormData(req.body);

      // Ensure SKU uniqueness if updated
      if (cleanedData.sku) {
        const existing = await Product.findOne({ sku: cleanedData.sku });
        if (existing && String(existing._id) !== String(req.params.id)) {
          return res.status(400).json({
            success: false,
            error: 'SKU must be unique. Another product with this SKU already exists.'
          });
        }
      }

      const product = await Product.findById(req.params.id);
      if (!product) {
        return res.status(404).json({
          success: false,
          error: 'Product not found'
        });
      }

      Object.assign(product, cleanedData);
      await product.save();

      res.json({
        success: true,
        data: product
      });
    } catch (error) {
      if ((error as any).code === 11000) {
        const dupKey = Object.keys((error as any).keyValue || {})[0] || 'field';
        return res.status(409).json({
          success: false,
          error: `${dupKey} already exists and must be unique.`
        });
      }
      res.status(500).json({
        success: false,
        error: 'Server error',
        details: (error as Error).message
      });
    }
  }
);

// Delete product
router.delete('/:id', authenticateToken, requirePermission('product:delete'), async (req: AuthRequest, res: AuthResponse) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }
    res.json({
      success: true,
      message: 'Product deleted successfully'
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
