"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const dotenv_1 = __importDefault(require("dotenv"));
const ProductCategory_1 = __importDefault(require("../models/ProductCategory"));
dotenv_1.default.config();
const categories = [
    'Fruits',
    'Vegetables',
    'Dairy',
    'Breakfast',
    'Bakery',
    'Biscuits',
    'Munchies',
    'Snacks',
    'Cold Drinks',
    'Juices',
    'Tea',
    'Coffee',
    'Health Drinks',
    'Instant Food',
    'Frozen Food',
    'Atta',
    'Rice',
    'Oil',
    'Dals',
    'Masala',
    'Dry Fruits',
    'Sweet Cravings',
    'Ice Creams',
    'Baby Care',
    'Baby Food',
    'Beauty',
    'Personal Care',
    'Pet Care',
    'Household Essentials',
    'Cleaning Supplies',
    'Home Care',
    'Stationery',
    'Electronics',
    'Mobiles',
    'Accessories',
    'Magazines',
    'Meat',
    'Chicken',
    'Fish',
    'Eggs',
    'Bread',
    'Pulses',
    'Cooking Essentials',
    'Condiments',
    'Sauces',
    'Chocolates',
    'Desserts',
    'Sweets',
    'Ready-to-Cook',
    'Ready-to-Eat',
    'Beverages',
    'Hair Care',
    'Skin Care',
    'Oral Care',
    'Health & Wellness',
    'First Aid',
    'Feminine Hygiene',
    'Laundry',
    'Detergents',
    'Tissues',
    'Paper Products'
];
async function upsertCategories() {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/bharatmart';
    await mongoose_1.default.connect(uri);
    console.log('Connected to MongoDB');
    try {
        for (const name of categories) {
            const trimmed = (name || '').trim();
            if (!trimmed)
                continue;
            const res = await ProductCategory_1.default.updateOne({ name: trimmed }, { $set: { name: trimmed } }, { upsert: true });
            console.log(`Upserted category: ${trimmed}`);
        }
        console.log('All categories processed');
    }
    catch (err) {
        console.error('Error upserting categories:', err);
    }
    finally {
        await mongoose_1.default.disconnect();
        console.log('Disconnected from MongoDB');
        process.exit(0);
    }
}
upsertCategories();
//# sourceMappingURL=insertProductCategories.js.map