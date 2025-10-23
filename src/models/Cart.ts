import mongoose, { Document, Model, Schema, Types } from 'mongoose';
import { ITimestamps } from '../types/common';

export interface ICartItem {
  product: Types.ObjectId;
  franchiseProduct?: Types.ObjectId;
  quantity: number;
  price: number;
  total: number;
}

export interface ICart extends ITimestamps {
  user: Types.ObjectId;
  items: ICartItem[];
  totalItems: number;
  totalQuantity: number;
  totalAmount: number;
}

export interface ICartDocument extends ICart, Document {
  _id: Types.ObjectId;
  addItem(item: ICartItem): Promise<void>;
  removeItem(productId: Types.ObjectId): Promise<void>;
  updateItemQuantity(productId: Types.ObjectId, quantity: number): Promise<void>;
  clearCart(): Promise<void>;
  calculateTotals(): void;
}

interface ICartModel extends Model<ICartDocument> {
  findByUser(userId: Types.ObjectId): Promise<ICartDocument | null>;
  createOrUpdateForUser(userId: Types.ObjectId): Promise<ICartDocument>;
}

const cartItemSchema = new Schema<ICartItem>({
  product: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  franchiseProduct: {
    type: Schema.Types.ObjectId,
    ref: 'FranchiseProduct'
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
    default: 1
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
  }
});

const cartSchema = new Schema<ICartDocument, ICartModel>({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  items: [cartItemSchema],
  totalItems: {
    type: Number,
    default: 0
  },
  totalQuantity: {
    type: Number,
    default: 0
  },
  totalAmount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Indexes
cartSchema.index({ user: 1 });

// Method to add item to cart
cartSchema.methods.addItem = async function(item: ICartItem): Promise<void> {
  const existingItemIndex = this.items.findIndex(
    (cartItem: ICartItem) => cartItem.product.toString() === item.product.toString()
  );

  if (existingItemIndex > -1) {
    // Update existing item
    this.items[existingItemIndex].quantity += item.quantity;
    this.items[existingItemIndex].total = this.items[existingItemIndex].quantity * this.items[existingItemIndex].price;
  } else {
    // Add new item
    this.items.push(item);
  }

  this.calculateTotals();
  await this.save();
};

// Method to remove item from cart
cartSchema.methods.removeItem = async function(productId: Types.ObjectId): Promise<void> {
  this.items = this.items.filter((item: ICartItem) => item.product.toString() !== productId.toString());
  this.calculateTotals();
  await this.save();
};

// Method to update item quantity
cartSchema.methods.updateItemQuantity = async function(productId: Types.ObjectId, quantity: number): Promise<void> {
  const existingItemIndex = this.items.findIndex(
    (cartItem: ICartItem) => cartItem.product.toString() === productId.toString()
  );

  if (existingItemIndex > -1) {
    if (quantity <= 0) {
      // Remove item if quantity is 0 or less
      this.items.splice(existingItemIndex, 1);
    } else {
      // Update quantity
      this.items[existingItemIndex].quantity = quantity;
      this.items[existingItemIndex].total = this.items[existingItemIndex].quantity * this.items[existingItemIndex].price;
    }
    this.calculateTotals();
    await this.save();
  }
};

// Method to clear cart
cartSchema.methods.clearCart = async function(): Promise<void> {
  this.items = [];
  this.calculateTotals();
  await this.save();
};

// Method to calculate totals
cartSchema.methods.calculateTotals = function(): void {
  this.totalItems = this.items.length;
  this.totalQuantity = this.items.reduce((sum: number, item: ICartItem) => sum + item.quantity, 0);
  this.totalAmount = this.items.reduce((sum: number, item: ICartItem) => sum + item.total, 0);
};

// Static method to find cart by user
cartSchema.statics.findByUser = function(userId: Types.ObjectId): Promise<ICartDocument | null> {
  return this.findOne({ user: userId }).exec();
};

// Static method to create or update cart for user
cartSchema.statics.createOrUpdateForUser = async function(userId: Types.ObjectId): Promise<ICartDocument> {
  let cart = await this.findOne({ user: userId });
  
  if (cart) {
    return cart;
  }
  
  cart = new this({
    user: userId,
    items: [],
    totalItems: 0,
    totalQuantity: 0,
    totalAmount: 0
  });
  
  return cart.save();
};

export default mongoose.model<ICartDocument, ICartModel>('Cart', cartSchema);