import mongoose, { Document, Model, Schema, Types } from 'mongoose';
import { IImage } from '../types/common';

export interface IProduct {
  name: string;
  description: string;
  category: Types.ObjectId;
  brand?: Types.ObjectId;
  sku: string;
  salePrice?: number;
  costPrice?: number;
  sellingPrice?: number;
  stock: number;
  minStock: number;
  images: IImage[];
  isActive: boolean;
}

export interface IProductDocument extends IProduct, Document {
  _id: Types.ObjectId;
}

interface IProductModel extends Model<IProductDocument> {}

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
  category: {
    type: Schema.Types.ObjectId,
    ref: 'ProductCategory',
    required: true
  },
  brand: {
    type: Schema.Types.ObjectId,
    ref: 'Vendor',
    default: null
  },
  
  sku: {
    type: String,
    trim: true,
    unique: true,
    default: () => 'SKU-' + Math.random().toString(36).substr(2, 9).toUpperCase()
  },
  salePrice: {
    type: Number,
    min: 0
  },
  costPrice: {
    type: Number,
    min: 0
  },
  sellingPrice: {
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
  }
});

export default mongoose.model<IProductDocument, IProductModel>('Product', productSchema);