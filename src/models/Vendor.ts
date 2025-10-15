import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export interface IVendor {
  // Business entity details
  name: string;
  description?: string;
  website?: string;
  logo?: string;
  address?: {
    street?: string;
    city: string;
    state: string;
    zipCode?: string;
    country: string;
  };
  
  // Point of contact details
  contactPerson: {
    name: string;
    designation?: string;
    email: string;
    phone: string;
    alternatePhone?: string;
  };
  
  // Business identifiers
  gst?: string;
  pan?: string;
  
  // Category reference
  category?: Types.ObjectId | string;
  
  // Status
  isActive: boolean;
  isVerified: boolean;
}

export interface IVendorDocument extends IVendor, Document {
  _id: Types.ObjectId;
}

interface IVendorModel extends Model<IVendorDocument> {}

const vendorSchema = new Schema<IVendorDocument, IVendorModel>({
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
    maxlength: 1000
  },
  website: {
    type: String,
    trim: true
  },
  logo: String,
  address: {
    street: String,
    city: {
      type: String,
      required: true
    },
    state: {
      type: String,
      required: true
    },
    zipCode: String,
    country: {
      type: String,
      default: 'India'
    }
  },
  contactPerson: {
    name: {
      type: String,
      required: true,
      trim: true
    },
    designation: {
      type: String,
      trim: true
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true
    },
    phone: {
      type: String,
      required: true,
      trim: true
    },
    alternatePhone: {
      type: String,
      trim: true
    }
  },
  gst: {
    type: String,
    trim: true,
    uppercase: true,
    sparse: true,
    match: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/
  },
  pan: {
    type: String,
    trim: true,
    uppercase: true,
    sparse: true,
    match: /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/
  },
  category: {
    type: Schema.Types.ObjectId,
    ref: 'VendorCategory'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isVerified: {
    type: Boolean,
    default: false
  }
});

// Indexes
vendorSchema.index({ name: 'text', description: 'text' });
vendorSchema.index({ 'contactPerson.email': 1 });
vendorSchema.index({ 'contactPerson.phone': 1 });

console.log('[Vendor] Model initialized');
export default mongoose.model<IVendorDocument, IVendorModel>('Vendor', vendorSchema);