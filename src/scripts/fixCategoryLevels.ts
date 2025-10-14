import mongoose from 'mongoose';
import Category, { ICategory } from '../models/Category';

interface LevelStat {
  _id: number;
  count: number;
  categories: string[];
}

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bharatmart');

async function fixCategoryLevels(): Promise<void> {
  try {
    console.log('Starting category level fix...');
    
    // Get all categories
    const categories = await Category.find({}).sort({ level: 1 });
    console.log(`Found ${categories.length} categories to process`);
    
    let updatedCount = 0;
    
    for (const category of categories) {
      let needsUpdate = false;
      let newLevel = 0;
      
      // Calculate correct level based on parent
      if (category.parent) {
        const parent = await Category.findById(category.parent);
        if (parent) {
          newLevel = parent.level + 1;
        } else {
          // Parent doesn't exist, remove parent reference
          category.parent = null;
          newLevel = 0;
          needsUpdate = true;
        }
      } else {
        newLevel = 0;
      }
      
      // Update if level is different or parent was removed
      if (category.level !== newLevel || needsUpdate) {
        category.level = newLevel;
        await category.save();
        updatedCount++;
        console.log(`Updated category "${category.name}" to level ${newLevel}`);
      }
    }
    
    console.log(`\n✅ Category level fix completed!`);
    console.log(`Updated ${updatedCount} categories out of ${categories.length} total`);
    
    // Verify the fix
    const levelStats = await Category.aggregate<LevelStat>([
      {
        $group: {
          _id: '$level',
          count: { $sum: 1 },
          categories: { $push: '$name' }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    console.log('\n📊 Level distribution after fix:');
    levelStats.forEach(stat => {
      console.log(`Level ${stat._id}: ${stat.count} categories`);
    });
    
  } catch (error) {
    console.error('Error fixing category levels:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
}

// Run the migration
fixCategoryLevels();
