import mongoose, { Schema, Document, Types } from 'mongoose';
import bcrypt from 'bcryptjs';
import { BaseDocument } from '../types/common';

export interface IEmployeeDocuments {
  pan?: string; // File path for PAN card
  aadhar?: string; // File path for Aadhar card
  joiningLetter?: string; // File path for joining letter
}

export interface IEmployee {
  // Basic Information
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  dateOfBirth?: Date;
  gender?: 'Male' | 'Female' | 'Other';
  address?: string;
  joinDate?: Date;
  
  // Role and Department
  role: string; // e.g., "Analyst", "Manager", "Developer"
  department?: Types.ObjectId; // Reference to Department model
  
  // Skills and Performance
  skills?: string[]; // Array of skills
  performanceScore?: number;
  
  // Activity and Status
  lastLogin?: Date;
  status: 'Active' | 'On Leave' | 'Resigned' | 'Terminated';
  
  // Documents (stored locally or S3)
  documents: IEmployeeDocuments;
  
  // Authentication
  password?: string;
  
  // User Reference (if employee is also a user in the system)
  userId?: Types.ObjectId;
}

export interface IEmployeeDocument extends Document, IEmployee {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const employeeSchema = new Schema<IEmployeeDocument>({
  // Basic Information
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true,
    minlength: [2, 'First name must be at least 2 characters'],
    maxlength: [50, 'First name cannot exceed 50 characters']
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true,
    minlength: [2, 'Last name must be at least 2 characters'],
    maxlength: [50, 'Last name cannot exceed 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address']
  },
  phoneNumber: {
    type: String,
    trim: true,
    match: [/^[0-9]{10}$/, 'Please provide a valid 10-digit phone number']
  },
  dateOfBirth: {
    type: Date
  },
  gender: {
    type: String,
    enum: ['Male', 'Female', 'Other']
  },
  address: {
    type: String,
    trim: true
  },
  joinDate: {
    type: Date,
    default: Date.now
  },
  
  // Role and Department
  role: {
    type: String,
    required: [true, 'Role is required'],
    trim: true
  },
  department: {
    type: Schema.Types.ObjectId,
    ref: 'Department'
  },
  
  // Skills and Performance
  skills: {
    type: [String],
    default: []
  },
  performanceScore: {
    type: Number,
    min: 0,
    max: 100
  },
  
  // Activity and Status
  lastLogin: {
    type: Date
  },
  status: {
    type: String,
    enum: ['Active', 'On Leave', 'Resigned', 'Terminated'],
    default: 'Active'
  },
  
  // Documents
  documents: {
    pan: {
      type: String
    },
    aadhar: {
      type: String
    },
    joiningLetter: {
      type: String
    }
  },
  
  // Authentication
  password: {
    type: String,
    select: false
  },
  
  // User Reference
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Index for faster queries
employeeSchema.index({ email: 1 });
employeeSchema.index({ department: 1 });
employeeSchema.index({ status: 1 });
employeeSchema.index({ role: 1 });

// Hash password before saving
employeeSchema.pre('save', async function(next) {
  if (!this.isModified('password') || !this.password) {
    return next();
  }
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error: any) {
    next(error);
  }
});

// Method to compare password
employeeSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

const Employee = mongoose.model<IEmployeeDocument>('Employee', employeeSchema);
export default Employee;
