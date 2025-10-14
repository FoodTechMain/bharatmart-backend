"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const Category_1 = __importDefault(require("../models/Category"));
// Connect to MongoDB
mongoose_1.default.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bharatmart');
async function fixCategoryLevels() {
    try {
        console.log('Starting category level fix...');
        // Get all categories
        const categories = await Category_1.default.find({}).sort({ level: 1 });
        console.log(`Found ${categories.length} categories to process`);
        let updatedCount = 0;
        for (const category of categories) {
            let needsUpdate = false;
            let newLevel = 0;
            // Calculate correct level based on parent
            if (category.parent) {
                const parent = await Category_1.default.findById(category.parent);
                if (parent) {
                    newLevel = parent.level + 1;
                }
                else {
                    // Parent doesn't exist, remove parent reference
                    category.parent = null;
                    newLevel = 0;
                    needsUpdate = true;
                }
            }
            else {
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
        const levelStats = await Category_1.default.aggregate([
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
    }
    catch (error) {
        console.error('Error fixing category levels:', error);
    }
    finally {
        await mongoose_1.default.connection.close();
        console.log('Database connection closed');
    }
}
// Run the migration
fixCategoryLevels();
//# sourceMappingURL=fixCategoryLevels.js.map