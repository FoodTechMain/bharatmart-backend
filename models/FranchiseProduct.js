const mongoose = require('mongoose');

const franchiseProductSchema = new mongoose.Schema({
  // 🏢 Franchise Reference
  franchise: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Franchise',
    required: true,
    index: true // For fast franchise-based queries
  },

  // 📦 Product Information
  name: {
    type: String,
    required: true,
    trim: true,
    index: true // For search optimization
  },
  description: {
    type: String,
    required: true
  },
  sku: {
    type: String,
    required: true,
    unique: true, // Global unique SKU
    index: true
  },
  barcode: {
    type: String,
    index: true
  },

  // 🏷️ Categorization
  category: {
    type: String,
    required: true,
    index: true
  },
  subcategory: {
    type: String,
    index: true
  },
  brand: {
    type: String,
    index: true
  },

  // 💰 Pricing
  costPrice: {
    type: Number,
    required: true,
    min: 0
  },
  sellingPrice: {
    type: Number,
    required: true,
    min: 0
  },
  mrp: {
    type: Number,
    min: 0
  },
  discount: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },

  // 📊 Inventory
  stock: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  minStock: {
    type: Number,
    min: 0,
    default: 0
  },
  maxStock: {
    type: Number,
    min: 0
  },

  // 📏 Physical Attributes
  weight: {
    value: Number,
    unit: {
      type: String,
      enum: ['g', 'kg', 'lb', 'oz'],
      default: 'kg'
    }
  },
  dimensions: {
    length: Number,
    width: Number,
    height: Number,
    unit: {
      type: String,
      enum: ['cm', 'm', 'in', 'ft'],
      default: 'cm'
    }
  },

  // 🖼️ Media
  images: [{
    url: String,
    alt: String,
    isPrimary: {
      type: Boolean,
      default: false
    }
  }],

  // 🏪 Store Information
  storeLocation: {
    type: String,
    index: true
  },
  shelfLocation: String,

  // ✅ Status & Flags
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  isFeatured: {
    type: Boolean,
    default: false,
    index: true
  },
  isDigital: {
    type: Boolean,
    default: false
  },

  // 📈 Analytics & Performance
  views: {
    type: Number,
    default: 0
  },
  sales: {
    type: Number,
    default: 0
  },
  rating: {
    average: {
      type: Number,
      min: 0,
      max: 5,
      default: 0
    },
    count: {
      type: Number,
      default: 0
    }
  },

  // 🏷️ Tags & SEO
  tags: [{
    type: String,
    index: true
  }],
  seoTitle: String,
  seoDescription: String,
  keywords: [String],

  // 📋 Compliance
  expiryDate: Date,
  manufacturingDate: Date,
  batchNumber: String,
  certifications: [String],

  // 🔄 Bulk Import Tracking
  importBatch: {
    type: String,
    index: true
  },
  importDate: Date,
  importSource: {
    type: String,
    enum: ['excel', 'api', 'manual'],
    default: 'manual'
  },

  // 🕓 Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes for optimal performance
franchiseProductSchema.index({ franchise: 1, category: 1 });
franchiseProductSchema.index({ franchise: 1, isActive: 1 });
franchiseProductSchema.index({ franchise: 1, createdAt: -1 });
franchiseProductSchema.index({ sku: 1, franchise: 1 });
franchiseProductSchema.index({ importBatch: 1, franchise: 1 });

// Text search index
franchiseProductSchema.index({
  name: 'text',
  description: 'text',
  category: 'text',
  brand: 'text',
  tags: 'text'
});

// Auto-update timestamps
franchiseProductSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

// Virtual for profit margin
franchiseProductSchema.virtual('profitMargin').get(function() {
  if (this.sellingPrice && this.costPrice) {
    return ((this.sellingPrice - this.costPrice) / this.sellingPrice * 100).toFixed(2);
  }
  return 0;
});

// Static method for bulk operations
franchiseProductSchema.statics.bulkCreate = async function(products, franchiseId, importBatch) {
  const productsWithMetadata = products.map(product => ({
    ...product,
    franchise: franchiseId,
    importBatch,
    importDate: new Date(),
    importSource: 'excel'
  }));
  
  return this.insertMany(productsWithMetadata, { ordered: false });
};

// Static method for bulk update
franchiseProductSchema.statics.bulkUpdate = async function(updates, franchiseId) {
  const bulkOps = updates.map(update => ({
    updateOne: {
      filter: { _id: update._id, franchise: franchiseId },
      update: { $set: update.data },
      upsert: false
    }
  }));
  
  return this.bulkWrite(bulkOps);
};

module.exports = mongoose.model('FranchiseProduct', franchiseProductSchema);
