const express = require('express');
const router = express.Router();
import { body, validationResult } from 'express-validator';
import { Types } from 'mongoose';
import Manufacturer, { IManufacturer } from '../models/Manufacturer.js';
import Product from '../models/Product.js';
import { authenticateToken, requirePermission } from '../middleware/auth.js';
import { AuthRequest, AuthResponse, PaginatedResponse, ApiResponse } from '../types/routes.js';

interface ManufacturerQuery {
  page?: string;
  limit?: string;
  search?: string;
  category?: string;
  status?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

interface ManufacturerStats {
  totalManufacturers: number;
  activeManufacturers: number;
  totalProducts: number;
  totalRevenue: number;
}

interface BulkStatusUpdate {
  manufacturerIds: string[];
  isActive: boolean;
}

// Get all manufacturers
router.get('/', authenticateToken, async (req: AuthRequest, res: AuthResponse) => {
  try {
    const { 
      page = '1', 
      limit = '10', 
      search, 
      category,
      status,
      sortBy = 'createdAt', 
      sortOrder = 'desc' 
    } = req.query as ManufacturerQuery;
    
    const query: any = {};
    
    if (category) query.category = category;
    if (status) query.isActive = status === 'active';
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { contactPerson: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const sortOptions: { [key: string]: 1 | -1 } = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    const manufacturers = await Manufacturer.find(query)
      .populate('category', 'name')
      .sort(sortOptions)
      .limit(limitNum)
      .skip((pageNum - 1) * limitNum)
      .lean()
      .exec();

    const transformed = manufacturers.map(m => ({ 
      ...m, 
      category: (m as any).category || { name: 'Uncategorized' } 
    }));

    const total = await Manufacturer.countDocuments(query);

    const response: PaginatedResponse<IManufacturer[]> = {
      success: true,
      data: transformed,
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

// Get manufacturer statistics
router.get('/stats', authenticateToken, requirePermission('manufacturer:read'), async (_req: AuthRequest, res: AuthResponse) => {
  try {
    const stats = await Manufacturer.aggregate<ManufacturerStats>([
      {
        $group: {
          _id: null,
          totalManufacturers: { $sum: 1 },
          activeManufacturers: { $sum: { $cond: ['$isActive', 1, 0] } },
          totalProducts: { $sum: '$totalProducts' },
          totalRevenue: { $sum: { $ifNull: ['$totalRevenue', 0] } }
        }
      }
    ]);

    res.json({
      success: true,
      data: stats[0] || {
        totalManufacturers: 0,
        activeManufacturers: 0,
        totalProducts: 0,
        totalRevenue: 0
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Create manufacturer
router.post('/', [
  authenticateToken,
  requirePermission('manufacturer:write'),
  body('name').trim().isLength({ min: 2 }).withMessage('Manufacturer name must be at least 2 characters'),
  body('contactPerson').trim().isLength({ min: 3 }).withMessage('Contact person name is required'),
  body('phone').matches(/^[0-9]{10}$/).withMessage('Valid 10-digit phone number is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('category').custom((value: string) => {
    if (!value || value === '') return true;
    if (!Types.ObjectId.isValid(value)) {
      throw new Error('Invalid category ID');
    }
    return true;
  }),
  body('bankDetails.accountNumber').optional().isString().trim().matches(/^[0-9]{9,18}$/).withMessage('Account number must be 9-18 digits'),
  body('bankDetails.ifscCode').optional().isString().trim().matches(/^[A-Z]{4}0[A-Z0-9]{6}$/).withMessage('IFSC code must be in format: BBBB0XXXXXX (4 letters, 0, 6 alphanumeric)'),
  body('bankDetails.bankName').optional().isString().trim(),
  body('bankDetails.branch').optional().isString().trim(),
  body('bankDetails.accountHolderName').optional().isString().trim()
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

    if (!req.body.category || req.body.category === '') {
      delete req.body.category;
    }

    const manufacturer = new Manufacturer(req.body);
    await manufacturer.save();

    res.status(201).json({
      success: true,
      message: 'Manufacturer created successfully',
      data: manufacturer
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error creating manufacturer',
      details: (error as Error).message
    });
  }
});

// Update manufacturer
router.put('/:id', [
  authenticateToken,
  requirePermission('manufacturer:write'),
  body('name').optional().trim().isLength({ min: 2 }),
  body('category').optional().isMongoId(),
  body('contactPerson').optional().trim().isLength({ min: 3 }),
  body('phone').optional().matches(/^[0-9]{10}$/).withMessage('Valid 10-digit phone number is required'),
  body('email').optional().isEmail(),
  body('website').optional().isURL(),
  body('address').optional().isObject(),
  body('gst').optional().matches(/^[0-9A-Z]{15}$/),
  body('pan').optional().matches(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/),
  body('bankDetails.accountNumber').optional().isString().trim().matches(/^[0-9]{9,18}$/).withMessage('Account number must be 9-18 digits'),
  body('bankDetails.ifscCode').optional().isString().trim().matches(/^[A-Z]{4}0[A-Z0-9]{6}$/).withMessage('IFSC code must be in format: BBBB0XXXXXX (4 letters, 0, 6 alphanumeric)'),
  body('bankDetails.bankName').optional().isString().trim(),
  body('bankDetails.branch').optional().isString().trim(),
  body('bankDetails.accountHolderName').optional().isString().trim()
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

    const manufacturer = await Manufacturer.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    ).populate('category', 'name');

    if (!manufacturer) {
      return res.status(404).json({
        success: false,
        error: 'Manufacturer not found'
      });
    }

    res.json({
      success: true,
      data: manufacturer
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Delete manufacturer
router.delete('/:id', authenticateToken, requirePermission('manufacturer:delete'), async (req: AuthRequest, res: AuthResponse) => {
  try {
    const productsCount = await Product.countDocuments({ manufacturer: req.params.id });
    if (productsCount > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete manufacturer with associated products'
      });
    }

    const manufacturer = await Manufacturer.findByIdAndDelete(req.params.id);
    if (!manufacturer) {
      return res.status(404).json({
        success: false,
        error: 'Manufacturer not found'
      });
    }

    res.json({
      success: true,
      message: 'Manufacturer deleted successfully',
      data: manufacturer
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Toggle manufacturer status
router.patch('/:id/toggle-status', authenticateToken, requirePermission('manufacturer:write'), async (req: AuthRequest, res: AuthResponse) => {
  try {
    const manufacturer = await Manufacturer.findById(req.params.id);
    if (!manufacturer) {
      return res.status(404).json({
        success: false,
        error: 'Manufacturer not found'
      });
    }

    manufacturer.isActive = !manufacturer.isActive;
    await manufacturer.save();

    res.json({
      success: true,
      message: `Manufacturer ${manufacturer.isActive ? 'activated' : 'deactivated'} successfully`,
      data: manufacturer
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Bulk update status
router.patch('/bulk/status', authenticateToken, requirePermission('manufacturer:write'), async (req: AuthRequest, res: AuthResponse) => {
  try {
    const { manufacturerIds, isActive } = req.body as BulkStatusUpdate;

    if (!Array.isArray(manufacturerIds) || manufacturerIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Manufacturer IDs array is required'
      });
    }

    const result = await Manufacturer.updateMany(
      { _id: { $in: manufacturerIds } },
      { isActive }
    );

    res.json({
      success: true,
      message: `${result.modifiedCount} manufacturers ${isActive ? 'activated' : 'deactivated'} successfully`,
      data: { modifiedCount: result.modifiedCount }
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
