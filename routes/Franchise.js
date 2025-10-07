const express = require('express');
const { body, validationResult, param } = require('express-validator');
const Franchise = require('../models/Franchise');
const { authenticateToken, requirePermission, requireSuperAdmin, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// Validation middleware
const validateFranchise = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Franchise name must be between 2 and 100 characters'),
  body('description')
    .trim()
    .isLength({ min: 10, max: 1000 })
    .withMessage('Description must be between 10 and 1000 characters'),
  body('industry')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Industry must be between 2 and 50 characters'),
  body('contactPerson')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Contact person name must be between 2 and 50 characters'),
  body('email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('phone')
    .optional()
    .isMobilePhone('any')
    .withMessage('Valid phone number is required 10 digits'),
  body('website')
    .optional()
    .isURL()
    .withMessage('Valid website URL is required'),
  body('gst')
    .optional()
    .matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/)
    .withMessage('Valid GST number is required 22AAAAA0000A1Z5'),
  body('pan')
    .optional()
    .matches(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/)
    .withMessage('Valid PAN number is required IOQHP7610A'),
  body('investmentRange.min')
    .optional()
    .isNumeric()
    .isFloat({ min: 0 })
    .withMessage('Minimum investment must be a positive number'),
  body('investmentRange.max')
    .optional()
    .isNumeric()
    .isFloat({ min: 0 })
    .withMessage('Maximum investment must be a positive number'),
  body('roi')
    .optional()
    .isNumeric()
    .isFloat({ min: 0, max: 100 })
    .withMessage('ROI must be between 0 and 100'),
  body('establishedYear')
    .optional()
    .isInt({ min: 1900, max: new Date().getFullYear() })
    .withMessage('Valid establishment year is required YYYY'),
  body('totalUnits')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Total units must be a positive integer')
];

const validateBankInfo = [
  body('bank.name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Bank name must be between 2 and 100 characters'),
  body('bank.accountNumber')
    .optional()
    .isLength({ min: 9, max: 18 })
    .withMessage('Account number must be between 9 and 18 characters'),
  body('bank.holderName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Account holder name must be between 2 and 100 characters'),
  body('bank.ifscCode')
    .optional()
    .matches(/^[A-Z]{4}0[A-Z0-9]{6}$/)
    .withMessage('Valid IFSC code is required HDFC0001234'),
  body('bank.branch')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Branch name must be between 2 and 100 characters'),
  body('bank.city')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('City name must be between 2 and 50 characters')
];

// Get all franchises with search, filtering, and pagination
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search, 
      industry,
      status,
      verified,
      minInvestment,
      maxInvestment,
      sortBy = 'createdAt', 
      sortOrder = 'desc' 
    } = req.query;
    
    const query = {};
    
    // Filter by industry
    if (industry && industry.trim() !== '') {
      query.industry = { $regex: industry, $options: 'i' };
    }
    
    // Filter by status
    if (status !== undefined && status !== '') {
      query.isActive = status === 'active';
    }
    
    // Filter by verification status
    if (verified !== undefined && verified !== '') {
      query.isVerified = verified === 'true';
    }
    
    // Filter by investment range
    if (minInvestment || maxInvestment) {
      query['investmentRange.min'] = {};
      if (minInvestment) query['investmentRange.min'].$gte = parseFloat(minInvestment);
      if (maxInvestment) query['investmentRange.min'].$lte = parseFloat(maxInvestment);
    }
    
    // Search functionality
    if (search && search.trim() !== '') {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { industry: { $regex: search, $options: 'i' } },
        { contactPerson: { $regex: search, $options: 'i' } }
      ];
    }

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const franchises = await Franchise.find(query)
      .sort(sortOptions)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean()
      .exec();

    const total = await Franchise.countDocuments(query);

    res.json({
      franchises,
      pagination: {
        totalPages: Math.ceil(total / limit),
        currentPage: parseInt(page),
        total,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get franchises error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get franchise by ID
router.get('/:id', [
  param('id').isMongoId().withMessage('Invalid franchise ID'),
  optionalAuth
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const franchise = await Franchise.findById(req.params.id);
    
    if (!franchise) {
      return res.status(404).json({ message: 'Franchise not found' });
    }

    res.json(franchise);
  } catch (error) {
    console.error('Get franchise error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create new franchise (Superadmin only)
router.post('/', [
  authenticateToken,
  requireSuperAdmin,
  ...validateFranchise,
  ...validateBankInfo
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Check if franchise with same name already exists
    const existingFranchise = await Franchise.findOne({ 
      name: { $regex: new RegExp(`^${req.body.name}$`, 'i') } 
    });
    
    if (existingFranchise) {
      return res.status(400).json({ message: 'Franchise with this name already exists' });
    }

    const franchise = new Franchise(req.body);
    await franchise.save();

    res.status(201).json(franchise);
  } catch (error) {
    console.error('Create franchise error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update franchise (Superadmin only)
router.put('/:id', [
  authenticateToken,
  requireSuperAdmin,
  param('id').isMongoId().withMessage('Invalid franchise ID'),
  ...validateFranchise,
  ...validateBankInfo
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const franchise = await Franchise.findById(req.params.id);
    if (!franchise) {
      return res.status(404).json({ message: 'Franchise not found' });
    }

    // Check if name is being changed and if it already exists
    if (req.body.name && req.body.name !== franchise.name) {
      const existingFranchise = await Franchise.findOne({ 
        name: { $regex: new RegExp(`^${req.body.name}$`, 'i') },
        _id: { $ne: req.params.id }
      });
      
      if (existingFranchise) {
        return res.status(400).json({ message: 'Franchise with this name already exists' });
      }
    }

    Object.assign(franchise, req.body);
    await franchise.save();

    res.json(franchise);
  } catch (error) {
    console.error('Update franchise error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete franchise (Superadmin only)
router.delete('/:id', [
  authenticateToken,
  requireSuperAdmin,
  param('id').isMongoId().withMessage('Invalid franchise ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const franchise = await Franchise.findById(req.params.id);
    if (!franchise) {
      return res.status(404).json({ message: 'Franchise not found' });
    }

    await Franchise.findByIdAndDelete(req.params.id);
    res.json({ message: 'Franchise deleted successfully' });
  } catch (error) {
    console.error('Delete franchise error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Toggle franchise active status (Superadmin only)
router.patch('/:id/toggle-status', [
  authenticateToken,
  requireSuperAdmin,
  param('id').isMongoId().withMessage('Invalid franchise ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const franchise = await Franchise.findById(req.params.id);
    if (!franchise) {
      return res.status(404).json({ message: 'Franchise not found' });
    }

    franchise.isActive = !franchise.isActive;
    await franchise.save();

    res.json({ 
      message: `Franchise ${franchise.isActive ? 'activated' : 'deactivated'} successfully`,
      isActive: franchise.isActive 
    });
  } catch (error) {
    console.error('Toggle franchise status error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Verify franchise (Superadmin only)
router.patch('/:id/verify', [
  authenticateToken,
  requireSuperAdmin,
  param('id').isMongoId().withMessage('Invalid franchise ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const franchise = await Franchise.findById(req.params.id);
    if (!franchise) {
      return res.status(404).json({ message: 'Franchise not found' });
    }

    franchise.isVerified = true;
    await franchise.save();

    res.json({ 
      message: 'Franchise verified successfully',
      isVerified: franchise.isVerified 
    });
  } catch (error) {
    console.error('Verify franchise error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get franchise statistics (Superadmin only)
router.get('/stats/overview', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const stats = await Franchise.aggregate([
      {
        $group: {
          _id: null,
          totalFranchises: { $sum: 1 },
          activeFranchises: {
            $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] }
          },
          verifiedFranchises: {
            $sum: { $cond: [{ $eq: ['$isVerified', true] }, 1, 0] }
          },
          avgInvestmentMin: { $avg: '$investmentRange.min' },
          avgInvestmentMax: { $avg: '$investmentRange.max' },
          avgROI: { $avg: '$roi' },
          avgTotalUnits: { $avg: '$totalUnits' }
        }
      }
    ]);

    const industryStats = await Franchise.aggregate([
      {
        $group: {
          _id: '$industry',
          count: { $sum: 1 },
          avgInvestmentMin: { $avg: '$investmentRange.min' },
          avgROI: { $avg: '$roi' }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    const yearlyStats = await Franchise.aggregate([
      {
        $group: {
          _id: '$establishedYear',
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: -1 } },
      { $limit: 10 }
    ]);

    res.json({
      overview: stats[0] || {
        totalFranchises: 0,
        activeFranchises: 0,
        verifiedFranchises: 0,
        avgInvestmentMin: 0,
        avgInvestmentMax: 0,
        avgROI: 0,
        avgTotalUnits: 0
      },
      industryBreakdown: industryStats,
      yearlyBreakdown: yearlyStats
    });
  } catch (error) {
    console.error('Get franchise stats error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get industries list
router.get('/meta/industries', optionalAuth, async (req, res) => {
  try {
    const industries = await Franchise.distinct('industry');
    res.json({ industries: industries.sort() });
  } catch (error) {
    console.error('Get industries error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Bulk operations (Superadmin only)
router.post('/bulk/activate', [
  authenticateToken,
  requireSuperAdmin,
  body('franchiseIds').isArray().withMessage('Franchise IDs must be an array'),
  body('franchiseIds.*').isMongoId().withMessage('Invalid franchise ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const result = await Franchise.updateMany(
      { _id: { $in: req.body.franchiseIds } },
      { $set: { isActive: true } }
    );

    res.json({ 
      message: `${result.modifiedCount} franchises activated successfully`,
      modifiedCount: result.modifiedCount 
    });
  } catch (error) {
    console.error('Bulk activate franchises error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/bulk/deactivate', [
  authenticateToken,
  requireSuperAdmin,
  body('franchiseIds').isArray().withMessage('Franchise IDs must be an array'),
  body('franchiseIds.*').isMongoId().withMessage('Invalid franchise ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const result = await Franchise.updateMany(
      { _id: { $in: req.body.franchiseIds } },
      { $set: { isActive: false } }
    );

    res.json({ 
      message: `${result.modifiedCount} franchises deactivated successfully`,
      modifiedCount: result.modifiedCount 
    });
  } catch (error) {
    console.error('Bulk deactivate franchises error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
