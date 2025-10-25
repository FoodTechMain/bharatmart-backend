import mongoose, { Schema, Document, Types } from 'mongoose';
import { BaseDocument } from '../types/common';

export interface IDepartment extends BaseDocument {
  name: string;
  description?: string;
  code: string; // Unique department code
  headOfDepartment?: Types.ObjectId; // Reference to Employee
  isActive: boolean;
}

const departmentSchema = new Schema<IDepartment>({
  name: {
    type: String,
    required: true,
    trim: true,
    unique: true
  },
  description: {
    type: String,
    trim: true
  },
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true
  },
  headOfDepartment: {
    type: Schema.Types.ObjectId,
    ref: 'Employee'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

const Department = mongoose.model<IDepartment>('Department', departmentSchema);
export default Department;
