import mongoose, { Document, Model, Schema, Types, CallbackError } from 'mongoose';
import bcrypt from 'bcryptjs';
import { ITimestamps, IAddress } from '../types/common';

export interface IUser extends ITimestamps {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone?: string;
  role: 'superadmin' | 'admin' | 'user' | 'staff' | 'shop_owner' | 'customer';
  permissions: string[];
  isActive: boolean;
  isVerified: boolean;
  address?: IAddress;
  avatar?: string;
  lastLogin?: Date;
  loginAttempts: number;
  lockUntil?: Date;
}

export interface IUserDocument extends IUser, Document {
  _id: Types.ObjectId;
  comparePassword(candidatePassword: string): Promise<boolean>;
  incrementLoginAttempts(): Promise<void>;
  resetLoginAttempts(): Promise<void>;
  lock(): Promise<void>;
  unlock(): Promise<void>;
}

export interface IUserModel extends Model<IUserDocument> {
  findByEmail(email: string): Promise<IUserDocument | null>;
  findByPhone(phone: string): Promise<IUserDocument | null>;
  findByRole(role: string): Promise<IUserDocument[]>;
}

const userSchema = new Schema<IUserDocument, IUserModel>({
  firstName: {
    type: String,
    trim: true,
    minlength: 2,
    maxlength: 50
  },
  lastName: {
    type: String,
    trim: true,
    minlength: 2,
    maxlength: 50
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    select: false
  },
  phone: {
    type: String,
    trim: true,
    sparse: true
  },
  role: {
    type: String,
    enum: ['superadmin', 'admin', 'user', 'staff', 'shop_owner', 'customer'],
    default: 'customer'
  },
  permissions: {
    type: [String],
    default: []
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isVerified: {
    type: Boolean,
    default: true // Auto-verify for now
  },
  address: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: String
  },
  avatar: String,
  lastLogin: Date,
  loginAttempts: {
    type: Number,
    required: true,
    default: 0
  },
  lockUntil: Date
}, {
  timestamps: true
});

// Indexes
// userSchema.index({ email: 1 }, { unique: true }); // Duplicate, unique: true already creates index
// userSchema.index({ phone: 1 }, { sparse: true }); // Duplicate, sparse: true already creates index
userSchema.index({ role: 1 });

// Pre-save middleware to hash password
userSchema.pre('save', async function(next) {
  try {
    if (!this.isModified('password')) {
      return next();
    }

    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error: any) {
    next(error as CallbackError);
  }
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error('Password comparison failed');
  }
};

// Method to increment login attempts
userSchema.methods.incrementLoginAttempts = async function(): Promise<void> {
  await this.updateOne({
    $inc: { loginAttempts: 1 }
  });
};

// Method to reset login attempts
userSchema.methods.resetLoginAttempts = async function(): Promise<void> {
  await this.updateOne({
    $set: {
      loginAttempts: 0,
      lockUntil: undefined
    }
  });
};

// Method to lock account
userSchema.methods.lock = async function(): Promise<void> {
  await this.updateOne({
    $set: {
      lockUntil: new Date(Date.now() + 3600000) // Lock for 1 hour
    }
  });
};

// Method to unlock account
userSchema.methods.unlock = async function(): Promise<void> {
  await this.updateOne({
    $set: {
      lockUntil: undefined,
      loginAttempts: 0
    }
  });
};

// Static method to find by email
userSchema.statics.findByEmail = function(email: string): Promise<IUserDocument | null> {
  return this.findOne({ email });
};

// Static method to find by phone
userSchema.statics.findByPhone = function(phone: string): Promise<IUserDocument | null> {
  return this.findOne({ phone });
};

// Static method to find by role
userSchema.statics.findByRole = function(role: string): Promise<IUserDocument[]> {
  return this.find({ role });
};

// Instance method to convert to JSON
userSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.password;
  delete obj.verificationToken;
  delete obj.resetPasswordToken;
  delete obj.resetPasswordExpires;
  delete obj.loginAttempts;
  delete obj.lockUntil;
  return obj;
};

export default mongoose.model<IUserDocument, IUserModel>('User', userSchema);