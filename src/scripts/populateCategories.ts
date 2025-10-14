import mongoose from 'mongoose';
import dotenv from 'dotenv';
import ManufacturerCategory from '../models/ManufacturerCategory';

dotenv.config();

interface Category {
  name: string;
  subcategories: string[];
}

// Read the category data from the markdown file
const categoryData = `1. Fruits & Vegetables

Fresh Fruits

Fresh Vegetables

Herbs & Seasoning

Exotic Fruits & Veggies

Cut & Packaged Produce

2. Dairy & Bakery

Milk & Curd

Butter & Cheese

Ghee & Cream

Bread & Buns

Cakes, Cookies & Pastries

Paneer & Tofu

3. Staples & Grains

Atta, Flours & Sooji

Rice & Rice Products

Pulses & Dal

Edible Oils & Ghee

Salt, Sugar & Jaggery

Spices & Masala

Dry Fruits & Nuts

4. Snacks & Munchies

Chips & Namkeen

Biscuits & Cookies

Chocolates & Candies

Popcorn & Instant Snacks

Sweets & Indian Snacks

Energy Bars & Healthy Snacks

5. Beverages

Soft Drinks & Sodas

Juices & Fruit Drinks

Tea & Coffee

Energy & Sports Drinks

Health Drinks

Water & Flavored Water

6. Packaged Food

Instant Noodles, Pasta & Vermicelli

Soups & Cup Meals

Ready-to-Eat Meals

Sauces, Dips & Spreads

Breakfast Cereals & Oats

Jams, Honey & Peanut Butter

7. Frozen & Ready-to-Cook

Frozen Snacks (Fries, Nuggets, Patties)

Frozen Desserts & Ice Creams

Parathas, Momos & Dumplings

Veg & Non-Veg Ready-to-Cook Items

8. Personal Care

Hair Care (Shampoo, Conditioner, Oil)

Skin Care (Face Wash, Creams, Lotion)

Oral Care (Toothpaste, Toothbrush, Mouthwash)

Bath & Body (Soaps, Shower Gel)

Deodorants & Perfumes

Men's Grooming

Women's Hygiene (Sanitary Pads, Intimate Wash)

9. Home Care

Laundry Detergents & Fabric Care

Household Cleaners & Disinfectants

Dishwashing Liquids & Bars

Air Fresheners & Repellents

Paper Products (Tissues, Napkins)

Utility & Cleaning Tools

10. Baby Care

Baby Food & Formula

Diapers & Wipes

Baby Bath & Skincare

Feeding Bottles & Accessories

Baby Toys & Essentials

11. Pet Care

Dog Food

Cat Food

Pet Treats

Grooming & Hygiene

Toys & Accessories

12. Stationery & Office Supplies

Pens, Pencils & Markers

Notebooks & Diaries

Art & Craft Supplies

Files, Folders & Organizers

Printer Paper & Ink Supplies

13. Electronics & Accessories

Mobile Accessories (Cables, Chargers, Power Banks)

Earphones & Headphones

Smart Devices (Smart Bulbs, Plugs)

Small Appliances (Trimmers, Irons, Kettles)

Batteries & Extension Boards

14. Health & Wellness

OTC Medicines

Vitamins & Supplements

First Aid Supplies

Health Monitoring Devices (Thermometer, Oximeter)

Ayurvedic & Herbal Products

15. Gifting & Occasions

Chocolates & Gift Packs

Flowers & Bouquets

Greeting Cards

Festive Hampers

Seasonal Items (Rakhi, Diwali Gifts, etc.)

16. Special & Seasonal Collections

(Dynamic, based on trends or festivals)

Breakfast Essentials

Party Essentials

Rainy Season Picks

Summer Coolers

Festive Specials

Healthy Living Collection`;

// Function to parse the category data
function parseCategories(data: string): Category[] {
  const lines = data.split('\n');
  const categories: Category[] = [];
  let currentCategory: Category | null = null;
  let categoryNumber = 0;

  for (const line of lines) {
    const trimmedLine = line.trim();
    
    if (!trimmedLine) continue; // Skip empty lines
    
    // Check if it's a main category (starts with number followed by '.')
    const categoryMatch = trimmedLine.match(/^(\d+)\.\s+(.+)$/);
    if (categoryMatch) {
      categoryNumber = parseInt(categoryMatch[1]);
      currentCategory = {
        name: categoryMatch[2].trim(),
        subcategories: []
      };
      categories.push(currentCategory);
    } else if (currentCategory && trimmedLine && !trimmedLine.startsWith('(')) {
      // This is a subcategory (skip lines that start with parentheses like "(Dynamic, based on trends or festivals)")
      currentCategory.subcategories.push(trimmedLine);
    }
  }
  
  return categories;
}

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bharatmart')
  .then(async () => {
    console.log('Connected to MongoDB');
    
    // Clear existing categories
    await ManufacturerCategory.deleteMany({});
    console.log('Cleared existing categories');
    
    // Parse the category data
    const categories = parseCategories(categoryData);
    console.log(`Parsed ${categories.length} main categories`);
    
    // Create main categories and their subcategories
    for (const category of categories) {
      try {
        // Create main category
        const mainCategory = new ManufacturerCategory({
          name: category.name,
          level: 0,
          parent: null
        });
        
        await mainCategory.save();
        console.log(`Created main category: ${category.name}`);
        
        // Create subcategories
        for (const subcategoryName of category.subcategories) {
          const subcategory = new ManufacturerCategory({
            name: subcategoryName,
            level: 1,
            parent: mainCategory._id
          });
          
          await subcategory.save();
          
          // Update the main category to reference its subcategory
          await ManufacturerCategory.findByIdAndUpdate(mainCategory._id, {
            $push: { children: subcategory._id }
          });
          
          console.log(`  Created subcategory: ${subcategoryName}`);
        }
      } catch (error) {
        console.error(`Error creating category ${category.name}:`, (error as Error).message);
      }
    }
    
    console.log('Category population completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  });
