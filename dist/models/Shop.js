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
const shopStaffSchema = new mongoose_1.Schema({
    user: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    role: {
        type: String,
        required: true,
        enum: ['manager', 'staff']
    },
    permissions: [{
            type: String,
            required: true
        }],
    isActive: {
        type: Boolean,
        default: true
    }
});
const shopSchema = new mongoose_1.Schema({
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
    owner: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    staff: [shopStaffSchema],
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
    contactEmail: {
        type: String,
        required: true,
        lowercase: true,
        trim: true
    },
    contactPhone: {
        type: String,
        required: true,
        trim: true
    },
    categories: [{
            type: mongoose_1.Schema.Types.ObjectId,
            ref: 'Category'
        }],
    isActive: {
        type: Boolean,
        default: true
    },
    isVerified: {
        type: Boolean,
        default: false
    },
    verificationStatus: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    verificationNotes: String,
    rating: {
        type: Number,
        default: 0,
        min: 0,
        max: 5
    },
    totalRatings: {
        type: Number,
        default: 0
    },
    totalSales: {
        type: Number,
        default: 0
    },
    seo: {
        title: String,
        description: String,
        keywords: [String]
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
    }
}, {
    timestamps: true
});
// Compound index for owner and name
shopSchema.index({ owner: 1, name: 1 }, { unique: true });
// Index for searching by name and city
shopSchema.index({ name: 'text', 'address.city': 'text' });
// Method to add staff member
shopSchema.methods.addStaffMember = async function (userId, role, permissions) {
    // Check if user is already a staff member
    const existingStaff = this.staff.find((staff) => staff.user.equals(userId));
    if (existingStaff) {
        throw new Error('User is already a staff member');
    }
    // Add new staff member
    this.staff.push({
        user: userId,
        role,
        permissions,
        isActive: true
    });
    await this.save();
};
// Method to remove staff member
shopSchema.methods.removeStaffMember = async function (userId) {
    const staffIndex = this.staff.findIndex((staff) => staff.user.equals(userId));
    if (staffIndex === -1) {
        throw new Error('User is not a staff member');
    }
    this.staff.splice(staffIndex, 1);
    await this.save();
};
// Method to update shop statistics
shopSchema.methods.updateStats = async function () {
    // This would typically involve aggregating orders, reviews, etc.
    // For now, it's a placeholder
    await this.save();
};
// Static method to find shops by owner
shopSchema.statics.findByOwner = function (ownerId) {
    return this.find({ owner: ownerId });
};
// Static method to find shops by staff member
shopSchema.statics.findByStaffMember = function (userId) {
    return this.find({ 'staff.user': userId, 'staff.isActive': true });
};
// Pre-save hook to validate bank details
shopSchema.pre('save', function (next) {
    if (this.isModified('bankDetails')) {
        const bankDetails = this.bankDetails;
        if (bankDetails) {
            // If any bank detail is provided, all fields become required
            const requiredFields = ['accountNumber', 'holderName', 'ifscCode', 'bankName', 'branch', 'city'];
            const missingFields = requiredFields.filter(field => !bankDetails[field]);
            if (missingFields.length > 0) {
                next(new Error(`Missing required bank details: ${missingFields.join(', ')}`));
                return;
            }
        }
    }
    next();
});
exports.default = mongoose_1.default.model('Shop', shopSchema);
//# sourceMappingURL=Shop.js.map