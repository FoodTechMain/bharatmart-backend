const express = require('express');
const { body, validationResult } = require('express-validator');
const ManufacturerCategory = require('../models/ManufacturerCategory');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get all top-level manufacturer categories (main categories)
router.get('/', async (req, res) => {
  try {
    const categories = await ManufacturerCategory.find({ parent: null }).sort({ name: 1 });
    res.json({ manufacturerCategories: categories });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get all categories with hierarchy (including subcategories)
router.get('/hierarchy', async (req, res) => {
  try {
    // Get all categories
    const allCategories = await ManufacturerCategory.find().sort({ name: 1 });
    
    // Build the hierarchy
    const mainCategories = allCategories.filter(cat => !cat.parent);
    const subCategories = allCategories.filter(cat => cat.parent);
    
    // Attach subcategories to their parents
    const categoriesWithHierarchy = mainCategories.map(cat => {
      const categoryObj = cat.toObject();
      categoryObj.children = subCategories
        .filter(subCat => subCat.parent.toString() === cat._id.toString())
        .map(subCat => subCat.toObject());
      return categoryObj;
    });
    
    res.json({ manufacturerCategories: categoriesWithHierarchy });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get subcategories for a specific category
router.get('/:categoryId/subcategories', async (req, res) => {
  try {
    const { categoryId } = req.params;
    const subcategories = await ManufacturerCategory.find({ parent: categoryId }).sort({ name: 1 });
    res.json({ subcategories });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get a single category by ID
router.get('/:id', async (req, res) => {
  try {
    const category = await ManufacturerCategory.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }
    res.json({ category });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create new main category
router.post('/', [
  authenticateToken,
  body('name').trim().isLength({ min: 2 }).withMessage('Category name must be at least 2 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const category = new ManufacturerCategory({
      name: req.body.name,
      level: 0  // Main category
    });
    
    await category.save();
    res.status(201).json(category);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create new subcategory
router.post('/:categoryId/subcategories', [
  authenticateToken,
  body('name').trim().isLength({ min: 2 }).withMessage('Subcategory name must be at least 2 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    // Check if parent category exists
    const parentCategory = await ManufacturerCategory.findById(req.params.categoryId);
    if (!parentCategory) {
      return res.status(404).json({ message: 'Parent category not found' });
    }
    
    const subcategory = new ManufacturerCategory({
      name: req.body.name,
      parent: req.params.categoryId,
      level: 1  // Subcategory
    });
    
    await subcategory.save();
    
    // Update parent to include the new child
    await ManufacturerCategory.findByIdAndUpdate(req.params.categoryId, {
      $push: { children: subcategory._id }
    });
    
    res.status(201).json(subcategory);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update category
router.put('/:id', [
  authenticateToken,
  body('name').optional().trim().isLength({ min: 2 }).withMessage('Category name must be at least 2 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const category = await ManufacturerCategory.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }
    
    res.json(category);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete category and its subcategories (if any)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const category = await ManufacturerCategory.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }
    
    // If this is a main category, delete all its subcategories first
    if (category.level === 0) {
      await ManufacturerCategory.deleteMany({ parent: req.params.id });
      
      // Remove references to this category from other categories' children arrays
      await ManufacturerCategory.updateMany(
        { children: { $in: [req.params.id] } },
        { $pull: { children: req.params.id } }
      );
    } else {
      // If this is a subcategory, remove it from its parent's children array
      if (category.parent) {
        await ManufacturerCategory.findByIdAndUpdate(
          category.parent,
          { $pull: { children: req.params.id } }
        );
      }
    }
    
    await ManufacturerCategory.findByIdAndDelete(req.params.id);
    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;