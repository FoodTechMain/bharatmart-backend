"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express = require('express');
const router = express.Router();
const express_validator_1 = require("express-validator");
const User_js_1 = __importDefault(require("../models/User.js"));
const auth_js_1 = require("../middleware/auth.js");
// Get all users (Superadmin only)
router.get('/', auth_js_1.authenticateToken, auth_js_1.requireSuperAdmin, async (req, res) => {
    try {
        const { page = '1', limit = '10', role, status, search, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
        const query = {};
        if (role)
            query.role = role;
        if (status !== undefined && status !== '')
            query.isActive = status === 'true';
        if (search) {
            query.$or = [
                { firstName: { $regex: search, $options: 'i' } },
                { lastName: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }
        const sortOptions = {};
        sortOptions[sortBy || 'createdAt'] = sortOrder === 'desc' ? -1 : 1;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const users = await User_js_1.default.find(query)
            .select('-password -emailVerificationToken -passwordResetToken')
            .sort(sortOptions)
            .limit(limitNum)
            .skip((pageNum - 1) * limitNum)
            .exec();
        const total = await User_js_1.default.countDocuments(query);
        const response = {
            success: true,
            data: users,
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
// Get user by ID
router.get('/:id', auth_js_1.authenticateToken, (0, auth_js_1.requirePermission)('user:read'), async (req, res) => {
    try {
        const user = await User_js_1.default.findById(req.params.id)
            .select('-password -emailVerificationToken -passwordResetToken');
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }
        res.json({
            success: true,
            data: user
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
// Create new user (Superadmin only)
router.post('/', [
    auth_js_1.authenticateToken,
    auth_js_1.requireSuperAdmin,
    (0, express_validator_1.body)('firstName').trim().isLength({ min: 2 }).withMessage('First name must be at least 2 characters'),
    (0, express_validator_1.body)('lastName').trim().isLength({ min: 2 }).withMessage('Last name must be at least 2 characters'),
    (0, express_validator_1.body)('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    (0, express_validator_1.body)('role').isIn(['superadmin', 'admin', 'user', 'staff', 'shop_owner', 'customer']).withMessage('Invalid role'),
    (0, express_validator_1.body)('phone').optional().isMobilePhone('any').withMessage('Valid phone number is required'),
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
        const { email, ...userData } = req.body;
        // Check if user already exists
        const existingUser = await User_js_1.default.findOne({ email });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                error: 'User with this email already exists'
            });
        }
        const user = new User_js_1.default({
            ...userData,
            email
        });
        await user.save();
        const userResponse = user.toJSON();
        res.status(201).json({
            success: true,
            data: userResponse
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
// Update user
router.put('/:id', [
    auth_js_1.authenticateToken,
    (0, auth_js_1.requirePermission)('user:write'),
    (0, express_validator_1.body)('firstName').optional().trim().isLength({ min: 2 }).withMessage('First name must be at least 2 characters'),
    (0, express_validator_1.body)('lastName').optional().trim().isLength({ min: 2 }).withMessage('Last name must be at least 2 characters'),
    (0, express_validator_1.body)('email').optional().isEmail().normalizeEmail().withMessage('Valid email is required'),
    (0, express_validator_1.body)('role').optional().isIn(['superadmin', 'shop_owner', 'customer']).withMessage('Invalid role'),
    (0, express_validator_1.body)('phone').optional().isMobilePhone('any').withMessage('Valid phone number is required'),
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
        const user = await User_js_1.default.findById(req.params.id);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }
        // Check if email is being changed and if it already exists
        if (req.body.email && req.body.email !== user.email) {
            const existingUser = await User_js_1.default.findOne({ email: req.body.email });
            if (existingUser) {
                return res.status(400).json({
                    success: false,
                    error: 'User with this email already exists'
                });
            }
        }
        // Exclude password from general update - password should be updated via separate endpoint
        const { password: _password, ...updateData } = req.body;
        Object.assign(user, updateData);
        await user.save();
        const userResponse = user.toJSON();
        res.json({
            success: true,
            data: userResponse
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
// Delete user (Superadmin only)
router.delete('/:id', auth_js_1.authenticateToken, auth_js_1.requireSuperAdmin, async (req, res) => {
    try {
        const user = await User_js_1.default.findById(req.params.id);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }
        // Prevent deleting the last superadmin
        if (user.role === 'superadmin') {
            const superadminCount = await User_js_1.default.countDocuments({ role: 'superadmin' });
            if (superadminCount <= 1) {
                return res.status(400).json({
                    success: false,
                    error: 'Cannot delete the last superadmin'
                });
            }
        }
        await User_js_1.default.findByIdAndDelete(req.params.id);
        res.json({
            success: true,
            message: 'User deleted successfully'
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
// Toggle user active status (Superadmin only)
router.patch('/:id/toggle-status', auth_js_1.authenticateToken, auth_js_1.requireSuperAdmin, async (req, res) => {
    try {
        const user = await User_js_1.default.findById(req.params.id);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }
        user.isActive = !user.isActive;
        await user.save();
        res.json({
            success: true,
            message: `User ${user.isActive ? 'activated' : 'deactivated'} successfully`,
            data: { isActive: user.isActive }
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
//# sourceMappingURL=users.js.map