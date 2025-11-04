import express from 'express';
import { body, validationResult, param, query } from 'express-validator';
import FranchiseInventory, { InventoryTransactionType } from '../../models/Franchise/FranchiseInventory';
import FranchiseProduct from '../../models/Franchise/FranchiseProduct';
import { authenticateFranchise } from '../../middleware/franchiseAuth';
import { AuthRequest, AuthResponse, PaginatedResponse } from '../../types/routes';
import { Types } from 'mongoose';

const router = express.Router();

// Get inventory transactions with filtering and pagination
router.get('/', authenticateFranchise, [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('productId').optional().isMongoId(),
  query('transactionType').optional().isIn([
    'purchase', 'sale', 'adjustment', 'return', 'damage', 
    'expired', 'transfer_in', 'transfer_out', 'initial_stock', 'reorder'
  ]),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601()
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

    const {
      page = '1',
      limit = '20',
      productId,
      transactionType,
      startDate,
      endDate,
      search
    } = req.query as any;

    const query: any = { franchise: req.franchiseId };

    if (productId) {
      query.product = productId;
    }

    if (transactionType) {
      query.transactionType = transactionType;
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    if (search) {
      query.$or = [
        { referenceNumber: { $regex: search, $options: 'i' } },
        { notes: { $regex: search, $options: 'i' } },
        { batchNumber: { $regex: search, $options: 'i' } }
      ];
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    const transactions = await FranchiseInventory.find(query)
      .populate('product', 'name sku category brand')
      .populate('performedBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(limitNum)
      .skip((pageNum - 1) * limitNum)
      .lean()
      .exec();

    const total = await FranchiseInventory.countDocuments(query);

    const response: PaginatedResponse<any> = {
      success: true,
      data: transactions,
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
    console.error('Get inventory transactions error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Get inventory transaction by ID
router.get('/:id', [
  authenticateFranchise,
  param('id').isMongoId()
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

    const transaction = await FranchiseInventory.findOne({
      _id: req.params.id,
      franchise: req.franchiseId
    })
      .populate('product', 'name sku category brand price')
      .populate('performedBy', 'name email');

    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found'
      });
    }

    res.json({
      success: true,
      data: transaction
    });
  } catch (error) {
    console.error('Get inventory transaction error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Record new inventory transaction
router.post('/', [
  authenticateFranchise,
  body('productId').isMongoId().withMessage('Valid product ID is required'),
  body('transactionType').isIn([
    'purchase', 'sale', 'adjustment', 'return', 'damage',
    'expired', 'transfer_in', 'transfer_out', 'initial_stock', 'reorder'
  ]).withMessage('Valid transaction type is required'),
  body('quantity').isInt().withMessage('Quantity must be an integer'),
  body('referenceNumber').optional().trim().isLength({ max: 100 }),
  body('notes').optional().trim().isLength({ max: 500 }),
  body('costPerUnit').optional().isFloat({ min: 0 }),
  body('supplier').optional().trim().isLength({ max: 100 }),
  body('expiryDate').optional().isISO8601(),
  body('batchNumber').optional().trim().isLength({ max: 50 })
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

    const {
      productId,
      transactionType,
      quantity,
      referenceNumber,
      notes,
      costPerUnit,
      supplier,
      expiryDate,
      batchNumber
    } = req.body;

    // Verify product belongs to franchise
    const product = await FranchiseProduct.findOne({
      _id: productId,
      franchise: req.franchiseId
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found or does not belong to this franchise'
      });
    }

    // For transactions that reduce stock, make quantity negative
    let adjustedQuantity = quantity;
    if (['sale', 'damage', 'expired', 'transfer_out'].includes(transactionType)) {
      adjustedQuantity = -Math.abs(quantity);
    } else {
      adjustedQuantity = Math.abs(quantity);
    }

    // Record the transaction
    const transaction = await FranchiseInventory.recordTransaction(
      req.franchiseId as Types.ObjectId,
      new Types.ObjectId(productId),
      transactionType as InventoryTransactionType,
      adjustedQuantity,
      {
        referenceNumber,
        notes,
        costPerUnit,
        supplier,
        expiryDate: expiryDate ? new Date(expiryDate) : undefined,
        batchNumber
      }
    );

    const populatedTransaction = await FranchiseInventory.findById(transaction._id)
      .populate('product', 'name sku category brand')
      .populate('performedBy', 'name email');

    res.status(201).json({
      success: true,
      message: 'Inventory transaction recorded successfully',
      data: populatedTransaction
    });
  } catch (error) {
    console.error('Record inventory transaction error:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message || 'Server error',
      details: (error as Error).message
    });
  }
});

// Bulk inventory adjustment
router.post('/bulk-adjustment', [
  authenticateFranchise,
  body('adjustments').isArray().withMessage('Adjustments must be an array'),
  body('adjustments.*.productId').isMongoId(),
  body('adjustments.*.quantity').isInt(),
  body('adjustments.*.notes').optional().trim().isLength({ max: 500 }),
  body('reason').optional().trim().isLength({ max: 200 })
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

    const { adjustments, reason } = req.body;
    const results = [];
    const failed = [];

    for (const adjustment of adjustments) {
      try {
        const transaction = await FranchiseInventory.recordTransaction(
          req.franchiseId as Types.ObjectId,
          new Types.ObjectId(adjustment.productId),
          'adjustment',
          adjustment.quantity,
          {
            notes: adjustment.notes || reason
          }
        );
        results.push(transaction);
      } catch (error) {
        failed.push({
          productId: adjustment.productId,
          error: (error as Error).message
        });
      }
    }

    res.json({
      success: true,
      message: `${results.length} adjustments processed successfully`,
      data: {
        successful: results.length,
        failed: failed.length,
        failures: failed
      }
    });
  } catch (error) {
    console.error('Bulk adjustment error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Get inventory statistics
router.get('/stats/overview', authenticateFranchise, async (req: AuthRequest, res: AuthResponse) => {
  try {
    const { startDate, endDate } = req.query;

    const query: any = { franchise: req.franchiseId };

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate as string);
      if (endDate) query.createdAt.$lte = new Date(endDate as string);
    }

    const stats = await FranchiseInventory.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$transactionType',
          count: { $sum: 1 },
          totalQuantity: { $sum: '$quantity' },
          totalCost: { $sum: '$totalCost' }
        }
      }
    ]);

    // Get current stock levels
    const products = await FranchiseProduct.find({ franchise: req.franchiseId })
      .populate('bharatmartProduct', 'name sku category brand images')
      .select('stock minStock sellingPrice bharatmartProduct')
      .lean();

    const stockStats = {
      totalProducts: products.length,
      totalStockValue: products.reduce((sum: number, p: any) => sum + (p.stock * p.sellingPrice), 0),
      lowStockProducts: products.filter((p: any) => p.stock <= p.minStock).length,
      outOfStockProducts: products.filter((p: any) => p.stock === 0).length
    };

    res.json({
      success: true,
      data: {
        transactionStats: stats,
        stockStats,
        lowStockProducts: products
          .filter((p: any) => p.stock <= p.minStock)
          .sort((a: any, b: any) => a.stock - b.stock)
          .slice(0, 10)
      }
    });
  } catch (error) {
    console.error('Get inventory stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Get product inventory history
router.get('/product/:productId/history', [
  authenticateFranchise,
  param('productId').isMongoId(),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601()
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

    const { startDate, endDate } = req.query;

    const history = await FranchiseInventory.getInventoryHistory(
      req.franchiseId as Types.ObjectId,
      new Types.ObjectId(req.params.productId),
      startDate ? new Date(startDate as string) : undefined,
      endDate ? new Date(endDate as string) : undefined
    );

    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    console.error('Get product inventory history error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Get low stock alert
router.get('/alerts/low-stock', authenticateFranchise, async (req: AuthRequest, res: AuthResponse) => {
  try {
    const products = await FranchiseProduct.find({
      franchise: req.franchiseId,
      $expr: { $lte: ['$stock', '$minStock'] }
    })
      .select('name sku stock minStock price category brand')
      .sort({ stock: 1 });

    res.json({
      success: true,
      data: products,
      count: products.length
    });
  } catch (error) {
    console.error('Get low stock alerts error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Get stock valuation
router.get('/reports/stock-valuation', authenticateFranchise, async (req: AuthRequest, res: AuthResponse) => {
  try {
    const products = await FranchiseProduct.find({ 
      franchise: req.franchiseId,
      isActive: true 
    })
      .select('name sku stock price costPrice category brand');

    const valuation = products.map(product => ({
      product: {
        id: product._id,
        name: product.name,
        sku: product.sku,
        category: product.category,
        brand: product.brand
      },
      stock: product.stock,
      costPrice: product.costPrice || 0,
      sellingPrice: product.price,
      stockValueAtCost: product.stock * (product.costPrice || 0),
      stockValueAtSelling: product.stock * product.price,
      potentialProfit: product.stock * (product.price - (product.costPrice || 0))
    }));

    const summary = {
      totalStockValueAtCost: valuation.reduce((sum, v) => sum + v.stockValueAtCost, 0),
      totalStockValueAtSelling: valuation.reduce((sum, v) => sum + v.stockValueAtSelling, 0),
      totalPotentialProfit: valuation.reduce((sum, v) => sum + v.potentialProfit, 0),
      totalProducts: products.length,
      totalStockUnits: products.reduce((sum, p) => sum + p.stock, 0)
    };

    res.json({
      success: true,
      data: {
        summary,
        products: valuation
      }
    });
  } catch (error) {
    console.error('Get stock valuation error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

export default router;
