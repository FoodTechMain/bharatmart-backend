import mongoose, { Document, Model, Schema, Types } from 'mongoose';
import { ITimestamps } from '../types/common.js';
import { Sluggable, Addressable } from '../types/mongoose.js';
import slugify from 'slugify';

export interface IManufacturer extends ITimestamps, Sluggable, Addressable {
  name: string;
  description: string;
  email: string;
  phone: string;
  website?: string;
  logo?: string;
  gst?: string;
  pan?: string;
  bankDetails?: {
    accountNumber: string;
    holderName: string;
    ifscCode: string;
    bankName: string;
    branch: string;
    city: string;
  };
  isActive: boolean;
  isVerified: boolean;
  totalProducts: number;
  totalRevenue: number;
}

export interface IManufacturerDocument extends IManufacturer, Document {
  _id: Types.ObjectId;
  updateStats(): Promise<void>;
}

interface IManufacturerModel extends Model<IManufacturerDocument> {
  findByEmail(email: string): Promise<IManufacturerDocument | null>;
  findByPhone(phone: string): Promise<IManufacturerDocument | null>;
  findActive(): Promise<IManufacturerDocument[]>;
  findVerified(): Promise<IManufacturerDocument[]>;
}

const manufacturerSchema = new Schema<IManufacturerDocument, IManufacturerModel>({
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 100
  },
  description: {
    type: String,
    required: true,
    trim: true,
    minlength: 10,
    maxlength: 1000
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    required: true,
    trim: true
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
  bankDetails: {
    accountNumber: {
      type: String,
      trim: true
    },
    holderName: {
      type: String,
      trim: true
    },
    ifscCode: {
      type: String,
      trim: true,
      uppercase: true,
      match: /^[A-Z]{4}0[A-Z0-9]{6}$/
    },
    bankName: {
      type: String,
      trim: true
    },
    branch: {
      type: String,
      trim: true
    },
    city: {
      type: String,
      trim: true
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  totalProducts: {
    type: Number,
    default: 0
  },
  totalRevenue: {
    type: Number,
    default: 0
  },
  slug: {
    type: String,
    required: true,
    unique: true
  }
}, {
  timestamps: true
});

// Indexes
manufacturerSchema.index({ name: 'text', description: 'text' });
manufacturerSchema.index({ email: 1 }, { unique: true });
manufacturerSchema.index({ phone: 1 });
manufacturerSchema.index({ slug: 1 }, { unique: true });

// Pre-save middleware
manufacturerSchema.pre('save', async function(next) {
  if (this.isModified('name')) {
    this.slug = slugify(this.name, { lower: true, strict: true });

    // Check for duplicate slug
    const duplicate = await this.model('Manufacturer').findOne({
      slug: this.slug,
      _id: { $ne: this._id }
    });

    if (duplicate) {
      this.slug = `${this.slug}-${this._id}`;
    }
  }

  next();
});

// Method to update manufacturer statistics
manufacturerSchema.methods.updateStats = async function(): Promise<void> {
  // This would typically involve aggregating products, orders, etc.
  // For now, it's a placeholder
  await this.save();
};

// Static method to find by email
manufacturerSchema.statics.findByEmail = function(email: string): Promise<IManufacturerDocument | null> {
  return this.findOne({ email });
};

// Static method to find by phone
manufacturerSchema.statics.findByPhone = function(phone: string): Promise<IManufacturerDocument | null> {
  return this.findOne({ phone });
};

// Static method to find active manufacturers
manufacturerSchema.statics.findActive = function(): Promise<IManufacturerDocument[]> {
  return this.find({ isActive: true });
};

// Static method to find verified manufacturers
manufacturerSchema.statics.findVerified = function(): Promise<IManufacturerDocument[]> {
  return this.find({ isVerified: true });
};

export default mongoose.model<IManufacturerDocument, IManufacturerModel>('Manufacturer', manufacturerSchema);