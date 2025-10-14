"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express = require('express');
const router = express.Router();
const express_validator_1 = require("express-validator");
const mongoose_1 = require("mongoose");
const Manufacturer_js_1 = __importDefault(require("../models/Manufacturer.js"));
const Product_js_1 = __importDefault(require("../models/Product.js"));
const auth_js_1 = require("../middleware/auth.js");
// Get all manufacturers
router.get('/', auth_js_1.authenticateToken, async (req, res) => {
    try {
        const { page = '1', limit = '10', search, category, status, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
        const query = {};
        if (category)
            query.category = category;
        if (status)
            query.isActive = status === 'active';
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { contactPerson: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }
        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const manufacturers = await Manufacturer_js_1.default.find(query)
            .populate('category', 'name')
            .sort(sortOptions)
            .limit(limitNum)
            .skip((pageNum - 1) * limitNum)
            .lean()
            .exec();
        const transformed = manufacturers.map(m => ({
            ...m,
            category: m.category || { name: 'Uncategorized' }
        }));
        const total = await Manufacturer_js_1.default.countDocuments(query);
        const response = {
            success: true,
            data: transformed,
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
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
});
// Get manufacturer statistics
router.get('/stats', auth_js_1.authenticateToken, (0, auth_js_1.requirePermission)('manufacturer:read'), async (_req, res) => {
    try {
        const stats = await Manufacturer_js_1.default.aggregate([
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
        res.json({
            success: true,
            data: stats[0] || {
                totalManufacturers: 0,
                activeManufacturers: 0,
                totalProducts: 0,
                totalRevenue: 0
            }
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
});
// Create manufacturer
router.post('/', [
    auth_js_1.authenticateToken,
    (0, auth_js_1.requirePermission)('manufacturer:write'),
    (0, express_validator_1.body)('name').trim().isLength({ min: 2 }).withMessage('Manufacturer name must be at least 2 characters'),
    (0, express_validator_1.body)('contactPerson').trim().isLength({ min: 3 }).withMessage('Contact person name is required'),
    (0, express_validator_1.body)('phone').matches(/^[0-9]{10}$/).withMessage('Valid 10-digit phone number is required'),
    (0, express_validator_1.body)('email').isEmail().withMessage('Valid email is required'),
    (0, express_validator_1.body)('category').custom((value) => {
        if (!value || value === '')
            return true;
        if (!mongoose_1.Types.ObjectId.isValid(value)) {
            throw new Error('Invalid category ID');
        }
        return true;
    }),
    (0, express_validator_1.body)('bankDetails.accountNumber').optional().isString().trim().matches(/^[0-9]{9,18}$/).withMessage('Account number must be 9-18 digits'),
    (0, express_validator_1.body)('bankDetails.ifscCode').optional().isString().trim().matches(/^[A-Z]{4}0[A-Z0-9]{6}$/).withMessage('IFSC code must be in format: BBBB0XXXXXX (4 letters, 0, 6 alphanumeric)'),
    (0, express_validator_1.body)('bankDetails.bankName').optional().isString().trim(),
    (0, express_validator_1.body)('bankDetails.branch').optional().isString().trim(),
    (0, express_validator_1.body)('bankDetails.accountHolderName').optional().isString().trim()
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
        if (!req.body.category || req.body.category === '') {
            delete req.body.category;
        }
        const manufacturer = new Manufacturer_js_1.default(req.body);
        await manufacturer.save();
        res.status(201).json({
            success: true,
            message: 'Manufacturer created successfully',
            data: manufacturer
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: 'Error creating manufacturer',
            details: error.message
        });
    }
});
// Update manufacturer
router.put('/:id', [
    auth_js_1.authenticateToken,
    (0, auth_js_1.requirePermission)('manufacturer:write'),
    (0, express_validator_1.body)('name').optional().trim().isLength({ min: 2 }),
    (0, express_validator_1.body)('category').optional().isMongoId(),
    (0, express_validator_1.body)('contactPerson').optional().trim().isLength({ min: 3 }),
    (0, express_validator_1.body)('phone').optional().matches(/^[0-9]{10}$/).withMessage('Valid 10-digit phone number is required'),
    (0, express_validator_1.body)('email').optional().isEmail(),
    (0, express_validator_1.body)('website').optional().isURL(),
    (0, express_validator_1.body)('address').optional().isObject(),
    (0, express_validator_1.body)('gst').optional().matches(/^[0-9A-Z]{15}$/),
    (0, express_validator_1.body)('pan').optional().matches(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/),
    (0, express_validator_1.body)('bankDetails.accountNumber').optional().isString().trim().matches(/^[0-9]{9,18}$/).withMessage('Account number must be 9-18 digits'),
    (0, express_validator_1.body)('bankDetails.ifscCode').optional().isString().trim().matches(/^[A-Z]{4}0[A-Z0-9]{6}$/).withMessage('IFSC code must be in format: BBBB0XXXXXX (4 letters, 0, 6 alphanumeric)'),
    (0, express_validator_1.body)('bankDetails.bankName').optional().isString().trim(),
    (0, express_validator_1.body)('bankDetails.branch').optional().isString().trim(),
    (0, express_validator_1.body)('bankDetails.accountHolderName').optional().isString().trim()
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
        const manufacturer = await Manufacturer_js_1.default.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true, runValidators: true }).populate('category', 'name');
        if (!manufacturer) {
            return res.status(404).json({
                success: false,
                error: 'Manufacturer not found'
            });
        }
        res.json({
            success: true,
            data: manufacturer
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
});
// Delete manufacturer
router.delete('/:id', auth_js_1.authenticateToken, (0, auth_js_1.requirePermission)('manufacturer:delete'), async (req, res) => {
    try {
        const productsCount = await Product_js_1.default.countDocuments({ manufacturer: req.params.id });
        if (productsCount > 0) {
            return res.status(400).json({
                success: false,
                error: 'Cannot delete manufacturer with associated products'
            });
        }
        const manufacturer = await Manufacturer_js_1.default.findByIdAndDelete(req.params.id);
        if (!manufacturer) {
            return res.status(404).json({
                success: false,
                error: 'Manufacturer not found'
            });
        }
        res.json({
            success: true,
            message: 'Manufacturer deleted successfully',
            data: manufacturer
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
});
// Toggle manufacturer status
router.patch('/:id/toggle-status', auth_js_1.authenticateToken, (0, auth_js_1.requirePermission)('manufacturer:write'), async (req, res) => {
    try {
        const manufacturer = await Manufacturer_js_1.default.findById(req.params.id);
        if (!manufacturer) {
            return res.status(404).json({
                success: false,
                error: 'Manufacturer not found'
            });
        }
        manufacturer.isActive = !manufacturer.isActive;
        await manufacturer.save();
        res.json({
            success: true,
            message: `Manufacturer ${manufacturer.isActive ? 'activated' : 'deactivated'} successfully`,
            data: manufacturer
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
});
// Bulk update status
router.patch('/bulk/status', auth_js_1.authenticateToken, (0, auth_js_1.requirePermission)('manufacturer:write'), async (req, res) => {
    try {
        const { manufacturerIds, isActive } = req.body;
        if (!Array.isArray(manufacturerIds) || manufacturerIds.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Manufacturer IDs array is required'
            });
        }
        const result = await Manufacturer_js_1.default.updateMany({ _id: { $in: manufacturerIds } }, { isActive });
        res.json({
            success: true,
            message: `${result.modifiedCount} manufacturers ${isActive ? 'activated' : 'deactivated'} successfully`,
            data: { modifiedCount: result.modifiedCount }
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
});
exports.default = router;
//# sourceMappingURL=manufacturers.js.map