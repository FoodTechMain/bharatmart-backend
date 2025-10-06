const express = require('express');
const { body, validationResult } = require('express-validator');
const ManufacturerCategory = require('../models/ManufacturerCategory');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get all manufacturer categories
router.get('/', async (req, res) => {
  try {
    const categories = await ManufacturerCategory.find().sort({ name: 1 });
    res.json({ manufacturerCategories: categories });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create new manufacturer category
router.post('/', [
  authenticateToken,
  body('name').trim().isLength({ min: 2 }).withMessage('Category name must be at least 2 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const category = new ManufacturerCategory({ name: req.body.name });
    await category.save();
    res.status(201).json(category);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;