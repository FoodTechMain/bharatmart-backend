const express = require('express');
const { body, validationResult } = require('express-validator');
const Manufacturer = require('../models/Manufacturer');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const Product = require('../models/Product');
const mongoose = require('mongoose');

const router = express.Router();

// Get all manufacturers
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

    const manufacturers = await Manufacturer.find(query)
      .populate('category', 'name')
      .sort(sortOptions)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean()
      .exec();

    const transformed = manufacturers.map(m => ({ ...m, category: m.category || { name: 'Uncategorized' } }));
    const total = await Manufacturer.countDocuments(query);

    res.json({
      data: {
        manufacturers: transformed,
        totalPages: Math.ceil(total / limit),
        currentPage: parseInt(page),
        total
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get manufacturer statistics
router.get('/stats', authenticateToken, requirePermission('manufacturer:read'), async (req, res) => {
  try {
    const stats = await Manufacturer.aggregate([
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

    res.json({ data: stats[0] || { totalManufacturers: 0, activeManufacturers: 0, totalProducts: 0, totalRevenue: 0 } });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create manufacturer
router.post('/', [
  authenticateToken,
  requirePermission('manufacturer:write'),
  body('name').trim().isLength({ min: 2 }).withMessage('Manufacturer name must be at least 2 characters'),
  body('contactPerson').trim().isLength({ min: 3 }).withMessage('Contact person name is required'),
  // Accept any 10-digit phone number (e.g. 9123456789)
  body('phone').matches(/^[0-9]{10}$/).withMessage('Valid 10-digit phone number is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('category').custom(value => {
    if (!value || value === '') return true;
    if (!mongoose.Types.ObjectId.isValid(value)) {
      throw new Error('Invalid category ID');
    }
    return true;
  }),
  body('bankDetails.accountNumber').optional().isString().trim().matches(/^[0-9]{9,18}$/).withMessage('Account number must be 9-18 digits'),
  body('bankDetails.ifscCode').optional().isString().trim().matches(/^[A-Z]{4}0[A-Z0-9]{6}$/).withMessage('IFSC code must be in format: BBBB0XXXXXX (4 letters, 0, 6 alphanumeric)'),
  body('bankDetails.bankName').optional().isString().trim(),
  body('bankDetails.branch').optional().isString().trim(),
  body('bankDetails.accountHolderName').optional().isString().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    if (!req.body.category || req.body.category === '') delete req.body.category;

    const manufacturer = new Manufacturer(req.body);
    await manufacturer.save();
    res.status(201).json({ message: 'Manufacturer created successfully', data: manufacturer });
  } catch (error) {
    res.status(500).json({ message: 'Error creating manufacturer', error: error.message });
  }
});

// Update manufacturer
router.put('/:id', [
  authenticateToken,
  requirePermission('manufacturer:write'),
  body('name').optional().trim().isLength({ min: 2 }),
  body('category').optional().isMongoId(),
  body('contactPerson').optional().trim().isLength({ min: 3 }),
  // Accept any 10-digit phone number on updates as well
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
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const manufacturer = await Manufacturer.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true, runValidators: true }).populate('category', 'name');
    if (!manufacturer) return res.status(404).json({ message: 'Manufacturer not found' });
    res.json({ data: manufacturer });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete manufacturer
router.delete('/:id', authenticateToken, requirePermission('manufacturer:delete'), async (req, res) => {
  try {
    const productsCount = await Product.countDocuments({ manufacturer: req.params.id });
    if (productsCount > 0) return res.status(400).json({ message: 'Cannot delete manufacturer with associated products' });

    const manufacturer = await Manufacturer.findByIdAndDelete(req.params.id);
    if (!manufacturer) return res.status(404).json({ message: 'Manufacturer not found' });
    res.json({ message: 'Manufacturer deleted successfully', data: manufacturer });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Toggle manufacturer status
router.patch('/:id/toggle-status', authenticateToken, requirePermission('manufacturer:write'), async (req, res) => {
  try {
    const manufacturer = await Manufacturer.findById(req.params.id);
    if (!manufacturer) return res.status(404).json({ message: 'Manufacturer not found' });
    manufacturer.isActive = !manufacturer.isActive;
    await manufacturer.save();
    res.json({ message: `Manufacturer ${manufacturer.isActive ? 'activated' : 'deactivated'} successfully`, data: manufacturer });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Bulk update status
router.patch('/bulk/status', authenticateToken, requirePermission('manufacturer:write'), async (req, res) => {
  try {
    const { manufacturerIds, isActive } = req.body;
    if (!Array.isArray(manufacturerIds) || manufacturerIds.length === 0) return res.status(400).json({ message: 'Manufacturer IDs array is required' });
    const result = await Manufacturer.updateMany({ _id: { $in: manufacturerIds } }, { isActive });
    res.json({ message: `${result.modifiedCount} manufacturers ${isActive ? 'activated' : 'deactivated'} successfully`, modifiedCount: result.modifiedCount });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
