import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import VendorCategory from '../src/models/VendorCategory';
import slugify from 'slugify';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/bharatmart';

async function run() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB for migration');

    const docs = await VendorCategory.find({ $or: [{ slug: { $exists: false } }, { slug: null }] }).lean();
    console.log(`Found ${docs.length} vendor categories with missing slug`);

    for (const doc of docs) {
      const base = slugify(doc.name || '', { lower: true, strict: true }) || doc._id?.toString();
      let slug = base;
      let i = 0;
      // ensure uniqueness
      // eslint-disable-next-line no-await-in-loop
      while (await VendorCategory.findOne({ slug })) {
        i += 1;
        slug = `${base}-${i}`;
        if (i > 100) break;
      }
      // eslint-disable-next-line no-await-in-loop
      await VendorCategory.findByIdAndUpdate(doc._id, { $set: { slug } });
      console.log(`Updated ${doc._id} -> slug: ${slug}`);
    }

    console.log('Migration complete');
    process.exit(0);
  } catch (err) {
    console.error('Migration error', err);
    process.exit(1);
  }
}

run();
