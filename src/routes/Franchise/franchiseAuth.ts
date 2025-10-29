import express from 'express';
import { body, validationResult } from 'express-validator';
import Franchise from '../../models/Franchise/Franchise';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { authenticateToken } from '../../middleware/auth';
import { AuthRequest, AuthResponse } from '../../types/routes';

const router = express.Router();

// Login franchise
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
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

    const { email, password } = req.body;

    // Find franchise
    const franchise = await Franchise.findOne({ email }).select('+password');
    if (!franchise) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    // Check if password exists
    if (!franchise.password) {
      return res.status(401).json({
        success: false,
        error: 'Password not set. Please reset your password.'
      });
    }

    // Check password
    const isMatch = await Franchise.comparePassword(password, franchise.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    // Check if franchise is active
    if (!franchise.isActive) {
      return res.status(401).json({
        success: false,
        error: 'Your franchise account has been deactivated'
      });
    }

    // Generate token
    const token = jwt.sign(
      {
        franchiseId: franchise._id,
        role: 'franchise', // Add franchise-specific role
        permissions: [] // Add franchise-specific permissions if needed
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    // Remove sensitive fields from response
    const franchiseResponse = {
      ...franchise.toJSON(),
      role: 'franchise',
      permissions: []
    };

    // Remove password from response
    delete franchiseResponse.password;

    res.json({
      success: true,
      franchise: franchiseResponse,
      token
    });
  } catch (error) {
    console.error('Franchise login error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Get current franchise
router.get('/me', async (req: AuthRequest, res: AuthResponse) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access token is required'
      });
    }

    // Verify and decode token
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'your-secret-key'
    ) as { franchiseId: string; role: string };

    // Check if this is a franchise token
    if (decoded.role !== 'franchise') {
      return res.status(401).json({
        success: false,
        error: 'Not a franchise account'
      });
    }

    // Fetch franchise data
    const franchise = await Franchise.findById(decoded.franchiseId).select('-password');
    
    if (!franchise) {
      return res.status(404).json({
        success: false,
        error: 'Franchise not found'
      });
    }

    if (!franchise.isActive) {
      return res.status(401).json({
        success: false,
        error: 'Franchise account is inactive'
      });
    }

    res.json({
      success: true,
      franchise: {
        ...franchise.toJSON(),
        role: 'franchise'
      }
    });
  } catch (error) {
    console.error('Get current franchise error:', error);
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token'
      });
    }
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

export default router;

// Update password for franchise (protected)
router.post('/update-password', async (req: AuthRequest, res: AuthResponse) => {
  try {
    const { oldPassword, newPassword, confirmPassword } = req.body;

    if (!oldPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ success: false, error: 'All password fields are required' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, error: 'New passwords do not match' });
    }

    if ((newPassword || '').length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
    }

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ success: false, error: 'Access token is required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key') as { franchiseId: string; role: string };

    if (!decoded || decoded.role !== 'franchise') {
      return res.status(401).json({ success: false, error: 'Not a franchise account' });
    }

    const franchise = await Franchise.findById(decoded.franchiseId).select('+password');
    if (!franchise) {
      return res.status(404).json({ success: false, error: 'Franchise not found' });
    }

    if (!franchise.password) {
      return res.status(400).json({ success: false, error: 'Current password is not set' });
    }

    const match = await Franchise.comparePassword(oldPassword, franchise.password);
    if (!match) {
      return res.status(401).json({ success: false, error: 'Current password is incorrect' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    franchise.password = hashed;
    franchise.mustChangePassword = false;
    await franchise.save();

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    console.error('Update password error:', error);
    if ((error as any).name === 'JsonWebTokenError' || (error as any).name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }
    res.status(500).json({ success: false, error: 'Server error', details: (error as Error).message });
  }
});

// Forgot password - send OTP
router.post('/forgot-password', [
  body('email').isEmail().normalizeEmail()
], async (req: AuthRequest, res: AuthResponse) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: 'Validation failed', details: errors.array() });
    }

    const { email } = req.body;

    // Generate OTP (6 digit)
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Find franchise
    const franchise = await Franchise.findOne({ email }).select('+email');

    // If franchise not found, inform caller
    if (!franchise) {
      return res.status(404).json({ success: false, error: 'Email does not exist' });
    }

    const hashedOtp = await bcrypt.hash(otp, 10);
    franchise.resetPasswordOTP = hashedOtp;
    franchise.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await franchise.save();

    // Try sending email using available env vars (EMAIL_HOST etc). If it fails, in non-production return the OTP in response for testing.
    try {
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: Number(process.env.EMAIL_PORT) || 465,
        secure: true,
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        }
      });

      await transporter.sendMail({
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to: email,
        subject: 'Your password reset OTP',
        text: `Your OTP for password reset is: ${otp}. It expires in 1 hour.`
      });
    } catch (emailErr) {
      console.error('Failed to send reset OTP email:', emailErr);
      if (process.env.NODE_ENV !== 'production') {
        // For development/testing, include OTP in response
        return res.json({ success: true, message: 'OTP generated (development)', otp });
      }
    }

    res.json({ success: true, message: 'If an account with that email exists, an OTP has been sent' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ success: false, error: 'Server error', details: (error as Error).message });
  }
});

// Reset password using OTP
router.post('/reset-password', [
  body('email').isEmail().normalizeEmail(),
  body('otp').notEmpty(),
  body('newPassword').isLength({ min: 6 })
], async (req: AuthRequest, res: AuthResponse) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: 'Validation failed', details: errors.array() });
    }

    const { email, otp, newPassword } = req.body;
    const franchise = await Franchise.findOne({ email }).select('+resetPasswordOTP +resetPasswordExpires +password');
    if (!franchise) {
      return res.status(404).json({ success: false, error: 'Email does not exist' });
    }

    if (!franchise.resetPasswordOTP || !franchise.resetPasswordExpires) {
      return res.status(400).json({ success: false, error: 'No OTP requested for this email' });
    }

    if (franchise.resetPasswordExpires.getTime() < Date.now()) {
      return res.status(400).json({ success: false, error: 'OTP has expired' });
    }

  const providedOtp = (otp || '').toString().trim();
  const match = await bcrypt.compare(providedOtp, franchise.resetPasswordOTP as string);
    if (!match) {
      return res.status(400).json({ success: false, error: 'OTP is incorrect' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    franchise.password = hashed;
    franchise.mustChangePassword = false;
    franchise.resetPasswordOTP = undefined as any;
    franchise.resetPasswordExpires = undefined as any;
    await franchise.save();

    res.json({ success: true, message: 'Password has been reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ success: false, error: 'Server error', details: (error as Error).message });
  }
});