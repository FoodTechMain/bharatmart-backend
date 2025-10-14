"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express = require('express');
const router = express.Router();
const express_validator_1 = require("express-validator");
const Category_js_1 = __importDefault(require("../models/Category.js"));
const Product_js_1 = __importDefault(require("../models/Product.js"));
const auth_js_1 = require("../middleware/auth.js");
// Get all categories
router.get('/', async (req, res) => {
    try {
        const { page = '1', limit = '50', parent, level, isActive, sortBy = 'sortOrder', sortOrder = 'asc' } = req.query;
        const query = {};
        if (parent !== undefined) {
            if (parent === 'null' || parent === '') {
                query.parent = null;
            }
            else {
                query.parent = parent;
            }
        }
        if (level !== undefined)
            query.level = parseInt(level);
        if (isActive !== undefined)
            query.isActive = isActive === 'true';
        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const categories = await Category_js_1.default.find(query)
            .populate('parent', 'name slug')
            .sort(sortOptions)
            .limit(limitNum)
            .skip((pageNum - 1) * limitNum)
            .exec();
        const total = await Category_js_1.default.countDocuments(query);
        const response = {
            success: true,
            data: categories,
            pagination: {
                total,
                currentPage: pageNum,
                totalPages: Math.ceil(total / limitNum),
                limit: limitNum,
                hasNext: pageNum * limitNum < total,
                hasPrev: pageNum > 1
            }
        };
        res.json(response);
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
});
// Get category by ID
router.get('/:id', async (req, res) => {
    try {
        const category = await Category_js_1.default.findById(req.params.id)
            .populate('parent', 'name slug')
            .populate('children', 'name slug isActive');
        if (!category) {
            return res.status(404).json({
                success: false,
                error: 'Category not found'
            });
        }
        res.json({
            success: true,
            data: category
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
});
// Create new category (Superadmin only)
router.post('/', [
    auth_js_1.authenticateToken,
    auth_js_1.requireSuperAdmin,
    (0, express_validator_1.body)('name').trim().isLength({ min: 2 }).withMessage('Category name must be at least 2 characters'),
    (0, express_validator_1.body)('description').optional().trim().isLength({ max: 500 }).withMessage('Description must be less than 500 characters'),
    (0, express_validator_1.body)('parent').optional().isMongoId().withMessage('Valid parent category ID is required'),
    (0, express_validator_1.body)('sortOrder').optional().isInt({ min: 0 }).withMessage('Sort order must be a non-negative integer'),
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
        const { parent, ...categoryData } = req.body;
        // Check if parent category exists
        if (parent) {
            const parentCategory = await Category_js_1.default.findById(parent);
            if (!parentCategory) {
                return res.status(404).json({
                    success: false,
                    error: 'Parent category not found'
                });
            }
        }
        const category = new Category_js_1.default({
            ...categoryData,
            parent: parent || null
        });
        await category.save();
        const populatedCategory = await Category_js_1.default.findById(category._id)
            .populate('parent', 'name slug');
        res.status(201).json({
            success: true,
            data: populatedCategory
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
});
// Update category (Superadmin only)
router.put('/:id', [
    auth_js_1.authenticateToken,
    auth_js_1.requireSuperAdmin,
    (0, express_validator_1.body)('name').optional().trim().isLength({ min: 2 }).withMessage('Category name must be at least 2 characters'),
    (0, express_validator_1.body)('description').optional().trim().isLength({ max: 500 }).withMessage('Description must be less than 500 characters'),
    (0, express_validator_1.body)('parent').optional().isMongoId().withMessage('Valid parent category ID is required'),
    (0, express_validator_1.body)('sortOrder').optional().isInt({ min: 0 }).withMessage('Sort order must be a non-negative integer'),
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
        const category = await Category_js_1.default.findById(req.params.id);
        if (!category) {
            return res.status(404).json({
                success: false,
                error: 'Category not found'
            });
        }
        const { parent, ...updateData } = req.body;
        // Check if parent category exists and prevent circular reference
        if (parent) {
            if (parent === req.params.id) {
                return res.status(400).json({
                    success: false,
                    error: 'Category cannot be its own parent'
                });
            }
            const parentCategory = await Category_js_1.default.findById(parent);
            if (!parentCategory) {
                return res.status(404).json({
                    success: false,
                    error: 'Parent category not found'
                });
            }
            // Check if the new parent is not a descendant of this category
            const descendants = await category.getDescendants();
            const descendantIds = descendants.map(d => d._id.toString());
            if (descendantIds.includes(parent)) {
                return res.status(400).json({
                    success: false,
                    error: 'Cannot set a descendant as parent'
                });
            }
        }
        Object.assign(category, updateData);
        if (parent !== undefined) {
            category.parent = parent || null;
        }
        await category.save();
        const updatedCategory = await Category_js_1.default.findById(category._id)
            .populate('parent', 'name slug');
        res.json({
            success: true,
            data: updatedCategory
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
});
// Delete category (Superadmin only)
router.delete('/:id', auth_js_1.authenticateToken, auth_js_1.requireSuperAdmin, async (req, res) => {
    try {
        const category = await Category_js_1.default.findById(req.params.id);
        if (!category) {
            return res.status(404).json({
                success: false,
                error: 'Category not found'
            });
        }
        // Check if category has children
        const children = await Category_js_1.default.find({ parent: req.params.id });
        if (children.length > 0) {
            return res.status(400).json({
                success: false,
                error: `Cannot delete category with ${children.length} subcategories. Please delete subcategories first.`
            });
        }
        // Check if category has products
        const productsCount = await Product_js_1.default.countDocuments({ category: req.params.id });
        if (productsCount > 0) {
            return res.status(400).json({
                success: false,
                error: `Cannot delete category with ${productsCount} products. Please move or delete products first.`
            });
        }
        await Category_js_1.default.findByIdAndDelete(req.params.id);
        // Update parent's subcategory count if exists
        if (category.parent) {
            const parent = await Category_js_1.default.findById(category.parent);
            if (parent) {
                await parent.updateSubcategoryCount();
            }
        }
        res.json({
            success: true,
            message: 'Category deleted successfully'
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
});
// Toggle category active status (Superadmin only)
router.patch('/:id/toggle-status', auth_js_1.authenticateToken, auth_js_1.requireSuperAdmin, async (req, res) => {
    try {
        const category = await Category_js_1.default.findById(req.params.id);
        if (!category) {
            return res.status(404).json({
                success: false,
                error: 'Category not found'
            });
        }
        const newStatus = !category.isActive;
        category.isActive = newStatus;
        await category.save();
        // If deactivating, also deactivate all children
        if (!newStatus) {
            const descendants = await category.getDescendants();
            if (descendants.length > 0) {
                await Category_js_1.default.updateMany({ _id: { $in: descendants } }, { isActive: false });
            }
        }
        res.json({
            success: true,
            message: `Category ${category.isActive ? 'activated' : 'deactivated'} successfully`,
            data: { isActive: category.isActive }
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
});
// Toggle category featured status (Superadmin only)
router.patch('/:id/toggle-featured', auth_js_1.authenticateToken, auth_js_1.requireSuperAdmin, async (req, res) => {
    try {
        const category = await Category_js_1.default.findById(req.params.id);
        if (!category) {
            return res.status(404).json({
                success: false,
                error: 'Category not found'
            });
        }
        category.isFeatured = !category.isFeatured;
        await category.save();
        res.json({
            success: true,
            message: `Category ${category.isFeatured ? 'featured' : 'unfeatured'} successfully`,
            data: { isFeatured: category.isFeatured }
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
});
// Get category tree
router.get('/tree/structure', async (_req, res) => {
    try {
        const tree = await Category_js_1.default.getCategoryTree();
        res.json({
            success: true,
            data: tree
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
});
// Get category breadcrumbs
router.get('/:id/breadcrumbs', async (req, res) => {
    try {
        const category = await Category_js_1.default.findById(req.params.id);
        if (!category) {
            return res.status(404).json({
                success: false,
                error: 'Category not found'
            });
        }
        const breadcrumbs = await category.getBreadcrumbs();
        res.json({
            success: true,
            data: breadcrumbs
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
});
// Get category descendants
router.get('/:id/descendants', async (req, res) => {
    try {
        const category = await Category_js_1.default.findById(req.params.id);
        if (!category) {
            return res.status(404).json({
                success: false,
                error: 'Category not found'
            });
        }
        const descendants = await category.getDescendants();
        res.json({
            success: true,
            data: descendants
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
});
// Get category ancestors
router.get('/:id/ancestors', async (req, res) => {
    try {
        const category = await Category_js_1.default.findById(req.params.id);
        if (!category) {
            return res.status(404).json({
                success: false,
                error: 'Category not found'
            });
        }
        const ancestors = await category.getAncestors();
        res.json({
            success: true,
            data: ancestors
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
});
// Get parent categories (for dropdown selection)
router.get('/parents/list', async (req, res) => {
    try {
        const { excludeId, level = '0' } = req.query;
        const query = {
            isActive: true,
            level: parseInt(level)
        };
        // Exclude current category if editing
        if (excludeId) {
            query._id = { $ne: excludeId };
        }
        const categories = await Category_js_1.default.find(query)
            .select('name slug level parent')
            .populate('parent', 'name slug')
            .sort({ sortOrder: 1, name: 1 })
            .exec();
        res.json({
            success: true,
            data: categories,
            total: categories.length
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
});
// Get featured categories
router.get('/featured/list', async (_req, res) => {
    try {
        const categories = await Category_js_1.default.find({
            isActive: true,
            isFeatured: true
        })
            .populate('parent', 'name slug')
            .sort({ sortOrder: 1, name: 1 })
            .limit(10);
        res.json({
            success: true,
            data: categories
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
});
exports.default = router;
//# sourceMappingURL=categories.js.map