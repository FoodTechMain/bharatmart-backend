import express from 'express';
import nodemailer from 'nodemailer';
import bcrypt from 'bcryptjs';
const router = express.Router();

// Function to generate secure 6-digit password with mixed characters
function generateSecurePassword(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const symbols = '!@#$%^&*';
  
  let password = '';
  
  // Ensure at least one of each type
  password += chars[Math.floor(Math.random() * chars.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += symbols[Math.floor(Math.random() * symbols.length)];
  
  // Fill remaining 3 characters randomly
  const allChars = chars + numbers + symbols;
  for(let i = 0; i < 3; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }
  
  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

// Configure nodemailer
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT),
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});
import { body, validationResult, param } from 'express-validator';
import Franchise, { IFranchise } from '../models/Franchise';
import { authenticateToken, requirePermission, requireSuperAdmin, optionalAuth } from '../middleware/auth';
import { AuthRequest, AuthResponse, PaginatedResponse, ApiResponse } from '../types/routes';

interface FranchiseQuery {
  page?: string;
  limit?: string;
  search?: string;
  industry?: string;
  status?: string;
  verified?: string;
  minInvestment?: string;
  maxInvestment?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

interface FranchiseStats {
  totalFranchises: number;
  activeFranchises: number;
  verifiedFranchises: number;
  avgInvestmentMin: number;
  avgInvestmentMax: number;
  avgROI: number;
  avgTotalUnits: number;
}

interface IndustryStats {
  _id: string;
  count: number;
  avgInvestmentMin: number;
  avgROI: number;
}

interface YearlyStats {
  _id: number;
  count: number;
}

interface BulkOperationResult {
  modifiedCount: number;
}

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
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Contact person name must be between 2 and 50 characters'),
  body('email')
    .trim()
    .isEmail()
    .withMessage('Valid email is required for franchise credentials'),
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
router.get('/', optionalAuth, async (req: AuthRequest, res: AuthResponse) => {
  try {
    const { 
      page = '1', 
      limit = '10', 
      search, 
      industry,
      status,
      verified,
      minInvestment,
      maxInvestment,
      sortBy = 'createdAt', 
      sortOrder = 'desc' 
    } = req.query as FranchiseQuery;
    
    const query: any = {};
    
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

    const sortOptions: { [key: string]: 1 | -1 } = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    const franchises = await Franchise.find(query)
      .sort(sortOptions)
      .limit(limitNum)
      .skip((pageNum - 1) * limitNum)
      .lean()
      .exec();

    const total = await Franchise.countDocuments(query);

    const response: PaginatedResponse<IFranchise[]> = {
      success: true,
      data: franchises,
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
    console.error('Get franchises error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Get franchise by ID
router.get('/:id', [
  param('id').isMongoId().withMessage('Invalid franchise ID'),
  optionalAuth
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

    const franchise = await Franchise.findById(req.params.id);
    
    if (!franchise) {
      return res.status(404).json({
        success: false,
        error: 'Franchise not found'
      });
    }

    res.json({
      success: true,
      data: franchise
    });
  } catch (error) {
    console.error('Get franchise error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Create new franchise (Superadmin only)
router.post('/', [
  authenticateToken,
  requireSuperAdmin,
  ...validateFranchise,
  ...validateBankInfo
], async (req: AuthRequest, res: AuthResponse) => {
  try {
    console.log('Creating new franchise with data:', req.body);
    console.log('SMTP Email Configuration:', {
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    });

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    if (!req.body.email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required for franchise credentials'
      });
    }

    // Check if franchise with same name exists
    const existingFranchise = await Franchise.findOne({ 
      name: { $regex: new RegExp(`^${req.body.name}$`, 'i') } 
    });
    
    if (existingFranchise) {
      return res.status(400).json({
        success: false,
        error: 'Franchise with this name already exists'
      });
    }

    // Generate and hash password
    const tempPassword = generateSecurePassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    // Convert investment range values to numbers if they exist
    const investmentRange = {
      min: req.body.investmentRange?.min ? Number(req.body.investmentRange.min) : undefined,
      max: req.body.investmentRange?.max ? Number(req.body.investmentRange.max) : undefined
    };

    // Prepare franchise data
    const franchiseData = {
      ...req.body,
      investmentRange,
      password: hashedPassword,
      mustChangePassword: true
    };

    // Remove undefined values
    Object.keys(franchiseData).forEach(key => 
      franchiseData[key] === undefined && delete franchiseData[key]
    );

    const franchise = new Franchise(franchiseData);
    await franchise.save();

    console.log("the email of the franchise owner is " + req.body.email);
    // Send email with credentials if email is provided
    if (req.body.email) {
      try {
        console.log('Sending welcome email to:', req.body.email);
        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: req.body.email,
          subject: 'Welcome to BharatMart - Your Franchise Access Credentials',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #2c3e50;">Welcome to BharatMart!</h2>
              <p>Dear ${req.body.contactPerson || 'Franchise Owner'},</p>
              <p>Your franchise has been successfully registered with BharatMart. Below are your login credentials:</p>
              <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <p style="margin: 0;"><strong>Login Details:</strong></p>
                <p style="margin: 10px 0;"><strong>Email:</strong> ${req.body.email}</p>
                <p style="margin: 10px 0;"><strong>Temporary Password:</strong> <code style="background: #e9ecef; padding: 2px 5px;">${tempPassword}</code></p>
              </div>
              <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <p style="color: #856404; margin: 0;"><strong>⚠️ Important Security Notice:</strong></p>
                <p style="color: #856404; margin: 10px 0;">Please change your password when you first log in for security purposes.</p>
              </div>
              <p>If you have any questions, please don't hesitate to contact our support team.</p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
              <p style="color: #666;">Best regards,<br>BharatMart Team</p>
            </div>
          `
        });
        console.log('Welcome email sent successfully to:', req.body.email);
      } catch (emailError) {
        console.error('Failed to send welcome email:', emailError);
        // Continue with the response even if email fails
      }
    }

    res.status(201).json({
      success: true,
      data: franchise
    });
  } catch (error) {
    console.error('Create franchise error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Update franchise (Superadmin only)
router.put('/:id', [
  authenticateToken,
  requireSuperAdmin,
  param('id').isMongoId().withMessage('Invalid franchise ID'),
  ...validateFranchise,
  ...validateBankInfo
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

    const franchise = await Franchise.findById(req.params.id);
    if (!franchise) {
      return res.status(404).json({
        success: false,
        error: 'Franchise not found'
      });
    }

    // Check if name is being changed and if it already exists
    if (req.body.name && req.body.name !== franchise.name) {
      const existingFranchise = await Franchise.findOne({ 
        name: { $regex: new RegExp(`^${req.body.name}$`, 'i') },
        _id: { $ne: req.params.id }
      });
      
      if (existingFranchise) {
        return res.status(400).json({
          success: false,
          error: 'Franchise with this name already exists'
        });
      }
    }

    Object.assign(franchise, req.body);
    await franchise.save();

    res.json({
      success: true,
      data: franchise
    });
  } catch (error) {
    console.error('Update franchise error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Delete franchise (Superadmin only)
router.delete('/:id', [
  authenticateToken,
  requireSuperAdmin,
  param('id').isMongoId().withMessage('Invalid franchise ID')
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

    const franchise = await Franchise.findById(req.params.id);
    if (!franchise) {
      return res.status(404).json({
        success: false,
        error: 'Franchise not found'
      });
    }

    await Franchise.findByIdAndDelete(req.params.id);
    res.json({
      success: true,
      message: 'Franchise deleted successfully'
    });
  } catch (error) {
    console.error('Delete franchise error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Toggle franchise active status (Superadmin only)
router.patch('/:id/toggle-status', [
  authenticateToken,
  requireSuperAdmin,
  param('id').isMongoId().withMessage('Invalid franchise ID')
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

    const franchise = await Franchise.findById(req.params.id);
    if (!franchise) {
      return res.status(404).json({
        success: false,
        error: 'Franchise not found'
      });
    }

    franchise.isActive = !franchise.isActive;
    await franchise.save();

    res.json({
      success: true,
      message: `Franchise ${franchise.isActive ? 'activated' : 'deactivated'} successfully`,
      data: { isActive: franchise.isActive }
    });
  } catch (error) {
    console.error('Toggle franchise status error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Verify franchise (Superadmin only)
router.patch('/:id/verify', [
  authenticateToken,
  requireSuperAdmin,
  param('id').isMongoId().withMessage('Invalid franchise ID')
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

    const franchise = await Franchise.findById(req.params.id);
    if (!franchise) {
      return res.status(404).json({
        success: false,
        error: 'Franchise not found'
      });
    }

    franchise.isVerified = true;
    await franchise.save();

    res.json({
      success: true,
      message: 'Franchise verified successfully',
      data: { isVerified: franchise.isVerified }
    });
  } catch (error) {
    console.error('Verify franchise error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Get franchise statistics (Superadmin only)
router.get('/stats/overview', authenticateToken, requireSuperAdmin, async (_req: AuthRequest, res: AuthResponse) => {
  try {
    const stats = await Franchise.aggregate<FranchiseStats>([
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

    const industryStats = await Franchise.aggregate<IndustryStats>([
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

    const yearlyStats = await Franchise.aggregate<YearlyStats>([
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
      success: true,
      data: {
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
      }
    });
  } catch (error) {
    console.error('Get franchise stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Get industries list
router.get('/meta/industries', optionalAuth, async (_req: AuthRequest, res: AuthResponse) => {
  try {
    const industries = await Franchise.distinct('industry');
    res.json({
      success: true,
      data: industries.sort()
    });
  } catch (error) {
    console.error('Get industries error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Bulk operations (Superadmin only)
router.post('/bulk/activate', [
  authenticateToken,
  requireSuperAdmin,
  body('franchiseIds').isArray().withMessage('Franchise IDs must be an array'),
  body('franchiseIds.*').isMongoId().withMessage('Invalid franchise ID')
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

    const result = await Franchise.updateMany(
      { _id: { $in: req.body.franchiseIds } },
      { $set: { isActive: true } }
    );

    res.json({
      success: true,
      message: `${result.modifiedCount} franchises activated successfully`,
      data: { modifiedCount: result.modifiedCount }
    });
  } catch (error) {
    console.error('Bulk activate franchises error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

router.post('/bulk/deactivate', [
  authenticateToken,
  requireSuperAdmin,
  body('franchiseIds').isArray().withMessage('Franchise IDs must be an array'),
  body('franchiseIds.*').isMongoId().withMessage('Invalid franchise ID')
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

    const result = await Franchise.updateMany(
      { _id: { $in: req.body.franchiseIds } },
      { $set: { isActive: false } }
    );

    res.json({
      success: true,
      message: `${result.modifiedCount} franchises deactivated successfully`,
      data: { modifiedCount: result.modifiedCount }
    });
  } catch (error) {
    console.error('Bulk deactivate franchises error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

export default router;
