const mongoose = require('mongoose');

const franchiseSchema = new mongoose.Schema({
   

  // 🏢 Franchise details
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

  // 📞 Contact details
  contactPerson: String,
  designation: String,
  phone: String,
  email: String,
  address: String,

  // 🧾 Legal & banking info
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

  // 📊 Business info
  investmentRange: {
    min: Number,
    max: Number
  },
  roi: Number,
  establishedYear: Number,
  totalUnits: Number,

  // ✅ Status
  isActive: {
    type: Boolean,
    default: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },

  // 🕓 Metadata
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Auto update `updatedAt`
franchiseSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Franchise', franchiseSchema);
