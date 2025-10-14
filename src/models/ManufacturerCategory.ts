import mongoose, { Document, Model, Schema, Types } from 'mongoose';
import { ITimestamps } from '../types/common.js';
import { Sluggable } from '../types/mongoose.js';
import slugify from 'slugify';

export interface IManufacturerCategory extends ITimestamps, Sluggable {
  name: string;
  description?: string;
  parent?: Types.ObjectId | null;
  children?: Types.ObjectId[];
  level: number;
  path: Types.ObjectId[];
  isActive: boolean;
  isLeaf: boolean;
  canBeParent: boolean;
}

export interface IManufacturerCategoryDocument extends IManufacturerCategory, Document {
  _id: Types.ObjectId;
  updatePath(): Promise<void>;
  updateLevel(): Promise<void>;
  updateChildren(): Promise<void>;
  updateParent(newParentId: Types.ObjectId | null): Promise<void>;
}

interface IManufacturerCategoryModel extends Model<IManufacturerCategoryDocument> {
  getCategoryTree(): Promise<IManufacturerCategory[]>;
  getBreadcrumbs(categoryId: Types.ObjectId): Promise<IManufacturerCategory[]>;
}

const manufacturerCategorySchema = new Schema<IManufacturerCategoryDocument, IManufacturerCategoryModel>({
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
    ref: 'ManufacturerCategory',
    default: null
  },
  children: [{
    type: Schema.Types.ObjectId,
    ref: 'ManufacturerCategory'
  }],
  level: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  path: [{
    type: Schema.Types.ObjectId,
    ref: 'ManufacturerCategory'
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
  slug: {
    type: String,
    required: true,
    unique: true
  }
}, {
  timestamps: true
});

// Indexes
manufacturerCategorySchema.index({ parent: 1 });
manufacturerCategorySchema.index({ path: 1 });
manufacturerCategorySchema.index({ slug: 1 }, { unique: true });
manufacturerCategorySchema.index({ name: 'text', description: 'text' });

// Pre-save middleware
manufacturerCategorySchema.pre('save', async function(next) {
  if (this.isModified('name')) {
    this.slug = slugify(this.name, { lower: true, strict: true });

    // Check for duplicate slug
    const duplicate = await this.model('ManufacturerCategory').findOne({
      slug: this.slug,
      _id: { $ne: this._id }
    });

    if (duplicate) {
      this.slug = `${this.slug}-${this._id}`;
    }
  }

  next();
});

// Method to update category path
manufacturerCategorySchema.methods.updatePath = async function(): Promise<void> {
  if (!this.parent) {
    this.path = [this._id];
    return;
  }

  const parent = await this.model('ManufacturerCategory').findById(this.parent);
  if (!parent) {
    throw new Error('Parent category not found');
  }

  this.path = [...parent.path, this._id];
};

// Method to update category level
manufacturerCategorySchema.methods.updateLevel = async function(): Promise<void> {
  if (!this.parent) {
    this.level = 0;
    return;
  }

  const parent = await this.model('ManufacturerCategory').findById(this.parent);
  if (!parent) {
    throw new Error('Parent category not found');
  }

  this.level = parent.level + 1;
};

// Method to update children array
manufacturerCategorySchema.methods.updateChildren = async function(): Promise<void> {
  const children = await this.model('ManufacturerCategory').find({ parent: this._id });
  this.children = children.map((child: IManufacturerCategoryDocument) => child._id);
  this.isLeaf = children.length === 0;
  await this.save();
};

// Method to update parent
manufacturerCategorySchema.methods.updateParent = async function(newParentId: Types.ObjectId | null): Promise<void> {
  // Remove from old parent's children array
  if (this.parent) {
    const oldParent = await this.model('ManufacturerCategory').findById(this.parent);
    if (oldParent) {
      oldParent.children = oldParent.children?.filter((childId: Types.ObjectId) => !childId.equals(this._id));
      oldParent.isLeaf = oldParent.children?.length === 0;
      await oldParent.save();
    }
  }

  // Add to new parent's children array
  if (newParentId) {
    const newParent = await this.model('ManufacturerCategory').findById(newParentId);
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

// Static method to get category tree
manufacturerCategorySchema.statics.getCategoryTree = async function(): Promise<IManufacturerCategory[]> {
  const categories = await this.find()
    .sort({ path: 1, name: 1 })
    .lean();

  return categories;
};

// Static method to get category breadcrumbs
manufacturerCategorySchema.statics.getBreadcrumbs = async function(categoryId: Types.ObjectId): Promise<IManufacturerCategory[]> {
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

export default mongoose.model<IManufacturerCategoryDocument, IManufacturerCategoryModel>('ManufacturerCategory', manufacturerCategorySchema);