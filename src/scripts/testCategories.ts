import mongoose from 'mongoose';
import dotenv from 'dotenv';
import ManufacturerCategory, { IManufacturerCategory } from '../models/ManufacturerCategory';

dotenv.config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bharatmart')
  .then(async () => {
    console.log('Connected to MongoDB for testing');
    
    // Test 1: Get all main categories
    console.log('\n--- Test 1: Get all main categories ---');
    const mainCategories = await ManufacturerCategory.find({ parent: null }).sort({ name: 1 });
    console.log(`Found ${mainCategories.length} main categories`);
    mainCategories.forEach(cat => console.log(`- ${cat.name}`));
    
    // Test 2: Get all categories with hierarchy
    console.log('\n--- Test 2: Get categories with hierarchy ---');
    const allCategories = await ManufacturerCategory.find().sort({ name: 1 });
    const mainCats = allCategories.filter(cat => !cat.parent);
    const subCats = allCategories.filter(cat => cat.parent);
    
    for (const mainCat of mainCats) {
      console.log(`\nMain Category: ${mainCat.name}`);
      const subcategories = subCats.filter(subCat => 
        subCat.parent && subCat.parent.toString() === mainCat._id.toString()
      );
      for (const subCat of subcategories) {
        console.log(`  - ${subCat.name}`);
      }
      console.log(`  Total subcategories: ${subcategories.length}`);
    }
    
    // Test 3: Get a specific category and its subcategories
    console.log('\n--- Test 3: Get first category and its subcategories ---');
    if (mainCategories.length > 0) {
      const firstMainCategory = mainCategories[0];
      console.log(`Main Category: ${firstMainCategory.name}`);
      
      const subcategories = await ManufacturerCategory.find({ parent: firstMainCategory._id }).sort({ name: 1 });
      console.log(`Found ${subcategories.length} subcategories:`);
      subcategories.forEach(sub => console.log(`  - ${sub.name}`));
    }
    
    console.log('\n--- All tests completed successfully! ---');
    process.exit(0);
  })
  .catch((error) => {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  });
