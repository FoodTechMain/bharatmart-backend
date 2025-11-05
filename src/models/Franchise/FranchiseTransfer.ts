import mongoose, { Document, Model, Schema, Types } from 'mongoose';
import { ITimestamps } from '../../types/common';

export type TransferStatus = 'requested' | 'rejected' | 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';

export interface ITransferItem {
  bharatmartProduct: Types.ObjectId; // Reference to main product
  franchiseProduct: Types.ObjectId;  // Reference to franchise product
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface ITransfer extends ITimestamps {
  transferNumber: string;
  bharatmartManager?: Types.ObjectId;  // Who initiated/approved the transfer
  franchise: Types.ObjectId;          // Target franchise
  items: ITransferItem[];
  status: TransferStatus;
  notes?: string;
  deliveredAt?: Date;
  deliveredBy?: Types.ObjectId;       // Who marked as delivered
  // Request-specific fields
  requestedBy?: Types.ObjectId;       // Franchise user who requested
  requestedAt?: Date;                 // When requested
  approvedBy?: Types.ObjectId;        // Admin who approved
  approvedAt?: Date;                  // When approved
  rejectedBy?: Types.ObjectId;        // Admin who rejected
  rejectedAt?: Date;                  // When rejected
  rejectionReason?: string;           // Why rejected
  statusHistory?: Array<{             // Track all status changes
    status: TransferStatus;
    timestamp: Date;
    notes?: string;
    changedBy?: Types.ObjectId;
  }>;
}

export interface ITransferDocument extends ITransfer, Document {
  _id: Types.ObjectId;
  updateStatus(status: TransferStatus, notes?: string, changedBy?: Types.ObjectId): Promise<void>;
  markAsDelivered(deliveredBy?: Types.ObjectId): Promise<void>;
  addNote(note: string): Promise<void>;
  approve(approvedBy: Types.ObjectId, notes?: string): Promise<void>;
  reject(rejectedBy: Types.ObjectId, reason: string): Promise<void>;
}

interface ITransferModel extends Model<ITransferDocument> {
  generateTransferNumber(): Promise<string>;
  findByFranchise(franchiseId: Types.ObjectId): Promise<ITransferDocument[]>;
  findByStatus(status: TransferStatus): Promise<ITransferDocument[]>;
}

const transferItemSchema = new Schema<ITransferItem>({
  bharatmartProduct: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  franchiseProduct: {
    type: Schema.Types.ObjectId,
    ref: 'FranchiseProduct',
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  unitPrice: {
    type: Number,
    required: true,
    min: 0
  },
  totalPrice: {
    type: Number,
    required: true,
    min: 0
  }
});

const transferSchema = new Schema<ITransferDocument, ITransferModel>({
  transferNumber: {
    type: String,
    required: true,
    unique: true
  },
  bharatmartManager: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  franchise: {
    type: Schema.Types.ObjectId,
    ref: 'Franchise',
    required: true
  },
  items: [transferItemSchema],
  status: {
    type: String,
    required: true,
    enum: ['requested', 'rejected', 'pending', 'processing', 'shipped', 'delivered', 'cancelled'],
    default: 'requested'
  },
  notes: {
    type: String
  },
  deliveredAt: {
    type: Date
  },
  deliveredBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  // Request fields
  requestedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  requestedAt: {
    type: Date
  },
  approvedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: {
    type: Date
  },
  rejectedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  rejectedAt: {
    type: Date
  },
  rejectionReason: {
    type: String
  },
  statusHistory: [{
    status: {
      type: String,
      enum: ['requested', 'rejected', 'pending', 'processing', 'shipped', 'delivered', 'cancelled'],
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    notes: String,
    changedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    }
  }]
}, {
  timestamps: true
});

// Indexes
transferSchema.index({ transferNumber: 1 }, { unique: true });
transferSchema.index({ franchise: 1 });
transferSchema.index({ status: 1 });
transferSchema.index({ bharatmartManager: 1 });
transferSchema.index({ createdAt: -1 });

// Static method to generate transfer number
transferSchema.statics.generateTransferNumber = async function(): Promise<string> {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  
  const lastTransfer = await this.findOne({}, {}, { sort: { transferNumber: -1 } });
  let sequence = 1;
  
  if (lastTransfer) {
    const lastSequence = parseInt(lastTransfer.transferNumber.slice(-4));
    sequence = lastSequence + 1;
  }
  
  return `TRF${year}${month}${day}${sequence.toString().padStart(4, '0')}`;
};

// Method to update status
transferSchema.methods.updateStatus = async function(status: TransferStatus, notes?: string, changedBy?: Types.ObjectId): Promise<void> {
  const oldStatus = this.status;
  this.status = status;
  
  // Add to status history
  if (!this.statusHistory) {
    this.statusHistory = [];
  }
  this.statusHistory.push({
    status,
    timestamp: new Date(),
    notes,
    changedBy
  });
  
  if (notes) {
    if (this.notes) {
      this.notes += `\n${notes}`;
    } else {
      this.notes = notes;
    }
  }
  
  if (status === 'delivered') {
    this.deliveredAt = new Date();
  }
  
  await this.save();
};

// Method to approve transfer request
transferSchema.methods.approve = async function(approvedBy: Types.ObjectId, notes?: string): Promise<void> {
  if (this.status !== 'requested') {
    throw new Error('Only requested transfers can be approved');
  }
  
  this.approvedBy = approvedBy;
  this.approvedAt = new Date();
  this.bharatmartManager = approvedBy; // Set as manager
  
  await this.updateStatus('pending', notes || 'Transfer request approved', approvedBy);
};

// Method to reject transfer request
transferSchema.methods.reject = async function(rejectedBy: Types.ObjectId, reason: string): Promise<void> {
  if (this.status !== 'requested') {
    throw new Error('Only requested transfers can be rejected');
  }
  
  this.rejectedBy = rejectedBy;
  this.rejectedAt = new Date();
  this.rejectionReason = reason;
  
  await this.updateStatus('rejected', `Rejected: ${reason}`, rejectedBy);
};

// Method to mark as delivered
transferSchema.methods.markAsDelivered = async function(deliveredBy?: Types.ObjectId): Promise<void> {
  this.status = 'delivered';
  this.deliveredAt = new Date();
  if (deliveredBy) {
    this.deliveredBy = deliveredBy;
  }
  
  // Add to status history
  if (!this.statusHistory) {
    this.statusHistory = [];
  }
  this.statusHistory.push({
    status: 'delivered',
    timestamp: new Date(),
    notes: 'Transfer received by franchise',
    changedBy: deliveredBy
  });
  
  await this.save();
};

// Method to add a note
transferSchema.methods.addNote = async function(note: string): Promise<void> {
  if (this.notes) {
    this.notes += `\n${note}`;
  } else {
    this.notes = note;
  }
  await this.save();
};

// Static method to find transfers by franchise
transferSchema.statics.findByFranchise = function(franchiseId: Types.ObjectId): Promise<ITransferDocument[]> {
  return this.find({ franchise: franchiseId });
};

// Static method to find transfers by status
transferSchema.statics.findByStatus = function(status: TransferStatus): Promise<ITransferDocument[]> {
  return this.find({ status });
};

export default mongoose.model<ITransferDocument, ITransferModel>('FranchiseTransfer', transferSchema);