import express from 'express';
import { body, validationResult } from 'express-validator';
import FranchiseTransfer, { ITransfer, TransferStatus } from '../../models/Franchise/FranchiseTransfer';
import Franchise from '../../models/Franchise/Franchise';
import Product from '../../models/Product/Product';
import FranchiseProduct from '../../models/Franchise/FranchiseProduct';
import { authenticateToken, requirePermission } from '../../middleware/auth';
import { authenticateAdminOrFranchise } from '../../middleware/franchiseAuth';
import { AuthRequest, AuthResponse, PaginatedResponse } from '../../types/routes';

const router = express.Router();

interface TransferQuery {
  franchise?: string;
  page?: string;
  limit?: string;
  status?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// Get all franchise transfers
router.get('/', [
  authenticateToken,
  requirePermission('franchise:read')
], async (req: AuthRequest, res: AuthResponse) => {
  try {
    const {
      franchise,
      page = '1',
      limit = '10',
      status,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query as TransferQuery;

    const query: any = {};
    
    if (franchise) {
      query.franchise = franchise;
    }
    
    if (status) {
      query.status = status;
    }

    // Sort options
    const sortOptions: { [key: string]: 1 | -1 } = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    const transfers = await FranchiseTransfer.find(query)
      .populate('franchise', 'name industry')
      .populate('bharatmartManager', 'firstName lastName email')
      .populate('requestedBy', 'firstName lastName email')
      .populate('items.bharatmartProduct', 'name sku stock')
      .populate('items.franchiseProduct', 'name sku stock')
      .populate('deliveredBy', 'firstName lastName email')
      .sort(sortOptions)
      .limit(limitNum)
      .skip((pageNum - 1) * limitNum)
      .exec();

    const total = await FranchiseTransfer.countDocuments(query);

    const response: PaginatedResponse<ITransfer[]> = {
      success: true,
      data: transfers,
      pagination: {
        total,
        currentPage: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Get franchise transfers error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Get transfer by ID
router.get('/:id', [
  authenticateToken,
  requirePermission('franchise:read')
], async (req: AuthRequest, res: AuthResponse) => {
  try {
    const transfer = await FranchiseTransfer.findById(req.params.id)
      .populate('franchise', 'name industry')
      .populate('bharatmartManager', 'firstName lastName email')
      .populate('items.bharatmartProduct', 'name sku stock')
      .populate('items.franchiseProduct', 'name sku stock')
      .populate('deliveredBy', 'firstName lastName email');
    
    if (!transfer) {
      return res.status(404).json({
        success: false,
        error: 'Transfer not found'
      });
    }

    res.json({
      success: true,
      data: transfer
    });
  } catch (error) {
    console.error('Get transfer error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Create new franchise transfer
router.post('/', [
  authenticateToken,
  requirePermission('franchise:write'),
  body('franchise').isMongoId().withMessage('Valid franchise ID is required'),
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.bharatmartProduct').isMongoId().withMessage('Valid product ID is required'),
  body('items.*.franchiseProduct').isMongoId().withMessage('Valid franchise product ID is required'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1')
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

    const { franchise, items, notes } = req.body;

    // Verify franchise exists
    const franchiseExists = await Franchise.findById(franchise);
    if (!franchiseExists) {
      return res.status(404).json({
        success: false,
        error: 'Franchise not found'
      });
    }

    // Validate products and check inventory
    const transferItems = [];
    let totalValue = 0;

    for (const item of items) {
      // Verify main product exists
      const bharatmartProduct = await Product.findById(item.bharatmartProduct);
      if (!bharatmartProduct) {
        return res.status(404).json({
          success: false,
          error: `Main product ${item.bharatmartProduct} not found`
        });
      }

      // Verify franchise product exists and is linked to the main product
      const franchiseProduct = await FranchiseProduct.findById(item.franchiseProduct);
      if (!franchiseProduct) {
        return res.status(404).json({
          success: false,
          error: `Franchise product ${item.franchiseProduct} not found`
        });
      }

      if (String(franchiseProduct.bharatmartProduct) !== String(item.bharatmartProduct)) {
        return res.status(400).json({
          success: false,
          error: `Franchise product ${item.franchiseProduct} is not linked to main product ${item.bharatmartProduct}`
        });
      }

      // Check if we have enough stock in the main product
      if (bharatmartProduct.stock < item.quantity) {
        return res.status(400).json({
          success: false,
          error: `Insufficient stock for ${bharatmartProduct.name}. Available: ${bharatmartProduct.stock}, Requested: ${item.quantity}`
        });
      }

      // Calculate pricing
      const unitPrice = bharatmartProduct.costPrice || bharatmartProduct.salePrice || 0;
      const itemTotal = unitPrice * item.quantity;

      transferItems.push({
        bharatmartProduct: bharatmartProduct._id,
        franchiseProduct: franchiseProduct._id,
        quantity: item.quantity,
        unitPrice,
        totalPrice: itemTotal
      });

      totalValue += itemTotal;
    }

    // Generate transfer number
    const transferNumber = await FranchiseTransfer.generateTransferNumber();

    const transfer = new FranchiseTransfer({
      transferNumber,
      bharatmartManager: req.user?._id,
      franchise,
      items: transferItems,
      notes,
      status: 'pending'
    });

    await transfer.save();

    const populatedTransfer = await FranchiseTransfer.findById(transfer._id)
      .populate('franchise', 'name industry')
      .populate('bharatmartManager', 'firstName lastName email')
      .populate('items.bharatmartProduct', 'name sku')
      .populate('items.franchiseProduct', 'name sku');

    res.status(201).json({
      success: true,
      data: populatedTransfer
    });
  } catch (error) {
    console.error('Create transfer error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// ============================================
// TRANSFER REQUEST ENDPOINTS (Franchise → Admin)
// ============================================

// Create transfer request (Franchise initiates)
router.post('/request', [
  authenticateAdminOrFranchise,
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.bharatmartProduct').isMongoId().withMessage('Valid product ID is required'),
  body('items.*.franchiseProduct').isMongoId().withMessage('Valid franchise product ID is required'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('notes').optional().trim().isLength({ max: 500 })
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

    const { items, notes } = req.body;
    
    // Get franchise ID - could be from franchiseId (franchise user) or req.user (admin)
    const franchiseId = req.franchiseId || req.user?.franchise || req.user?._id;
    
    if (!franchiseId) {
      return res.status(400).json({
        success: false,
        error: 'Franchise ID not found'
      });
    }

    // Verify franchise exists
    const franchiseExists = await Franchise.findById(franchiseId);
    if (!franchiseExists) {
      return res.status(404).json({
        success: false,
        error: 'Franchise not found'
      });
    }

    // Validate products and prepare transfer items
    const transferItems = [];
    let totalValue = 0;

    for (const item of items) {
      // Verify main product exists
      const bharatmartProduct = await Product.findById(item.bharatmartProduct);
      if (!bharatmartProduct) {
        return res.status(404).json({
          success: false,
          error: `Main product ${item.bharatmartProduct} not found`
        });
      }

      // Verify franchise product exists and is linked
      const franchiseProduct = await FranchiseProduct.findById(item.franchiseProduct);
      if (!franchiseProduct) {
        return res.status(404).json({
          success: false,
          error: `Franchise product ${item.franchiseProduct} not found`
        });
      }

      if (String(franchiseProduct.bharatmartProduct) !== String(item.bharatmartProduct)) {
        return res.status(400).json({
          success: false,
          error: `Franchise product ${item.franchiseProduct} is not linked to main product ${item.bharatmartProduct}`
        });
      }

      if (String(franchiseProduct.franchise) !== String(franchiseId)) {
        return res.status(403).json({
          success: false,
          error: `Franchise product ${item.franchiseProduct} does not belong to your franchise`
        });
      }

      // Calculate pricing
      const unitPrice = bharatmartProduct.costPrice || bharatmartProduct.salePrice || 0;
      const itemTotal = unitPrice * item.quantity;

      transferItems.push({
        bharatmartProduct: bharatmartProduct._id,
        franchiseProduct: franchiseProduct._id,
        quantity: item.quantity,
        unitPrice,
        totalPrice: itemTotal
      });

      totalValue += itemTotal;
    }

    // Generate transfer number
    const transferNumber = await FranchiseTransfer.generateTransferNumber();

    // Create transfer request
    const transfer = new FranchiseTransfer({
      transferNumber,
      franchise: franchiseId,
      items: transferItems,
      notes: notes || 'Stock reorder request from franchise',
      status: 'requested',
      requestedBy: req.user?._id,
      requestedAt: new Date(),
      statusHistory: [{
        status: 'requested',
        timestamp: new Date(),
        notes: 'Transfer request created by franchise',
        changedBy: req.user?._id
      }]
    });

    await transfer.save();

    const populatedTransfer = await FranchiseTransfer.findById(transfer._id)
      .populate('franchise', 'name industry')
      .populate('requestedBy', 'firstName lastName email')
      .populate('items.bharatmartProduct', 'name sku')
      .populate('items.franchiseProduct', 'name sku');

    res.status(201).json({
      success: true,
      message: 'Transfer request created successfully. Waiting for admin approval.',
      data: populatedTransfer
    });
  } catch (error) {
    console.error('Create transfer request error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Approve transfer request (Admin only)
router.patch('/:id/approve', [
  authenticateToken,
  requirePermission('franchise:write'),
  body('notes').optional().trim().isLength({ max: 500 })
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

    const transfer = await FranchiseTransfer.findById(req.params.id);
    if (!transfer) {
      return res.status(404).json({
        success: false,
        error: 'Transfer request not found'
      });
    }

    if (transfer.status !== 'requested') {
      return res.status(400).json({
        success: false,
        error: `Cannot approve transfer with status: ${transfer.status}`
      });
    }

    // Check if main products have sufficient stock
    for (const item of transfer.items) {
      const product = await Product.findById(item.bharatmartProduct);
      if (!product) {
        return res.status(404).json({
          success: false,
          error: `Product not found: ${item.bharatmartProduct}`
        });
      }

      if (product.stock < item.quantity) {
        return res.status(400).json({
          success: false,
          error: `Insufficient stock for ${product.name}. Available: ${product.stock}, Requested: ${item.quantity}`
        });
      }
    }

    // Approve the transfer
    await transfer.approve(req.user?._id!, req.body.notes);

    const updatedTransfer = await FranchiseTransfer.findById(transfer._id)
      .populate('franchise', 'name industry')
      .populate('bharatmartManager', 'firstName lastName email')
      .populate('requestedBy', 'firstName lastName email')
      .populate('approvedBy', 'firstName lastName email')
      .populate('items.bharatmartProduct', 'name sku stock')
      .populate('items.franchiseProduct', 'name sku stock');

    res.json({
      success: true,
      message: 'Transfer request approved successfully',
      data: updatedTransfer
    });
  } catch (error) {
    console.error('Approve transfer error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Reject transfer request (Admin only)
router.patch('/:id/reject', [
  authenticateToken,
  requirePermission('franchise:write'),
  body('reason').trim().isLength({ min: 1, max: 500 }).withMessage('Rejection reason is required')
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

    const transfer = await FranchiseTransfer.findById(req.params.id);
    if (!transfer) {
      return res.status(404).json({
        success: false,
        error: 'Transfer request not found'
      });
    }

    if (transfer.status !== 'requested') {
      return res.status(400).json({
        success: false,
        error: `Cannot reject transfer with status: ${transfer.status}`
      });
    }

    // Reject the transfer
    await transfer.reject(req.user?._id!, req.body.reason);

    const updatedTransfer = await FranchiseTransfer.findById(transfer._id)
      .populate('franchise', 'name industry')
      .populate('requestedBy', 'firstName lastName email')
      .populate('rejectedBy', 'firstName lastName email')
      .populate('items.bharatmartProduct', 'name sku stock')
      .populate('items.franchiseProduct', 'name sku stock');

    res.json({
      success: true,
      message: 'Transfer request rejected',
      data: updatedTransfer
    });
  } catch (error) {
    console.error('Reject transfer error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Update transfer status
router.patch('/:id/status', [
  authenticateToken,
  requirePermission('franchise:write'),
  body('status').isIn(['requested', 'rejected', 'pending', 'processing', 'shipped', 'delivered', 'cancelled']).withMessage('Invalid status'),
  body('notes').optional().trim().isLength({ max: 500 }).withMessage('Notes must be less than 500 characters'),
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

    const transfer = await FranchiseTransfer.findById(req.params.id);
    if (!transfer) {
      return res.status(404).json({
        success: false,
        error: 'Transfer not found'
      });
    }

    const oldStatus = transfer.status;
    const newStatus = req.body.status as TransferStatus;
    const notes = req.body.notes;

    // Validate status transition
    const validTransitions: { [key: string]: TransferStatus[] } = {
      requested: ['pending', 'rejected'], // Use approve/reject endpoints instead
      rejected: [], // Final state
      pending: ['processing', 'shipped', 'cancelled'],
      processing: ['shipped', 'cancelled'],
      shipped: ['delivered'],
      delivered: [], // Final state
      cancelled: [] // Final state
    };

    if (!validTransitions[oldStatus] || !validTransitions[oldStatus].includes(newStatus)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status transition from ${oldStatus} to ${newStatus}`
      });
    }

    // If marking as delivered, update stock for both main and franchise products
    if (newStatus === 'delivered' && oldStatus !== 'delivered') {
      for (const item of transfer.items) {
        // Update main product stock (decrease)
        await Product.findByIdAndUpdate(item.bharatmartProduct, {
          $inc: { stock: -item.quantity }
        });

        // Update franchise product stock (increase)
        await FranchiseProduct.findByIdAndUpdate(item.franchiseProduct, {
          $inc: { stock: item.quantity }
        });
      }
    }

    // Handle cancellation - restore inventory if needed
    if (newStatus === 'cancelled' && oldStatus !== 'cancelled') {
      // We might want to restore stock if the transfer was already delivered
      // For now, we'll leave this as a future enhancement
    }

    await transfer.updateStatus(newStatus, notes);

    const updatedTransfer = await FranchiseTransfer.findById(transfer._id)
      .populate('franchise', 'name industry')
      .populate('bharatmartManager', 'firstName lastName email')
      .populate('requestedBy', 'firstName lastName email')
      .populate('items.bharatmartProduct', 'name sku stock')
      .populate('items.franchiseProduct', 'name sku stock')
      .populate('deliveredBy', 'firstName lastName email');

    res.json({
      success: true,
      data: updatedTransfer
    });
  } catch (error) {
    console.error('Update transfer status error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Mark transfer as delivered (special endpoint)
router.patch('/:id/delivered', [
  authenticateToken,
  requirePermission('franchise:write'),
  body('notes').optional().trim().isLength({ max: 500 }).withMessage('Notes must be less than 500 characters'),
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

    const transfer = await FranchiseTransfer.findById(req.params.id);
    if (!transfer) {
      return res.status(404).json({
        success: false,
        error: 'Transfer not found'
      });
    }

    if (transfer.status === 'delivered') {
      return res.status(400).json({
        success: false,
        error: 'Transfer is already marked as delivered'
      });
    }

    if (transfer.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        error: 'Cannot deliver a cancelled transfer'
      });
    }

    // Update main product stock (decrease)
    for (const item of transfer.items) {
      const product = await Product.findById(item.bharatmartProduct);
      if (!product) {
        return res.status(404).json({
          success: false,
          error: `Main product ${item.bharatmartProduct} not found`
        });
      }

      if (product.stock < item.quantity) {
        return res.status(400).json({
          success: false,
          error: `Insufficient stock for ${product.name}. Available: ${product.stock}, Requested: ${item.quantity}`
        });
      }

      // Update main product stock (decrease)
      await Product.findByIdAndUpdate(item.bharatmartProduct, {
        $inc: { stock: -item.quantity }
      });

      // Update franchise product stock (increase)
      await FranchiseProduct.findByIdAndUpdate(item.franchiseProduct, {
        $inc: { stock: item.quantity }
      });
    }

    // Add any additional notes
    if (req.body.notes) {
      await transfer.addNote(req.body.notes);
    }

    // Mark as delivered
    await transfer.markAsDelivered(req.user?._id);

    const updatedTransfer = await FranchiseTransfer.findById(transfer._id)
      .populate('franchise', 'name industry')
      .populate('bharatmartManager', 'firstName lastName email')
      .populate('items.bharatmartProduct', 'name sku')
      .populate('items.franchiseProduct', 'name sku')
      .populate('deliveredBy', 'firstName lastName email');

    res.json({
      success: true,
      data: updatedTransfer
    });
  } catch (error) {
    console.error('Mark transfer as delivered error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Add note to transfer
router.patch('/:id/note', [
  authenticateToken,
  requirePermission('franchise:write'),
  body('note').trim().isLength({ min: 1, max: 500 }).withMessage('Note must be between 1 and 500 characters')
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

    const transfer = await FranchiseTransfer.findById(req.params.id);
    if (!transfer) {
      return res.status(404).json({
        success: false,
        error: 'Transfer not found'
      });
    }

    await transfer.addNote(req.body.note);

    res.json({
      success: true,
      message: 'Note added successfully',
      data: transfer
    });
  } catch (error) {
    console.error('Add note to transfer error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// ============================================
// FRANCHISE-ACCESSIBLE ENDPOINTS
// ============================================

// Get transfers for logged-in franchise
router.get('/my-transfers', [
  authenticateAdminOrFranchise
], async (req: AuthRequest, res: AuthResponse) => {
  try {
    const {
      page = '1',
      limit = '10',
      status,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query as TransferQuery;

    // Get franchise ID - could be from franchiseId (franchise user) or req.user (admin)
    const franchiseId = req.franchiseId || req.user?.franchise || req.user?._id;
    
    if (!franchiseId) {
      return res.status(400).json({
        success: false,
        error: 'Franchise ID not found in token'
      });
    }

    const query: any = { franchise: franchiseId };
    
    if (status) {
      query.status = status;
    }

    // Sort options
    const sortOptions: { [key: string]: 1 | -1 } = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    const transfers = await FranchiseTransfer.find(query)
      .populate('bharatmartManager', 'firstName lastName email')
      .populate('items.bharatmartProduct', 'name sku stock')
      .populate('items.franchiseProduct', 'name sku stock')
      .populate('deliveredBy', 'firstName lastName email')
      .sort(sortOptions)
      .limit(limitNum)
      .skip((pageNum - 1) * limitNum)
      .exec();

    const total = await FranchiseTransfer.countDocuments(query);

    // Get stats
    const stats = await FranchiseTransfer.aggregate([
      { $match: { franchise: franchiseId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const response: PaginatedResponse<ITransfer[]> = {
      success: true,
      data: transfers,
      pagination: {
        total,
        currentPage: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      },
      stats: stats.reduce((acc: any, curr: any) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {})
    };

    res.json(response);
  } catch (error) {
    console.error('Get franchise transfers error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Franchise marks transfer as received
router.patch('/:id/receive', [
  authenticateAdminOrFranchise,
  body('notes').optional().trim().isLength({ max: 500 }).withMessage('Notes must be less than 500 characters')
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

    const transfer = await FranchiseTransfer.findById(req.params.id);
    if (!transfer) {
      return res.status(404).json({
        success: false,
        error: 'Transfer not found'
      });
    }

    // Verify franchise owns this transfer
    const franchiseId = req.franchiseId || req.user?.franchise || req.user?._id;
    if (String(transfer.franchise) !== String(franchiseId)) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to receive this transfer'
      });
    }

    if (transfer.status === 'delivered') {
      return res.status(400).json({
        success: false,
        error: 'Transfer is already marked as delivered'
      });
    }

    if (transfer.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        error: 'Cannot receive a cancelled transfer'
      });
    }

    if (transfer.status !== 'shipped') {
      return res.status(400).json({
        success: false,
        error: 'Transfer must be in shipped status before receiving'
      });
    }

    // Update stock for both main and franchise products
    for (const item of transfer.items) {
      // Verify main product has stock
      const product = await Product.findById(item.bharatmartProduct);
      if (!product) {
        return res.status(404).json({
          success: false,
          error: `Main product ${item.bharatmartProduct} not found`
        });
      }

      if (product.stock < item.quantity) {
        return res.status(400).json({
          success: false,
          error: `Insufficient stock for ${product.name}. Available: ${product.stock}, Requested: ${item.quantity}`
        });
      }

      // Update main product stock (decrease)
      await Product.findByIdAndUpdate(item.bharatmartProduct, {
        $inc: { stock: -item.quantity }
      });

      // Update franchise product stock (increase)
      await FranchiseProduct.findByIdAndUpdate(item.franchiseProduct, {
        $inc: { stock: item.quantity }
      });
    }

    // Add note if provided
    if (req.body.notes) {
      await transfer.addNote(`Received by franchise: ${req.body.notes}`);
    }

    // Mark as delivered
    await transfer.markAsDelivered(req.user?._id);

    const updatedTransfer = await FranchiseTransfer.findById(transfer._id)
      .populate('bharatmartManager', 'firstName lastName email')
      .populate('items.bharatmartProduct', 'name sku stock')
      .populate('items.franchiseProduct', 'name sku stock')
      .populate('deliveredBy', 'firstName lastName email');

    res.json({
      success: true,
      message: 'Transfer marked as received successfully. Stock has been updated.',
      data: updatedTransfer
    });
  } catch (error) {
    console.error('Franchise receive transfer error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

export default router;