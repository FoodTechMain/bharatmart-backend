const mongoose = require('mongoose');

const manufacturerCategorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Manufacturer category name is required'],
    trim: true,
    maxlength: [100, 'Category name cannot exceed 100 characters']
  },
  slug: {
    type: String,
    unique: true,
    index: true
  },
  parent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ManufacturerCategory',
    default: null
  },
  children: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ManufacturerCategory'
  }],
  level: {
    type: Number,
    default: 0,  // 0 for main categories, 1 for subcategories
    min: 0
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Pre-save middleware to generate slug
manufacturerCategorySchema.pre('save', function(next) {
  if (this.isModified('name')) {
    this.slug = this.name.toLowerCase().replace(/[^a-zA-Z0-9]/g, '-');
  }
  next();
});

// Index for efficient querying
manufacturerCategorySchema.index({ parent: 1 });
manufacturerCategorySchema.index({ level: 1 });
manufacturerCategorySchema.index({ isActive: 1 });

module.exports = mongoose.model('ManufacturerCategory', manufacturerCategorySchema);