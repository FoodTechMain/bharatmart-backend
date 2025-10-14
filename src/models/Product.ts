import mongoose, { Document, Model, Schema, Types } from 'mongoose';
import { ITimestamps, IImage, IWeight, IDimensions } from '../types/common.js';

export interface IProductVariant {
  name: string;
  sku: string;
  price: number;
  stock: number;
  attributes: Record<string, string>;
}

export interface IProductAttribute {
  name: string;
  values: string[];
}

export interface IProduct extends ITimestamps {
  name: string;
  description: string;
  shop: Types.ObjectId;
  category: Types.ObjectId;
  brand?: Types.ObjectId;
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
  attributes: IProductAttribute[];
  variants: IProductVariant[];
  isActive: boolean;
  isFeatured: boolean;
  tags: string[];
  metaTitle?: string;
  metaDescription?: string;
  metaKeywords?: string[];
  rating: number;
  totalRatings: number;
  totalSales: number;
  taxRate?: number;
  shippingClass?: string;
}

export interface IProductDocument extends IProduct, Document {
  _id: Types.ObjectId;
  updateStock(quantity: number): Promise<void>;
  updateRating(rating: number): Promise<void>;
  updateSales(quantity: number): Promise<void>;
}

interface IProductModel extends Model<IProductDocument> {
  findByShop(shopId: Types.ObjectId): Promise<IProductDocument[]>;
  findByCategory(categoryId: Types.ObjectId): Promise<IProductDocument[]>;
  findByBrand(brandId: Types.ObjectId): Promise<IProductDocument[]>;
  findLowStock(): Promise<IProductDocument[]>;
  findFeatured(): Promise<IProductDocument[]>;
}

const productVariantSchema = new Schema<IProductVariant>({
  name: {
    type: String,
    required: true,
    trim: true
  },
  sku: {
    type: String,
    required: true,
    trim: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  stock: {
    type: Number,
    required: true,
    min: 0
  },
  attributes: {
    type: Map,
    of: String
  }
});

const productAttributeSchema = new Schema<IProductAttribute>({
  name: {
    type: String,
    required: true,
    trim: true
  },
  values: [{
    type: String,
    required: true,
    trim: true
  }]
});

const productSchema = new Schema<IProductDocument, IProductModel>({
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
  shop: {
    type: Schema.Types.ObjectId,
    ref: 'Shop',
    required: true
  },
  category: {
    type: Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  },
  brand: {
    type: Schema.Types.ObjectId,
    ref: 'Brand'
  },
  sku: {
    type: String,
    required: true,
    trim: true,
    unique: true
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
  attributes: [productAttributeSchema],
  variants: [productVariantSchema],
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
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  totalRatings: {
    type: Number,
    default: 0,
    min: 0
  },
  totalSales: {
    type: Number,
    default: 0,
    min: 0
  },
  taxRate: {
    type: Number,
    min: 0,
    max: 100
  },
  shippingClass: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Indexes
productSchema.index({ shop: 1, sku: 1 }, { unique: true });
productSchema.index({ name: 'text', description: 'text', tags: 'text' });
productSchema.index({ category: 1 });
productSchema.index({ brand: 1 });
productSchema.index({ isActive: 1 });
productSchema.index({ isFeatured: 1 });

// Method to update stock
productSchema.methods.updateStock = async function(quantity: number): Promise<void> {
  this.stock += quantity;
  if (this.stock < 0) {
    this.stock = 0;
  }
  await this.save();
};

// Method to update rating
productSchema.methods.updateRating = async function(rating: number): Promise<void> {
  this.totalRatings += 1;
  this.rating = ((this.rating * (this.totalRatings - 1)) + rating) / this.totalRatings;
  await this.save();
};

// Method to update sales
productSchema.methods.updateSales = async function(quantity: number): Promise<void> {
  this.totalSales += quantity;
  await this.save();
};

// Static method to find products by shop
productSchema.statics.findByShop = function(shopId: Types.ObjectId): Promise<IProductDocument[]> {
  return this.find({ shop: shopId });
};

// Static method to find products by category
productSchema.statics.findByCategory = function(categoryId: Types.ObjectId): Promise<IProductDocument[]> {
  return this.find({ category: categoryId });
};

// Static method to find products by brand
productSchema.statics.findByBrand = function(brandId: Types.ObjectId): Promise<IProductDocument[]> {
  return this.find({ brand: brandId });
};

// Static method to find low stock products
productSchema.statics.findLowStock = function(): Promise<IProductDocument[]> {
  return this.find({
    $expr: { $lte: ['$stock', '$minStock'] }
  });
};

// Static method to find featured products
productSchema.statics.findFeatured = function(): Promise<IProductDocument[]> {
  return this.find({ isFeatured: true });
};

export default mongoose.model<IProductDocument, IProductModel>('Product', productSchema);