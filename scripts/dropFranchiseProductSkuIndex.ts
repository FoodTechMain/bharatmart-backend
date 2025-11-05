import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const dropSkuIndex = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/test');
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Database connection not established');
    }
    const collection = db.collection('franchiseproducts');

    console.log('Checking existing indexes...');
    const indexes = await collection.indexes();
    console.log('Current indexes:', JSON.stringify(indexes, null, 2));

    // Find all indexes that contain 'sku' in their key or name
    const skuIndexes = indexes.filter((index: any) => 
      index.name.includes('sku') || Object.keys(index.key).includes('sku')
    );
    
    if (skuIndexes.length > 0) {
      console.log(`Found ${skuIndexes.length} sku-related indexes to drop:`);
      for (const index of skuIndexes) {
        console.log(`  - ${index.name}`);
      }
      
      for (const index of skuIndexes) {
        if (!index.name) continue;
        try {
          console.log(`\nDropping ${index.name}...`);
          await collection.dropIndex(index.name);
          console.log(`✓ Successfully dropped ${index.name}`);
        } catch (error: any) {
          console.error(`✗ Failed to drop ${index.name}:`, error.message);
        }
      }
    } else {
      console.log('No sku-related indexes found');
    }

    console.log('\nFinal indexes:');
    const finalIndexes = await collection.indexes();
    console.log(JSON.stringify(finalIndexes, null, 2));

    console.log('\n✓ Migration completed successfully');
  } catch (error) {
    console.error('Error during migration:', error);
    throw error;
  } finally {
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
  }
};

dropSkuIndex()
  .then(() => {
    console.log('Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });
