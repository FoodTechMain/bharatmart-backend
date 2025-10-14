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
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const userSchema = new mongoose_1.Schema({
    name: {
        type: String,
        trim: true,
        minlength: 2,
        maxlength: 50
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: true,
        select: false
    },
    phone: {
        type: String,
        trim: true,
        sparse: true
    },
    role: {
        type: String,
        enum: ['superadmin', 'admin', 'user', 'staff'],
        default: 'user'
    },
    permissions: {
        type: [String],
        default: []
    },
    isActive: {
        type: Boolean,
        default: true
    },
    isVerified: {
        type: Boolean,
        default: true // Auto-verify for now
    },
    address: {
        street: String,
        city: String,
        state: String,
        zipCode: String,
        country: String
    },
    avatar: String,
    lastLogin: Date,
    loginAttempts: {
        type: Number,
        required: true,
        default: 0
    },
    lockUntil: Date
}, {
    timestamps: true
});
// Indexes
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ phone: 1 }, { sparse: true });
userSchema.index({ role: 1 });
// Pre-save middleware to hash password
userSchema.pre('save', async function (next) {
    try {
        if (!this.isModified('password')) {
            return next();
        }
        const salt = await bcryptjs_1.default.genSalt(10);
        this.password = await bcryptjs_1.default.hash(this.password, salt);
        next();
    }
    catch (error) {
        next(error);
    }
});
// Method to compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
    try {
        return await bcryptjs_1.default.compare(candidatePassword, this.password);
    }
    catch (error) {
        throw new Error('Password comparison failed');
    }
};
// Method to increment login attempts
userSchema.methods.incrementLoginAttempts = async function () {
    await this.updateOne({
        $inc: { loginAttempts: 1 }
    });
};
// Method to reset login attempts
userSchema.methods.resetLoginAttempts = async function () {
    await this.updateOne({
        $set: {
            loginAttempts: 0,
            lockUntil: undefined
        }
    });
};
// Method to lock account
userSchema.methods.lock = async function () {
    await this.updateOne({
        $set: {
            lockUntil: new Date(Date.now() + 3600000) // Lock for 1 hour
        }
    });
};
// Method to unlock account
userSchema.methods.unlock = async function () {
    await this.updateOne({
        $set: {
            lockUntil: undefined,
            loginAttempts: 0
        }
    });
};
// Static method to find by email
userSchema.statics.findByEmail = function (email) {
    return this.findOne({ email });
};
// Static method to find by phone
userSchema.statics.findByPhone = function (phone) {
    return this.findOne({ phone });
};
// Static method to find by role
userSchema.statics.findByRole = function (role) {
    return this.find({ role });
};
// Instance method to convert to JSON
userSchema.methods.toJSON = function () {
    const obj = this.toObject();
    delete obj.password;
    delete obj.verificationToken;
    delete obj.resetPasswordToken;
    delete obj.resetPasswordExpires;
    delete obj.loginAttempts;
    delete obj.lockUntil;
    return obj;
};
exports.default = mongoose_1.default.model('User', userSchema);
//# sourceMappingURL=User.js.map