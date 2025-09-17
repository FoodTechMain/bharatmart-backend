const express = require('express');
const { body, validationResult } = require('express-validator');
const Category = require('../models/Category');
const { authenticateToken, requireSuperAdmin } = require('../middleware/auth');

const router = express.Router();

// Get all categories
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      parent, 
      level,
      isActive,
      sortBy = 'sortOrder', 
      sortOrder = 'asc' 
    } = req.query;
    
    const query = {};
    
    if (parent !== undefined) {
      if (parent === 'null' || parent === '') {
        query.parent = null;
      } else {
        query.parent = parent;
      }
    }
    if (level !== undefined) query.level = parseInt(level);
    if (isActive !== undefined) query.isActive = isActive === 'true';

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const categories = await Category.find(query)
      .populate('parent', 'name slug')
      .sort(sortOptions)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const total = await Category.countDocuments(query);

    res.json({
      categories,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get category by ID
router.get('/:id', async (req, res) => {
  try {
    const category = await Category.findById(req.params.id)
      .populate('parent', 'name slug')
      .populate('children', 'name slug isActive');
    
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    res.json(category);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
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
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { parent, ...categoryData } = req.body;

    // Check if parent category exists
    if (parent) {
      const parentCategory = await Category.findById(parent);
      if (!parentCategory) {
        return res.status(404).json({ message: 'Parent category not found' });
      }
    }

    const category = new Category({
      ...categoryData,
      parent: parent || null
    });

    await category.save();

    const populatedCategory = await Category.findById(category._id)
      .populate('parent', 'name slug');

    res.status(201).json(populatedCategory);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
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
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    const { parent, ...updateData } = req.body;

    // Check if parent category exists and prevent circular reference
    if (parent) {
      if (parent === req.params.id) {
        return res.status(400).json({ message: 'Category cannot be its own parent' });
      }

      const parentCategory = await Category.findById(parent);
      if (!parentCategory) {
        return res.status(404).json({ message: 'Parent category not found' });
      }

      // Check if the new parent is not a descendant of this category
      const descendants = await category.getDescendants();
      const descendantIds = descendants.map(d => d._id.toString());
      if (descendantIds.includes(parent)) {
        return res.status(400).json({ message: 'Cannot set a descendant as parent' });
      }
    }

    Object.assign(category, updateData);
    if (parent !== undefined) {
      category.parent = parent || null;
    }

    await category.save();

    const updatedCategory = await Category.findById(category._id)
      .populate('parent', 'name slug');

    res.json(updatedCategory);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete category (Superadmin only)
router.delete('/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    // Check if category has children
    const children = await Category.find({ parent: req.params.id });
    if (children.length > 0) {
      return res.status(400).json({ 
        message: `Cannot delete category with ${children.length} subcategories. Please delete subcategories first.` 
      });
    }

    // Check if category has products
    const Product = require('../models/Product');
    const productsCount = await Product.countDocuments({ category: req.params.id });
    if (productsCount > 0) {
      return res.status(400).json({ 
        message: `Cannot delete category with ${productsCount} products. Please move or delete products first.` 
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
    
    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Toggle category active status (Superadmin only)
router.patch('/:id/toggle-status', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    const newStatus = !category.isActive;
    category.isActive = newStatus;
    await category.save();

    // If deactivating, also deactivate all children
    if (!newStatus) {
      const Category = require('../models/Category');
      const descendants = await category.getDescendants();
      if (descendants.length > 0) {
        await Category.updateMany(
          { _id: { $in: descendants } },
          { isActive: false }
        );
      }
    }

    res.json({ 
      message: `Category ${category.isActive ? 'activated' : 'deactivated'} successfully`,
      isActive: category.isActive 
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Toggle category featured status (Superadmin only)
router.patch('/:id/toggle-featured', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    category.isFeatured = !category.isFeatured;
    await category.save();

    res.json({ 
      message: `Category ${category.isFeatured ? 'featured' : 'unfeatured'} successfully`,
      isFeatured: category.isFeatured 
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get category tree
router.get('/tree/structure', async (req, res) => {
  try {
    const tree = await Category.getCategoryTree();
    res.json(tree);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get category breadcrumbs
router.get('/:id/breadcrumbs', async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    const breadcrumbs = await category.getBreadcrumbs();
    res.json(breadcrumbs);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get category descendants
router.get('/:id/descendants', async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    const descendants = await category.getDescendants();
    res.json(descendants);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get category ancestors
router.get('/:id/ancestors', async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    const ancestors = await category.getAncestors();
    res.json(ancestors);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get parent categories (for dropdown selection)
router.get('/parents/list', async (req, res) => {
  try {
    const { excludeId, level = 0 } = req.query;
    
    const query = { 
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
      categories,
      total: categories.length
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get featured categories
router.get('/featured/list', async (req, res) => {
  try {
    const categories = await Category.find({ 
      isActive: true, 
      isFeatured: true 
    })
    .populate('parent', 'name slug')
    .sort({ sortOrder: 1, name: 1 })
    .limit(10);

    res.json(categories);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router; 