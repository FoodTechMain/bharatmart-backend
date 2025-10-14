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
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
// Validation middleware
const validateRegistration = [
    (0, express_validator_1.body)('name')
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage('Name must be between 2 and 50 characters'),
    (0, express_validator_1.body)('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Valid email is required'),
    (0, express_validator_1.body)('password')
        .isLength({ min: 6 })
        .withMessage('Password must be at least 6 characters long'),
    (0, express_validator_1.body)('phone')
        .optional()
        .isMobilePhone('any')
        .withMessage('Valid phone number is required')
];
// Register new user
router.post('/register', validateRegistration, async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array()
            });
        }
        const { name, email, password, phone } = req.body;
        // Check if user already exists
        const existingUser = await User_js_1.default.findOne({ email });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                error: 'User with this email already exists'
            });
        }
        // Create new user
        const user = new User_js_1.default({
            name,
            email,
            password,
            phone,
            role: 'user',
            permissions: [],
            isActive: true,
            isVerified: true // Auto-verify for now
        });
        await user.save();
        // Generate token
        const token = jsonwebtoken_1.default.sign({
            userId: user._id,
            role: user.role || 'user',
            permissions: user.permissions || []
        }, process.env.JWT_SECRET || 'your-secret-key', { expiresIn: '7d' });
        // Remove sensitive fields from response
        const userResponse = {
            ...user.toJSON(),
            role: user.role || 'user',
            permissions: user.permissions || []
        };
        res.status(201).json({
            success: true,
            message: 'Registration successful',
            user: userResponse,
            token
        });
    }
    catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
});
// Login user
router.post('/login', [
    (0, express_validator_1.body)('email').isEmail().normalizeEmail(),
    (0, express_validator_1.body)('password').notEmpty()
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
        const { email, password } = req.body;
        // Find user
        const user = await User_js_1.default.findOne({ email }).select('+password');
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Invalid email or password'
            });
        }
        // Check if password exists
        if (!user.password) {
            return res.status(401).json({
                success: false,
                error: 'Password not set. Please reset your password.'
            });
        }
        // Check password
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                error: 'Invalid email or password'
            });
        }
        // Check if user is active
        if (!user.isActive) {
            return res.status(401).json({
                success: false,
                error: 'Your account has been deactivated'
            });
        }
        // Skip email verification check for now
        // Generate token
        const token = jsonwebtoken_1.default.sign({
            userId: user._id,
            role: user.role || 'user',
            permissions: user.permissions || []
        }, process.env.JWT_SECRET || 'your-secret-key', { expiresIn: '7d' });
        // Remove sensitive fields from response
        const userResponse = {
            ...user.toJSON(),
            role: user.role || 'user',
            permissions: user.permissions || []
        };
        res.json({
            success: true,
            user: userResponse,
            token
        });
    }
    catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
});
// Email verification functionality removed for now
// Password reset functionality removed for now
// Change password (authenticated)
router.post('/change-password', [
    auth_js_1.authenticateToken,
    (0, express_validator_1.body)('currentPassword').notEmpty(),
    (0, express_validator_1.body)('newPassword')
        .isLength({ min: 6 })
        .withMessage('New password must be at least 6 characters long')
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
        const { currentPassword, newPassword } = req.body;
        // Get user with password
        const user = await User_js_1.default.findById(req.user?._id).select('+password');
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }
        // Check current password
        const isMatch = await bcryptjs_1.default.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                error: 'Current password is incorrect'
            });
        }
        // Update password
        user.password = newPassword;
        await user.save();
        res.json({
            success: true,
            message: 'Password changed successfully'
        });
    }
    catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
});
// Get current user
router.get('/me', auth_js_1.authenticateToken, async (req, res) => {
    try {
        const user = await User_js_1.default.findById(req.user?._id);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }
        const userResponse = {
            ...user.toJSON(),
            role: user.role || 'user',
            permissions: user.permissions || []
        };
        res.json({
            success: true,
            user: userResponse
        });
    }
    catch (error) {
        console.error('Get current user error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
});
exports.default = router;
//# sourceMappingURL=auth.js.map