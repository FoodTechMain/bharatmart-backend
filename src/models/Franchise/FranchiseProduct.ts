import mongoose, { Document, Model, Schema, Types } from 'mongoose';
import { ITimestamps, IImage, IWeight, IDimensions } from '../../types/common';

export interface IFranchiseProduct extends ITimestamps {
  name: string;
  description: string;
  franchise: Types.ObjectId;
  category: string;
  brand?: string;
  sku: string;
  barcode?: string;
  price: number;
  salePrice?: number;
  costPrice?: number;
  stock: number;
  minStock: number;
  weight?: IWeight;
  dimensions?: IDimensions;
  images: IImage[];
  isActive: boolean;
  isFeatured: boolean;
  tags: string[];
  metaTitle?: string;
  metaDescription?: string;
  metaKeywords?: string[];
  importBatch?: string;
  bharatmartProductId?: Types.ObjectId; // Reference to the main Bharatmart product
}

export interface IFranchiseProductDocument extends IFranchiseProduct, Document {
  _id: Types.ObjectId;
  updateStock(quantity: number): Promise<void>;
  updatePrice(price: number): Promise<void>;
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
    type: Schema.Types.ObjectId,
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
  },
  bharatmartProductId: {
    type: Schema.Types.ObjectId,
    ref: 'Product', // Reference to the main Product model
    index: true
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
franchiseProductSchema.index({ bharatmartProductId: 1 });

// Method to update stock
franchiseProductSchema.methods.updateStock = async function(quantity: number): Promise<void> {
  this.stock += quantity;
  if (this.stock < 0) {
    this.stock = 0;
  }
  await this.save();
};

// Method to update price
franchiseProductSchema.methods.updatePrice = async function(price: number): Promise<void> {
  this.price = price;
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