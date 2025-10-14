"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express = require('express');
const router = express.Router();
const express_validator_1 = require("express-validator");
const Franchise_js_1 = __importDefault(require("../models/Franchise.js"));
const auth_js_1 = require("../middleware/auth.js");
// Validation middleware
const validateFranchise = [
    (0, express_validator_1.body)('name')
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage('Franchise name must be between 2 and 100 characters'),
    (0, express_validator_1.body)('description')
        .trim()
        .isLength({ min: 10, max: 1000 })
        .withMessage('Description must be between 10 and 1000 characters'),
    (0, express_validator_1.body)('industry')
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage('Industry must be between 2 and 50 characters'),
    (0, express_validator_1.body)('contactPerson')
        .optional()
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage('Contact person name must be between 2 and 50 characters'),
    (0, express_validator_1.body)('email')
        .optional()
        .isEmail()
        .normalizeEmail()
        .withMessage('Valid email is required'),
    (0, express_validator_1.body)('phone')
        .optional()
        .isMobilePhone('any')
        .withMessage('Valid phone number is required 10 digits'),
    (0, express_validator_1.body)('website')
        .optional()
        .isURL()
        .withMessage('Valid website URL is required'),
    (0, express_validator_1.body)('gst')
        .optional()
        .matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/)
        .withMessage('Valid GST number is required 22AAAAA0000A1Z5'),
    (0, express_validator_1.body)('pan')
        .optional()
        .matches(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/)
        .withMessage('Valid PAN number is required IOQHP7610A'),
    (0, express_validator_1.body)('investmentRange.min')
        .optional()
        .isNumeric()
        .isFloat({ min: 0 })
        .withMessage('Minimum investment must be a positive number'),
    (0, express_validator_1.body)('investmentRange.max')
        .optional()
        .isNumeric()
        .isFloat({ min: 0 })
        .withMessage('Maximum investment must be a positive number'),
    (0, express_validator_1.body)('roi')
        .optional()
        .isNumeric()
        .isFloat({ min: 0, max: 100 })
        .withMessage('ROI must be between 0 and 100'),
    (0, express_validator_1.body)('establishedYear')
        .optional()
        .isInt({ min: 1900, max: new Date().getFullYear() })
        .withMessage('Valid establishment year is required YYYY'),
    (0, express_validator_1.body)('totalUnits')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Total units must be a positive integer')
];
const validateBankInfo = [
    (0, express_validator_1.body)('bank.name')
        .optional()
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage('Bank name must be between 2 and 100 characters'),
    (0, express_validator_1.body)('bank.accountNumber')
        .optional()
        .isLength({ min: 9, max: 18 })
        .withMessage('Account number must be between 9 and 18 characters'),
    (0, express_validator_1.body)('bank.holderName')
        .optional()
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage('Account holder name must be between 2 and 100 characters'),
    (0, express_validator_1.body)('bank.ifscCode')
        .optional()
        .matches(/^[A-Z]{4}0[A-Z0-9]{6}$/)
        .withMessage('Valid IFSC code is required HDFC0001234'),
    (0, express_validator_1.body)('bank.branch')
        .optional()
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage('Branch name must be between 2 and 100 characters'),
    (0, express_validator_1.body)('bank.city')
        .optional()
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage('City name must be between 2 and 50 characters')
];
// Get all franchises with search, filtering, and pagination
router.get('/', auth_js_1.optionalAuth, async (req, res) => {
    try {
        const { page = '1', limit = '10', search, industry, status, verified, minInvestment, maxInvestment, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
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
            if (minInvestment)
                query['investmentRange.min'].$gte = parseFloat(minInvestment);
            if (maxInvestment)
                query['investmentRange.min'].$lte = parseFloat(maxInvestment);
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
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const franchises = await Franchise_js_1.default.find(query)
            .sort(sortOptions)
            .limit(limitNum)
            .skip((pageNum - 1) * limitNum)
            .lean()
            .exec();
        const total = await Franchise_js_1.default.countDocuments(query);
        const response = {
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
    }
    catch (error) {
        console.error('Get franchises error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
});
// Get franchise by ID
router.get('/:id', [
    (0, express_validator_1.param)('id').isMongoId().withMessage('Invalid franchise ID'),
    auth_js_1.optionalAuth
], async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array()
            });
        }
        const franchise = await Franchise_js_1.default.findById(req.params.id);
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
    }
    catch (error) {
        console.error('Get franchise error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
});
// Create new franchise (Superadmin only)
router.post('/', [
    auth_js_1.authenticateToken,
    auth_js_1.requireSuperAdmin,
    ...validateFranchise,
    ...validateBankInfo
], async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array()
            });
        }
        // Check if franchise with same name already exists
        const existingFranchise = await Franchise_js_1.default.findOne({
            name: { $regex: new RegExp(`^${req.body.name}$`, 'i') }
        });
        if (existingFranchise) {
            return res.status(400).json({
                success: false,
                error: 'Franchise with this name already exists'
            });
        }
        const franchise = new Franchise_js_1.default(req.body);
        await franchise.save();
        res.status(201).json({
            success: true,
            data: franchise
        });
    }
    catch (error) {
        console.error('Create franchise error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
});
// Update franchise (Superadmin only)
router.put('/:id', [
    auth_js_1.authenticateToken,
    auth_js_1.requireSuperAdmin,
    (0, express_validator_1.param)('id').isMongoId().withMessage('Invalid franchise ID'),
    ...validateFranchise,
    ...validateBankInfo
], async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array()
            });
        }
        const franchise = await Franchise_js_1.default.findById(req.params.id);
        if (!franchise) {
            return res.status(404).json({
                success: false,
                error: 'Franchise not found'
            });
        }
        // Check if name is being changed and if it already exists
        if (req.body.name && req.body.name !== franchise.name) {
            const existingFranchise = await Franchise_js_1.default.findOne({
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
    }
    catch (error) {
        console.error('Update franchise error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
});
// Delete franchise (Superadmin only)
router.delete('/:id', [
    auth_js_1.authenticateToken,
    auth_js_1.requireSuperAdmin,
    (0, express_validator_1.param)('id').isMongoId().withMessage('Invalid franchise ID')
], async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array()
            });
        }
        const franchise = await Franchise_js_1.default.findById(req.params.id);
        if (!franchise) {
            return res.status(404).json({
                success: false,
                error: 'Franchise not found'
            });
        }
        await Franchise_js_1.default.findByIdAndDelete(req.params.id);
        res.json({
            success: true,
            message: 'Franchise deleted successfully'
        });
    }
    catch (error) {
        console.error('Delete franchise error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
});
// Toggle franchise active status (Superadmin only)
router.patch('/:id/toggle-status', [
    auth_js_1.authenticateToken,
    auth_js_1.requireSuperAdmin,
    (0, express_validator_1.param)('id').isMongoId().withMessage('Invalid franchise ID')
], async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array()
            });
        }
        const franchise = await Franchise_js_1.default.findById(req.params.id);
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
    }
    catch (error) {
        console.error('Toggle franchise status error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
});
// Verify franchise (Superadmin only)
router.patch('/:id/verify', [
    auth_js_1.authenticateToken,
    auth_js_1.requireSuperAdmin,
    (0, express_validator_1.param)('id').isMongoId().withMessage('Invalid franchise ID')
], async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array()
            });
        }
        const franchise = await Franchise_js_1.default.findById(req.params.id);
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
    }
    catch (error) {
        console.error('Verify franchise error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
});
// Get franchise statistics (Superadmin only)
router.get('/stats/overview', auth_js_1.authenticateToken, auth_js_1.requireSuperAdmin, async (_req, res) => {
    try {
        const stats = await Franchise_js_1.default.aggregate([
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
        const industryStats = await Franchise_js_1.default.aggregate([
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
        const yearlyStats = await Franchise_js_1.default.aggregate([
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
    }
    catch (error) {
        console.error('Get franchise stats error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
});
// Get industries list
router.get('/meta/industries', auth_js_1.optionalAuth, async (_req, res) => {
    try {
        const industries = await Franchise_js_1.default.distinct('industry');
        res.json({
            success: true,
            data: industries.sort()
        });
    }
    catch (error) {
        console.error('Get industries error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
});
// Bulk operations (Superadmin only)
router.post('/bulk/activate', [
    auth_js_1.authenticateToken,
    auth_js_1.requireSuperAdmin,
    (0, express_validator_1.body)('franchiseIds').isArray().withMessage('Franchise IDs must be an array'),
    (0, express_validator_1.body)('franchiseIds.*').isMongoId().withMessage('Invalid franchise ID')
], async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array()
            });
        }
        const result = await Franchise_js_1.default.updateMany({ _id: { $in: req.body.franchiseIds } }, { $set: { isActive: true } });
        res.json({
            success: true,
            message: `${result.modifiedCount} franchises activated successfully`,
            data: { modifiedCount: result.modifiedCount }
        });
    }
    catch (error) {
        console.error('Bulk activate franchises error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
});
router.post('/bulk/deactivate', [
    auth_js_1.authenticateToken,
    auth_js_1.requireSuperAdmin,
    (0, express_validator_1.body)('franchiseIds').isArray().withMessage('Franchise IDs must be an array'),
    (0, express_validator_1.body)('franchiseIds.*').isMongoId().withMessage('Invalid franchise ID')
], async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array()
            });
        }
        const result = await Franchise_js_1.default.updateMany({ _id: { $in: req.body.franchiseIds } }, { $set: { isActive: false } });
        res.json({
            success: true,
            message: `${result.modifiedCount} franchises deactivated successfully`,
            data: { modifiedCount: result.modifiedCount }
        });
    }
    catch (error) {
        console.error('Bulk deactivate franchises error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
});
exports.default = router;
//# sourceMappingURL=Franchise.js.map