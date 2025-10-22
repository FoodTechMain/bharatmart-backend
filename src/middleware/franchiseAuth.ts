import { AuthRequest, AuthResponse } from '../types/routes';
import Franchise from '../models/Franchise';
import jwt from 'jsonwebtoken';

interface FranchiseJwtPayload {
  franchiseId: string;
  role: string;
  permissions?: string[];
}

/**
 * Middleware to authenticate franchise users via JWT token
 */
export const authenticateFranchise = async (
  req: AuthRequest, 
  res: AuthResponse, 
  next: any
) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access token is required'
      });
    }

    // Verify and decode the JWT token
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'your-secret-key'
    ) as FranchiseJwtPayload;

    // Check if the token is for a franchise account
    if (decoded.role !== 'franchise') {
      return res.status(401).json({
        success: false,
        error: 'Not a franchise account'
      });
    }

    // Fetch franchise details from database
    const franchise = await Franchise.findById(decoded.franchiseId);
    
    if (!franchise) {
      return res.status(404).json({
        success: false,
        error: 'Franchise not found'
      });
    }

    // Check if franchise is active
    if (!franchise.isActive) {
      return res.status(401).json({
        success: false,
        error: 'Franchise account is inactive'
      });
    }

    // Attach franchise ID to request object
    req.franchiseId = franchise._id;
    
    next();
  } catch (error) {
    console.error('Franchise authentication error:', error);
    
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token'
      });
    }
    
    return res.status(500).json({
      success: false,
      error: 'Authentication failed',
      details: (error as Error).message
    });
  }
};

/**
 * Middleware to optionally authenticate franchise users
 * Continues even if authentication fails
 */
export const optionalFranchiseAuth = async (
  req: AuthRequest,
  res: AuthResponse,
  next: any
) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return next();
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'your-secret-key'
    ) as FranchiseJwtPayload;

    if (decoded.role === 'franchise') {
      const franchise = await Franchise.findById(decoded.franchiseId);
      
      if (franchise && franchise.isActive) {
        req.franchiseId = franchise._id;
      }
    }

    next();
  } catch (error) {
    // Don't block request on optional auth failure
    next();
  }
};

/**
 * Middleware to check if franchise is verified
 */
export const requireVerifiedFranchise = async (
  req: AuthRequest,
  res: AuthResponse,
  next: any
) => {
  try {
    if (!req.franchiseId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const franchise = await Franchise.findById(req.franchiseId);
    
    if (!franchise || !franchise.isVerified) {
      return res.status(403).json({
        success: false,
        error: 'Franchise account must be verified to perform this action'
      });
    }

    next();
  } catch (error) {
    console.error('Franchise verification check error:', error);
    return res.status(500).json({
      success: false,
      error: 'Verification check failed',
      details: (error as Error).message
    });
  }
};
