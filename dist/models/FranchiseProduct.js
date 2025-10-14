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
const franchiseProductSchema = new mongoose_1.Schema({
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
    franchise: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Franchise',
        required: true
    },
    category: {
        type: String,
        required: true,
        trim: true
    },
    brand: {
        type: String,
        trim: true
    },
    sku: {
        type: String,
        required: true,
        trim: true
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
    importBatch: {
        type: String,
        trim: true
    }
}, {
    timestamps: true
});
// Indexes
franchiseProductSchema.index({ franchise: 1, sku: 1 }, { unique: true });
franchiseProductSchema.index({ name: 'text', description: 'text', tags: 'text' });
franchiseProductSchema.index({ category: 1 });
franchiseProductSchema.index({ brand: 1 });
franchiseProductSchema.index({ isActive: 1 });
franchiseProductSchema.index({ isFeatured: 1 });
franchiseProductSchema.index({ importBatch: 1 });
// Method to update stock
franchiseProductSchema.methods.updateStock = async function (quantity) {
    this.stock += quantity;
    if (this.stock < 0) {
        this.stock = 0;
    }
    await this.save();
};
// Method to update price
franchiseProductSchema.methods.updatePrice = async function (price) {
    this.price = price;
    await this.save();
};
// Static method to bulk create products
franchiseProductSchema.statics.bulkCreate = async function (products, franchiseId, importBatch) {
    const productsToInsert = products.map(product => ({
        ...product,
        franchise: franchiseId,
        importBatch
    }));
    return this.create(productsToInsert);
};
// Static method to bulk update products
franchiseProductSchema.statics.bulkUpdate = async function (updates, franchiseId) {
    const operations = updates.map(update => ({
        updateOne: {
            filter: { _id: update._id, franchise: franchiseId },
            update: { $set: update.data }
        }
    }));
    return this.bulkWrite(operations);
};
exports.default = mongoose_1.default.model('FranchiseProduct', franchiseProductSchema);
//# sourceMappingURL=FranchiseProduct.js.map