// import express from 'express';
const express = require('express');
import { body, validationResult } from 'express-validator';
import User, { IUser } from '../../models/User/User';
type UserRole = 'superadmin' | 'admin' | 'user' | 'staff' | 'shop_owner' | 'customer';
import { authenticateToken, requireSuperAdmin, requirePermission } from '../../middleware/auth';
import { AuthRequest, AuthResponse, PaginatedResponse, ApiResponse } from '../../types/routes';

const router = express.Router();

interface UserQuery {
  role?: string;
  status?: string;
  search?: string;
  page?: string;
  limit?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

interface UserUpdateData {
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: UserRole;
  phone?: string;
  address?: any;
  isActive?: boolean;
  avatar?: string;
}

// Get all users (Superadmin only)
router.get('/', authenticateToken, requireSuperAdmin, async (req: AuthRequest, res: AuthResponse) => {
  try {
    const { 
      page = '1', 
      limit = '10', 
      role, 
      status, 
      search, 
      sortBy = 'createdAt', 
      sortOrder = 'desc' 
    } = req.query as UserQuery;
    
    const query: any = {};
    if (role) query.role = role;
    if (status !== undefined && status !== '') query.isActive = status === 'true';
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const sortOptions: { [key: string]: 1 | -1 } = {};
    sortOptions[sortBy || 'createdAt'] = sortOrder === 'desc' ? -1 : 1;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    const users = await User.find(query)
      .select('-password -emailVerificationToken -passwordResetToken')
      .sort(sortOptions)
      .limit(limitNum)
      .skip((pageNum - 1) * limitNum)
      .exec();

    const total = await User.countDocuments(query);

    const response = {
      success: true,
      data: {
        users: users,
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

// Get user by ID
router.get('/:id', authenticateToken, requirePermission('user:read'), async (req: AuthRequest, res: AuthResponse) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password -emailVerificationToken -passwordResetToken');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Create new user (Superadmin only)
router.post('/', [
  authenticateToken,
  requireSuperAdmin,
  body('firstName').trim().isLength({ min: 2 }).withMessage('First name must be at least 2 characters'),
  body('lastName').trim().isLength({ min: 2 }).withMessage('Last name must be at least 2 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('role').isIn(['superadmin', 'admin', 'user', 'staff', 'shop_owner', 'customer']).withMessage('Invalid role'),
  body('phone').optional().isMobilePhone('any').withMessage('Valid phone number is required'),
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

    const { email, ...userData } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'User with this email already exists'
      });
    }

    const user = new User({
      ...userData,
      email
    });

    await user.save();

    const userResponse = user.toJSON();

    res.status(201).json({
      success: true,
      data: userResponse
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Update user
router.put('/:id', [
  authenticateToken,
  requirePermission('user:write'),
  body('firstName').optional().trim().isLength({ min: 2 }).withMessage('First name must be at least 2 characters'),
  body('lastName').optional().trim().isLength({ min: 2 }).withMessage('Last name must be at least 2 characters'),
  body('email').optional().isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('role').optional().isIn(['superadmin', 'shop_owner', 'customer']).withMessage('Invalid role'),
  body('phone').optional().isMobilePhone('any').withMessage('Valid phone number is required'),
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

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Check if email is being changed and if it already exists
    if (req.body.email && req.body.email !== user.email) {
      const existingUser = await User.findOne({ email: req.body.email });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          error: 'User with this email already exists'
        });
      }
    }

    // Exclude password from general update - password should be updated via separate endpoint
    const { password: _password, ...updateData } = req.body;
    
    Object.assign(user, updateData);
    await user.save();

    const userResponse = user.toJSON();

    res.json({
      success: true,
      data: userResponse
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Delete user (Superadmin only)
router.delete('/:id', authenticateToken, requireSuperAdmin, async (req: AuthRequest, res: AuthResponse) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Prevent deleting the last superadmin
    if ((user.role as UserRole) === 'superadmin') {
      const superadminCount = await User.countDocuments({ role: 'superadmin' });
      if (superadminCount <= 1) {
        return res.status(400).json({
          success: false,
          error: 'Cannot delete the last superadmin'
        });
      }
    }

    await User.findByIdAndDelete(req.params.id);
    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Toggle user active status (Superadmin only)
router.patch('/:id/toggle-status', authenticateToken, requireSuperAdmin, async (req: AuthRequest, res: AuthResponse) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    user.isActive = !user.isActive;
    await user.save();

    res.json({
      success: true,
      message: `User ${user.isActive ? 'activated' : 'deactivated'} successfully`,
      data: { isActive: user.isActive }
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
