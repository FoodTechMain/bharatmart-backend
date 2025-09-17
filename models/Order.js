const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  orderNumber: {
    type: String,
    required: true,
    unique: true
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Customer is required']
  },
  shop: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop',
    required: [true, 'Shop is required']
  },
  items: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      min: [1, 'Quantity must be at least 1']
    },
    price: {
      type: Number,
      required: true,
      min: [0, 'Price cannot be negative']
    },
    total: {
      type: Number,
      required: true,
      min: [0, 'Total cannot be negative']
    },
    variant: {
      name: String,
      value: String
    }
  }],
  subtotal: {
    type: Number,
    required: true,
    min: [0, 'Subtotal cannot be negative']
  },
  tax: {
    amount: {
      type: Number,
      default: 0,
      min: [0, 'Tax amount cannot be negative']
    },
    rate: {
      type: Number,
      default: 0,
      min: [0, 'Tax rate cannot be negative']
    }
  },
  shipping: {
    cost: {
      type: Number,
      default: 0,
      min: [0, 'Shipping cost cannot be negative']
    },
    method: {
      type: String,
      enum: ['standard', 'express', 'pickup'],
      default: 'standard'
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
    },
    trackingNumber: String,
    estimatedDelivery: Date
  },
  discount: {
    amount: {
      type: Number,
      default: 0,
      min: [0, 'Discount amount cannot be negative']
    },
    code: String,
    type: {
      type: String,
      enum: ['percentage', 'fixed'],
      default: 'fixed'
    }
  },
  totalAmount: {
    type: Number,
    required: true,
    min: [0, 'Total amount cannot be negative']
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'],
    default: 'pending'
  },
  payment: {
    method: {
      type: String,
      enum: ['cod', 'online', 'bank_transfer'],
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending'
    },
    transactionId: String,
    paidAt: Date
  },
  notes: {
    customer: String,
    admin: String
  },
  timeline: [{
    status: {
      type: String,
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    note: String,
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes for better query performance
orderSchema.index({ orderNumber: 1 });
orderSchema.index({ customer: 1 });
orderSchema.index({ shop: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ 'payment.status': 1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ 'timeline.timestamp': -1 });

// Virtual for order summary
orderSchema.virtual('orderSummary').get(function() {
  return {
    itemCount: this.items.length,
    totalItems: this.items.reduce((sum, item) => sum + item.quantity, 0),
    totalAmount: this.totalAmount,
    status: this.status,
    paymentStatus: this.payment.status
  };
});

// Virtual for delivery address
orderSchema.virtual('deliveryAddress').get(function() {
  const addr = this.shipping.address;
  if (!addr) return '';
  return `${addr.street || ''}, ${addr.city || ''}, ${addr.state || ''}, ${addr.zipCode || ''}, ${addr.country || ''}`.trim();
});

// Method to generate order number
orderSchema.statics.generateOrderNumber = async function() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  const count = await this.countDocuments({
    createdAt: {
      $gte: new Date(year, date.getMonth(), date.getDate()),
      $lt: new Date(year, date.getMonth(), date.getDate() + 1)
    }
  });
  
  const sequence = String(count + 1).padStart(4, '0');
  return `ORD-${year}${month}${day}-${sequence}`;
};

// Method to update order status
orderSchema.methods.updateStatus = async function(newStatus, note = '', updatedBy = null) {
  this.status = newStatus;
  this.timeline.push({
    status: newStatus,
    note,
    updatedBy
  });
  
  return this.save();
};

// Method to calculate totals
orderSchema.methods.calculateTotals = function() {
  // Calculate subtotal
  this.subtotal = this.items.reduce((sum, item) => sum + item.total, 0);
  
  // Calculate tax
  this.tax.amount = (this.subtotal * this.tax.rate) / 100;
  
  // Calculate total
  this.totalAmount = this.subtotal + this.tax.amount + this.shipping.cost - this.discount.amount;
  
  return this;
};

// Method to validate inventory
orderSchema.methods.validateInventory = async function() {
  const Product = mongoose.model('Product');
  const errors = [];
  
  for (const item of this.items) {
    const product = await Product.findById(item.product);
    if (!product) {
      errors.push(`Product ${item.product} not found`);
      continue;
    }
    
    if (product.inventory.trackInventory && product.inventory.quantity < item.quantity) {
      errors.push(`Insufficient stock for ${product.name}. Available: ${product.inventory.quantity}, Requested: ${item.quantity}`);
    }
  }
  
  return errors;
};

// Method to update inventory
orderSchema.methods.updateInventory = async function() {
  const Product = mongoose.model('Product');
  
  for (const item of this.items) {
    await Product.findByIdAndUpdate(item.product, {
      $inc: { 'inventory.quantity': -item.quantity }
    });
  }
};

// Pre-save middleware to generate order number
orderSchema.pre('save', async function(next) {
  if (this.isNew && !this.orderNumber) {
    this.orderNumber = await this.constructor.generateOrderNumber();
  }
  
  // Add initial timeline entry
  if (this.isNew) {
    this.timeline.push({
      status: this.status,
      note: 'Order created'
    });
  }
  
  next();
});

// Pre-save middleware to calculate totals
orderSchema.pre('save', function(next) {
  if (this.isModified('items') || this.isModified('tax') || this.isModified('shipping') || this.isModified('discount')) {
    this.calculateTotals();
  }
  next();
});

module.exports = mongoose.model('Order', orderSchema); 