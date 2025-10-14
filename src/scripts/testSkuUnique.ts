import mongoose from 'mongoose';
import Product from '../models/Product';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/bharatmart_test';

async function run(): Promise<void> {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to DB');

    // Clean up test products with this SKU
    const testSku = 'TEST-SKU-123';
    await Product.deleteMany({ sku: testSku });

    // Insert first product
    const p1 = new Product({
      name: 'Test Product 1',
      category: 'Test',
      sku: testSku,
      mrp: 100,
      price: { regular: 100 },
      weight: { value: 1, unit: 'g' },
      inventory: { quantity: 10 }
    });
    await p1.save();
    console.log('Saved first product');

    // Attempt to insert second product with same SKU
    const p2 = new Product({
      name: 'Test Product 2',
      category: 'Test',
      sku: testSku,
      mrp: 120,
      price: { regular: 120 },
      weight: { value: 1, unit: 'g' },
      inventory: { quantity: 5 }
    });

    try {
      await p2.save();
      console.log('Saved second product (unexpected)');
    } catch (err) {
      const error = err as mongoose.Error;
      console.error('Error saving second product (expected):', error && error.message);
      if (error.name === 'MongoServerError' && (error as any).code === 11000) {
        console.error('Duplicate key error code 11000 as expected');
      }
    }

    // Cleanup
    await Product.deleteMany({ sku: testSku });
    await mongoose.disconnect();
    console.log('Disconnected');
  } catch (err) {
    console.error('Test failed:', err);
    process.exit(1);
  }
}

run();
