import express from 'express';
import { query, param } from 'express-validator';
import FranchiseProduct from '../models/FranchiseProduct';
import { authenticateFranchise } from '../middleware/franchiseAuth';
import { AuthRequest, AuthResponse, PaginatedResponse } from '../types/routes';

const router = express.Router();

// Get franchise's own products with filtering and pagination
router.get('/', authenticateFranchise, [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('search').optional().trim(),
  query('category').optional().trim(),
  query('brand').optional().trim(),
  query('minPrice').optional().isFloat({ min: 0 }),
  query('maxPrice').optional().isFloat({ min: 0 }),
  query('lowStock').optional().isBoolean(),
  query('isActive').optional().isBoolean(),
  query('sortBy').optional().trim(),
  query('sortOrder').optional().isIn(['asc', 'desc'])
], async (req: AuthRequest, res: AuthResponse) => {
  try {
    const {
      page = '1',
      limit = '20',
      search,
      category,
      brand,
      minPrice,
      maxPrice,
      lowStock,
      isActive,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query as any;

    // Build query - automatically filter by franchise ID
    const query: any = { franchise: req.franchiseId };
    
    if (search && search.trim() !== '') {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { sku: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } },
        { brand: { $regex: search, $options: 'i' } }
      ];
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
    
    if (lowStock === 'true' || lowStock === true) {
      query.$expr = { $lte: ['$stock', '$minStock'] };
    }
    
    if (isActive !== undefined && isActive !== '') {
      query.isActive = isActive === 'true' || isActive === true;
    }

    // Sort options
    const sortOptions: { [key: string]: 1 | -1 } = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    const products = await FranchiseProduct.find(query)
      .sort(sortOptions)
      .limit(limitNum)
      .skip((pageNum - 1) * limitNum)
      .lean()
      .exec();

    const total = await FranchiseProduct.countDocuments(query);

    const response: PaginatedResponse<any> = {
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
    console.error('Get franchise products error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Get single product by ID (franchise's own products only)
router.get('/:id', [
  authenticateFranchise,
  param('id').isMongoId().withMessage('Invalid product ID')
], async (req: AuthRequest, res: AuthResponse) => {
  try {
    const product = await FranchiseProduct.findOne({
      _id: req.params.id,
      franchise: req.franchiseId
    });
    
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

// Get product statistics for franchise
router.get('/stats/overview', authenticateFranchise, async (req: AuthRequest, res: AuthResponse) => {
  try {
    const stats = await FranchiseProduct.aggregate([
      { $match: { franchise: req.franchiseId } },
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
      { $match: { franchise: req.franchiseId } },
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
