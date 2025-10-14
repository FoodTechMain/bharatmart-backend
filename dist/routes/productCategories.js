"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express = require('express');
const router = express.Router();
const express_validator_1 = require("express-validator");
const ProductCategory_js_1 = __importDefault(require("../models/ProductCategory.js"));
const auth_js_1 = require("../middleware/auth.js");
// GET /product-categories - List all product categories
router.get('/', async (_req, res) => {
    try {
        const categories = await ProductCategory_js_1.default.find().sort({ name: 1 });
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
// Create new product category
router.post('/', [
    auth_js_1.authenticateToken,
    (0, express_validator_1.body)('name').trim().isLength({ min: 2 }).withMessage('Category name must be at least 2 characters')
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
        const category = new ProductCategory_js_1.default({ name: req.body.name });
        await category.save();
        res.status(201).json({
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
exports.default = router;
//# sourceMappingURL=productCategories.js.map