import express from 'express';
import { body, validationResult } from 'express-validator';
import VendorCategory, { IVendorCategory } from '../models/VendorCategory';
import slugify from 'slugify';
import { authenticateToken } from '../middleware/auth';
import { AuthRequest, AuthResponse, ApiResponse } from '../types/routes';

const router = express.Router();

console.log('[VendorCategories] Route file loaded');

// Get all vendor categories
router.get('/', async (_req: AuthRequest, res: AuthResponse) => {
  try {
    console.log('[VendorCategories] Fetching all vendor categories');
    const categories = await VendorCategory.find().sort({ name: 1 });
    console.log(`[VendorCategories] Found ${categories.length} vendor categories`);
    
    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    console.error('[VendorCategories] Error fetching categories:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Get a single category by ID
router.get('/:id', async (req: AuthRequest, res: AuthResponse) => {
  try {
    console.log(`[VendorCategories] Fetching category with ID: ${req.params.id}`);
    const category = await VendorCategory.findById(req.params.id);
    
    if (!category) {
      console.log(`[VendorCategories] Category not found with ID: ${req.params.id}`);
      return res.status(404).json({
        success: false,
        error: 'Category not found'
      });
    }
    
    console.log(`[VendorCategories] Found category: ${category.name}`);
    res.json({
      success: true,
      data: category
    });
  } catch (error) {
    console.error(`[VendorCategories] Error fetching category ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Search categories by name
router.get('/search/:query', async (req: AuthRequest, res: AuthResponse) => {
  try {
    const { query } = req.params;
    console.log(`[VendorCategories] Searching categories with query: ${query}`);
    
    const categories = await VendorCategory.find({
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } }
      ]
    }).sort({ name: 1 });
    
    console.log(`[VendorCategories] Search found ${categories.length} categories for query: ${query}`);
    
    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    console.error(`[VendorCategories] Error searching categories:`, error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Create new vendor category
// Allow skipping authentication during local development to make testing easier.
const createMiddlewares = [] as any[];
if (process.env.NODE_ENV !== 'development') {
  createMiddlewares.push(authenticateToken);
}
createMiddlewares.push(
  body('name').trim().isLength({ min: 2 }).withMessage('Category name must be at least 2 characters'),
  body('description').optional().trim().isLength({ max: 500 }).withMessage('Description must not exceed 500 characters')
);

router.post('/', createMiddlewares, async (req: AuthRequest, res: AuthResponse) => {
  try {
    console.log(`[VendorCategories] Creating new vendor category with data:`, req.body);
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('[VendorCategories] Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }
    
    // Check if category with same name already exists
    const existingCategory = await VendorCategory.findByName(req.body.name);
    if (existingCategory) {
      console.log(`[VendorCategories] Category already exists with name: ${req.body.name}`);
      return res.status(409).json({
        success: false,
        error: 'Category with this name already exists'
      });
    }
    
    // Ensure a unique slug is set to avoid duplicate key errors in databases
    // that already have a unique index on slug (common in dev environments).
    try {
      const baseSlug = slugify(req.body.name || '', { lower: true, strict: true }) || `${Date.now()}`;
      // append timestamp to ensure uniqueness
      req.body.slug = `${baseSlug}-${Date.now()}`;
    } catch (e) {
      req.body.slug = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    }

    const category = new VendorCategory({
      name: req.body.name,
      description: req.body.description,
      slug: req.body.slug
    });
    
    await category.save();
    console.log(`[VendorCategories] Successfully created vendor category: ${category.name} with ID: ${category._id}`);
    
    res.status(201).json({
      success: true,
      data: category
    });
  } catch (error) {
    console.error('[VendorCategories] Error creating category:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Update vendor category
router.put('/:id', [
  authenticateToken,
  body('name').optional().trim().isLength({ min: 2 }).withMessage('Category name must be at least 2 characters'),
  body('description').optional().trim().isLength({ max: 500 }).withMessage('Description must not exceed 500 characters')
], async (req: AuthRequest, res: AuthResponse) => {
  try {
    console.log(`[VendorCategories] Updating vendor category ${req.params.id} with data:`, req.body);
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('[VendorCategories] Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }
    
    // If name is being updated, check for duplicates
    if (req.body.name) {
      const existingCategory = await VendorCategory.findOne({
        name: { $regex: new RegExp(`^${req.body.name}$`, 'i') },
        _id: { $ne: req.params.id }
      });
      
      if (existingCategory) {
        console.log(`[VendorCategories] Cannot update - category already exists with name: ${req.body.name}`);
        return res.status(409).json({
          success: false,
          error: 'Category with this name already exists'
        });
      }
    }
    
    const category = await VendorCategory.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    
    if (!category) {
      console.log(`[VendorCategories] Category not found for update with ID: ${req.params.id}`);
      return res.status(404).json({
        success: false,
        error: 'Category not found'
      });
    }
    
    console.log(`[VendorCategories] Successfully updated vendor category: ${category.name}`);
    
    res.json({
      success: true,
      data: category
    });
  } catch (error) {
    console.error(`[VendorCategories] Error updating category ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Delete vendor category
router.delete('/:id', authenticateToken, async (req: AuthRequest, res: AuthResponse) => {
  try {
    console.log(`[VendorCategories] Attempting to delete vendor category with ID: ${req.params.id}`);
    
    const category = await VendorCategory.findById(req.params.id);
    if (!category) {
      console.log(`[VendorCategories] Category not found for deletion with ID: ${req.params.id}`);
      return res.status(404).json({
        success: false,
        error: 'Category not found'
      });
    }
    
    console.log(`[VendorCategories] Deleting vendor category: ${category.name}`);
    await VendorCategory.findByIdAndDelete(req.params.id);
    
    console.log(`[VendorCategories] Successfully deleted vendor category: ${category.name}`);
    
    res.json({
      success: true,
      message: 'Category deleted successfully'
    });
  } catch (error) {
    console.error(`[VendorCategories] Error deleting category ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

console.log('[VendorCategories] All routes defined');

export default router;