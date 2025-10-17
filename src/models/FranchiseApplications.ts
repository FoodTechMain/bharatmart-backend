import mongoose from 'mongoose';

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