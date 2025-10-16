import express from 'express';
import { body, validationResult } from 'express-validator';
import Vendor, { IVendor } from '../models/Vendor';
import Brand from '../models/Brand';
import Product from '../models/Product';
import { authenticateToken, requirePermission } from '../middleware/auth';
import { AuthRequest, AuthResponse, PaginatedResponse } from '../types/routes';
// Add this with your other imports
import mongoose from 'mongoose';

const router = express.Router();

console.log('[Vendors] Route file loaded');

// Get all vendors with pagination and search
const getMiddlewares = [] as any[];
if (process.env.NODE_ENV !== 'development') {
  getMiddlewares.push(authenticateToken);
}
getMiddlewares.push(async (req: AuthRequest, res: AuthResponse): Promise<void> => {
    try {
      console.log('[Vendors] Fetching vendors with query:', req.query);

      const page = parseInt((req.query.page as string) || '1');
      const limit = parseInt((req.query.limit as string) || '10');
      const search = req.query.search as string;
      const sortBy = (req.query.sortBy as string) || 'name';
      const sortOrder = (req.query.sortOrder as string) || 'asc';
      const status = req.query.status as string;
      const category = req.query.category as string;

      const query: Record<string, any> = {};

      if (status) {
        query.isActive = status === 'active';
        console.log(`[Vendors] Filtering by status: ${status}`);
      }

      if (category) {
        query.category = category;
        console.log(`[Vendors] Filtering by category: ${category}`);
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

router.get('/', ...getMiddlewares);

// Get vendor by ID
router.get(
  '/:id',
  authenticateToken,
  async (req: AuthRequest, res: AuthResponse): Promise<void> => {
    try {
      const { id } = req.params;
      console.log(`[Vendors] Fetching vendor with ID: ${id}`);

      const vendor = await Vendor.findById(id).lean();

      if (!vendor) {
        console.log(`[Vendors] Vendor not found with ID: ${id}`);
        res.status(404).json({
          success: false,
          error: 'Vendor not found'
        });
        return;
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
  }
);

// Create vendor
const createMiddlewares = [] as any[];
if (process.env.NODE_ENV !== 'development') {
  createMiddlewares.push(authenticateToken);
}
createMiddlewares.push(
  body('name').trim().isLength({ min: 2 }).withMessage('Vendor name must be at least 2 characters'),
  body('contactPerson.name').trim().notEmpty().withMessage('Contact person name is required'),
  body('contactPerson.email').isEmail().withMessage('Valid contact email is required'),
  body('contactPerson.phone').matches(/^[0-9]{10}$/).withMessage('Valid 10-digit contact phone number is required'),
  body('address.city').notEmpty().withMessage('City is required'),
  body('address.state').notEmpty().withMessage('State is required'),
  body('gst').optional().matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/).withMessage('Invalid GST format'),
  body('pan').optional().matches(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/).withMessage('Invalid PAN format')
);

router.post('/', createMiddlewares, async (req: AuthRequest, res: AuthResponse): Promise<void> => {
    try {
      console.log('[Vendors] Creating new vendor with data:', req.body);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        console.log('[Vendors] Validation errors:', errors.array());
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array()
        });
        return;
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
  }
);

// Update vendor
router.put(
  '/:id',
  [
    authenticateToken,
    body('name').optional().trim().isLength({ min: 2 }).withMessage('Vendor name must be at least 2 characters'),
    body('contactPerson.name').optional().trim().notEmpty().withMessage('Contact person name is required'),
    body('contactPerson.email').optional().isEmail().withMessage('Valid contact email is required'),
    body('contactPerson.phone').optional().matches(/^[0-9]{10}$/).withMessage('Valid 10-digit contact phone number is required'),
    body('address.city').optional().notEmpty().withMessage('City is required'),
    body('address.state').optional().notEmpty().withMessage('State is required'),
    body('gst').optional().matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/).withMessage('Invalid GST format'),
    body('pan').optional().matches(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/).withMessage('Invalid PAN format')
  ],
  async (req: AuthRequest, res: AuthResponse): Promise<void> => {
    try {
      const { id } = req.params;
      console.log(`[Vendors] Updating vendor ${id} with data:`, req.body);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        console.log('[Vendors] Validation errors:', errors.array());
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array()
        });
        return;
      }

      const vendor = await Vendor.findByIdAndUpdate(
        id,
        { $set: req.body },
        { new: true, runValidators: true }
      );

      if (!vendor) {
        console.log(`[Vendors] Vendor not found for update with ID: ${id}`);
        res.status(404).json({
          success: false,
          error: 'Vendor not found'
        });
        return;
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
  }
);

// Delete vendor (soft delete by setting isActive to false)
const deleteMiddlewares = [] as any[];
if (process.env.NODE_ENV !== 'development') {
  deleteMiddlewares.push(authenticateToken);
  deleteMiddlewares.push(requirePermission('vendor:delete'));
}
deleteMiddlewares.push(async (req: AuthRequest, res: AuthResponse): Promise<void> => {
  try {
    const { id } = req.params;
    console.log(`[Vendors] Deleting vendor with ID: ${id}`);

    // Check for active brands associated with this vendor
    const brandsCount = await Brand.countDocuments({ vendor: id, isActive: true });
    
    // Check for products associated with this vendor's brands
    const productsCount = await Product.countDocuments({ brand: { $in: await Brand.find({ vendor: id }).distinct('_id') }, isActive: true });

    if (productsCount > 0) {
      console.log(`[Vendors] Cannot delete vendor ${id}: ${productsCount} active products found`);
      res.status(400).json({
        success: false,
        error: 'Cannot delete vendor with active products',
        message: `This vendor has ${productsCount} active product(s). Please reassign or deactivate these products first.`
      });
      return;
    }

    // Hard delete the vendor
    const vendor = await Vendor.findByIdAndDelete(id);

    if (!vendor) {
      console.log(`[Vendors] Vendor not found for deletion with ID: ${id}`);
      res.status(404).json({
        success: false,
        error: 'Vendor not found'
      });
      return;
    }

    // Also delete all brands of this vendor
    if (brandsCount > 0) {
      console.log(`[Vendors] Deleting ${brandsCount} brands for vendor ${id}`);
      await Brand.deleteMany({ vendor: id });
    }

    console.log(`[Vendors] Successfully deleted vendor: ${vendor.name}`);

    res.json({
      success: true,
      message: 'Vendor deleted successfully',
      data: {
        vendor: vendor.name,
        deletedBrands: brandsCount
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

router.delete('/:id', ...deleteMiddlewares);

// Toggle vendor verification status
router.patch(
  '/:id/toggle-verification',
  authenticateToken,
  requirePermission('vendor:verify'),
  async (req: AuthRequest, res: AuthResponse): Promise<void> => {
    try {
      const { id } = req.params;
      console.log(`[Vendors] Toggling verification status for vendor: ${id}`);

      const vendor = await Vendor.findById(id);
      if (!vendor) {
        console.log(`[Vendors] Vendor not found with ID: ${id}`);
        res.status(404).json({
          success: false,
          error: 'Vendor not found'
        });
        return;
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
  }
);

// Toggle vendor active status
const toggleStatusMiddlewares = [] as any[];
if (process.env.NODE_ENV !== 'development') {
  toggleStatusMiddlewares.push(authenticateToken);
  toggleStatusMiddlewares.push(requirePermission('vendor:update'));
}
toggleStatusMiddlewares.push(async (req: AuthRequest, res: AuthResponse): Promise<void> => {
  try {
    const { id } = req.params;
    console.log(`[Vendors] Toggling active status for vendor: ${id}`);

    const vendor = await Vendor.findById(id);
    if (!vendor) {
      console.log(`[Vendors] Vendor not found with ID: ${id}`);
      res.status(404).json({
        success: false,
        error: 'Vendor not found'
      });
      return;
    }

    vendor.isActive = !vendor.isActive;
    await vendor.save();

    console.log(`[Vendors] Vendor ${vendor.name} active status changed to: ${vendor.isActive ? 'active' : 'inactive'}`);

    res.json({
      success: true,
      message: `Vendor ${vendor.isActive ? 'activated' : 'deactivated'} successfully`,
      data: vendor
    });
  } catch (error) {
    console.error(`[Vendors] Error toggling active status for vendor ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

router.patch('/:id/toggle-status', ...toggleStatusMiddlewares);

// Get brands by vendor ID
router.get(
  '/:id/brands',
  async (req: AuthRequest, res: AuthResponse): Promise<void> => {
    try {
      const { id } = req.params;
      console.log(`[Vendors] Fetching brands for vendor: ${id}`);

      const vendor = await Vendor.findById(id);
      if (!vendor) {
        console.log(`[Vendors] Vendor not found with ID: ${id}`);
        res.status(404).json({
          success: false,
          error: 'Vendor not found'
        });
        return;
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
  }
);

// Add this new endpoint right after your existing routes
// Get all brand owners (vendors with category "brand owner")
router.get(
  '/by-category/brand-owners',  // Changed path to avoid conflict with :id route
  async (req: AuthRequest, res: AuthResponse): Promise<void> => {
    try {
      // Find the brand owner category
      const brandOwnerCategory = await mongoose.model('VendorCategory').findOne({
        name: { $regex: /^brand owner$/i }  // Case-insensitive search
      });
      
      if (!brandOwnerCategory) {
        res.json({
          success: true,
          data: [],
          message: 'Brand Owner category not found'
        });
        return;
      }
      
      // Get vendors with this category
      const brandOwners = await mongoose.model('Vendor').find({ 
        category: brandOwnerCategory._id,
        isActive: true 
      })
      .select('_id name logo')
      .sort({ name: 1 })
      .lean();
      
      res.json({
        success: true,
        data: brandOwners
      });
    } catch (error) {
      console.error('[Vendors] Error fetching brand owners:', error);
      res.status(500).json({
        success: false,
        error: 'Server error',
        details: (error as Error).message
      });
    }
  }
);

console.log('[Vendors] All routes defined');

export default router;