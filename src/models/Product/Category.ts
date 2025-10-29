import mongoose, { Document, Model, Schema, Types } from 'mongoose';
import { ITimestamps } from '../../types/common';
import { Sluggable } from '../../types/mongoose';
import slugify from 'slugify';

export interface ICategory extends ITimestamps, Sluggable {
  name: string;
  description?: string;
  parent?: Types.ObjectId | null;
  children?: Types.ObjectId[];
  level: number;
  path: Types.ObjectId[];
  isActive: boolean;
  isLeaf: boolean;
  canBeParent: boolean;
  isFeatured?: boolean;
}

export interface ICategoryDocument extends ICategory, Document {
  _id: Types.ObjectId;
  updatePath(): Promise<void>;
  updateLevel(): Promise<void>;
  updateChildren(): Promise<void>;
  updateParent(newParentId: Types.ObjectId | null): Promise<void>;
  getDescendants(): Promise<ICategoryDocument[]>;
  getAncestors(): Promise<ICategoryDocument[]>;
  getBreadcrumbs(): Promise<ICategoryDocument[]>;
  updateSubcategoryCount(): Promise<void>;
}

interface ICategoryModel extends Model<ICategoryDocument> {
  getCategoryTree(): Promise<ICategory[]>;
  getBreadcrumbs(categoryId: Types.ObjectId): Promise<ICategory[]>;
}

const categorySchema = new Schema<ICategoryDocument, ICategoryModel>({
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 100
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500
  },
  parent: {
    type: Schema.Types.ObjectId,
    ref: 'Category',
    default: null
  },
  children: [{
    type: Schema.Types.ObjectId,
    ref: 'Category'
  }],
  level: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  path: [{
    type: Schema.Types.ObjectId,
    ref: 'Category'
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  isLeaf: {
    type: Boolean,
    default: true
  },
  canBeParent: {
    type: Boolean,
    default: true
  },
  isFeatured: {
    type: Boolean,
    default: false
  },
  slug: {
    type: String,
    required: true,
    unique: true
  }
}, {
  timestamps: true
});

// Indexes
categorySchema.index({ parent: 1 });
categorySchema.index({ path: 1 });
// categorySchema.index({ slug: 1 }, { unique: true }); // Commented out to avoid duplicate index warning
categorySchema.index({ name: 'text', description: 'text' });

// Method to update category path
categorySchema.methods.updatePath = async function(): Promise<void> {
  if (!this.parent) {
    this.path = [this._id];
    return;
  }

  const parent = await this.model('Category').findById(this.parent);
  if (!parent) {
    throw new Error('Parent category not found');
  }

  this.path = [...parent.path, this._id];
};

// Method to update category level
categorySchema.methods.updateLevel = async function(): Promise<void> {
  if (!this.parent) {
    this.level = 0;
    return;
  }

  const parent = await this.model('Category').findById(this.parent);
  if (!parent) {
    throw new Error('Parent category not found');
  }

  this.level = parent.level + 1;
};

// Method to update children array
categorySchema.methods.updateChildren = async function(): Promise<void> {
  const children = await this.model('Category').find({ parent: this._id });
  this.children = children.map((child: ICategoryDocument) => child._id);
  this.isLeaf = children.length === 0;
  await this.save();
};

// Method to update parent
categorySchema.methods.updateParent = async function(newParentId: Types.ObjectId | null): Promise<void> {
  // Remove from old parent's children array
  if (this.parent) {
    const oldParent = await this.model('Category').findById(this.parent);
    if (oldParent) {
      oldParent.children = oldParent.children?.filter((childId: Types.ObjectId) => !childId.equals(this._id));
      oldParent.isLeaf = oldParent.children?.length === 0;
      await oldParent.save();
    }
  }

  // Add to new parent's children array
  if (newParentId) {
    const newParent = await this.model('Category').findById(newParentId);
    if (!newParent) {
      throw new Error('New parent category not found');
    }

    if (!newParent.canBeParent) {
      throw new Error('Selected category cannot be a parent');
    }

    newParent.children = [...(newParent.children || []), this._id];
    newParent.isLeaf = false;
    await newParent.save();
  }

  // Update this category
  this.parent = newParentId;
  await this.updatePath();
  await this.updateLevel();
  await this.save();
};

// Method to get descendants
categorySchema.methods.getDescendants = async function(): Promise<ICategoryDocument[]> {
  return this.model('Category').find({
    path: this._id,
    _id: { $ne: this._id }
  }).sort({ path: 1 });
};

// Method to get ancestors
categorySchema.methods.getAncestors = async function(): Promise<ICategoryDocument[]> {
  return this.model('Category').find({
    _id: { $in: this.path, $ne: this._id }
  }).sort({ level: 1 });
};

// Method to get breadcrumbs
categorySchema.methods.getBreadcrumbs = async function(): Promise<ICategoryDocument[]> {
  return this.model('Category').find({
    _id: { $in: this.path }
  }).sort({ level: 1 });
};

// Method to update subcategory count
categorySchema.methods.updateSubcategoryCount = async function(): Promise<void> {
  const descendants = await this.getDescendants();
  this.isLeaf = descendants.length === 0;
  await this.save();
};

// Static method to get category tree
categorySchema.statics.getCategoryTree = async function(): Promise<ICategory[]> {
  const categories = await this.find()
    .sort({ path: 1, name: 1 })
    .lean();

  return categories;
};

// Static method to get category breadcrumbs
categorySchema.statics.getBreadcrumbs = async function(categoryId: Types.ObjectId): Promise<ICategory[]> {
  const category = await this.findById(categoryId);
  if (!category) {
    throw new Error('Category not found');
  }

  const breadcrumbs = await this.find({
    _id: { $in: category.path }
  })
  .sort({ level: 1 })
  .lean();

  return breadcrumbs;
};

// Pre-save middleware
categorySchema.pre('save', async function(next) {
  if (this.isModified('name')) {
    this.slug = slugify(this.name, { lower: true, strict: true });

    // Check for duplicate slug
    const duplicate = await this.model('Category').findOne({
      slug: this.slug,
      _id: { $ne: this._id }
    });

    if (duplicate) {
      this.slug = `${this.slug}-${this._id}`;
    }
  }

  next();
});

export default mongoose.model<ICategoryDocument, ICategoryModel>('Category', categorySchema);