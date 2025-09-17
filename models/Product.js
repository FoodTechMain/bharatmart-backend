const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true,
    maxlength: [200, 'Product name cannot exceed 200 characters']
  },
  description: {
    type: String,
    required: [true, 'Product description is required'],
    trim: true
  },
  shortDescription: {
    type: String,
    trim: true,
    maxlength: [300, 'Short description cannot exceed 300 characters']
  },
  shop: { type: String },      // Change from ObjectId to String
  category: { type: String },  // Change from ObjectId to String
  subcategory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category'
  },
  brand: {
    type: String,
    trim: true
  },
  sku: {
    type: String,
    unique: true,
    sparse: true,
    trim: true
  },
  images: [{
    url: {
      type: String,
      required: true
    },
    alt: String,
    isPrimary: {
      type: Boolean,
      default: false
    }
  }],
  price: {
    regular: {
      type: Number,
      required: [true, 'Regular price is required'],
      min: [0, 'Price cannot be negative']
    },
    sale: {
      type: Number,
      min: [0, 'Sale price cannot be negative']
    },
    cost: {
      type: Number,
      min: [0, 'Cost cannot be negative']
    }
  },
  inventory: {
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [0, 'Quantity cannot be negative'],
      default: 0
    },
    lowStockThreshold: {
      type: Number,
      default: 10,
      min: [0, 'Low stock threshold cannot be negative']
    },
    trackInventory: {
      type: Boolean,
      default: true
    }
  },
  variants: [{
    name: {
      type: String,
      required: true
    },
    options: [{
      label: String,
      value: String,
      priceModifier: {
        type: Number,
        default: 0
      },
      stockQuantity: {
        type: Number,
        default: 0
      }
    }]
  }],
  attributes: [{
    name: String,
    value: String
  }],
  specifications: [{
    name: String,
    value: String
  }],
  tags: [{
    type: String,
    trim: true
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
  isFeatured: {
    type: Boolean,
    default: false
  },
  isOnSale: {
    type: Boolean,
    default: false
  },
  saleStartDate: Date,
  saleEndDate: Date,
  weight: {
    value: Number,
    unit: {
      type: String,
      enum: ['kg', 'g', 'lb', 'oz'],
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
  shipping: {
    weight: Number,
    requiresShipping: {
      type: Boolean,
      default: true
    },
    freeShipping: {
      type: Boolean,
      default: false
    }
  },
  seo: {
    title: {
      type: String,
      trim: true,
      maxlength: [60, 'SEO title cannot exceed 60 characters']
    },
    description: {
      type: String,
      trim: true,
      maxlength: [160, 'SEO description cannot exceed 160 characters']
    },
    keywords: [{
      type: String,
      trim: true
    }],
    slug: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      lowercase: true
    },
    canonicalUrl: String,
    ogImage: String,
    structuredData: {
      type: String,
      default: ''
    }
  },
  stats: {
    views: {
      type: Number,
      default: 0
    },
    sales: {
      type: Number,
      default: 0
    },
    revenue: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true
});

// Indexes for better query performance
productSchema.index({ shop: 1 });
productSchema.index({ category: 1 });
productSchema.index({ isActive: 1 });
productSchema.index({ isFeatured: 1 });
productSchema.index({ isOnSale: 1 });
productSchema.index({ 'price.regular': 1 });
productSchema.index({ rating: -1 });
productSchema.index({ 'stats.views': -1 });
productSchema.index({ 'stats.sales': -1 });
productSchema.index({ tags: 1 });
productSchema.index({ name: 'text', description: 'text' });

// Virtual for current price
productSchema.virtual('currentPrice').get(function() {
  if (this.isOnSale && this.price.sale && this.price.sale > 0) {
    const now = new Date();
    if ((!this.saleStartDate || now >= this.saleStartDate) && 
        (!this.saleEndDate || now <= this.saleEndDate)) {
      return this.price.sale;
    }
  }
  return this.price.regular;
});

// Virtual for discount percentage
productSchema.virtual('discountPercentage').get(function() {
  if (this.isOnSale && this.price.sale && this.price.sale > 0) {
    const now = new Date();
    if ((!this.saleStartDate || now >= this.saleStartDate) && 
        (!this.saleEndDate || now <= this.saleEndDate)) {
      return Math.round(((this.price.regular - this.price.sale) / this.price.regular) * 100);
    }
  }
  return 0;
});

// Virtual for primary image
productSchema.virtual('primaryImage').get(function() {
  const primary = this.images.find(img => img.isPrimary);
  return primary ? primary.url : (this.images.length > 0 ? this.images[0].url : '');
});

// Virtual for stock status
productSchema.virtual('stockStatus').get(function() {
  if (!this.inventory.trackInventory) return 'in_stock';
  if (this.inventory.quantity <= 0) return 'out_of_stock';
  if (this.inventory.quantity <= this.inventory.lowStockThreshold) return 'low_stock';
  return 'in_stock';
});

// Method to update product stats
productSchema.methods.updateStats = async function() {
  const Order = mongoose.model('Order');
  
  const result = await Order.aggregate([
    { $match: { 'items.product': this._id, status: { $in: ['completed', 'delivered'] } } },
    { $group: { _id: null, sales: { $sum: '$items.quantity' }, revenue: { $sum: '$totalAmount' } } }
  ]);
  
  if (result.length > 0) {
    this.stats.sales = result[0].sales;
    this.stats.revenue = result[0].revenue;
  }
  
  return this.save();
};

// Method to calculate average rating
productSchema.methods.calculateAverageRating = async function() {
  const Review = mongoose.model('Review');
  
  const result = await Review.aggregate([
    { $match: { product: this._id } },
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

// Method to increment view count
productSchema.methods.incrementViews = function() {
  this.stats.views += 1;
  return this.save();
};

// Pre-save middleware to generate SKU and SEO slug if not provided
productSchema.pre('save', async function(next) {
  if (!this.sku) {
    const Product = mongoose.model('Product');
    const count = await Product.countDocuments();
    this.sku = `PROD-${Date.now()}-${count + 1}`;
  }
  
  // Generate SEO slug if not provided
  if (!this.seo.slug && this.name) {
    const Product = mongoose.model('Product');
    let slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim('-');
    
    // Ensure uniqueness
    let counter = 1;
    let originalSlug = slug;
    while (await Product.findOne({ 'seo.slug': slug, _id: { $ne: this._id } })) {
      slug = `${originalSlug}-${counter}`;
      counter++;
    }
    this.seo.slug = slug;
  }
  
  // Generate SEO title if not provided
  if (!this.seo.title && this.name) {
    this.seo.title = this.name;
  }
  
  // Generate SEO description if not provided
  if (!this.seo.description && this.shortDescription) {
    this.seo.description = this.shortDescription.length > 160 
      ? this.shortDescription.substring(0, 157) + '...'
      : this.shortDescription;
  }
  
  // Update isOnSale based on sale dates
  if (this.price.sale && this.price.sale > 0) {
    const now = new Date();
    this.isOnSale = (!this.saleStartDate || now >= this.saleStartDate) && 
                    (!this.saleEndDate || now <= this.saleEndDate);
  } else {
    this.isOnSale = false;
  }
  
  next();
});

module.exports = mongoose.model('Product', productSchema);