const express = require('express');
const router = express.Router();
import { body, validationResult } from 'express-validator';
import Category, { ICategory } from '../models/Category.js';
import Product from '../models/Product.js';
import { authenticateToken, requireSuperAdmin } from '../middleware/auth.js';
import { AuthRequest, AuthResponse, PaginatedResponse, ApiResponse } from '../types/routes.js';

interface CategoryQuery {
  page?: string;
  limit?: string;
  parent?: string;
  level?: string;
  isActive?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  excludeId?: string;
}

// Get all categories
router.get('/', async (req: AuthRequest, res: AuthResponse) => {
  try {
    const { 
      page = '1', 
      limit = '50', 
      parent, 
      level,
      isActive,
      sortBy = 'sortOrder', 
      sortOrder = 'asc' 
    } = req.query as CategoryQuery;
    
    const query: any = {};
    
    if (parent !== undefined) {
      if (parent === 'null' || parent === '') {
        query.parent = null;
      } else {
        query.parent = parent;
      }
    }
    if (level !== undefined) query.level = parseInt(level);
    if (isActive !== undefined) query.isActive = isActive === 'true';

    const sortOptions: { [key: string]: 1 | -1 } = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    const categories = await Category.find(query)
      .populate('parent', 'name slug')
      .sort(sortOptions)
      .limit(limitNum)
      .skip((pageNum - 1) * limitNum)
      .exec();

    const total = await Category.countDocuments(query);

    const response: PaginatedResponse<ICategory[]> = {
      success: true,
      data: categories,
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

// Get category by ID
router.get('/:id', async (req: AuthRequest, res: AuthResponse) => {
  try {
    const category = await Category.findById(req.params.id)
      .populate('parent', 'name slug')
      .populate('children', 'name slug isActive');
    
    if (!category) {
      return res.status(404).json({
        success: false,
        error: 'Category not found'
      });
    }

    res.json({
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

// Create new category (Superadmin only)
router.post('/', [
  authenticateToken,
  requireSuperAdmin,
  body('name').trim().isLength({ min: 2 }).withMessage('Category name must be at least 2 characters'),
  body('description').optional().trim().isLength({ max: 500 }).withMessage('Description must be less than 500 characters'),
  body('parent').optional().isMongoId().withMessage('Valid parent category ID is required'),
  body('sortOrder').optional().isInt({ min: 0 }).withMessage('Sort order must be a non-negative integer'),
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

    const { parent, ...categoryData } = req.body;

    // Check if parent category exists
    if (parent) {
      const parentCategory = await Category.findById(parent);
      if (!parentCategory) {
        return res.status(404).json({
          success: false,
          error: 'Parent category not found'
        });
      }
    }

    const category = new Category({
      ...categoryData,
      parent: parent || null
    });

    await category.save();

    const populatedCategory = await Category.findById(category._id)
      .populate('parent', 'name slug');

    res.status(201).json({
      success: true,
      data: populatedCategory
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Update category (Superadmin only)
router.put('/:id', [
  authenticateToken,
  requireSuperAdmin,
  body('name').optional().trim().isLength({ min: 2 }).withMessage('Category name must be at least 2 characters'),
  body('description').optional().trim().isLength({ max: 500 }).withMessage('Description must be less than 500 characters'),
  body('parent').optional().isMongoId().withMessage('Valid parent category ID is required'),
  body('sortOrder').optional().isInt({ min: 0 }).withMessage('Sort order must be a non-negative integer'),
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

    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({
        success: false,
        error: 'Category not found'
      });
    }

    const { parent, ...updateData } = req.body;

    // Check if parent category exists and prevent circular reference
    if (parent) {
      if (parent === req.params.id) {
        return res.status(400).json({
          success: false,
          error: 'Category cannot be its own parent'
        });
      }

      const parentCategory = await Category.findById(parent);
      if (!parentCategory) {
        return res.status(404).json({
          success: false,
          error: 'Parent category not found'
        });
      }

      // Check if the new parent is not a descendant of this category
      const descendants = await category.getDescendants();
      const descendantIds = descendants.map(d => d._id.toString());
      if (descendantIds.includes(parent)) {
        return res.status(400).json({
          success: false,
          error: 'Cannot set a descendant as parent'
        });
      }
    }

    Object.assign(category, updateData);
    if (parent !== undefined) {
      category.parent = parent || null;
    }

    await category.save();

    const updatedCategory = await Category.findById(category._id)
      .populate('parent', 'name slug');

    res.json({
      success: true,
      data: updatedCategory
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Delete category (Superadmin only)
router.delete('/:id', authenticateToken, requireSuperAdmin, async (req: AuthRequest, res: AuthResponse) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({
        success: false,
        error: 'Category not found'
      });
    }

    // Check if category has children
    const children = await Category.find({ parent: req.params.id });
    if (children.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Cannot delete category with ${children.length} subcategories. Please delete subcategories first.`
      });
    }

    // Check if category has products
    const productsCount = await Product.countDocuments({ category: req.params.id });
    if (productsCount > 0) {
      return res.status(400).json({
        success: false,
        error: `Cannot delete category with ${productsCount} products. Please move or delete products first.`
      });
    }

    await Category.findByIdAndDelete(req.params.id);
    
    // Update parent's subcategory count if exists
    if (category.parent) {
      const parent = await Category.findById(category.parent);
      if (parent) {
        await parent.updateSubcategoryCount();
      }
    }
    
    res.json({
      success: true,
      message: 'Category deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Toggle category active status (Superadmin only)
router.patch('/:id/toggle-status', authenticateToken, requireSuperAdmin, async (req: AuthRequest, res: AuthResponse) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({
        success: false,
        error: 'Category not found'
      });
    }

    const newStatus = !category.isActive;
    category.isActive = newStatus;
    await category.save();

    // If deactivating, also deactivate all children
    if (!newStatus) {
      const descendants = await category.getDescendants();
      if (descendants.length > 0) {
        await Category.updateMany(
          { _id: { $in: descendants } },
          { isActive: false }
        );
      }
    }

    res.json({
      success: true,
      message: `Category ${category.isActive ? 'activated' : 'deactivated'} successfully`,
      data: { isActive: category.isActive }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Toggle category featured status (Superadmin only)
router.patch('/:id/toggle-featured', authenticateToken, requireSuperAdmin, async (req: AuthRequest, res: AuthResponse) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({
        success: false,
        error: 'Category not found'
      });
    }

    category.isFeatured = !category.isFeatured;
    await category.save();

    res.json({
      success: true,
      message: `Category ${category.isFeatured ? 'featured' : 'unfeatured'} successfully`,
      data: { isFeatured: category.isFeatured }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Get category tree
router.get('/tree/structure', async (_req: AuthRequest, res: AuthResponse) => {
  try {
    const tree = await Category.getCategoryTree();
    res.json({
      success: true,
      data: tree
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Get category breadcrumbs
router.get('/:id/breadcrumbs', async (req: AuthRequest, res: AuthResponse) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({
        success: false,
        error: 'Category not found'
      });
    }

    const breadcrumbs = await category.getBreadcrumbs();
    res.json({
      success: true,
      data: breadcrumbs
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Get category descendants
router.get('/:id/descendants', async (req: AuthRequest, res: AuthResponse) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({
        success: false,
        error: 'Category not found'
      });
    }

    const descendants = await category.getDescendants();
    res.json({
      success: true,
      data: descendants
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Get category ancestors
router.get('/:id/ancestors', async (req: AuthRequest, res: AuthResponse) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({
        success: false,
        error: 'Category not found'
      });
    }

    const ancestors = await category.getAncestors();
    res.json({
      success: true,
      data: ancestors
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Get parent categories (for dropdown selection)
router.get('/parents/list', async (req: AuthRequest, res: AuthResponse) => {
  try {
    const { excludeId, level = '0' } = req.query as CategoryQuery;
    
    const query: any = { 
      isActive: true,
      level: parseInt(level)
    };
    
    // Exclude current category if editing
    if (excludeId) {
      query._id = { $ne: excludeId };
    }

    const categories = await Category.find(query)
      .select('name slug level parent')
      .populate('parent', 'name slug')
      .sort({ sortOrder: 1, name: 1 })
      .exec();

    res.json({
      success: true,
      data: categories,
      total: categories.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Get featured categories
router.get('/featured/list', async (_req: AuthRequest, res: AuthResponse) => {
  try {
    const categories = await Category.find({ 
      isActive: true, 
      isFeatured: true 
    })
    .populate('parent', 'name slug')
    .sort({ sortOrder: 1, name: 1 })
    .limit(10);

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

export default router;
