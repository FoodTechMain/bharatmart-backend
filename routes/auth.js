const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const crypto = require('crypto');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');
const { sendEmail } = require('../utils/email');

const router = express.Router();

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
};

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post('/register', [
  body('firstName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be between 2 and 50 characters'),
  body('lastName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be between 2 and 50 characters'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  body('role')
    .optional()
    .isIn(['customer', 'shop_owner'])
    .withMessage('Invalid role specified')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { firstName, lastName, email, password, role = 'customer', phone, address } = req.body;

    // Check if user already exists
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({
        message: 'User with this email already exists',
        code: 'EMAIL_EXISTS'
      });
    }

    // Create verification token
    const emailVerificationToken = crypto.randomBytes(32).toString('hex');
    const emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Create user
    const user = new User({
      firstName,
      lastName,
      email,
      password,
      role,
      phone,
      address,
      emailVerificationToken,
      emailVerificationExpires
    });

    await user.save();

    // Send verification email
    try {
      const verificationUrl = `${process.env.CORS_ORIGIN}/verify-email?token=${emailVerificationToken}`;
      await sendEmail({
        to: user.email,
        subject: 'Verify your email address',
        template: 'emailVerification',
        data: {
          name: user.firstName,
          verificationUrl
        }
      });
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      // Continue with registration even if email fails
    }

    // Generate token
    const token = generateToken(user._id);

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        isEmailVerified: user.isEmailVerified
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      message: 'Registration failed',
      code: 'REGISTRATION_ERROR'
    });
  }
});

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email, password } = req.body;

    // Find user by email
    const user = await User.findByEmail(email).select('+password');
    if (!user) {
      return res.status(401).json({
        message: 'Invalid email or password',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Check if account is locked
    if (user.isLocked) {
      return res.status(401).json({
        message: 'Account is temporarily locked due to multiple failed login attempts',
        code: 'ACCOUNT_LOCKED'
      });
    }

    // Check if account is active
    if (!user.isActive) {
      return res.status(401).json({
        message: 'Account is deactivated',
        code: 'ACCOUNT_DEACTIVATED'
      });
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      // Increment login attempts
      await user.incLoginAttempts();
      
      return res.status(401).json({
        message: 'Invalid email or password',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Reset login attempts on successful login
    await user.resetLoginAttempts();

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate token
    const token = generateToken(user._id);

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        isEmailVerified: user.isEmailVerified
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      message: 'Login failed',
      code: 'LOGIN_ERROR'
    });
  }
});

// @route   POST /api/auth/verify-email
// @desc    Verify email address
// @access  Public
router.post('/verify-email', [
  body('token')
    .notEmpty()
    .withMessage('Verification token is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { token } = req.body;

    const user = await User.findOne({
      emailVerificationToken: token,
      emailVerificationExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        message: 'Invalid or expired verification token',
        code: 'INVALID_TOKEN'
      });
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    res.json({
      message: 'Email verified successfully',
      user: {
        id: user._id,
        email: user.email,
        isEmailVerified: user.isEmailVerified
      }
    });

  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({
      message: 'Email verification failed',
      code: 'VERIFICATION_ERROR'
    });
  }
});

// @route   POST /api/auth/resend-verification
// @desc    Resend email verification
// @access  Public
router.post('/resend-verification', [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email } = req.body;

    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(404).json({
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({
        message: 'Email is already verified',
        code: 'ALREADY_VERIFIED'
      });
    }

    // Generate new verification token
    const emailVerificationToken = crypto.randomBytes(32).toString('hex');
    const emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    user.emailVerificationToken = emailVerificationToken;
    user.emailVerificationExpires = emailVerificationExpires;
    await user.save();

    // Send verification email
    try {
      const verificationUrl = `${process.env.CORS_ORIGIN}/verify-email?token=${emailVerificationToken}`;
      await sendEmail({
        to: user.email,
        subject: 'Verify your email address',
        template: 'emailVerification',
        data: {
          name: user.firstName,
          verificationUrl
        }
      });

      res.json({
        message: 'Verification email sent successfully'
      });
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      res.status(500).json({
        message: 'Failed to send verification email',
        code: 'EMAIL_SEND_ERROR'
      });
    }

  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({
      message: 'Failed to resend verification email',
      code: 'RESEND_ERROR'
    });
  }
});

// @route   POST /api/auth/forgot-password
// @desc    Send password reset email
// @access  Public
router.post('/forgot-password', [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email } = req.body;

    const user = await User.findByEmail(email);
    if (!user) {
      // Don't reveal if user exists or not
      return res.json({
        message: 'If an account with that email exists, a password reset link has been sent'
      });
    }

    // Generate reset token
    const passwordResetToken = crypto.randomBytes(32).toString('hex');
    const passwordResetExpires = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1 hour

    user.passwordResetToken = passwordResetToken;
    user.passwordResetExpires = passwordResetExpires;
    await user.save();

    // Send reset email
    try {
      const resetUrl = `${process.env.CORS_ORIGIN}/reset-password?token=${passwordResetToken}`;
      await sendEmail({
        to: user.email,
        subject: 'Reset your password',
        template: 'passwordReset',
        data: {
          name: user.firstName,
          resetUrl
        }
      });

      res.json({
        message: 'If an account with that email exists, a password reset link has been sent'
      });
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      res.status(500).json({
        message: 'Failed to send password reset email',
        code: 'EMAIL_SEND_ERROR'
      });
    }

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      message: 'Failed to process password reset request',
      code: 'FORGOT_PASSWORD_ERROR'
    });
  }
});

// @route   POST /api/auth/reset-password
// @desc    Reset password with token
// @access  Public
router.post('/reset-password', [
  body('token')
    .notEmpty()
    .withMessage('Reset token is required'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { token, password } = req.body;

    const user = await User.findOne({
      passwordResetToken: token,
      passwordResetExpires: { $gt: Date.now() }
    }).select('+password');

    if (!user) {
      return res.status(400).json({
        message: 'Invalid or expired reset token',
        code: 'INVALID_TOKEN'
      });
    }

    // Update password
    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    res.json({
      message: 'Password reset successfully'
    });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      message: 'Password reset failed',
      code: 'RESET_PASSWORD_ERROR'
    });
  }
});

// @route   GET /api/auth/me
// @desc    Get current user profile
// @access  Private
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    res.json({
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        phone: user.phone,
        address: user.address,
        avatar: user.avatar,
        isEmailVerified: user.isEmailVerified,
        lastLogin: user.lastLogin,
        permissions: user.getPermissions()
      }
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      message: 'Failed to get user profile',
      code: 'PROFILE_ERROR'
    });
  }
});

// @route   POST /api/auth/logout
// @desc    Logout user (client-side token removal)
// @access  Private
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    // In a stateless JWT system, logout is handled client-side
    // You could implement a blacklist here if needed
    res.json({
      message: 'Logged out successfully'
    });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      message: 'Logout failed',
      code: 'LOGOUT_ERROR'
    });
  }
});

module.exports = router; 