import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Migration script to drop the old bharatmartProduct index
 * Run this script to fix the duplicate key error:
 * 
 * npm run migrate:drop-index
 * OR
 * npx ts-node src/scripts/dropOldBharatmartProductIndex.ts
 */
async function dropOldIndex() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/test';
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Get the collection directly
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Database connection not established');
    }
    
    const collection = db.collection('franchiseproducts');

    // Check existing indexes
    const indexes = await collection.indexes();
    console.log('\n📋 Existing indexes:');
    indexes.forEach(index => {
      console.log(`   - ${index.name}:`, JSON.stringify(index.key));
    });

    // Drop the old index if it exists
    const oldIndexName = 'franchise_1_bharatmartProduct_1';
    const indexExists = indexes.some(index => index.name === oldIndexName);

    if (indexExists) {
      console.log(`\n🗑️  Dropping old index: ${oldIndexName}`);
      await collection.dropIndex(oldIndexName);
      console.log('✅ Old index dropped successfully');
    } else {
      console.log(`\n⚠️  Index '${oldIndexName}' not found. Nothing to drop.`);
    }

    // Show final indexes
    const finalIndexes = await collection.indexes();
    console.log('\n📋 Final indexes:');
    finalIndexes.forEach(index => {
      console.log(`   - ${index.name}:`, JSON.stringify(index.key));
    });

    console.log('\n✅ Migration completed successfully');
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
    process.exit(0);
  }
}

// Run the migration
dropOldIndex();
