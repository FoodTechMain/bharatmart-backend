"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express = require('express');
const router = express.Router();
const Request = express.Request;
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const express_validator_1 = require("express-validator");
const FranchiseProduct_js_1 = __importDefault(require("../models/FranchiseProduct.js"));
const Franchise_js_1 = __importDefault(require("../models/Franchise.js"));
const excelProcessor_js_1 = __importDefault(require("../utils/excelProcessor.js"));
const auth_js_1 = require("../middleware/auth.js");
const slugify_1 = __importDefault(require("slugify"));
const xlsx_1 = __importDefault(require("xlsx"));
const promises_1 = __importDefault(require("fs/promises"));
const mongoose_1 = require("mongoose");
// Configure multer for file uploads
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, 'uploads/temp/');
    },
    filename: (_req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `products-${uniqueSuffix}${path_1.default.extname(file.originalname)}`);
    }
});
const upload = (0, multer_1.default)({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: (_req, file, cb) => {
        const allowedTypes = ['.xlsx', '.xls', '.csv'];
        const ext = path_1.default.extname(file.originalname).toLowerCase();
        if (allowedTypes.includes(ext)) {
            cb(null, true);
        }
        else {
            cb(new Error('Only Excel files (.xlsx, .xls) and CSV files are allowed'));
        }
    }
});
// Validation middleware
const validateProduct = [
    (0, express_validator_1.body)("name")
        .trim()
        .isLength({ min: 2, max: 200 })
        .withMessage("Product name must be between 2 and 200 characters"),
    (0, express_validator_1.body)("description")
        .trim()
        .isLength({ min: 10, max: 1000 })
        .withMessage("Description must be between 10 and 1000 characters"),
    (0, express_validator_1.body)("sku")
        .trim()
        .isLength({ min: 3, max: 50 })
        .withMessage("SKU must be between 3 and 50 characters"),
    (0, express_validator_1.body)("stock")
        .optional()
        .isInt({ min: 0 })
        .withMessage("Stock must be a non-negative integer"),
    (0, express_validator_1.body)("category")
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage("Category must be between 2 and 100 characters"),
];
// Get all franchise products with advanced filtering
router.get('/', [
    auth_js_1.authenticateToken,
    (0, auth_js_1.requirePermission)('franchise_products:read')
], async (req, res) => {
    try {
        const { franchise, page = '1', limit = '20', search, category, brand, minPrice, maxPrice, lowStock, isActive, isFeatured, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
        // Build query
        const query = {};
        if (franchise) {
            query.franchise = franchise;
        }
        if (search && search.trim() !== '') {
            query.$text = { $search: search };
        }
        if (category && category.trim() !== '') {
            query.category = { $regex: category, $options: 'i' };
        }
        if (brand && brand.trim() !== '') {
            query.brand = { $regex: brand, $options: 'i' };
        }
        if (minPrice || maxPrice) {
            query.sellingPrice = {};
            if (minPrice)
                query.sellingPrice.$gte = parseFloat(minPrice);
            if (maxPrice)
                query.sellingPrice.$lte = parseFloat(maxPrice);
        }
        if (lowStock === 'true') {
            query.$expr = { $lte: ['$stock', '$minStock'] };
        }
        if (isActive !== undefined && isActive !== '') {
            query.isActive = isActive === 'true';
        }
        if (isFeatured !== undefined && isFeatured !== '') {
            query.isFeatured = isFeatured === 'true';
        }
        // Sort options
        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const products = await FranchiseProduct_js_1.default.find(query)
            .populate('franchise', 'name industry')
            .sort(sortOptions)
            .limit(limitNum)
            .skip((pageNum - 1) * limitNum)
            .lean()
            .exec();
        const total = await FranchiseProduct_js_1.default.countDocuments(query);
        // Get aggregation stats
        const stats = await FranchiseProduct_js_1.default.aggregate([
            { $match: query },
            {
                $group: {
                    _id: null,
                    totalProducts: { $sum: 1 },
                    totalValue: { $sum: { $multiply: ['$stock', '$sellingPrice'] } },
                    avgPrice: { $avg: '$sellingPrice' },
                    lowStockCount: {
                        $sum: {
                            $cond: [{ $lte: ['$stock', '$minStock'] }, 1, 0]
                        }
                    }
                }
            }
        ]);
        const response = {
            success: true,
            data: products,
            pagination: {
                total,
                currentPage: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(total / limitNum)
            },
            stats: stats[0] || {
                totalProducts: 0,
                totalValue: 0,
                avgPrice: 0,
                lowStockCount: 0
            }
        };
        res.json(response);
    }
    catch (error) {
        console.error('Get franchise products error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
});
// Get product by ID
router.get('/:id', [
    auth_js_1.authenticateToken,
    (0, auth_js_1.requirePermission)('franchise_products:read'),
    (0, express_validator_1.param)('id').isMongoId().withMessage('Invalid product ID')
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
        const product = await FranchiseProduct_js_1.default.findById(req.params.id)
            .populate('franchise', 'name industry contactPerson email');
        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'Product not found'
            });
        }
        res.json({
            success: true,
            data: product
        });
    }
    catch (error) {
        console.error('Get product error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
});
// Create new product
router.post('/', [
    auth_js_1.authenticateToken,
    (0, auth_js_1.requirePermission)('franchise_products:create'),
    ...validateProduct
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
        // Check if SKU already exists
        const existingProduct = await FranchiseProduct_js_1.default.findOne({
            sku: req.body.sku,
            franchise: req.body.franchise
        });
        if (existingProduct) {
            return res.status(400).json({
                success: false,
                error: 'Product with this SKU already exists for this franchise'
            });
        }
        const product = new FranchiseProduct_js_1.default(req.body);
        await product.save();
        res.status(201).json({
            success: true,
            data: product
        });
    }
    catch (error) {
        console.error('Create product error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
});
// Update product
router.put('/:id', [
    auth_js_1.authenticateToken,
    (0, auth_js_1.requirePermission)('franchise_products:update'),
    (0, express_validator_1.param)('id').isMongoId().withMessage('Invalid product ID'),
    ...validateProduct
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
        const product = await FranchiseProduct_js_1.default.findById(req.params.id);
        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'Product not found'
            });
        }
        // Check SKU uniqueness if changing
        if (req.body.sku && req.body.sku !== product.sku) {
            const existingProduct = await FranchiseProduct_js_1.default.findOne({
                sku: req.body.sku,
                franchise: product.franchise,
                _id: { $ne: req.params.id }
            });
            if (existingProduct) {
                return res.status(400).json({
                    success: false,
                    error: 'Product with this SKU already exists for this franchise'
                });
            }
        }
        Object.assign(product, req.body);
        await product.save();
        res.json({
            success: true,
            data: product
        });
    }
    catch (error) {
        console.error('Update product error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
});
// Delete product
router.delete('/:id', [
    auth_js_1.authenticateToken,
    (0, auth_js_1.requirePermission)('franchise_products:delete'),
    (0, express_validator_1.param)('id').isMongoId().withMessage('Invalid product ID')
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
        const product = await FranchiseProduct_js_1.default.findById(req.params.id);
        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'Product not found'
            });
        }
        await FranchiseProduct_js_1.default.findByIdAndDelete(req.params.id);
        res.json({
            success: true,
            message: 'Product deleted successfully'
        });
    }
    catch (error) {
        console.error('Delete product error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
});
// Bulk import from Excel
router.post('/bulk/import', [
    auth_js_1.authenticateToken,
    (0, auth_js_1.requirePermission)('franchise_products:create'),
    upload.single('file'),
    (0, express_validator_1.body)('franchise').isMongoId().withMessage('Valid franchise ID is required')
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
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'Excel file is required'
            });
        }
        const { franchise } = req.body;
        const importBatch = `batch_${Date.now()}`;
        // Verify franchise exists
        const franchiseExists = await Franchise_js_1.default.findById(franchise);
        if (!franchiseExists) {
            return res.status(404).json({
                success: false,
                error: 'Franchise not found'
            });
        }
        // Parse Excel file
        const products = await excelProcessor_js_1.default.parseExcelFile(req.file.path);
        // Validate products
        const { validProducts, errors: validationErrors } = excelProcessor_js_1.default.validateProducts(products);
        if (validationErrors.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Validation errors found',
                details: {
                    errors: validationErrors,
                    validCount: validProducts.length,
                    errorCount: validationErrors.length
                }
            });
        }
        // Check for duplicate SKUs
        const skus = validProducts.map(p => p.sku);
        const existingProducts = await FranchiseProduct_js_1.default.find({
            sku: { $in: skus },
            franchise: franchise
        });
        if (existingProducts.length > 0) {
            const duplicateSkus = existingProducts.map(p => p.sku);
            return res.status(400).json({
                success: false,
                error: 'Duplicate SKUs found',
                details: {
                    duplicateSkus,
                    existingProducts: existingProducts.map(p => ({ sku: p.sku, name: p.name }))
                }
            });
        }
        // Add franchise and import batch to each product
        const productsToInsert = validProducts.map(product => ({
            ...product,
            franchise: franchise,
            importBatch: importBatch,
            slug: (0, slugify_1.default)(product.name || '', { lower: true, strict: true })
        }));
        // Bulk insert using Mongoose insertMany
        const insertedProducts = await FranchiseProduct_js_1.default.insertMany(productsToInsert);
        // Clean up temp file
        await promises_1.default.unlink(req.file.path);
        res.json({
            success: true,
            message: `${insertedProducts.length} products imported successfully`,
            data: {
                importBatch,
                importedCount: insertedProducts.length,
                products: insertedProducts
            }
        });
    }
    catch (error) {
        console.error('Bulk import error:', error);
        // Clean up temp file on error
        if (req.file) {
            try {
                await promises_1.default.unlink(req.file.path);
            }
            catch (cleanupError) {
                console.error('File cleanup error:', cleanupError);
            }
        }
        res.status(500).json({
            success: false,
            error: 'Import failed',
            details: error.message
        });
    }
});
// Bulk export to Excel
router.get('/bulk/export', [
    auth_js_1.authenticateToken,
    (0, auth_js_1.requirePermission)('franchise_products:read'),
    (0, express_validator_1.query)('franchise').optional().isMongoId().withMessage('Invalid franchise ID'),
    (0, express_validator_1.query)('format').optional().isIn(['xlsx', 'csv']).withMessage('Format must be xlsx or csv')
], async (req, res) => {
    try {
        const { franchise, format = 'xlsx' } = req.query;
        // Build query
        const query = {};
        if (franchise) {
            query.franchise = franchise;
        }
        // Get products
        const products = await FranchiseProduct_js_1.default.find(query)
            .populate('franchise', 'name industry')
            .sort({ createdAt: -1 })
            .lean();
        if (products.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'No products found to export'
            });
        }
        // Generate Excel file
        const workbook = excelProcessor_js_1.default.exportToExcel(products);
        // Set response headers
        const filename = `franchise_products_${Date.now()}.${format}`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        // Send file
        const buffer = xlsx_1.default.write(workbook, { type: 'buffer', bookType: format });
        res.send(buffer);
    }
    catch (error) {
        console.error('Bulk export error:', error);
        res.status(500).json({
            success: false,
            error: 'Export failed',
            details: error.message
        });
    }
});
// Download Excel template
router.get('/template/download', [
    auth_js_1.authenticateToken,
    (0, auth_js_1.requirePermission)('franchise_products:create')
], async (_req, res) => {
    try {
        const workbook = excelProcessor_js_1.default.generateTemplate();
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="franchise_products_template.xlsx"');
        const buffer = xlsx_1.default.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        res.send(buffer);
    }
    catch (error) {
        console.error('Template download error:', error);
        res.status(500).json({
            success: false,
            error: 'Template download failed',
            details: error.message
        });
    }
});
// Bulk update products
router.put('/bulk/update', [
    auth_js_1.authenticateToken,
    (0, auth_js_1.requirePermission)('franchise_products:update'),
    (0, express_validator_1.body)('updates').isArray().withMessage('Updates must be an array'),
    (0, express_validator_1.body)('updates.*._id').isMongoId().withMessage('Invalid product ID'),
    (0, express_validator_1.body)('franchise').isMongoId().withMessage('Valid franchise ID is required')
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
        const { updates, franchise } = req.body;
        // Validate all products belong to the franchise
        const productIds = updates.map(u => u._id);
        const existingProducts = await FranchiseProduct_js_1.default.find({
            _id: { $in: productIds },
            franchise: franchise
        });
        if (existingProducts.length !== productIds.length) {
            return res.status(400).json({
                success: false,
                error: 'Some products not found or do not belong to the specified franchise'
            });
        }
        // Perform bulk update
        const result = await FranchiseProduct_js_1.default.bulkUpdate(updates.map(u => ({ _id: new mongoose_1.Types.ObjectId(u._id), data: u.data })), new mongoose_1.Types.ObjectId(franchise));
        res.json({
            success: true,
            message: `${result.modifiedCount} products updated successfully`,
            data: {
                modifiedCount: result.modifiedCount,
                matchedCount: result.matchedCount
            }
        });
    }
    catch (error) {
        console.error('Bulk update error:', error);
        res.status(500).json({
            success: false,
            error: 'Bulk update failed',
            details: error.message
        });
    }
});
// Bulk delete products
router.delete('/bulk/delete', [
    auth_js_1.authenticateToken,
    (0, auth_js_1.requirePermission)('franchise_products:delete'),
    (0, express_validator_1.body)('productIds').isArray().withMessage('Product IDs must be an array'),
    (0, express_validator_1.body)('productIds.*').isMongoId().withMessage('Invalid product ID'),
    (0, express_validator_1.body)('franchise').isMongoId().withMessage('Valid franchise ID is required')
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
        const { productIds, franchise } = req.body;
        const result = await FranchiseProduct_js_1.default.deleteMany({
            _id: { $in: productIds },
            franchise: franchise
        });
        res.json({
            success: true,
            message: `${result.deletedCount} products deleted successfully`,
            data: {
                deletedCount: result.deletedCount
            }
        });
    }
    catch (error) {
        console.error('Bulk delete error:', error);
        res.status(500).json({
            success: false,
            error: 'Bulk delete failed',
            details: error.message
        });
    }
});
// Get product statistics
router.get('/stats/overview', [
    auth_js_1.authenticateToken,
    (0, auth_js_1.requirePermission)('franchise_products:read'),
    (0, express_validator_1.query)('franchise').optional().isMongoId().withMessage('Invalid franchise ID')
], async (req, res) => {
    try {
        const { franchise } = req.query;
        const matchStage = franchise ? { franchise } : {};
        const stats = await FranchiseProduct_js_1.default.aggregate([
            { $match: matchStage },
            {
                $group: {
                    _id: null,
                    totalProducts: { $sum: 1 },
                    activeProducts: { $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] } },
                    featuredProducts: { $sum: { $cond: [{ $eq: ['$isFeatured', true] }, 1, 0] } },
                    totalValue: { $sum: { $multiply: ['$stock', '$sellingPrice'] } },
                    avgPrice: { $avg: '$sellingPrice' },
                    lowStockCount: { $sum: { $cond: [{ $lte: ['$stock', '$minStock'] }, 1, 0] } },
                    totalStock: { $sum: '$stock' }
                }
            }
        ]);
        const categoryStats = await FranchiseProduct_js_1.default.aggregate([
            { $match: matchStage },
            {
                $group: {
                    _id: '$category',
                    count: { $sum: 1 },
                    totalValue: { $sum: { $multiply: ['$stock', '$sellingPrice'] } },
                    avgPrice: { $avg: '$sellingPrice' }
                }
            },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);
        res.json({
            success: true,
            data: {
                overview: stats[0] || {
                    totalProducts: 0,
                    activeProducts: 0,
                    featuredProducts: 0,
                    totalValue: 0,
                    avgPrice: 0,
                    lowStockCount: 0,
                    totalStock: 0
                },
                categoryBreakdown: categoryStats
            }
        });
    }
    catch (error) {
        console.error('Get product stats error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
});
exports.default = router;
//# sourceMappingURL=franchiseProducts.js.map