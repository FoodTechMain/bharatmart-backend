import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export interface IBrand {
  name: string;
  description?: string;
  logo?: string;
  vendor: Types.ObjectId;
  isActive: boolean;
}

export interface IBrandDocument extends IBrand, Document {
  _id: Types.ObjectId;
}

interface IBrandModel extends Model<IBrandDocument> {
  findByVendor(vendorId: string): Promise<IBrandDocument[]>;
}

const brandSchema = new Schema<IBrandDocument, IBrandModel>({
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 100
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500
  },
  logo: String,
  vendor: {
    type: Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
});

// Indexes
brandSchema.index({ name: 'text', description: 'text' });
brandSchema.index({ vendor: 1 });
brandSchema.index({ name: 1, vendor: 1 }, { unique: true }); // Prevent duplicate brand names for same vendor

// Static method to find brands by vendor
brandSchema.statics.findByVendor = function(vendorId: string): Promise<IBrandDocument[]> {
  console.log(`[Brand] Finding brands for vendor: ${vendorId}`);
  return this.find({ vendor: vendorId, isActive: true }).sort({ name: 1 });
};

console.log('[Brand] Model initialized');
export default mongoose.model<IBrandDocument, IBrandModel>('Brand', brandSchema);