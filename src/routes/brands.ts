import express from 'express';
import { body, validationResult } from 'express-validator';
import Brand, { IBrand } from '../models/Brand';
import Vendor from '../models/Vendors/Vendor';
import { authenticateToken, requirePermission } from '../middleware/auth';
import { AuthRequest, AuthResponse } from '../types/routes';

const router = express.Router();

console.log('[Brands] Route file loaded');

// Get all brands
router.get('/', async (req: AuthRequest, res: AuthResponse) => {
  try {
    console.log('[Brands] Fetching all brands');
    
    const filter: any = {};
    
    // Allow filtering by vendor
    if (req.query.vendor) {
      filter.vendor = req.query.vendor;
    }
    
    // Allow filtering by active status
    if (req.query.active) {
      filter.isActive = req.query.active === 'true';
    }
    
    // Allow searching by name
    if (req.query.search) {
      filter.name = { $regex: req.query.search, $options: 'i' };
    }
    
    const brands = await Brand.find(filter)
      .populate('vendor', 'name')
      .sort({ name: 1 })
      .lean();
    
    console.log(`[Brands] Found ${brands.length} brands`);
    
    res.json({
      success: true,
      data: brands
    });
  } catch (error) {
    console.error('[Brands] Error fetching brands:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Get brand by ID
router.get('/:id', async (req: AuthRequest, res: AuthResponse) => {
  try {
    const { id } = req.params;
    console.log(`[Brands] Fetching brand with ID: ${id}`);
    
    const brand = await Brand.findById(id).populate('vendor', 'name');
    
    if (!brand) {
      console.log(`[Brands] Brand not found with ID: ${id}`);
      return res.status(404).json({
        success: false,
        error: 'Brand not found'
      });
    }
    
    console.log(`[Brands] Found brand: ${brand.name}`);
    res.json({
      success: true,
      data: brand
    });
  } catch (error) {
    console.error(`[Brands] Error fetching brand ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Create brand
router.post('/', [
  authenticateToken,
  body('name').trim().isLength({ min: 1 }).withMessage('Brand name is required'),
  body('description').optional().trim().isLength({ max: 500 }).withMessage('Description must not exceed 500 characters'),
  body('vendor').isMongoId().withMessage('Valid vendor ID is required')
], async (req: AuthRequest, res: AuthResponse) => {
  try {
    console.log('[Brands] Creating new brand with data:', req.body);
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('[Brands] Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    // Verify vendor exists
    const vendor = await Vendor.findById(req.body.vendor);
    if (!vendor) {
      console.log(`[Brands] Vendor not found with ID: ${req.body.vendor}`);
      return res.status(404).json({
        success: false,
        error: 'Vendor not found'
      });
    }
    
    // Check if brand name already exists for this vendor
    const existingBrand = await Brand.findOne({
      name: { $regex: new RegExp(`^${req.body.name}$`, 'i') },
      vendor: req.body.vendor
    });
    
    if (existingBrand) {
      console.log(`[Brands] Brand name '${req.body.name}' already exists for this vendor`);
      return res.status(409).json({
        success: false,
        error: 'Brand name already exists for this vendor'
      });
    }
    
    const brand = new Brand({
      name: req.body.name,
      description: req.body.description,
      logo: req.body.logo,
      vendor: req.body.vendor,
      isActive: true
    });
    
    await brand.save();
    
    console.log(`[Brands] Successfully created brand: ${brand.name} for vendor: ${vendor.name}`);
    
    res.status(201).json({
      success: true,
      message: 'Brand created successfully',
      data: brand
    });
  } catch (error) {
    console.error('[Brands] Error creating brand:', error);
    res.status(500).json({
      success: false,
      error: 'Error creating brand',
      details: (error as Error).message
    });
  }
});

// Update brand
router.put('/:id', [
  authenticateToken,
  body('name').optional().trim().isLength({ min: 1 }).withMessage('Brand name cannot be empty'),
  body('description').optional().trim().isLength({ max: 500 }).withMessage('Description must not exceed 500 characters')
], async (req: AuthRequest, res: AuthResponse) => {
  try {
    const { id } = req.params;
    console.log(`[Brands] Updating brand ${id} with data:`, req.body);
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('[Brands] Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }
    
    // Make sure we can't change the vendor
    if (req.body.vendor) {
      delete req.body.vendor;
    }
    
    // If name is changing, check for duplicates
    if (req.body.name) {
      const existingBrand = await Brand.findById(id);
      
      if (existingBrand) {
        const duplicateBrand = await Brand.findOne({
          name: { $regex: new RegExp(`^${req.body.name}$`, 'i') },
          vendor: existingBrand.vendor,
          _id: { $ne: id }
        });
        
        if (duplicateBrand) {
          console.log(`[Brands] Brand name '${req.body.name}' already exists for this vendor`);
          return res.status(409).json({
            success: false,
            error: 'Brand name already exists for this vendor'
          });
        }
      }
    }

    const brand = await Brand.findByIdAndUpdate(
      id,
      { $set: req.body },
      { new: true, runValidators: true }
    );

    if (!brand) {
      console.log(`[Brands] Brand not found for update with ID: ${id}`);
      return res.status(404).json({
        success: false,
        error: 'Brand not found'
      });
    }
    
    console.log(`[Brands] Successfully updated brand: ${brand.name}`);
    
    res.json({
      success: true,
      data: brand
    });
  } catch (error) {
    console.error(`[Brands] Error updating brand ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Toggle brand active status
router.patch('/:id/toggle-status', authenticateToken, async (req: AuthRequest, res: AuthResponse) => {
  try {
    const { id } = req.params;
    console.log(`[Brands] Toggling active status for brand: ${id}`);
    
    const brand = await Brand.findById(id);
    if (!brand) {
      console.log(`[Brands] Brand not found with ID: ${id}`);
      return res.status(404).json({
        success: false,
        error: 'Brand not found'
      });
    }
    
    brand.isActive = !brand.isActive;
    await brand.save();
    
    console.log(`[Brands] Brand ${brand.name} active status changed to: ${brand.isActive ? 'active' : 'inactive'}`);
    
    res.json({
      success: true,
      message: `Brand ${brand.isActive ? 'activated' : 'deactivated'} successfully`,
      data: brand
    });
  } catch (error) {
    console.error(`[Brands] Error toggling status for brand ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Delete brand (hard delete)
router.delete('/:id', authenticateToken, requirePermission('brand:delete'), async (req: AuthRequest, res: AuthResponse) => {
  try {
    const { id } = req.params;
    console.log(`[Brands] Deleting brand with ID: ${id}`);
    
    // Check if brand is associated with any products before deletion
    // This would require a Product model check, but for now we'll just proceed
    
    const brand = await Brand.findByIdAndDelete(id);
    if (!brand) {
      console.log(`[Brands] Brand not found for deletion with ID: ${id}`);
      return res.status(404).json({
        success: false,
        error: 'Brand not found'
      });
    }
    
    console.log(`[Brands] Successfully deleted brand: ${brand.name}`);
    
    res.json({
      success: true,
      message: 'Brand deleted successfully',
      data: brand
    });
  } catch (error) {
    console.error(`[Brands] Error deleting brand ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

console.log('[Brands] All routes defined');

export default router;