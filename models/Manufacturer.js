const mongoose = require('mongoose');

const manufacturerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  slug: {
    type: String,
    unique: true
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ManufacturerCategory',
    default: null
  },
  logo: {
    type: String,
    default: ''
  },
  website: {
    type: String,
    trim: true
  },
  contactPerson: {
    type: String,
    required: true
  },
  designation: String,
  phone: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  address: {
    street: String,
    city: String,
    state: String,
    pincode: String,
    country: {
      type: String,
      default: 'India'
    }
  },
  gst: {
    type: String,
    trim: true
  },
  pan: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  totalProducts: {
    type: Number,
    default: 0
  },
  totalRevenue: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

manufacturerSchema.pre('save', function(next) {
  if (this.isModified('name')) {
    this.slug = this.name.toLowerCase().replace(/[^a-zA-Z0-9]/g, '-');
  }
  next();
});

manufacturerSchema.pre('save', function(next) {
  if (this.category === '') this.category = null;
  next();
});

const Manufacturer = mongoose.model('Manufacturer', manufacturerSchema);
module.exports = Manufacturer;
