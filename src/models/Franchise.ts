import mongoose, { Schema, Model, Types } from 'mongoose';
import bcrypt from 'bcryptjs';
import { BaseDocument } from '../types/common';

export interface IFranchiseBank {
  name?: string;
  accountNumber?: string;
  holderName?: string;
  ifscCode?: string;
  branch?: string;
  city?: string;
}

export interface IFranchiseInvestment {
  min?: number;
  max?: number;
}

export interface IFranchise extends BaseDocument {
  // Franchise details
  name: string;
  description: string;
  industry: string;
  logo?: string;
  website?: string;

  // Contact details
  contactPerson?: string;
  designation?: string;
  phone?: string;
  email?: string;
  address?: string;

  // Owner reference
  owner?: Types.ObjectId;

  // Legal & banking info
  gst?: string;
  pan?: string;
  bank: IFranchiseBank;

  // Business info
  investmentRange: IFranchiseInvestment;
  roi?: number;
  establishedYear?: number;
  totalUnits?: number;

  // Status
  isActive: boolean;
  isVerified: boolean;
  
  // Authentication
  password?: string;
  mustChangePassword?: boolean;
  // Password reset OTP fields
  resetPasswordOTP?: string;
  resetPasswordExpires?: Date;
}

interface IFranchiseModel extends Model<IFranchise> {
  comparePassword(candidatePassword: string, hashedPassword: string): Promise<boolean>;
}

const franchiseSchema = new Schema<IFranchise>({
  // Franchise details
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  industry: {
    type: String,
    required: true // e.g. "Food", "Retail", "Education"
  },
  logo: String,
  website: String,

  // Contact details
  contactPerson: String,
  designation: String,
  phone: String,
  email: String,
  address: String,

  // Owner reference
  owner: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: false // initially may not be connected to a user
  },

  // Legal & banking info
  gst: String,
  pan: String,
  bank: {
    name: String,
    accountNumber: String,
    holderName: String,
    ifscCode: String,
    branch: String,
    city: String
  },

  // Business info
  investmentRange: {
    min: Number,
    max: Number
  },
  roi: Number,
  establishedYear: Number,
  totalUnits: Number,

  // Status
  isActive: {
    type: Boolean,
    default: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  password: {
    type: String,
    select: false
  },
  mustChangePassword: {
    type: Boolean,
    default: true
  }
  ,
  // Fields for password reset via OTP
  resetPasswordOTP: {
    type: String,
    select: false
  },
  resetPasswordExpires: {
    type: Date
  }
}, {
  timestamps: true // This replaces the manual createdAt and updatedAt fields
});

// Password comparison method
franchiseSchema.statics.comparePassword = async function(candidatePassword: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, hashedPassword);
};

const Franchise = mongoose.model<IFranchise, IFranchiseModel>('Franchise', franchiseSchema);
export default Franchise;
