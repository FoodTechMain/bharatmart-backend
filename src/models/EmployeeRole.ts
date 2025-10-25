import mongoose, { Schema, Document } from 'mongoose';
import { BaseDocument } from '../types/common';

export interface IEmployeeRole extends BaseDocument {
  name: string;
  description?: string;
  permissions: string[];
  isActive: boolean;
}

const employeeRoleSchema = new Schema<IEmployeeRole>({
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
  permissions: {
    type: [String],
    default: []
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

const EmployeeRole = mongoose.model<IEmployeeRole>('EmployeeRole', employeeRoleSchema);
export default EmployeeRole;
