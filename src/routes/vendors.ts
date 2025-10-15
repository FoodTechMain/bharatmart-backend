import express from 'express';
import { body, query, param, validationResult } from 'express-validator';
import Vendor, { IVendor } from '../models/Vendor';
import Brand from '../models/Brand';
import { authenticateToken, requirePermission } from '../middleware/auth';
import { AuthRequest, AuthResponse, PaginatedResponse } from '../types/routes';

const router = express.Router();

console.log('[Vendors] Route file loaded');

// Get all vendors with pagination and search
router.get('/', authenticateToken, async (req: AuthRequest, res: AuthResponse) => {
  try {
    console.log('[Vendors] Fetching vendors with query:', req.query);
    
    const page = parseInt(req.query.page as string || '1');
    const limit = parseInt(req.query.limit as string || '10');
    const search = req.query.search as string;
    const sortBy = req.query.sortBy as string || 'name';
    const sortOrder = req.query.sortOrder as string || 'asc';
    const status = req.query.status as string;
    
    const query: any = {};
    
    if (status) {
      query.isActive = status === 'active';
      console.log(`[Vendors] Filtering by status: ${status}`);
    }
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { 'contactPerson.name': { $regex: search, $options: 'i' } },
        { 'contactPerson.email': { $regex: search, $options: 'i' } },
        { 'contactPerson.phone': { $regex: search, $options: 'i' } }
      ];
      console.log(`[Vendors] Searching for: ${search}`);
    }

    const sortOptions: { [key: string]: 1 | -1 } = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;
    console.log(`[Vendors] Sorting by: ${sortBy} (${sortOrder})`);

    const vendors = await Vendor.find(query)
      .sort(sortOptions)
      .limit(limit)
      .skip((page - 1) * limit)
      .lean();

    const total = await Vendor.countDocuments(query);
    console.log(`[Vendors] Found ${vendors.length} vendors (total: ${total})`);

    const response: PaginatedResponse<IVendor[]> = {
      success: true,
      data: vendors,
      pagination: {
        total,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        limit,
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    };

    res.json(response);
  } catch (error) {
    console.error('[Vendors] Error fetching vendors:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Get vendor by ID
router.get('/:id', authenticateToken, async (req: AuthRequest, res: AuthResponse) => {
  try {
    const { id } = req.params;
    console.log(`[Vendors] Fetching vendor with ID: ${id}`);
    
    const vendor = await Vendor.findById(id).lean();
    
    if (!vendor) {
      console.log(`[Vendors] Vendor not found with ID: ${id}`);
      return res.status(404).json({
        success: false,
        error: 'Vendor not found'
      });
    }
    
    console.log(`[Vendors] Found vendor: ${vendor.name}`);
    res.json({
      success: true,
      data: vendor
    });
  } catch (error) {
    console.error(`[Vendors] Error fetching vendor ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Create vendor
router.post('/', [
  authenticateToken,
  body('name').trim().isLength({ min: 2 }).withMessage('Vendor name must be at least 2 characters'),
  body('contactPerson.name').trim().notEmpty().withMessage('Contact person name is required'),
  body('contactPerson.email').isEmail().withMessage('Valid contact email is required'),
  body('contactPerson.phone').matches(/^[0-9]{10}$/).withMessage('Valid 10-digit contact phone number is required'),
  body('address.city').notEmpty().withMessage('City is required'),
  body('address.state').notEmpty().withMessage('State is required'),
  body('gst').optional().matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/).withMessage('Invalid GST format'),
  body('pan').optional().matches(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/).withMessage('Invalid PAN format')
], async (req: AuthRequest, res: AuthResponse) => {
  try {
    console.log('[Vendors] Creating new vendor with data:', req.body);
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('[Vendors] Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const vendor = new Vendor(req.body);
    await vendor.save();
    
    console.log(`[Vendors] Successfully created vendor: ${vendor.name} with ID: ${vendor._id}`);
    
    res.status(201).json({
      success: true,
      message: 'Vendor created successfully',
      data: vendor
    });
  } catch (error) {
    console.error('[Vendors] Error creating vendor:', error);
    res.status(500).json({
      success: false,
      error: 'Error creating vendor',
      details: (error as Error).message
    });
  }
});

// Update vendor
router.put('/:id', [
  authenticateToken,
  body('name').optional().trim().isLength({ min: 2 }).withMessage('Vendor name must be at least 2 characters'),
  body('contactPerson.name').optional().trim().notEmpty().withMessage('Contact person name is required'),
  body('contactPerson.email').optional().isEmail().withMessage('Valid contact email is required'),
  body('contactPerson.phone').optional().matches(/^[0-9]{10}$/).withMessage('Valid 10-digit contact phone number is required'),
  body('address.city').optional().notEmpty().withMessage('City is required'),
  body('address.state').optional().notEmpty().withMessage('State is required'),
  body('gst').optional().matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/).withMessage('Invalid GST format'),
  body('pan').optional().matches(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/).withMessage('Invalid PAN format')
], async (req: AuthRequest, res: AuthResponse) => {
  try {
    const { id } = req.params;
    console.log(`[Vendors] Updating vendor ${id} with data:`, req.body);
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('[Vendors] Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const vendor = await Vendor.findByIdAndUpdate(
      id,
      { $set: req.body },
      { new: true, runValidators: true }
    );

    if (!vendor) {
      console.log(`[Vendors] Vendor not found for update with ID: ${id}`);
      return res.status(404).json({
        success: false,
        error: 'Vendor not found'
      });
    }
    
    console.log(`[Vendors] Successfully updated vendor: ${vendor.name}`);
    
    res.json({
      success: true,
      data: vendor
    });
  } catch (error) {
    console.error(`[Vendors] Error updating vendor ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Delete vendor (soft delete by setting isActive to false)
router.delete('/:id', authenticateToken, requirePermission('vendor:delete'), async (req: AuthRequest, res: AuthResponse) => {
  try {
    const { id } = req.params;
    console.log(`[Vendors] Soft deleting vendor with ID: ${id}`);
    
    // Check for active brands associated with this vendor
    const brandsCount = await Brand.countDocuments({ vendor: id, isActive: true });
    
    const vendor = await Vendor.findByIdAndUpdate(
      id,
      { $set: { isActive: false } },
      { new: true }
    );
    
    if (!vendor) {
      console.log(`[Vendors] Vendor not found for deletion with ID: ${id}`);
      return res.status(404).json({
        success: false,
        error: 'Vendor not found'
      });
    }
    
    // Also mark all brands of this vendor as inactive
    if (brandsCount > 0) {
      console.log(`[Vendors] Deactivating ${brandsCount} brands for vendor ${id}`);
      await Brand.updateMany(
        { vendor: id },
        { $set: { isActive: false } }
      );
    }
    
    console.log(`[Vendors] Successfully soft deleted vendor: ${vendor.name}`);
    
    res.json({
      success: true,
      message: 'Vendor deactivated successfully',
      data: {
        vendor,
        deactivatedBrands: brandsCount
      }
    });
  } catch (error) {
    console.error(`[Vendors] Error deleting vendor ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Toggle vendor verification status
router.patch('/:id/toggle-verification', authenticateToken, requirePermission('vendor:verify'), async (req: AuthRequest, res: AuthResponse) => {
  try {
    const { id } = req.params;
    console.log(`[Vendors] Toggling verification status for vendor: ${id}`);
    
    const vendor = await Vendor.findById(id);
    if (!vendor) {
      console.log(`[Vendors] Vendor not found with ID: ${id}`);
      return res.status(404).json({
        success: false,
        error: 'Vendor not found'
      });
    }

    vendor.isVerified = !vendor.isVerified;
    await vendor.save();
    
    console.log(`[Vendors] Vendor ${vendor.name} verification status changed to: ${vendor.isVerified ? 'verified' : 'unverified'}`);
    
    res.json({
      success: true,
      message: `Vendor ${vendor.isVerified ? 'verified' : 'unverified'} successfully`,
      data: vendor
    });
  } catch (error) {
    console.error(`[Vendors] Error toggling verification for vendor ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Get brands by vendor ID
router.get('/:id/brands', async (req: AuthRequest, res: AuthResponse) => {
  try {
    const { id } = req.params;
    console.log(`[Vendors] Fetching brands for vendor: ${id}`);
    
    const vendor = await Vendor.findById(id);
    if (!vendor) {
      console.log(`[Vendors] Vendor not found with ID: ${id}`);
      return res.status(404).json({
        success: false,
        error: 'Vendor not found'
      });
    }
    
    const brands = await Brand.findByVendor(id);
    console.log(`[Vendors] Found ${brands.length} brands for vendor: ${vendor.name}`);
    
    res.json({
      success: true,
      data: brands,
      vendor: {
        id: vendor._id,
        name: vendor.name
      }
    });
  } catch (error) {
    console.error(`[Vendors] Error fetching brands for vendor ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

console.log('[Vendors] All routes defined');

export default router;