import mongoose from 'mongoose';

// Add new interface for admin management data
interface AdminManagement {
  cityManager?: string;
  storeInspector?: string;
  franchiseModel?: 'FOCO' | 'FOFO' | 'undecided';
  loanRequired?: boolean;
  numberOfFranchises?: number;
  currentStatus?: string;
  lastUpdatedBy?: string;
  lastUpdatedAt?: Date;
}

const franchiseApplicationSchema = new mongoose.Schema({
  // Personal Information
  fullName: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    // Not required as per frontend form
  },
  phone: {
    type: String,
    required: true,
    trim: true,
    validate: {
      validator: function(v: string) {
        return /^\d{10}$/.test(v);
      },
      message: 'Phone number must be exactly 10 digits'
    }
  },
  city: {
    type: String,
    required: true,
    trim: true
  },
  state: {
    type: String,
    required: true,
    trim: true
  },
  pincode: {
    type: String,
    required: true,
    trim: true,
    validate: {
      validator: function(v: string) {
        return /^\d{6}$/.test(v);
      },
      message: 'Pincode must be exactly 6 digits'
    }
  },

  // Business Information
  currentBusinessType: {
    type: String,
    required: true,
    enum: ['kirana', 'supermarket', 'wholesale', 'manufacturing', 'services', 'ecommerce', 'franchise', 'other', 'none']
  },
  yearsOfExperience: {
    type: String,
    required: true,
    enum: ['no-experience', '1-3-years', '3-5-years', '5-10-years', '10-plus-years']
  },
  investmentCapacity: {
    type: String,
    required: true,
    enum: ['1-2-lakhs', '2-5-lakhs', '5-10-lakhs', '10-25-lakhs', '25-50-lakhs']
  },
  preferredStartTime: {
    type: String,
    required: true,
    enum: ['immediately', '3-6-months', '6-12-months', '1-2-years', 'flexible']
  },
  preferredLocation: {
    type: String,
    required: true,
    trim: true
  },
  businessGoals: {
    type: String,
    required: true,
    enum: ['primary-income', 'additional-income', 'business-expansion', 'career-change', 'investment', 'family-business', 'other-goals']
  },
  message: {
    type: String,
    trim: true
  },

  // Admin Management Information
  adminManagement: {
    cityManager: {
      type: String,
      default: 'Unassigned'
    },
    storeInspector: {
      type: String,
      default: 'Unassigned'
    },
    franchiseModel: {
      type: String,
      enum: ['FOCO', 'FOFO', 'undecided'],
      default: 'undecided'
    },
    loanRequired: {
      type: Boolean,
      default: false
    },
    numberOfFranchises: {
      type: Number,
      default: 1,
      min: 1
    },
    currentStatus: {
      type: String,
      default: 'Initial Review Pending'
    },
    lastUpdatedBy: {
      type: String
    },
    lastUpdatedAt: {
      type: Date,
      default: Date.now
    }
  },

  // Metadata
  status: {
    type: String,
    required: true,
    enum: ['pending', 'contacted', 'approved', 'rejected'],
    default: 'pending'
  },
  submittedAt: {
    type: Date,
    default: Date.now
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  notes: [{
    content: String,
    addedBy: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }]
});

// Update lastUpdated timestamp before saving
franchiseApplicationSchema.pre('save', function(next) {
  this.lastUpdated = new Date();
  next();
});

const FranchiseApplication = mongoose.model('FranchiseApplication', franchiseApplicationSchema);

export default FranchiseApplication;