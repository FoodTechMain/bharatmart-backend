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
const orderItemSchema = new mongoose_1.Schema({
    product: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    variant: String,
    quantity: {
        type: Number,
        required: true,
        min: 1
    },
    price: {
        type: Number,
        required: true,
        min: 0
    },
    total: {
        type: Number,
        required: true,
        min: 0
    },
    shop: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Shop',
        required: true
    }
});
const orderPaymentSchema = new mongoose_1.Schema({
    method: {
        type: String,
        required: true,
        enum: ['card', 'upi', 'netbanking', 'cod']
    },
    transactionId: String,
    status: {
        type: String,
        required: true,
        enum: ['pending', 'completed', 'failed', 'refunded'],
        default: 'pending'
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    currency: {
        type: String,
        required: true,
        default: 'INR'
    },
    refundId: String,
    refundAmount: {
        type: Number,
        min: 0
    },
    refundReason: String
});
const orderTimelineSchema = new mongoose_1.Schema({
    timestamp: {
        type: Date,
        required: true,
        default: Date.now
    },
    status: {
        type: String,
        required: true,
        enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded', 'confirmed']
    },
    note: {
        type: String,
        required: true
    },
    updatedBy: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User'
    }
});
const orderShippingSchema = new mongoose_1.Schema({
    method: {
        type: String,
        required: true,
        enum: ['standard', 'express', 'same_day']
    },
    carrier: String,
    trackingNumber: String,
    estimatedDelivery: Date,
    cost: {
        type: Number,
        required: true,
        min: 0
    },
    address: {
        street: {
            type: String,
            required: true
        },
        city: {
            type: String,
            required: true
        },
        state: {
            type: String,
            required: true
        },
        zipCode: {
            type: String,
            required: true
        },
        country: {
            type: String,
            required: true,
            default: 'India'
        }
    }
});
const orderSchema = new mongoose_1.Schema({
    orderNumber: {
        type: String,
        required: true,
        unique: true
    },
    user: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    customer: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User'
    },
    shop: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Shop'
    },
    items: [orderItemSchema],
    status: {
        type: String,
        required: true,
        enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded', 'confirmed'],
        default: 'pending'
    },
    subTotal: {
        type: Number,
        required: true,
        min: 0
    },
    tax: {
        type: Number,
        required: true,
        min: 0
    },
    shipping: orderShippingSchema,
    total: {
        type: Number,
        required: true,
        min: 0
    },
    payment: orderPaymentSchema,
    timeline: [orderTimelineSchema],
    notes: String,
    isGift: {
        type: Boolean,
        default: false
    },
    giftMessage: String
}, {
    timestamps: true
});
// Indexes
orderSchema.index({ orderNumber: 1 }, { unique: true });
orderSchema.index({ user: 1 });
orderSchema.index({ 'items.shop': 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ createdAt: -1 });
// Static method to generate order number
orderSchema.statics.generateOrderNumber = async function () {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const lastOrder = await this.findOne({}, {}, { sort: { orderNumber: -1 } });
    let sequence = 1;
    if (lastOrder) {
        const lastSequence = parseInt(lastOrder.orderNumber.slice(-4));
        sequence = lastSequence + 1;
    }
    return `ORD${year}${month}${day}${sequence.toString().padStart(4, '0')}`;
};
// Method to add timeline entry
orderSchema.methods.addTimelineEntry = async function (entry) {
    this.timeline.push({
        ...entry,
        timestamp: new Date()
    });
    await this.save();
};
// Method to update status
orderSchema.methods.updateStatus = async function (status, note, updatedBy) {
    this.status = status;
    this.timeline.push({
        timestamp: new Date(),
        status,
        note,
        updatedBy
    });
    await this.save();
};
// Method to process refund
orderSchema.methods.processRefund = async function (amount, reason) {
    if (amount > this.total) {
        throw new Error('Refund amount cannot be greater than order total');
    }
    this.payment.status = 'refunded';
    this.payment.refundAmount = amount;
    this.payment.refundReason = reason;
    this.status = 'refunded';
    this.timeline.push({
        timestamp: new Date(),
        status: 'refunded',
        note: `Refunded ${amount} - ${reason}`
    });
    await this.save();
};
// Static method to find orders by user
orderSchema.statics.findByUser = function (userId) {
    return this.find({ user: userId });
};
// Static method to find orders by shop
orderSchema.statics.findByShop = function (shopId) {
    return this.find({ 'items.shop': shopId });
};
// Static method to find orders by status
orderSchema.statics.findByStatus = function (status) {
    return this.find({ status });
};
// Pre-save hook to calculate totals
orderSchema.pre('save', function (next) {
    if (this.isNew || this.isModified('items') || this.isModified('shipping') || this.isModified('tax')) {
        // Calculate subtotal
        this.subTotal = this.items.reduce((total, item) => total + item.total, 0);
        // Calculate total
        this.total = this.subTotal + this.tax + this.shipping.cost;
    }
    next();
});
exports.default = mongoose_1.default.model('Order', orderSchema);
//# sourceMappingURL=Order.js.map