// const express = require('express');
// const router = express.Router();
// import { body, validationResult } from 'express-validator';
// import { Types } from 'mongoose';
// import { authenticateToken, requirePermission } from '../middleware/auth';
// import Product, { IProduct } from '../models/Product';
// // import Manufacturer from '../models/Manufacturer';
// import ProductCategory from '../models/ProductCategory';
// import { AuthRequest, AuthResponse, PaginatedResponse, ApiResponse } from '../types/routes';

// interface ProductQuery {
//   page?: string;
//   limit?: string;
//   category?: string;
//   manufacturer?: string;
//   search?: string;
//   minPrice?: string;
//   maxPrice?: string;
//   inStock?: string;
//   sortBy?: string;
//   sortOrder?: 'asc' | 'desc';
// }

// interface ProductStats {
//   totalProducts: number;
//   activeProducts: number;
//   featuredProducts: number;
//   onSaleProducts: number;
//   outOfStockProducts: number;
//   lowStockProducts: number;
//   totalViews: number;
//   totalSales: number;
//   totalRevenue: number;
// }

// // Get all products
// router.get('/', authenticateToken, async (req: AuthRequest, res: AuthResponse) => {
//   try {
//     const { 
//       page = '1', 
//       limit = '10', 
//       category, 
//       manufacturer,
//       search, 
//       minPrice, 
//       maxPrice,
//       inStock,
//       sortBy = 'createdAt', 
//       sortOrder = 'desc' 
//     } = req.query as ProductQuery;
    
//     const query: any = { isActive: true };
    
//     if (category) query.category = category;
//     if (manufacturer) query.manufacturer = manufacturer;
//     if (minPrice || maxPrice) {
//       query.price = {};
//       if (minPrice) query.price.$gte = parseFloat(minPrice);
//       if (maxPrice) query.price.$lte = parseFloat(maxPrice);
//     }
//     if (inStock === 'true') query['inventory.quantity'] = { $gt: 0 };
//     if (inStock === 'false') query['inventory.quantity'] = { $lte: 0 };
    
//     if (search) {
//       query.$or = [
//         { name: { $regex: search, $options: 'i' } },
//         { description: { $regex: search, $options: 'i' } }
//       ];
//     }

//     const sortOptions: { [key: string]: 1 | -1 } = {};
//     sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

//     const pageNum = parseInt(page);
//     const limitNum = parseInt(limit);

//     const products = await Product.find(query)
//       .sort(sortOptions)
//       .limit(limitNum)
//       .skip((pageNum - 1) * limitNum)
//       .populate('manufacturer')
//       .exec();

//     const total = await Product.countDocuments(query);

//     const response: PaginatedResponse<IProduct[]> = {
//       success: true,
//       data: products,
//       pagination: {
//         total,
//         currentPage: pageNum,
//         totalPages: Math.ceil(total / limitNum),
//         limit: limitNum,
//         hasNext: pageNum * limitNum < total,
//         hasPrev: pageNum > 1
//       }
//     };

//     res.json(response);
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       error: 'Server error',
//       details: (error as Error).message
//     });
//   }
// });

// // Get product by ID
// router.get('/:id', authenticateToken, async (req: AuthRequest, res: AuthResponse) => {
//   try {
//     const product = await Product.findById(req.params.id);
//     if (!product) {
//       return res.status(404).json({
//         success: false,
//         error: 'Product not found'
//       });
//     }
//     // Increment view count
//     await (product as any).incrementViews();
//     res.json({
//       success: true,
//       data: product
//     });
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       error: 'Server error',
//       details: (error as Error).message
//     });
//   }
// });

// // Create new product
// router.post('/', [
//   authenticateToken,
//   requirePermission('product:write'),
//   body('name').trim().isLength({ min: 3 }).withMessage('Product name must be at least 3 characters'),
//   body('category').trim().isLength({ min: 1 }).withMessage('Category is required'),
//   body('manufacturer').custom((val: any, { req }: any) => {
//     if (!val && !req.body.customManufacturer) {
//       throw new Error('Manufacturer is required');
//     }
//     return true;
//   }),
// ], async (req: AuthRequest, res: AuthResponse) => {
//   try {
//     const errors = validationResult(req);
//     if (!errors.isEmpty()) {
//       return res.status(400).json({
//         success: false,
//         error: 'Validation failed',
//         details: errors.array()
//       });
//     }

//     console.log('POST /api/products payload:', JSON.stringify(req.body, null, 2));

//     const payload = { ...req.body };

//     // Normalize manufacturer if object
//     if (payload.manufacturer && typeof payload.manufacturer === 'object') {
//       if (payload.manufacturer._id) payload.manufacturer = String(payload.manufacturer._id);
//       else if (payload.manufacturer.name) payload.manufacturer = String(payload.manufacturer.name);
//       else payload.manufacturer = '';
//     }

//     // Normalize numeric fields and defaults
//     payload.mrp = payload.mrp !== undefined ? Number(payload.mrp) : 0;
//     payload.price = payload.price || {};
//     payload.price.regular = payload.price.regular !== undefined ? Number(payload.price.regular) : payload.mrp || 0;
//     if (payload.price.sale !== undefined) payload.price.sale = Number(payload.price.sale);
//     if (payload.price.cost !== undefined) payload.price.cost = Number(payload.price.cost);
//     if (payload.price.wholesale !== undefined) payload.price.wholesale = Number(payload.price.wholesale);

//     // Weight default
//     if (!payload.weight || typeof payload.weight !== 'object') {
//       payload.weight = { value: 0, unit: 'g' };
//     } else {
//       payload.weight.value = Number(payload.weight.value || 0);
//       payload.weight.unit = payload.weight.unit || 'g';
//     }

//     // Inventory defaults
//     payload.inventory = payload.inventory || {};
//     payload.inventory.quantity = payload.inventory.quantity !== undefined ? Number(payload.inventory.quantity) : 0;
//     payload.inventory.lowStockThreshold = payload.inventory.lowStockThreshold !== undefined ? Number(payload.inventory.lowStockThreshold) : 10;
//     payload.inventory.trackInventory = payload.inventory.trackInventory !== undefined ? !!payload.inventory.trackInventory : true;

//     // Ensure required string fields have safe defaults
//     if (payload.description === undefined || payload.description === null) payload.description = '';
//     if (payload.batchNo !== undefined && payload.batchNo !== null) payload.batchNo = String(payload.batchNo).trim();

//     // If manufacturer is a name (not an ObjectId), upsert and replace with _id
//     if (payload.manufacturer && !Types.ObjectId.isValid(payload.manufacturer)) {
//       const name = String(payload.manufacturer).trim();
//       let existing = await Manufacturer.findOne({ name });
//       if (!existing) {
//         existing = new Manufacturer({
//           name,
//           contactPerson: 'Default Contact',
//           phone: '0000000000',
//           email: 'default@example.com'
//         });
//         await existing.save();
//       }
//       payload.manufacturer = existing._id;
//     }

//     // Ensure product category exists
//     if (payload.category) {
//       await ProductCategory.updateOne({ name: payload.category }, { name: payload.category }, { upsert: true });
//     }

//     // Ensure SKU uniqueness
//     if (payload.sku) {
//       const existingSku = await Product.findOne({ sku: payload.sku }).collation({ locale: 'en', strength: 2 });
//       if (existingSku) {
//         return res.status(400).json({
//           success: false,
//           error: 'SKU must be unique. Another product with this SKU already exists.'
//         });
//       }
//     }

//     const product = new Product(payload);
//     await product.save();
//     res.status(201).json({
//       success: true,
//       data: product
//     });
//   } catch (error) {
//     console.error('POST /api/products error:', error);
//     if ((error as any).errors && (error as any).name === 'ValidationError') {
//       return res.status(400).json({
//         success: false,
//         error: 'Validation error',
//         details: (error as Error).message
//       });
//     }
//     if ((error as any).code === 11000) {
//       const dupKey = Object.keys((error as any).keyValue || {})[0] || 'field';
//       return res.status(409).json({
//         success: false,
//         error: `${dupKey} already exists and must be unique.`
//       });
//     }
//     res.status(500).json({
//       success: false,
//       error: 'Server error',
//       details: process.env.NODE_ENV === 'development' ? (error as Error).stack : (error as Error).message
//     });
//   }
// });

// // Update product
// router.put('/:id', [
//   authenticateToken,
//   requirePermission('product:write'),
//   body('name').optional().trim().isLength({ min: 3 }).withMessage('Product name must be at least 3 characters'),
//   body('category').optional().isString(),
//   body('manufacturer').optional().trim(),
// ], async (req: AuthRequest, res: AuthResponse) => {
//   try {
//     const errors = validationResult(req);
//     if (!errors.isEmpty()) {
//       return res.status(400).json({
//         success: false,
//         error: 'Validation failed',
//         details: errors.array()
//       });
//     }

//     console.log('PUT /api/products payload:', JSON.stringify(req.body, null, 2));

//     // If manufacturer provided as name, upsert and replace with id
//     if (req.body.manufacturer && !Types.ObjectId.isValid(req.body.manufacturer)) {
//       const name = req.body.manufacturer.trim();
//       let existing = await Manufacturer.findOne({ name });
//       if (!existing) {
//         existing = new Manufacturer({ name });
//         await existing.save();
//       }
//       req.body.manufacturer = existing._id;
//     }

//     // Ensure category exists
//     if (req.body.category) {
//       await ProductCategory.updateOne({ name: req.body.category }, { name: req.body.category }, { upsert: true });
//     }

//     // Normalize fields
//     if (req.body.batchNo !== undefined && req.body.batchNo !== null) req.body.batchNo = String(req.body.batchNo).trim();
//     if (req.body.price) {
//       if (req.body.price.retail !== undefined) req.body.price.retail = Number(req.body.price.retail);
//       if (req.body.price.wholesale !== undefined) req.body.price.wholesale = Number(req.body.price.wholesale);
//     }

//     // Check SKU uniqueness
//     if (req.body.sku) {
//       const existing = await Product.findOne({ sku: req.body.sku }).collation({ locale: 'en', strength: 2 });
//       if (existing && String(existing._id) !== String(req.params.id)) {
//         return res.status(400).json({
//           success: false,
//           error: 'SKU must be unique. Another product with this SKU already exists.'
//         });
//       }
//     }

//     const product = await Product.findById(req.params.id);
//     if (!product) {
//       return res.status(404).json({
//         success: false,
//         error: 'Product not found'
//       });
//     }

//     Object.assign(product, req.body);
//     await product.save();

//     res.json({
//       success: true,
//       data: product
//     });
//   } catch (error) {
//     console.error('PUT /api/products error:', error);
//     if ((error as any).code === 11000) {
//       const dupKey = Object.keys((error as any).keyValue || {})[0] || 'field';
//       return res.status(409).json({
//         success: false,
//         error: `${dupKey} already exists and must be unique.`
//       });
//     }
//     res.status(500).json({
//       success: false,
//       error: 'Server error',
//       details: process.env.NODE_ENV === 'development' ? (error as Error).stack : (error as Error).message
//     });
//   }
// });

// // Delete product
// router.delete('/:id', authenticateToken, requirePermission('product:delete'), async (req: AuthRequest, res: AuthResponse) => {
//   try {
//     const product = await Product.findById(req.params.id);
//     if (!product) {
//       return res.status(404).json({
//         success: false,
//         error: 'Product not found'
//       });
//     }

//     await Product.findByIdAndDelete(req.params.id);
//     res.json({
//       success: true,
//       message: 'Product deleted successfully'
//     });
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       error: 'Server error',
//       details: (error as Error).message
//     });
//   }
// });

// // Toggle product active status
// router.patch('/:id/toggle-status', authenticateToken, requirePermission('product:write'), async (req: AuthRequest, res: AuthResponse) => {
//   try {
//     const product = await Product.findById(req.params.id);
//     if (!product) {
//       return res.status(404).json({
//         success: false,
//         error: 'Product not found'
//       });
//     }

//     product.isActive = !product.isActive;
//     await product.save();

//     res.json({
//       success: true,
//       message: `Product ${product.isActive ? 'activated' : 'deactivated'} successfully`,
//       data: { isActive: product.isActive }
//     });
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       error: 'Server error',
//       details: (error as Error).message
//     });
//   }
// });

// // Toggle product featured status
// router.patch('/:id/toggle-featured', authenticateToken, requirePermission('product:write'), async (req: AuthRequest, res: AuthResponse) => {
//   try {
//     const product = await Product.findById(req.params.id);
//     if (!product) {
//       return res.status(404).json({
//         success: false,
//         error: 'Product not found'
//       });
//     }

//     product.isFeatured = !product.isFeatured;
//     await product.save();

//     res.json({
//       success: true,
//       message: `Product ${product.isFeatured ? 'featured' : 'unfeatured'} successfully`,
//       data: { isFeatured: product.isFeatured }
//     });
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       error: 'Server error',
//       details: (error as Error).message
//     });
//   }
// });

// // Get featured products
// router.get('/featured/list', async (_req: AuthRequest, res: AuthResponse) => {
//   try {
//     const products = await Product.find({ 
//       isActive: true, 
//       isFeatured: true 
//     })
//     .populate('shop', 'name logo')
//     .populate('category', 'name')
//     .sort({ createdAt: -1 })
//     .limit(10);

//     res.json({
//       success: true,
//       data: products
//     });
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       error: 'Server error',
//       details: (error as Error).message
//     });
//   }
// });

// // Get product statistics
// router.get('/stats/overview', authenticateToken, requirePermission('product:read'), async (_req: AuthRequest, res: AuthResponse) => {
//   try {
//     const stats = await Product.aggregate<ProductStats>([
//       {
//         $group: {
//           _id: null,
//           totalProducts: { $sum: 1 },
//           activeProducts: { $sum: { $cond: ['$isActive', 1, 0] } },
//           featuredProducts: { $sum: { $cond: ['$isFeatured', 1, 0] } },
//           onSaleProducts: { $sum: { $cond: ['$isOnSale', 1, 0] } },
//           outOfStockProducts: { $sum: { $cond: [{ $lte: ['$inventory.quantity', 0] }, 1, 0] } },
//           lowStockProducts: { $sum: { $cond: [{ $and: [{ $gt: ['$inventory.quantity', 0] }, { $lte: ['$inventory.quantity', '$inventory.lowStockThreshold'] }] }, 1, 0] } },
//           totalViews: { $sum: '$stats.views' },
//           totalSales: { $sum: '$stats.sales' },
//           totalRevenue: { $sum: '$stats.revenue' }
//         }
//       }
//     ]);

//     res.json({
//       success: true,
//       data: stats[0] || {
//         totalProducts: 0,
//         activeProducts: 0,
//         featuredProducts: 0,
//         onSaleProducts: 0,
//         outOfStockProducts: 0,
//         lowStockProducts: 0,
//         totalViews: 0,
//         totalSales: 0,
//         totalRevenue: 0
//       }
//     });
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       error: 'Server error',
//       details: (error as Error).message
//     });
//   }
// });

// // Bulk update product status
// router.patch('/bulk/status', authenticateToken, requirePermission('product:write'), async (req: AuthRequest, res: AuthResponse) => {
//   try {
//     const { productIds, isActive } = req.body;
    
//     if (!Array.isArray(productIds) || productIds.length === 0) {
//       return res.status(400).json({
//         success: false,
//         error: 'Product IDs array is required'
//       });
//     }

//     const result = await Product.updateMany(
//       { _id: { $in: productIds } },
//       { isActive }
//     );

//     res.json({
//       success: true,
//       message: `${result.modifiedCount} products ${isActive ? 'activated' : 'deactivated'} successfully`,
//       data: { modifiedCount: result.modifiedCount }
//     });
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       error: 'Server error',
//       details: (error as Error).message
//     });
//   }
// });

// // Get products by category
// router.get('/category/:categoryId', authenticateToken, async (req: AuthRequest, res: AuthResponse) => {
//   try {
//     const { page = '1', limit = '10', sortBy = 'createdAt', sortOrder = 'desc' } = req.query as ProductQuery;
    
//     const query = { 
//       category: req.params.categoryId,
//       isActive: true 
//     };

//     const sortOptions: { [key: string]: 1 | -1 } = {};
//     sortOptions[sortBy || 'createdAt'] = sortOrder === 'desc' ? -1 : 1;

//     const pageNum = parseInt(page);
//     const limitNum = parseInt(limit);

//     const products = await Product.find(query)
//       .populate('shop', 'name logo')
//       .populate('category', 'name')
//       .sort(sortOptions)
//       .limit(limitNum)
//       .skip((pageNum - 1) * limitNum)
//       .exec();

//     const total = await Product.countDocuments(query);

//     const response: PaginatedResponse<IProduct[]> = {
//       success: true,
//       data: products,
//       pagination: {
//         total,
//         currentPage: pageNum,
//         totalPages: Math.ceil(total / limitNum),
//         limit: limitNum,
//         hasNext: pageNum * limitNum < total,
//         hasPrev: pageNum > 1
//       }
//     };

//     res.json(response);
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       error: 'Server error',
//       details: (error as Error).message
//     });
//   }
// });

// export default router;
