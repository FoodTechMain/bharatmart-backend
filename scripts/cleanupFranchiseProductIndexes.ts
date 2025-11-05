import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const cleanupOldIndexes = async () => {
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
    console.log('Current indexes count:', indexes.length);

    // Define the indexes that should exist according to the current schema
    const validIndexNames = [
      '_id_', // Default MongoDB index
      'bharatmartProduct_1', // From schema
      'franchise_1', // From schema
      'isActive_1', // From schema
      'franchise_1_bharatmartProduct_1' // From schema (unique compound index)
    ];

    // Find indexes to drop
    const indexesToDrop = indexes.filter((index: any) => 
      !validIndexNames.includes(index.name)
    );

    if (indexesToDrop.length > 0) {
      console.log(`\nFound ${indexesToDrop.length} old indexes to drop:`);
      for (const index of indexesToDrop) {
        console.log(`  - ${index.name}`);
      }
      
      console.log('\nDropping old indexes...');
      for (const index of indexesToDrop) {
        if (!index.name || index.name === '_id_') continue; // Never drop _id index
        try {
          console.log(`  Dropping ${index.name}...`);
          await collection.dropIndex(index.name);
          console.log(`  ✓ Successfully dropped ${index.name}`);
        } catch (error: any) {
          console.error(`  ✗ Failed to drop ${index.name}:`, error.message);
        }
      }
    } else {
      console.log('No old indexes to drop');
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

cleanupOldIndexes()
  .then(() => {
    console.log('Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });
