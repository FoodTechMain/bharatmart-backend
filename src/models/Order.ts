import mongoose, { Document, Model, Schema, Types } from 'mongoose';
import { ITimestamps } from '../types/common';

export type OrderStatus = 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded' | 'confirmed';

export interface IOrderItem {
  product: Types.ObjectId;
  variant?: string;
  quantity: number;
  price: number;
  total: number;
  shop: Types.ObjectId;
}

export interface IOrderPayment {
  method: string;
  transactionId?: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  amount: number;
  currency: string;
  refundId?: string;
  refundAmount?: number;
  refundReason?: string;
}

export interface IOrderTimelineEntry {
  timestamp: Date;
  status: OrderStatus;
  note: string;
  updatedBy?: Types.ObjectId;
}

export interface IOrderShipping {
  method: string;
  carrier?: string;
  trackingNumber?: string;
  estimatedDelivery?: Date;
  cost: number;
  address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
}

export interface IOrder extends ITimestamps {
  orderNumber: string;
  user: Types.ObjectId;
  customer?: Types.ObjectId;
  shop?: Types.ObjectId;
  items: IOrderItem[];
  status: OrderStatus;
  subTotal: number;
  tax: number;
  shipping: IOrderShipping;
  total: number;
  payment: IOrderPayment;
  timeline: IOrderTimelineEntry[];
  notes?: string;
  isGift?: boolean;
  giftMessage?: string;
}

export interface IOrderDocument extends IOrder, Document {
  _id: Types.ObjectId;
  addTimelineEntry(entry: IOrderTimelineEntry): Promise<void>;
  updateStatus(status: OrderStatus, note: string, updatedBy?: Types.ObjectId): Promise<void>;
  processRefund(amount: number, reason: string): Promise<void>;
}

interface IOrderModel extends Model<IOrderDocument> {
  generateOrderNumber(): Promise<string>;
  findByUser(userId: Types.ObjectId): Promise<IOrderDocument[]>;
  findByShop(shopId: Types.ObjectId): Promise<IOrderDocument[]>;
  findByStatus(status: OrderStatus): Promise<IOrderDocument[]>;
}

const orderItemSchema = new Schema<IOrderItem>({
  product: {
    type: Schema.Types.ObjectId,
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
    type: Schema.Types.ObjectId,
    ref: 'Shop',
    required: true
  }
});

const orderPaymentSchema = new Schema<IOrderPayment>({
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

const orderTimelineSchema = new Schema<IOrderTimelineEntry>({
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
    type: Schema.Types.ObjectId,
    ref: 'User'
  }
});

const orderShippingSchema = new Schema<IOrderShipping>({
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

const orderSchema = new Schema<IOrderDocument, IOrderModel>({
  orderNumber: {
    type: String,
    required: true,
    unique: true
  },
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  customer: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  shop: {
    type: Schema.Types.ObjectId,
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
// orderSchema.index({ orderNumber: 1 }, { unique: true }); // Duplicate, unique: true already creates index
orderSchema.index({ user: 1 });
orderSchema.index({ 'items.shop': 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ createdAt: -1 });

// Static method to generate order number
orderSchema.statics.generateOrderNumber = async function(): Promise<string> {
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
orderSchema.methods.addTimelineEntry = async function(entry: IOrderTimelineEntry): Promise<void> {
  this.timeline.push({
    ...entry,
    timestamp: new Date()
  });
  await this.save();
};

// Method to update status
orderSchema.methods.updateStatus = async function(
  status: OrderStatus,
  note: string,
  updatedBy?: Types.ObjectId
): Promise<void> {
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
orderSchema.methods.processRefund = async function(amount: number, reason: string): Promise<void> {
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
orderSchema.statics.findByUser = function(userId: Types.ObjectId): Promise<IOrderDocument[]> {
  return this.find({ user: userId });
};

// Static method to find orders by shop
orderSchema.statics.findByShop = function(shopId: Types.ObjectId): Promise<IOrderDocument[]> {
  return this.find({ 'items.shop': shopId });
};

// Static method to find orders by status
orderSchema.statics.findByStatus = function(status: OrderStatus): Promise<IOrderDocument[]> {
  return this.find({ status });
};

// Pre-save hook to calculate totals
orderSchema.pre('save', function(next) {
  if (this.isNew || this.isModified('items') || this.isModified('shipping') || this.isModified('tax')) {
    // Calculate subtotal
    this.subTotal = this.items.reduce((total, item) => total + item.total, 0);
    
    // Calculate total
    this.total = this.subTotal + this.tax + this.shipping.cost;
  }
  next();
});

export default mongoose.model<IOrderDocument, IOrderModel>('Order', orderSchema);