import mongoose, { Document, Model, Schema, Types } from 'mongoose';
import { ITimestamps, IAddress, ISEO } from '../../types/common';

export interface IShopStaffMember {
  user: Types.ObjectId;
  role: 'manager' | 'staff';
  permissions: string[];
  isActive: boolean;
}

export interface IShopBankDetails {
  accountNumber: string;
  holderName: string;
  ifscCode: string;
  bankName: string;
  branch: string;
  city: string;
}

export interface IShop extends ITimestamps {
  name: string;
  description: string;
  owner: Types.ObjectId;
  staff: IShopStaffMember[];
  address: IAddress;
  contactEmail: string;
  contactPhone: string;
  categories: Types.ObjectId[];
  isActive: boolean;
  isVerified: boolean;
  verificationStatus?: 'pending' | 'approved' | 'rejected';
  verificationNotes?: string;
  rating: number;
  totalRatings: number;
  totalSales: number;
  seo: ISEO;
  gst?: string;
  pan?: string;
  bankDetails?: IShopBankDetails;
}

export interface IShopDocument extends IShop, Document {
  _id: Types.ObjectId;
  addStaffMember(userId: Types.ObjectId, role: string, permissions: string[]): Promise<void>;
  removeStaffMember(userId: Types.ObjectId): Promise<void>;
  updateStats(): Promise<void>;
}

interface IShopModel extends Model<IShopDocument> {
  findByOwner(ownerId: Types.ObjectId): Promise<IShopDocument[]>;
  findByStaffMember(userId: Types.ObjectId): Promise<IShopDocument[]>;
}

const shopStaffSchema = new Schema<IShopStaffMember>({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  role: {
    type: String,
    required: true,
    enum: ['manager', 'staff']
  },
  permissions: [{
    type: String,
    required: true
  }],
  isActive: {
    type: Boolean,
    default: true
  }
});

const shopSchema = new Schema<IShopDocument, IShopModel>({
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
  owner: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  staff: [shopStaffSchema],
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
  contactEmail: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  contactPhone: {
    type: String,
    required: true,
    trim: true
  },
  categories: [{
    type: Schema.Types.ObjectId,
    ref: 'Category'
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  verificationStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  verificationNotes: String,
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  totalRatings: {
    type: Number,
    default: 0
  },
  totalSales: {
    type: Number,
    default: 0
  },
  seo: {
    title: String,
    description: String,
    keywords: [String]
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
  }
}, {
  timestamps: true
});

// Compound index for owner and name
shopSchema.index({ owner: 1, name: 1 }, { unique: true });

// Index for searching by name and city
shopSchema.index({ name: 'text', 'address.city': 'text' });

// Method to add staff member
shopSchema.methods.addStaffMember = async function(
  userId: Types.ObjectId,
  role: string,
  permissions: string[]
): Promise<void> {
  // Check if user is already a staff member
  const existingStaff = this.staff.find((staff: IShopStaffMember) => staff.user.equals(userId));
  if (existingStaff) {
    throw new Error('User is already a staff member');
  }

  // Add new staff member
  this.staff.push({
    user: userId,
    role,
    permissions,
    isActive: true
  });

  await this.save();
};

// Method to remove staff member
shopSchema.methods.removeStaffMember = async function(userId: Types.ObjectId): Promise<void> {
  const staffIndex = this.staff.findIndex((staff: IShopStaffMember) => staff.user.equals(userId));
  if (staffIndex === -1) {
    throw new Error('User is not a staff member');
  }

  this.staff.splice(staffIndex, 1);
  await this.save();
};

// Method to update shop statistics
shopSchema.methods.updateStats = async function(): Promise<void> {
  // This would typically involve aggregating orders, reviews, etc.
  // For now, it's a placeholder
  await this.save();
};

// Static method to find shops by owner
shopSchema.statics.findByOwner = function(ownerId: Types.ObjectId): Promise<IShopDocument[]> {
  return this.find({ owner: ownerId });
};

// Static method to find shops by staff member
shopSchema.statics.findByStaffMember = function(userId: Types.ObjectId): Promise<IShopDocument[]> {
  return this.find({ 'staff.user': userId, 'staff.isActive': true });
};

// Pre-save hook to validate bank details
shopSchema.pre('save', function(next) {
  if (this.isModified('bankDetails')) {
    const bankDetails = this.bankDetails;
    if (bankDetails) {
      // If any bank detail is provided, all fields become required
      const requiredFields = ['accountNumber', 'holderName', 'ifscCode', 'bankName', 'branch', 'city'];
      const missingFields = requiredFields.filter(field => !bankDetails[field as keyof IShopBankDetails]);
      
      if (missingFields.length > 0) {
        next(new Error(`Missing required bank details: ${missingFields.join(', ')}`));
        return;
      }
    }
  }
  next();
});

export default mongoose.model<IShopDocument, IShopModel>('Shop', shopSchema);