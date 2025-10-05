const express = require('express');
const { body, validationResult } = require('express-validator');
const Manufacturer = require('../models/Manufacturer');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const Product = require('../models/Product');
const mongoose = require('mongoose');

const router = express.Router();

// Get all brands
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search, 
      category,
      status,
      sortBy = 'createdAt', 
      sortOrder = 'desc' 
    } = req.query;
    
    const query = {};
    
    if (category) query.category = category;
    if (status) query.isActive = status === 'active';
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { contactPerson: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const brands = await Manufacturer.find(query)
      .populate('category', 'name')
      .sort(sortOptions)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean()
      .exec();

    // Transform the response to handle null categories
    const transformedBrands = brands.map(brand => ({
      ...brand,
      category: brand.category || { name: 'Uncategorized' }
    }));

  const total = await Manufacturer.countDocuments(query);

    res.json({
      data: {
        brands: transformedBrands,
        totalPages: Math.ceil(total / limit),
        currentPage: parseInt(page),
        total
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get brand statistics
router.get('/stats', authenticateToken, requirePermission('brand:read'), async (req, res) => {
  try {
  const stats = await Manufacturer.aggregate([
      {
        $group: {
          _id: null,
          totalBrands: { $sum: 1 },
          activeBrands: { $sum: { $cond: ['$isActive', 1, 0] } },
          totalProducts: { $sum: '$totalProducts' },
          totalRevenue: { $sum: { $ifNull: ['$totalRevenue', 0] } }
        }
      }
    ]);

    res.json({
      data: stats[0] || {
        totalBrands: 0,
        activeBrands: 0,
        totalProducts: 0,
        totalRevenue: 0
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Modify the create brand route
router.post('/', [
  authenticateToken,
  requirePermission('brand:write'),
  body('name').trim().isLength({ min: 2 }).withMessage('Brand name must be at least 2 characters'),
  body('contactPerson').trim().isLength({ min: 3 }).withMessage('Contact person name is required'),
  body('phone').matches(/^[0-9]{10}$/).withMessage('Valid 10-digit phone number is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('category').custom(value => {
    if (!value || value === '') return true;
    if (!mongoose.Types.ObjectId.isValid(value)) {
      throw new Error('Invalid category ID');
    }
    return true;
  })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Clean up the request body
    if (!req.body.category || req.body.category === '') {
      delete req.body.category; // Remove empty category field
    }

  const brand = new Manufacturer(req.body);
  await brand.save();

    res.status(201).json({ 
      message: 'Brand created successfully',
      data: brand 
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'Error creating brand', 
      error: error.message 
    });
  }
});

// Update brand
router.put('/:id', [
  authenticateToken,
  requirePermission('brand:write'),
  body('name').optional().trim().isLength({ min: 2 }),
  body('category').optional().isMongoId(),
  body('contactPerson').optional().trim().isLength({ min: 3 }),
  body('phone').optional().matches(/^[0-9]{10}$/),
  body('email').optional().isEmail(),
  body('website').optional().isURL(),
  body('address').optional().isObject(),
  body('gst').optional().matches(/^[0-9A-Z]{15}$/),
  body('pan').optional().matches(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/)
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const brand = await Manufacturer.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    ).populate('category', 'name');

    if (!brand) {
      return res.status(404).json({ message: 'Brand not found' });
    }

    res.json({ data: brand });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete brand
router.delete('/:id', authenticateToken, requirePermission('brand:delete'), async (req, res) => {
  try {
  const productsCount = await Product.countDocuments({ manufacturer: req.params.id });
    if (productsCount > 0) {
      return res.status(400).json({ 
        message: 'Cannot delete brand with associated products' 
      });
    }

  const brand = await Manufacturer.findByIdAndDelete(req.params.id);
    if (!brand) {
      return res.status(404).json({ message: 'Brand not found' });
    }

    res.json({ 
      message: 'Brand deleted successfully',
      data: brand 
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Toggle brand status
router.patch('/:id/toggle-status', authenticateToken, requirePermission('brand:write'), async (req, res) => {
  try {
  const brand = await Manufacturer.findById(req.params.id);
    if (!brand) {
      return res.status(404).json({ message: 'Brand not found' });
    }

    brand.isActive = !brand.isActive;
    await brand.save();

    res.json({ 
      message: `Brand ${brand.isActive ? 'activated' : 'deactivated'} successfully`,
      data: brand
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Bulk update brand status
router.patch('/bulk/status', authenticateToken, requirePermission('brand:write'), async (req, res) => {
  try {
    const { brandIds, isActive } = req.body;
    
    if (!Array.isArray(brandIds) || brandIds.length === 0) {
      return res.status(400).json({ message: 'Brand IDs array is required' });
    }

    const result = await Manufacturer.updateMany(
      { _id: { $in: brandIds } },
      { isActive }
    );

    res.json({ 
      message: `${result.modifiedCount} brands ${isActive ? 'activated' : 'deactivated'} successfully`,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;