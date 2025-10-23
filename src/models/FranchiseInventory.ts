import mongoose, { Document, Model, Schema, Types } from 'mongoose';
import { ITimestamps } from '../types/common';

export type InventoryTransactionType = 
  | 'purchase' 
  | 'sale' 
  | 'adjustment' 
  | 'return' 
  | 'damage' 
  | 'expired' 
  | 'transfer_in' 
  | 'transfer_out'
  | 'initial_stock';

export interface IFranchiseInventory extends ITimestamps {
  franchise: Types.ObjectId;
  product: Types.ObjectId;
  transactionType: InventoryTransactionType;
  quantity: number; // positive for additions, negative for reductions
  previousStock: number;
  newStock: number;
  referenceNumber?: string; // Order ID, Purchase Order, etc.
  notes?: string;
  performedBy?: Types.ObjectId; // User who performed the transaction
  costPerUnit?: number;
  totalCost?: number;
  supplier?: string;
  expiryDate?: Date;
  batchNumber?: string;
}

export interface IFranchiseInventoryDocument extends IFranchiseInventory, Document {
  _id: Types.ObjectId;
}

interface IFranchiseInventoryModel extends Model<IFranchiseInventoryDocument> {
  recordTransaction(
    franchiseId: Types.ObjectId,
    productId: Types.ObjectId,
    type: InventoryTransactionType,
    quantity: number,
    options?: {
      referenceNumber?: string;
      notes?: string;
      performedBy?: Types.ObjectId;
      costPerUnit?: number;
      supplier?: string;
      expiryDate?: Date;
      batchNumber?: string;
    }
  ): Promise<IFranchiseInventoryDocument>;
  
  getInventoryHistory(
    franchiseId: Types.ObjectId,
    productId?: Types.ObjectId,
    startDate?: Date,
    endDate?: Date
  ): Promise<IFranchiseInventoryDocument[]>;
}

const franchiseInventorySchema = new Schema<IFranchiseInventoryDocument, IFranchiseInventoryModel>({
  franchise: {
    type: Schema.Types.ObjectId,
    ref: 'Franchise',
    required: true,
    index: true
  },
  product: {
    type: Schema.Types.ObjectId,
    ref: 'FranchiseProduct',
    required: true,
    index: true
  },
  transactionType: {
    type: String,
    enum: [
      'purchase',
      'sale',
      'adjustment',
      'return',
      'damage',
      'expired',
      'transfer_in',
      'transfer_out',
      'initial_stock'
    ],
    required: true,
    index: true
  },
  quantity: {
    type: Number,
    required: true
  },
  previousStock: {
    type: Number,
    required: true,
    min: 0
  },
  newStock: {
    type: Number,
    required: true,
    min: 0
  },
  referenceNumber: {
    type: String,
    trim: true,
    index: true
  },
  notes: {
    type: String,
    trim: true,
    maxlength: 500
  },
  performedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  costPerUnit: {
    type: Number,
    min: 0
  },
  totalCost: {
    type: Number,
    min: 0
  },
  supplier: {
    type: String,
    trim: true
  },
  expiryDate: {
    type: Date
  },
  batchNumber: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Indexes
franchiseInventorySchema.index({ franchise: 1, product: 1, createdAt: -1 });
franchiseInventorySchema.index({ transactionType: 1, createdAt: -1 });
franchiseInventorySchema.index({ referenceNumber: 1 });

// Static method to record a transaction
franchiseInventorySchema.statics.recordTransaction = async function(
  franchiseId: Types.ObjectId,
  productId: Types.ObjectId,
  type: InventoryTransactionType,
  quantity: number,
  options = {}
): Promise<IFranchiseInventoryDocument> {
  const FranchiseProduct = mongoose.model('FranchiseProduct');
  
  // Get current product stock
  const product = await FranchiseProduct.findOne({ 
    _id: productId, 
    franchise: franchiseId 
  });
  
  if (!product) {
    throw new Error('Product not found');
  }
  
  const previousStock = product.stock;
  const newStock = previousStock + quantity;
  
  if (newStock < 0) {
    throw new Error('Insufficient stock for this transaction');
  }
  
  // Calculate total cost if costPerUnit is provided
  const totalCost = options.costPerUnit ? Math.abs(quantity) * options.costPerUnit : undefined;
  
  // Create inventory transaction
  const transaction = await this.create({
    franchise: franchiseId,
    product: productId,
    transactionType: type,
    quantity,
    previousStock,
    newStock,
    totalCost,
    ...options
  });
  
  // Update product stock
  product.stock = newStock;
  await product.save();
  
  return transaction;
};

// Static method to get inventory history
franchiseInventorySchema.statics.getInventoryHistory = async function(
  franchiseId: Types.ObjectId,
  productId?: Types.ObjectId,
  startDate?: Date,
  endDate?: Date
): Promise<IFranchiseInventoryDocument[]> {
  const query: any = { franchise: franchiseId };
  
  if (productId) {
    query.product = productId;
  }
  
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = startDate;
    if (endDate) query.createdAt.$lte = endDate;
  }
  
  return this.find(query)
    .populate('product', 'name sku')
    .populate('performedBy', 'name email')
    .sort({ createdAt: -1 })
    .lean()
    .exec();
};

export default mongoose.model<IFranchiseInventoryDocument, IFranchiseInventoryModel>('FranchiseInventory', franchiseInventorySchema);
