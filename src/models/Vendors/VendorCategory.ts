import mongoose, { Document, Model, Schema, Types } from 'mongoose';
import slugify from 'slugify';

export interface IVendorCategory {
  name: string;
  description?: string;
  slug?: string;
}

export interface IVendorCategoryDocument extends IVendorCategory, Document {
  _id: Types.ObjectId;
}

interface IVendorCategoryModel extends Model<IVendorCategoryDocument> {
  findByName(name: string): Promise<IVendorCategoryDocument | null>;
}

const vendorCategorySchema = new Schema<IVendorCategoryDocument, IVendorCategoryModel>({
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 100
  },
  slug: {
    type: String,
    trim: true,
    lowercase: true
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500
  }
});

// Indexes
vendorCategorySchema.index({ name: 'text', description: 'text' });
vendorCategorySchema.index({ name: 1 }, { unique: true });
// Unique index for slug but sparse so existing null slugs don't cause duplicate key errors
// vendorCategorySchema.index({ slug: 1 }, { unique: true, sparse: true }); // Commented out to avoid duplicate index warning

// Ensure slug is generated from name to avoid duplicate-null unique index issues
vendorCategorySchema.pre('validate', async function (next) {
  // 'this' is the document
  const doc = this as IVendorCategoryDocument & { slug?: string };
  if (!doc.slug && doc.name) {
    let base = slugify(doc.name || '', { lower: true, strict: true }) || doc._id?.toString();
    let slug = base;
    const model = (this.constructor as IVendorCategoryModel);
    let i = 0;
    // Try to find existing slug and append numeric suffix until unique
    while (await model.findOne({ slug })) {
      i += 1;
      slug = `${base}-${i}`;
      // safety break
      if (i > 10) break;
    }
    doc.slug = slug;
  }
  next();
});

// Static method to find by name
vendorCategorySchema.statics.findByName = async function(name: string): Promise<IVendorCategoryDocument | null> {
  console.log(`[VendorCategory] Searching for category with name: ${name}`);
  return this.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
};

export default mongoose.model<IVendorCategoryDocument, IVendorCategoryModel>('VendorCategory', vendorCategorySchema);