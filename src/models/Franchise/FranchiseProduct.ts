import mongoose, { Document, Model, Schema, Types } from 'mongoose';
import { ITimestamps, IImage, IWeight, IDimensions } from '../../types/common';

export interface IFranchiseProduct extends ITimestamps {
  bharatmartProduct: Types.ObjectId; // Required reference to main Bharatmart product
  franchise: Types.ObjectId;
  stock: number;
  minStock: number;
  sellingPrice: number; // Franchise-specific selling price
  isActive: boolean;
}

export interface IFranchiseProductDocument extends IFranchiseProduct, Document {
  _id: Types.ObjectId;
  updateStock(quantity: number): Promise<void>;
}

export interface IBulkUpdateOperation {
  _id: Types.ObjectId;
  data: Partial<IFranchiseProduct>;
}

interface IFranchiseProductModel extends Model<IFranchiseProductDocument> {
  bulkCreate(products: Partial<IFranchiseProduct>[], franchiseId: Types.ObjectId, importBatch: string): Promise<IFranchiseProductDocument[]>;
  bulkUpdate(updates: IBulkUpdateOperation[], franchiseId: Types.ObjectId): Promise<mongoose.mongo.BulkWriteResult>;
}

const franchiseProductSchema = new Schema<IFranchiseProductDocument, IFranchiseProductModel>({
  bharatmartProduct: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
    index: true
  },
  franchise: {
    type: Schema.Types.ObjectId,
    ref: 'Franchise',
    required: true
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
  sellingPrice: {
    type: Number,
    required: true,
    min: 0
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes
franchiseProductSchema.index({ franchise: 1, bharatmartProduct: 1 }, { unique: true }); // One franchise can only have one entry per product
franchiseProductSchema.index({ bharatmartProduct: 1 });
franchiseProductSchema.index({ franchise: 1 });
franchiseProductSchema.index({ isActive: 1 });

// Method to update stock
franchiseProductSchema.methods.updateStock = async function(quantity: number): Promise<void> {
  this.stock += quantity;
  if (this.stock < 0) {
    this.stock = 0;
  }
  await this.save();
};

// Static method to bulk create products
franchiseProductSchema.statics.bulkCreate = async function(
  products: Partial<IFranchiseProduct>[],
  franchiseId: Types.ObjectId,
  importBatch: string
): Promise<IFranchiseProductDocument[]> {
  const productsToInsert = products.map(product => ({
    ...product,
    franchise: franchiseId,
    importBatch
  }));

  return this.create(productsToInsert);
};

// Static method to bulk update products
franchiseProductSchema.statics.bulkUpdate = async function(
  updates: IBulkUpdateOperation[],
  franchiseId: Types.ObjectId
): Promise<mongoose.mongo.BulkWriteResult> {
  const operations = updates.map(update => ({
    updateOne: {
      filter: { _id: update._id, franchise: franchiseId },
      update: { $set: update.data }
    }
  }));

  return this.bulkWrite(operations);
};

export default mongoose.model<IFranchiseProductDocument, IFranchiseProductModel>('FranchiseProduct', franchiseProductSchema);