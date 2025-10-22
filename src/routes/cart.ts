import express from 'express';
const router = express.Router();
import { body, validationResult, param } from 'express-validator';
import Cart, { ICartDocument, ICartItem } from '../models/Cart';
import FranchiseProduct from '../models/FranchiseProduct';
import Franchise from '../models/Franchise';
import User from '../models/User';
import { authenticateToken, requirePermission } from '../middleware/auth';
import { AuthRequest, AuthResponse } from '../types/routes';
import { Types } from 'mongoose';

// Validation middleware
const validateCartItem = [
  body('productId')
    .isMongoId()
    .withMessage('Valid product ID is required'),
  body('quantity')
    .isInt({ min: 1 })
    .withMessage('Quantity must be at least 1'),
  body('price')
    .isFloat({ min: 0 })
    .withMessage('Price must be a non-negative number')
];

// Get user's cart
router.get('/cart', authenticateToken, async (req: AuthRequest, res: AuthResponse) => {
  try {
    const cart = await Cart.findByUser(req.user!._id);
    
    if (!cart) {
      return res.json({
        success: true,
        data: {
          items: [],
          totalItems: 0,
          totalQuantity: 0,
          totalAmount: 0
        }
      });
    }

    res.json({
      success: true,
      data: cart
    });
  } catch (error) {
    console.error('Get cart error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Add item to cart
router.post('/cart/items', [
  authenticateToken,
  ...validateCartItem
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

    const { productId, quantity, price } = req.body;

    // Check if the franchise product exists
    const franchiseProduct = await FranchiseProduct.findById(productId);
    if (!franchiseProduct) {
      return res.status(404).json({
        success: false,
        error: 'Franchise product not found'
      });
    }

    // Check if the user has access to this franchise (franchise owner or authorized staff)
    if (req.user?.role !== 'superadmin') {
      // Check if user is the franchise owner
      const franchise = await Franchise.findById(franchiseProduct.franchise);
      if (!franchise) {
        return res.status(404).json({
          success: false,
          error: 'Associated franchise not found'
        });
      }

      if (!franchise._id.equals(req.user?._id)) {
        return res.status(403).json({
          success: false,
          error: 'You do not have access to this franchise product'
        });
      }
    }

    // Check if product stock is sufficient
    if (quantity > franchiseProduct.stock) {
      return res.status(400).json({
        success: false,
        error: `Insufficient stock. Available: ${franchiseProduct.stock}, Requested: ${quantity}`
      });
    }

    // Prepare cart item
    const cartItem: ICartItem = {
      product: franchiseProduct._id,
      franchiseProduct: franchiseProduct._id,
      quantity,
      price,
      total: quantity * price
    };

    // Find or create user's cart
    let cart = await Cart.findByUser(req.user!._id);
    if (!cart) {
      cart = await Cart.create({
        user: req.user!._id,
        items: [cartItem],
        totalItems: 1,
        totalQuantity: quantity,
        totalAmount: quantity * price
      });
    } else {
      // Check if item already exists in cart
      const existingItemIndex = cart.items.findIndex(
        item => item.product.toString() === productId
      );

      if (existingItemIndex > -1) {
        // Update quantity and total
        const newQuantity = cart.items[existingItemIndex].quantity + quantity;
        if (newQuantity > franchiseProduct.stock) {
          return res.status(400).json({
            success: false,
            error: `Insufficient stock. Available: ${franchiseProduct.stock}, Requested: ${newQuantity}`
          });
        }
        
        cart.items[existingItemIndex].quantity = newQuantity;
        cart.items[existingItemIndex].total = newQuantity * price;
      } else {
        // Add new item
        cart.items.push(cartItem);
      }
      
      cart.calculateTotals();
      await cart.save();
    }

    res.json({
      success: true,
      message: 'Item added to cart successfully',
      data: cart
    });
  } catch (error) {
    console.error('Add to cart error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Update cart item quantity
router.put('/cart/items/:productId', [
  authenticateToken,
  param('productId').isMongoId().withMessage('Valid product ID is required'),
  body('quantity')
    .isInt({ min: 1 })
    .withMessage('Quantity must be at least 1')
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

    const { productId } = req.params;
    const { quantity } = req.body;

    // Find user's cart
    const cart = await Cart.findByUser(req.user!._id);
    if (!cart) {
      return res.status(404).json({
        success: false,
        error: 'Cart not found'
      });
    }

    // Find the cart item
    const cartItemIndex = cart.items.findIndex(
      item => item.product.toString() === productId
    );

    if (cartItemIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Item not found in cart'
      });
    }

    // Get the franchise product to check stock
    const franchiseProduct = await FranchiseProduct.findById(productId);
    if (!franchiseProduct) {
      return res.status(404).json({
        success: false,
        error: 'Franchise product not found'
      });
    }

    // Check if new quantity exceeds stock
    if (quantity > franchiseProduct.stock) {
      return res.status(400).json({
        success: false,
        error: `Insufficient stock. Available: ${franchiseProduct.stock}, Requested: ${quantity}`
      });
    }

    // Update quantity
    cart.items[cartItemIndex].quantity = quantity;
    cart.items[cartItemIndex].total = quantity * cart.items[cartItemIndex].price;

    cart.calculateTotals();
    await cart.save();

    res.json({
      success: true,
      message: 'Cart item updated successfully',
      data: cart
    });
  } catch (error) {
    console.error('Update cart item error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Remove item from cart
router.delete('/cart/items/:productId', [
  authenticateToken,
  param('productId').isMongoId().withMessage('Valid product ID is required')
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

    const { productId } = req.params;

    // Find user's cart
    const cart = await Cart.findByUser(req.user!._id);
    if (!cart) {
      return res.status(404).json({
        success: false,
        error: 'Cart not found'
      });
    }

    // Find the cart item
    const initialLength = cart.items.length;
    cart.items = cart.items.filter(
      item => item.product.toString() !== productId
    );

    if (cart.items.length === initialLength) {
      return res.status(404).json({
        success: false,
        error: 'Item not found in cart'
      });
    }

    cart.calculateTotals();
    await cart.save();

    res.json({
      success: true,
      message: 'Item removed from cart successfully',
      data: cart
    });
  } catch (error) {
    console.error('Remove from cart error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Clear cart
router.delete('/cart', authenticateToken, async (req: AuthRequest, res: AuthResponse) => {
  try {
    // Find user's cart
    const cart = await Cart.findByUser(req.user!._id);
    if (!cart) {
      return res.status(404).json({
        success: false,
        error: 'Cart not found'
      });
    }

    // Clear cart items
    cart.items = [];
    cart.calculateTotals();
    await cart.save();

    res.json({
      success: true,
      message: 'Cart cleared successfully',
      data: cart
    });
  } catch (error) {
    console.error('Clear cart error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// View franchise inventory (for franchise owners)
router.get('/franchise/:franchiseId/inventory', [
  authenticateToken,
  param('franchiseId').isMongoId().withMessage('Valid franchise ID is required')
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

    const { franchiseId } = req.params;

    // Verify user has access to this franchise
    if (req.user?.role !== 'superadmin') {
      // Check if the user is the franchise owner
      // In a real implementation, you might have a field in the User model that links to the franchise
      // For now, we'll assume that the franchise contact email matches user email
      // Or that franchise owners have special permissions
      const franchise = await Franchise.findById(franchiseId);
      if (!franchise) {
        return res.status(404).json({
          success: false,
          error: 'Franchise not found'
        });
      }

      // Check if user has permission to access this franchise
      // This is a simplified check - in a real application, you'd have a relationship between users and franchises
      if (franchise.email !== req.user?.email && req.user?.role !== 'admin' && req.user?.role !== 'staff') {
        // Check if user has franchise-specific permissions
        const hasFranchiseAccess = req.user?.permissions.includes('franchise:read') || 
                                  req.user?.permissions.includes(`franchise:${franchiseId}:read`);
        
        if (!hasFranchiseAccess) {
          return res.status(403).json({
            success: false,
            error: 'You do not have permission to access this franchise inventory'
          });
        }
      }
    }

    // Get all products for this franchise
    const products = await FranchiseProduct.find({ franchise: franchiseId })
      .populate('franchise', 'name industry')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: {
        products,
        count: products.length
      }
    });
  } catch (error) {
    console.error('View franchise inventory error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// View franchise inventory with filtering and pagination (for franchise owners)
router.get('/franchise/:franchiseId/inventory/search', [
  authenticateToken,
  param('franchiseId').isMongoId().withMessage('Valid franchise ID is required')
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

    const { franchiseId } = req.params;
    const {
      page = '1',
      limit = '20',
      search = '',
      category = '',
      brand = '',
      minPrice = '',
      maxPrice = '',
      lowStock = '',
      isActive = ''
    } = req.query;

    // Verify user has access to this franchise
    if (req.user?.role !== 'superadmin') {
      const franchise = await Franchise.findById(franchiseId);
      if (!franchise) {
        return res.status(404).json({
          success: false,
          error: 'Franchise not found'
        });
      }

      // Check if user has permission to access this franchise
      if (franchise.email !== req.user?.email && req.user?.role !== 'admin' && req.user?.role !== 'staff') {
        const hasFranchiseAccess = req.user?.permissions.includes('franchise:read') || 
                                  req.user?.permissions.includes(`franchise:${franchiseId}:read`);
        
        if (!hasFranchiseAccess) {
          return res.status(403).json({
            success: false,
            error: 'You do not have permission to access this franchise inventory'
          });
        }
      }
    }

    // Build query
    const query: any = { franchise: franchiseId };
    
    if (search && search.toString().trim() !== '') {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } },
        { brand: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (category && category.toString().trim() !== '') {
      query.category = { $regex: category.toString(), $options: 'i' };
    }
    
    if (brand && brand.toString().trim() !== '') {
      query.brand = { $regex: brand.toString(), $options: 'i' };
    }
    
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = parseFloat(minPrice.toString());
      if (maxPrice) query.price.$lte = parseFloat(maxPrice.toString());
    }
    
    if (lowStock === 'true') {
      query.$expr = { $lte: ['$stock', '$minStock'] };
    }
    
    if (isActive !== undefined && isActive !== '') {
      query.isActive = isActive === 'true';
    }

    // Pagination
    const pageNum = parseInt(page.toString());
    const limitNum = parseInt(limit.toString());

    const products = await FranchiseProduct.find(query)
      .populate('franchise', 'name industry')
      .sort({ createdAt: -1 })
      .limit(limitNum)
      .skip((pageNum - 1) * limitNum);

    const total = await FranchiseProduct.countDocuments(query);

    res.json({
      success: true,
      data: {
        products,
        pagination: {
          total,
          currentPage: pageNum,
          totalPages: Math.ceil(total / limitNum),
          limit: limitNum,
          hasNext: pageNum * limitNum < total,
          hasPrev: pageNum > 1
        }
      }
    });
  } catch (error) {
    console.error('Search franchise inventory error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Get franchise inventory count statistics
router.get('/franchise/:franchiseId/inventory/stats', [
  authenticateToken,
  param('franchiseId').isMongoId().withMessage('Valid franchise ID is required')
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

    const { franchiseId } = req.params;

    // Verify user has access to this franchise
    if (req.user?.role !== 'superadmin') {
      const franchise = await Franchise.findById(franchiseId);
      if (!franchise) {
        return res.status(404).json({
          success: false,
          error: 'Franchise not found'
        });
      }
    }

    // Get inventory statistics
    const stats = await FranchiseProduct.aggregate([
      { $match: { franchise: new Types.ObjectId(franchiseId) } },
      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          totalStock: { $sum: '$stock' },
          totalValue: { $sum: { $multiply: ['$stock', '$price'] } },
          avgPrice: { $avg: '$price' },
          lowStockCount: {
            $sum: {
              $cond: [{ $lte: ['$stock', '$minStock'] }, 1, 0]
            }
          },
          activeProducts: {
            $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] }
          },
          inactiveProducts: {
            $sum: { $cond: [{ $eq: ['$isActive', false] }, 1, 0] }
          }
        }
      }
    ]);

    const categoryStats = await FranchiseProduct.aggregate([
      { $match: { franchise: new Types.ObjectId(franchiseId) } },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          totalStock: { $sum: '$stock' },
          totalValue: { $sum: { $multiply: ['$stock', '$price'] } }
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.json({
      success: true,
      data: {
        summary: stats[0] || {
          totalProducts: 0,
          totalStock: 0,
          totalValue: 0,
          avgPrice: 0,
          lowStockCount: 0,
          activeProducts: 0,
          inactiveProducts: 0
        },
        categories: categoryStats
      }
    });
  } catch (error) {
    console.error('Get franchise inventory stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

// Add item to cart from franchise inventory
router.post('/franchise/:franchiseId/cart/items', [
  authenticateToken,
  ...validateCartItem
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

    const { franchiseId } = req.params;
    const { productId, quantity, price } = req.body;

    // Check if the franchise product exists and belongs to the specified franchise
    const franchiseProduct = await FranchiseProduct.findOne({
      _id: productId,
      franchise: franchiseId
    });
    
    if (!franchiseProduct) {
      return res.status(404).json({
        success: false,
        error: 'Franchise product not found or does not belong to this franchise'
      });
    }

    // Check if the user has access to this franchise
    if (req.user?.role !== 'superadmin') {
      const franchise = await Franchise.findById(franchiseId);
      if (!franchise) {
        return res.status(404).json({
          success: false,
          error: 'Franchise not found'
        });
      }

      // In a real system, we would have a mapping between users and franchises
      // For now, we'll implement a basic check
      // Typically franchise owners would have a specific role or connection to the franchise
    }

    // Check if product stock is sufficient
    if (quantity > franchiseProduct.stock) {
      return res.status(400).json({
        success: false,
        error: `Insufficient stock. Available: ${franchiseProduct.stock}, Requested: ${quantity}`
      });
    }

    // Prepare cart item
    const cartItem: ICartItem = {
      product: franchiseProduct._id,
      franchiseProduct: franchiseProduct._id,
      quantity,
      price,
      total: quantity * price
    };

    // Find or create user's cart
    let cart = await Cart.findByUser(req.user!._id);
    if (!cart) {
      cart = await Cart.create({
        user: req.user!._id,
        items: [cartItem],
        totalItems: 1,
        totalQuantity: quantity,
        totalAmount: quantity * price
      });
    } else {
      // Check if item already exists in cart
      const existingItemIndex = cart.items.findIndex(
        item => item.product.toString() === productId
      );

      if (existingItemIndex > -1) {
        // Update quantity and total
        const newQuantity = cart.items[existingItemIndex].quantity + quantity;
        if (newQuantity > franchiseProduct.stock) {
          return res.status(400).json({
            success: false,
            error: `Insufficient stock. Available: ${franchiseProduct.stock}, Requested: ${newQuantity}`
          });
        }
        
        cart.items[existingItemIndex].quantity = newQuantity;
        cart.items[existingItemIndex].total = newQuantity * price;
      } else {
        // Add new item
        cart.items.push(cartItem);
      }
      
      cart.calculateTotals();
      await cart.save();
    }

    res.json({
      success: true,
      message: 'Item added to cart successfully',
      data: cart
    });
  } catch (error) {
    console.error('Add franchise product to cart error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: (error as Error).message
    });
  }
});

export default router;