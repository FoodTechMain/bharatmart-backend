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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importStar(require("mongoose"));
const slugify_1 = __importDefault(require("slugify"));
const manufacturerCategorySchema = new mongoose_1.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        minlength: 2,
        maxlength: 100
    },
    description: {
        type: String,
        trim: true,
        maxlength: 500
    },
    parent: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'ManufacturerCategory',
        default: null
    },
    children: [{
            type: mongoose_1.Schema.Types.ObjectId,
            ref: 'ManufacturerCategory'
        }],
    level: {
        type: Number,
        required: true,
        default: 0,
        min: 0
    },
    path: [{
            type: mongoose_1.Schema.Types.ObjectId,
            ref: 'ManufacturerCategory'
        }],
    isActive: {
        type: Boolean,
        default: true
    },
    isLeaf: {
        type: Boolean,
        default: true
    },
    canBeParent: {
        type: Boolean,
        default: true
    },
    slug: {
        type: String,
        required: true,
        unique: true
    }
}, {
    timestamps: true
});
// Indexes
manufacturerCategorySchema.index({ parent: 1 });
manufacturerCategorySchema.index({ path: 1 });
manufacturerCategorySchema.index({ slug: 1 }, { unique: true });
manufacturerCategorySchema.index({ name: 'text', description: 'text' });
// Pre-save middleware
manufacturerCategorySchema.pre('save', async function (next) {
    if (this.isModified('name')) {
        this.slug = (0, slugify_1.default)(this.name, { lower: true, strict: true });
        // Check for duplicate slug
        const duplicate = await this.model('ManufacturerCategory').findOne({
            slug: this.slug,
            _id: { $ne: this._id }
        });
        if (duplicate) {
            this.slug = `${this.slug}-${this._id}`;
        }
    }
    next();
});
// Method to update category path
manufacturerCategorySchema.methods.updatePath = async function () {
    if (!this.parent) {
        this.path = [this._id];
        return;
    }
    const parent = await this.model('ManufacturerCategory').findById(this.parent);
    if (!parent) {
        throw new Error('Parent category not found');
    }
    this.path = [...parent.path, this._id];
};
// Method to update category level
manufacturerCategorySchema.methods.updateLevel = async function () {
    if (!this.parent) {
        this.level = 0;
        return;
    }
    const parent = await this.model('ManufacturerCategory').findById(this.parent);
    if (!parent) {
        throw new Error('Parent category not found');
    }
    this.level = parent.level + 1;
};
// Method to update children array
manufacturerCategorySchema.methods.updateChildren = async function () {
    const children = await this.model('ManufacturerCategory').find({ parent: this._id });
    this.children = children.map((child) => child._id);
    this.isLeaf = children.length === 0;
    await this.save();
};
// Method to update parent
manufacturerCategorySchema.methods.updateParent = async function (newParentId) {
    // Remove from old parent's children array
    if (this.parent) {
        const oldParent = await this.model('ManufacturerCategory').findById(this.parent);
        if (oldParent) {
            oldParent.children = oldParent.children?.filter((childId) => !childId.equals(this._id));
            oldParent.isLeaf = oldParent.children?.length === 0;
            await oldParent.save();
        }
    }
    // Add to new parent's children array
    if (newParentId) {
        const newParent = await this.model('ManufacturerCategory').findById(newParentId);
        if (!newParent) {
            throw new Error('New parent category not found');
        }
        if (!newParent.canBeParent) {
            throw new Error('Selected category cannot be a parent');
        }
        newParent.children = [...(newParent.children || []), this._id];
        newParent.isLeaf = false;
        await newParent.save();
    }
    // Update this category
    this.parent = newParentId;
    await this.updatePath();
    await this.updateLevel();
    await this.save();
};
// Static method to get category tree
manufacturerCategorySchema.statics.getCategoryTree = async function () {
    const categories = await this.find()
        .sort({ path: 1, name: 1 })
        .lean();
    return categories;
};
// Static method to get category breadcrumbs
manufacturerCategorySchema.statics.getBreadcrumbs = async function (categoryId) {
    const category = await this.findById(categoryId);
    if (!category) {
        throw new Error('Category not found');
    }
    const breadcrumbs = await this.find({
        _id: { $in: category.path }
    })
        .sort({ level: 1 })
        .lean();
    return breadcrumbs;
};
exports.default = mongoose_1.default.model('ManufacturerCategory', manufacturerCategorySchema);
//# sourceMappingURL=ManufacturerCategory.js.map