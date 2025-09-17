const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Category name is required'],
    trim: true,
    maxlength: [100, 'Category name cannot exceed 100 characters']
  },
  slug: {
    type: String,
    required: [true, 'Category slug is required'],
    unique: true,
    lowercase: true,
    trim: true
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  parent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    default: null
  },
  level: {
    type: Number,
    default: 0,
    min: 0
  },
  image: {
    type: String,
    default: ''
  },
  icon: {
    type: String,
    default: ''
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isFeatured: {
    type: Boolean,
    default: false
  },
  sortOrder: {
    type: Number,
    default: 0
  },
  seo: {
    title: String,
    description: String,
    keywords: [String]
  },
  stats: {
    productCount: {
      type: Number,
      default: 0
    },
    subcategoryCount: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true
});

// Indexes for better query performance
categorySchema.index({ slug: 1 });
categorySchema.index({ parent: 1 });
categorySchema.index({ level: 1 });
categorySchema.index({ isActive: 1 });
categorySchema.index({ isFeatured: 1 });
categorySchema.index({ sortOrder: 1 });

// Virtual for full path
categorySchema.virtual('fullPath').get(function() {
  return this.parent ? `${this.parent.fullPath} > ${this.name}` : this.name;
});

// Virtual for children
categorySchema.virtual('children', {
  ref: 'Category',
  localField: '_id',
  foreignField: 'parent'
});

// Method to get all descendants
categorySchema.methods.getDescendants = async function() {
  const Category = mongoose.model('Category');
  const descendants = [];
  
  const getChildren = async (parentId) => {
    const children = await Category.find({ parent: parentId, isActive: true });
    for (const child of children) {
      descendants.push(child._id);
      await getChildren(child._id);
    }
  };
  
  await getChildren(this._id);
  return descendants;
};

// Method to get all ancestors
categorySchema.methods.getAncestors = async function() {
  const Category = mongoose.model('Category');
  const ancestors = [];
  let current = this;
  
  while (current.parent) {
    const parent = await Category.findById(current.parent);
    if (parent) {
      ancestors.unshift(parent);
      current = parent;
    } else {
      break;
    }
  }
  
  return ancestors;
};

// Method to update product count
categorySchema.methods.updateProductCount = async function() {
  const Product = mongoose.model('Product');
  const descendants = await this.getDescendants();
  const categoryIds = [this._id, ...descendants];
  
  const count = await Product.countDocuments({
    category: { $in: categoryIds },
    isActive: true
  });
  
  this.stats.productCount = count;
  return this.save();
};

// Method to update subcategory count
categorySchema.methods.updateSubcategoryCount = async function() {
  const Category = mongoose.model('Category');
  const count = await Category.countDocuments({
    parent: this._id,
    isActive: true
  });
  
  this.stats.subcategoryCount = count;
  return this.save();
};

// Method to get full path as string
categorySchema.methods.getFullPath = async function() {
  const ancestors = await this.getAncestors();
  const pathParts = [...ancestors.map(ancestor => ancestor.name), this.name];
  return pathParts.join(' > ');
};

// Method to check if category can be a parent
categorySchema.methods.canBeParent = function() {
  return this.isActive && this.level < 5; // Max 5 levels deep
};

// Pre-save middleware to generate slug and set level
categorySchema.pre('save', async function(next) {
  // Generate slug if not provided
  if (!this.slug) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
  
  // Set level based on parent
  if (this.parent) {
    const Category = mongoose.model('Category');
    const parent = await Category.findById(this.parent);
    if (parent) {
      // Prevent circular reference
      if (parent._id.equals(this._id)) {
        return next(new Error('Category cannot be its own parent'));
      }
      
      // Check if the new parent is not a descendant of this category
      const descendants = await this.getDescendants();
      if (descendants.some(desc => desc.equals(parent._id))) {
        return next(new Error('Cannot set a descendant as parent'));
      }
      
      this.level = parent.level + 1;
    } else {
      // If parent is not found, set as top level
      this.level = 0;
      this.parent = null;
    }
  } else {
    this.level = 0;
  }
  
  // Ensure level is always a valid number
  if (isNaN(this.level) || this.level < 0) {
    this.level = 0;
  }
  
  // Limit hierarchy depth (optional - remove if you want unlimited depth)
  if (this.level > 5) {
    return next(new Error('Category hierarchy cannot exceed 5 levels'));
  }
  
  next();
});

// Pre-save middleware to ensure unique slug
categorySchema.pre('save', async function(next) {
  if (this.isModified('slug')) {
    const Category = mongoose.model('Category');
    const existing = await Category.findOne({ 
      slug: this.slug, 
      _id: { $ne: this._id } 
    });
    
    if (existing) {
      return next(new Error('Category with this slug already exists'));
    }
  }
  next();
});

// Static method to get category tree
categorySchema.statics.getCategoryTree = async function() {
  const categories = await this.find({ isActive: true }).sort({ sortOrder: 1, name: 1 });
  
  const buildTree = (parentId = null) => {
    return categories
      .filter(cat => String(cat.parent) === String(parentId))
      .map(cat => ({
        ...cat.toObject(),
        children: buildTree(cat._id)
      }));
  };
  
  return buildTree();
};

// Static method to get breadcrumbs
categorySchema.statics.getBreadcrumbs = async function(categoryId) {
  const Category = mongoose.model('Category');
  const category = await Category.findById(categoryId);
  if (!category) return [];
  
  const ancestors = await category.getAncestors();
  return [...ancestors, category];
};

module.exports = mongoose.model('Category', categorySchema); 