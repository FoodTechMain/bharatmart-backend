import mongoose, { Schema, Model } from 'mongoose';
import { BaseDocument } from '../types/common';

export interface IProductCategory extends BaseDocument {
  name: string;
}

interface IProductCategoryModel extends Model<IProductCategory> {}

const productCategorySchema = new Schema<IProductCategory>({
  name: {
    type: String,
    required: [true, 'Product category name is required'],
    trim: true,
    maxlength: [100, 'Category name cannot exceed 100 characters']
  }
}, {
  timestamps: true
});

const ProductCategory = mongoose.model<IProductCategory, IProductCategoryModel>('ProductCategory', productCategorySchema);
export default ProductCategory;
