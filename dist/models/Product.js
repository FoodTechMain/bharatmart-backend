"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importStar(require("mongoose"));
const productVariantSchema = new mongoose_1.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    sku: {
        type: String,
        required: true,
        trim: true
    },
    price: {
        type: Number,
        required: true,
        min: 0
    },
    stock: {
        type: Number,
        required: true,
        min: 0
    },
    attributes: {
        type: Map,
        of: String
    }
});
const productAttributeSchema = new mongoose_1.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    values: [{
            type: String,
            required: true,
            trim: true
        }]
});
const productSchema = new mongoose_1.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        minlength: 2,
        maxlength: 200
    },
    description: {
        type: String,
        required: true,
        trim: true,
        minlength: 10,
        maxlength: 2000
    },
    shop: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Shop',
        required: true
    },
    category: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Category',
        required: true
    },
    brand: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Brand'
    },
    sku: {
        type: String,
        required: true,
        trim: true,
        unique: true
    },
    barcode: {
        type: String,
        trim: true,
        sparse: true
    },
    price: {
        type: Number,
        required: true,
        min: 0
    },
    salePrice: {
        type: Number,
        min: 0
    },
    costPrice: {
        type: Number,
        min: 0
    },
    stock: {
        type: Number,
        required: true,
        min: 0,
        default: 0
    },
    minStock: {
        type: Number,
        required: true,
        min: 0,
        default: 5
    },
    weight: {
        value: {
            type: Number,
            min: 0
        },
        unit: {
            type: String,
            enum: ['g', 'kg', 'lb', 'oz']
        }
    },
    dimensions: {
        length: {
            type: Number,
            min: 0
        },
        width: {
            type: Number,
            min: 0
        },
        height: {
            type: Number,
            min: 0
        },
        unit: {
            type: String,
            enum: ['cm', 'in', 'm', 'ft']
        }
    },
    images: [{
            url: {
                type: String,
                required: true
            },
            alt: String,
            isPrimary: {
                type: Boolean,
                default: false
            }
        }],
    attributes: [productAttributeSchema],
    variants: [productVariantSchema],
    isActive: {
        type: Boolean,
        default: true
    },
    isFeatured: {
        type: Boolean,
        default: false
    },
    tags: [{
            type: String,
            trim: true
        }],
    metaTitle: {
        type: String,
        trim: true,
        maxlength: 100
    },
    metaDescription: {
        type: String,
        trim: true,
        maxlength: 200
    },
    metaKeywords: [{
            type: String,
            trim: true
        }],
    rating: {
        type: Number,
        default: 0,
        min: 0,
        max: 5
    },
    totalRatings: {
        type: Number,
        default: 0,
        min: 0
    },
    totalSales: {
        type: Number,
        default: 0,
        min: 0
    },
    taxRate: {
        type: Number,
        min: 0,
        max: 100
    },
    shippingClass: {
        type: String,
        trim: true
    }
}, {
    timestamps: true
});
// Indexes
productSchema.index({ shop: 1, sku: 1 }, { unique: true });
productSchema.index({ name: 'text', description: 'text', tags: 'text' });
productSchema.index({ category: 1 });
productSchema.index({ brand: 1 });
productSchema.index({ isActive: 1 });
productSchema.index({ isFeatured: 1 });
// Method to update stock
productSchema.methods.updateStock = async function (quantity) {
    this.stock += quantity;
    if (this.stock < 0) {
        this.stock = 0;
    }
    await this.save();
};
// Method to update rating
productSchema.methods.updateRating = async function (rating) {
    this.totalRatings += 1;
    this.rating = ((this.rating * (this.totalRatings - 1)) + rating) / this.totalRatings;
    await this.save();
};
// Method to update sales
productSchema.methods.updateSales = async function (quantity) {
    this.totalSales += quantity;
    await this.save();
};
// Static method to find products by shop
productSchema.statics.findByShop = function (shopId) {
    return this.find({ shop: shopId });
};
// Static method to find products by category
productSchema.statics.findByCategory = function (categoryId) {
    return this.find({ category: categoryId });
};
// Static method to find products by brand
productSchema.statics.findByBrand = function (brandId) {
    return this.find({ brand: brandId });
};
// Static method to find low stock products
productSchema.statics.findLowStock = function () {
    return this.find({
        $expr: { $lte: ['$stock', '$minStock'] }
    });
};
// Static method to find featured products
productSchema.statics.findFeatured = function () {
    return this.find({ isFeatured: true });
};
exports.default = mongoose_1.default.model('Product', productSchema);
//# sourceMappingURL=Product.js.map