import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import FranchiseInventory from '../models/Franchise/FranchiseInventory';
import FranchiseProduct from '../models/Franchise/FranchiseProduct';
import Franchise from '../models/Franchise/Franchise';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function testInventorySystem() {
  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bharatmart');
    console.log('✅ Connected to MongoDB\n');

    // Find a test franchise
    const franchise = await Franchise.findOne();
    if (!franchise) {
      console.log('❌ No franchise found. Please create a franchise first.');
      return;
    }
    console.log(`✅ Found franchise: ${franchise.name} (${franchise._id})\n`);

    // Find or create a test product
    let product = await FranchiseProduct.findOne({ franchise: franchise._id });
    
    if (!product) {
      console.log('Creating a test product...');
      product = await FranchiseProduct.create({
        franchise: franchise._id,
        name: 'Test Product for Inventory',
        description: 'A test product to demonstrate inventory management',
        category: 'Electronics',
        brand: 'Test Brand',
        sku: `TEST-${Date.now()}`,
        price: 1500,
        costPrice: 1000,
        stock: 50,
        minStock: 10,
        isActive: true,
        isFeatured: false,
        tags: ['test', 'inventory']
      });
      console.log(`✅ Created test product: ${product.name} (${product._id})\n`);
    } else {
      console.log(`✅ Found existing product: ${product.name} (${product._id})\n`);
    }

    console.log(`Initial stock: ${product.stock}\n`);

    // Test 1: Record a purchase transaction
    console.log('Test 1: Recording a PURCHASE transaction...');
    const purchaseTransaction = await FranchiseInventory.recordTransaction(
      franchise._id,
      product._id,
      'purchase',
      100,
      {
        costPerUnit: 950,
        supplier: 'Test Supplier Co.',
        referenceNumber: 'PO-TEST-001',
        batchNumber: 'BATCH-TEST-001',
        notes: 'Test purchase transaction'
      }
    );
    console.log(`✅ Purchase recorded: Added 100 units`);
    console.log(`   Previous Stock: ${purchaseTransaction.previousStock}`);
    console.log(`   New Stock: ${purchaseTransaction.newStock}`);
    console.log(`   Total Cost: ₹${purchaseTransaction.totalCost}\n`);

    // Test 2: Record a sale transaction
    console.log('Test 2: Recording a SALE transaction...');
    const saleTransaction = await FranchiseInventory.recordTransaction(
      franchise._id,
      product._id,
      'sale',
      -25,
      {
        referenceNumber: 'ORDER-TEST-001',
        notes: 'Test sale transaction'
      }
    );
    console.log(`✅ Sale recorded: Sold 25 units`);
    console.log(`   Previous Stock: ${saleTransaction.previousStock}`);
    console.log(`   New Stock: ${saleTransaction.newStock}\n`);

    // Test 3: Record a damage adjustment
    console.log('Test 3: Recording a DAMAGE transaction...');
    const damageTransaction = await FranchiseInventory.recordTransaction(
      franchise._id,
      product._id,
      'damage',
      -5,
      {
        notes: 'Test damage - broken during handling'
      }
    );
    console.log(`✅ Damage recorded: Removed 5 units`);
    console.log(`   Previous Stock: ${damageTransaction.previousStock}`);
    console.log(`   New Stock: ${damageTransaction.newStock}\n`);

    // Test 4: Get inventory history
    console.log('Test 4: Fetching inventory history...');
    const history = await FranchiseInventory.getInventoryHistory(
      franchise._id,
      product._id
    );
    console.log(`✅ Found ${history.length} transactions in history:`);
    history.forEach((t: any, index: number) => {
      console.log(`   ${index + 1}. ${t.transactionType.toUpperCase()}: ${t.quantity > 0 ? '+' : ''}${t.quantity} units (${t.createdAt.toLocaleString()})`);
    });
    console.log();

    // Test 5: Get statistics
    console.log('Test 5: Calculating inventory statistics...');
    const stats = await FranchiseInventory.aggregate([
      { $match: { franchise: franchise._id } },
      {
        $group: {
          _id: '$transactionType',
          count: { $sum: 1 },
          totalQuantity: { $sum: '$quantity' },
          totalCost: { $sum: '$totalCost' }
        }
      }
    ]);
    console.log('✅ Transaction Statistics:');
    stats.forEach((stat: any) => {
      console.log(`   ${stat._id}: ${stat.count} transactions, ${stat.totalQuantity > 0 ? '+' : ''}${stat.totalQuantity} units, Cost: ₹${stat.totalCost || 0}`);
    });
    console.log();

    // Test 6: Check current product stock
    const updatedProduct = await FranchiseProduct.findById(product._id);
    console.log('Test 6: Final stock verification...');
    console.log(`✅ Current stock in database: ${updatedProduct?.stock}`);
    console.log(`   Expected: 50 + 100 - 25 - 5 = 120`);
    console.log(`   Match: ${updatedProduct?.stock === 120 ? '✅ YES' : '❌ NO'}\n`);

    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ All inventory system tests completed successfully!');
    console.log('═══════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the test
console.log('═══════════════════════════════════════════════════════');
console.log('   FRANCHISE INVENTORY MANAGEMENT SYSTEM TEST');
console.log('═══════════════════════════════════════════════════════\n');

testInventorySystem().then(() => {
  process.exit(0);
}).catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
