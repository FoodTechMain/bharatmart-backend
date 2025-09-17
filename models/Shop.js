const mongoose = require('mongoose');

const shopSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Shop name is required'],
    trim: true,
    maxlength: [100, 'Shop name cannot exceed 100 characters']
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Shop owner is required']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  logo: {
    type: String,
    default: ''
  },
  banner: {
    type: String,
    default: ''
  },
  contactInfo: {
    email: {
      type: String,
      required: [true, 'Contact email is required'],
      lowercase: true,
      trim: true
    },
    phone: {
      type: String,
      required: [true, 'Contact phone is required'],
      trim: true
    },
    address: {
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: {
        type: String,
        default: 'India'
      }
    }
  },
  businessHours: {
    monday: { open: String, close: String, isOpen: { type: Boolean, default: true } },
    tuesday: { open: String, close: String, isOpen: { type: Boolean, default: true } },
    wednesday: { open: String, close: String, isOpen: { type: Boolean, default: true } },
    thursday: { open: String, close: String, isOpen: { type: Boolean, default: true } },
    friday: { open: String, close: String, isOpen: { type: Boolean, default: true } },
    saturday: { open: String, close: String, isOpen: { type: Boolean, default: true } },
    sunday: { open: String, close: String, isOpen: { type: Boolean, default: false } }
  },
  categories: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category'
  }],
  rating: {
    average: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    count: {
      type: Number,
      default: 0
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  verificationStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  socialMedia: {
    website: String,
    facebook: String,
    instagram: String,
    twitter: String
  },
  settings: {
    autoAcceptOrders: {
      type: Boolean,
      default: true
    },
    allowReviews: {
      type: Boolean,
      default: true
    },
    minimumOrderAmount: {
      type: Number,
      default: 0
    },
    deliveryRadius: {
      type: Number,
      default: 10 // in kilometers
    }
  },
  stats: {
    totalProducts: {
      type: Number,
      default: 0
    },
    totalOrders: {
      type: Number,
      default: 0
    },
    totalRevenue: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true
});

// Indexes for better query performance
shopSchema.index({ owner: 1 });
shopSchema.index({ isActive: 1 });
shopSchema.index({ isVerified: 1 });
shopSchema.index({ 'contactInfo.city': 1 });
shopSchema.index({ rating: -1 });

// Virtual for full address
shopSchema.virtual('fullAddress').get(function() {
  const addr = this.contactInfo.address;
  if (!addr) return '';
  return `${addr.street || ''}, ${addr.city || ''}, ${addr.state || ''}, ${addr.zipCode || ''}, ${addr.country || ''}`.trim();
});

// Method to update shop stats
shopSchema.methods.updateStats = async function() {
  const Product = mongoose.model('Product');
  const Order = mongoose.model('Order');
  
  const totalProducts = await Product.countDocuments({ shop: this._id, isActive: true });
  const totalOrders = await Order.countDocuments({ shop: this._id });
  const totalRevenue = await Order.aggregate([
    { $match: { shop: this._id, status: { $in: ['completed', 'delivered'] } } },
    { $group: { _id: null, total: { $sum: '$totalAmount' } } }
  ]);
  
  this.stats = {
    totalProducts,
    totalOrders,
    totalRevenue: totalRevenue.length > 0 ? totalRevenue[0].total : 0
  };
  
  return this.save();
};

// Method to calculate average rating
shopSchema.methods.calculateAverageRating = async function() {
  const Review = mongoose.model('Review');
  
  const result = await Review.aggregate([
    { $match: { shop: this._id } },
    { $group: { _id: null, average: { $avg: '$rating' }, count: { $sum: 1 } } }
  ]);
  
  if (result.length > 0) {
    this.rating = {
      average: Math.round(result[0].average * 10) / 10,
      count: result[0].count
    };
  } else {
    this.rating = { average: 0, count: 0 };
  }
  
  return this.save();
};

// Pre-save middleware to ensure owner is a shop_owner
shopSchema.pre('save', async function(next) {
  if (this.isModified('owner')) {
    const User = mongoose.model('User');
    const owner = await User.findById(this.owner);
    if (!owner || owner.role !== 'shop_owner') {
      return next(new Error('Shop owner must have shop_owner role'));
    }
  }
  next();
});

module.exports = mongoose.model('Shop', shopSchema); 