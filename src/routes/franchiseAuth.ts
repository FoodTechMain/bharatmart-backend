import express from 'express';
import { body, validationResult } from 'express-validator';
import Franchise from '../models/Franchise';
import jwt from 'jsonwebtoken';
import { authenticateToken } from '../middleware/auth';
import { AuthRequest, AuthResponse } from '../types/routes';

const router = express.Router();

// Login franchise
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
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

    const { email, password } = req.body;

    // Find franchise
    const franchise = await Franchise.findOne({ email }).select('+password');
    if (!franchise) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    // Check if password exists
    if (!franchise.password) {
      return res.status(401).json({
        success: false,
        error: 'Password not set. Please reset your password.'
      });
    }

    // Check password
    const isMatch = await Franchise.comparePassword(password, franchise.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    // Check if franchise is active
    if (!franchise.isActive) {
      return res.status(401).json({
        success: false,
        error: 'Your franchise account has been deactivated'
      });
    }

    // Generate token
    const token = jwt.sign(
      {
        franchiseId: franchise._id,
        role: 'franchise', // Add franchise-specific role
        permissions: [] // Add franchise-specific permissions if needed
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    // Remove sensitive fields from response
    const franchiseResponse = {
      ...franchise.toJSON(),
      role: 'franchise',
      permissions: []
    };

    // Remove password from response
    delete franchiseResponse.password;

    res.json({
      success: true,
      franchise: franchiseResponse,
      token
    });
  } catch (error) {
    console.error('Franchise login error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Get current franchise
router.get('/me', async (req: AuthRequest, res: AuthResponse) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access token is required'
      });
    }

    // Verify and decode token
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'your-secret-key'
    ) as { franchiseId: string; role: string };

    // Check if this is a franchise token
    if (decoded.role !== 'franchise') {
      return res.status(401).json({
        success: false,
        error: 'Not a franchise account'
      });
    }

    // Fetch franchise data
    const franchise = await Franchise.findById(decoded.franchiseId).select('-password');
    
    if (!franchise) {
      return res.status(404).json({
        success: false,
        error: 'Franchise not found'
      });
    }

    if (!franchise.isActive) {
      return res.status(401).json({
        success: false,
        error: 'Franchise account is inactive'
      });
    }

    res.json({
      success: true,
      franchise: {
        ...franchise.toJSON(),
        role: 'franchise'
      }
    });
  } catch (error) {
    console.error('Get current franchise error:', error);
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token'
      });
    }
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

export default router;