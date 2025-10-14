const express = require('express');
const router = express.Router();
import { body, validationResult } from 'express-validator';
import ProductCategory, { IProductCategory } from '../models/ProductCategory.js';
import { authenticateToken } from '../middleware/auth.js';
import { AuthRequest, AuthResponse, ApiResponse } from '../types/routes.js';

// GET /product-categories - List all product categories
router.get('/', async (_req: AuthRequest, res: AuthResponse) => {
  try {
    const categories = await ProductCategory.find().sort({ name: 1 });
    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Create new product category
router.post('/', [
  authenticateToken,
  body('name').trim().isLength({ min: 2 }).withMessage('Category name must be at least 2 characters')
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

    const category = new ProductCategory({ name: req.body.name });
    await category.save();

    res.status(201).json({
      success: true,
      data: category
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
