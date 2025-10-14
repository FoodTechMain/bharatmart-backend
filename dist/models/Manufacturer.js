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
const manufacturerSchema = new mongoose_1.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        minlength: 2,
        maxlength: 100
    },
    description: {
        type: String,
        required: true,
        trim: true,
        minlength: 10,
        maxlength: 1000
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    phone: {
        type: String,
        required: true,
        trim: true
    },
    website: {
        type: String,
        trim: true
    },
    logo: String,
    address: {
        street: String,
        city: {
            type: String,
            required: true
        },
        state: {
            type: String,
            required: true
        },
        zipCode: String,
        country: {
            type: String,
            default: 'India'
        }
    },
    gst: {
        type: String,
        trim: true,
        uppercase: true,
        sparse: true,
        match: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/
    },
    pan: {
        type: String,
        trim: true,
        uppercase: true,
        sparse: true,
        match: /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/
    },
    bankDetails: {
        accountNumber: {
            type: String,
            trim: true
        },
        holderName: {
            type: String,
            trim: true
        },
        ifscCode: {
            type: String,
            trim: true,
            uppercase: true,
            match: /^[A-Z]{4}0[A-Z0-9]{6}$/
        },
        bankName: {
            type: String,
            trim: true
        },
        branch: {
            type: String,
            trim: true
        },
        city: {
            type: String,
            trim: true
        }
    },
    isActive: {
        type: Boolean,
        default: true
    },
    isVerified: {
        type: Boolean,
        default: false
    },
    totalProducts: {
        type: Number,
        default: 0
    },
    totalRevenue: {
        type: Number,
        default: 0
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
manufacturerSchema.index({ name: 'text', description: 'text' });
manufacturerSchema.index({ email: 1 }, { unique: true });
manufacturerSchema.index({ phone: 1 });
manufacturerSchema.index({ slug: 1 }, { unique: true });
// Pre-save middleware
manufacturerSchema.pre('save', async function (next) {
    if (this.isModified('name')) {
        this.slug = (0, slugify_1.default)(this.name, { lower: true, strict: true });
        // Check for duplicate slug
        const duplicate = await this.model('Manufacturer').findOne({
            slug: this.slug,
            _id: { $ne: this._id }
        });
        if (duplicate) {
            this.slug = `${this.slug}-${this._id}`;
        }
    }
    next();
});
// Method to update manufacturer statistics
manufacturerSchema.methods.updateStats = async function () {
    // This would typically involve aggregating products, orders, etc.
    // For now, it's a placeholder
    await this.save();
};
// Static method to find by email
manufacturerSchema.statics.findByEmail = function (email) {
    return this.findOne({ email });
};
// Static method to find by phone
manufacturerSchema.statics.findByPhone = function (phone) {
    return this.findOne({ phone });
};
// Static method to find active manufacturers
manufacturerSchema.statics.findActive = function () {
    return this.find({ isActive: true });
};
// Static method to find verified manufacturers
manufacturerSchema.statics.findVerified = function () {
    return this.find({ isVerified: true });
};
exports.default = mongoose_1.default.model('Manufacturer', manufacturerSchema);
//# sourceMappingURL=Manufacturer.js.map