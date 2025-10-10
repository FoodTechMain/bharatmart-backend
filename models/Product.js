const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
  name: { type: String, required: true },
  manufacturer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Manufacturer',
    required: false
  },
  category: { type: String, required: true }, // Now a string, not ObjectId
  sku: { type: String, required: true },
  batchNo: { type: String },
  barcode: { type: String },
  mrp: { type: Number, required: true },
  price: {
    regular: { type: Number, required: true },
    sale: { type: Number },
    cost: { type: Number },
    wholesale: { type: Number }
  },
  weight: {
    value: { type: Number, required: true },
    unit: { type: String, required: true }
  },
  // dimensions removed per request
  expiryDate: { type: Date },
  // manufacturer field is stored as an ObjectId reference to Manufacturer model
  hsn: { type: String },
  gst: { type: Number },
  minOrderQty: { type: Number },
  maxOrderQty: { type: Number },
  shortDescription: { type: String },
  description: { type: String, default: '' },
  images: [{
    url: { type: String },
    alt: { type: String },
    isPrimary: { type: Boolean, default: false }
  }],
  inventory: {
    quantity: { type: Number, required: true },
    lowStockThreshold: { type: Number, default: 10 },
    trackInventory: { type: Boolean, default: true }
  },
  seo: {
    title: { type: String },
    description: { type: String },
    keywords: [{ type: String }]
  },
  isActive: { type: Boolean, default: true },
  isFeatured: { type: Boolean, default: false },
  stats: {
    views: { type: Number, default: 0 },
    sales: { type: Number, default: 0 },
    revenue: { type: Number, default: 0 }
  }
}, { timestamps: true });
// Create a case-insensitive unique index for SKU
// This uses a collation to make uniqueness checks case-insensitive
ProductSchema.index({ sku: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

// Optional: Auto-generate SKU if not provided
ProductSchema.pre('validate', function(next) {
  if (!this.sku) {
    this.sku = `SKU-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
  }
  next();
});

// Optional: Increment view count method
ProductSchema.methods.incrementViews = async function() {
  this.stats.views += 1;
  await this.save();
};

module.exports = mongoose.model('Product', ProductSchema);