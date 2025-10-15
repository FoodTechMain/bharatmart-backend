import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export interface IVendorCategory {
  name: string;
  description?: string;
}

export interface IVendorCategoryDocument extends IVendorCategory, Document {
  _id: Types.ObjectId;
}

interface IVendorCategoryModel extends Model<IVendorCategoryDocument> {
  findByName(name: string): Promise<IVendorCategoryDocument | null>;
}

const vendorCategorySchema = new Schema<IVendorCategoryDocument, IVendorCategoryModel>({
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 100
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500
  }
});

// Indexes
vendorCategorySchema.index({ name: 'text', description: 'text' });
vendorCategorySchema.index({ name: 1 }, { unique: true });

// Static method to find by name
vendorCategorySchema.statics.findByName = async function(name: string): Promise<IVendorCategoryDocument | null> {
  console.log(`[VendorCategory] Searching for category with name: ${name}`);
  return this.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
};

export default mongoose.model<IVendorCategoryDocument, IVendorCategoryModel>('VendorCategory', vendorCategorySchema);