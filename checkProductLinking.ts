// Product Linking Status Checker
// Run this in your backend to check which products need linking

import mongoose from 'mongoose';
import FranchiseProduct from './src/models/Franchise/FranchiseProduct';
import Product from './src/models/Product/Product';
import dotenv from 'dotenv';

dotenv.config();

async function checkProductLinkingStatus() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bharatmart');
    console.log('✅ Connected to MongoDB\n');

    // Get all franchise products
    const franchiseProducts = await FranchiseProduct.find({})
      .select('name sku stock minStock bharatmartProductId franchise')
      .populate('franchise', 'name')
      .lean();

    // Separate linked and unlinked
    const linked = franchiseProducts.filter(p => p.bharatmartProductId);
    const unlinked = franchiseProducts.filter(p => !p.bharatmartProductId);

    console.log('📊 PRODUCT LINKING STATUS REPORT');
    console.log('================================\n');

    console.log(`📦 Total Franchise Products: ${franchiseProducts.length}`);
    console.log(`✅ Linked Products: ${linked.length} (${((linked.length / franchiseProducts.length) * 100).toFixed(1)}%)`);
    console.log(`⚠️  Unlinked Products: ${unlinked.length} (${((unlinked.length / franchiseProducts.length) * 100).toFixed(1)}%)`);
    console.log('\n');

    // Show low stock unlinked products (these need immediate attention)
    const lowStockUnlinked = unlinked.filter(p => p.stock <= p.minStock);
    
    if (lowStockUnlinked.length > 0) {
      console.log('🚨 LOW STOCK PRODUCTS THAT NEED LINKING (High Priority):');
      console.log('--------------------------------------------------\n');
      lowStockUnlinked.forEach((product, index) => {
        console.log(`${index + 1}. ${product.name}`);
        console.log(`   SKU: ${product.sku}`);
        console.log(`   Stock: ${product.stock} / Min: ${product.minStock}`);
        console.log(`   Franchise: ${product.franchise?.name || 'Unknown'}`);
        console.log(`   ID: ${product._id}`);
        console.log('');
      });
    }

    // Show all unlinked products
    if (unlinked.length > 0) {
      console.log('\n📋 ALL UNLINKED PRODUCTS:');
      console.log('----------------------\n');
      unlinked.forEach((product, index) => {
        const stockStatus = product.stock <= product.minStock ? '🔴 LOW' : '🟢 OK';
        console.log(`${index + 1}. ${product.name} (${product.sku}) - Stock: ${product.stock} ${stockStatus}`);
        console.log(`   ID: ${product._id}`);
      });
    }

    // Suggest potential matches
    console.log('\n\n🔍 FINDING POTENTIAL MATCHES BY SKU...\n');
    
    const mainProducts = await Product.find({})
      .select('name sku _id')
      .lean();

    let matchCount = 0;
    for (const fp of unlinked) {
      const match = mainProducts.find(mp => mp.sku === fp.sku);
      if (match) {
        matchCount++;
        console.log(`✅ MATCH FOUND:`);
        console.log(`   Franchise Product: ${fp.name} (${fp.sku})`);
        console.log(`   Main Product: ${match.name} (${match.sku})`);
        console.log(`   
   Link Command:
   db.franchiseproducts.updateOne(
     { _id: ObjectId("${fp._id}") },
     { $set: { bharatmartProductId: ObjectId("${match._id}") } }
   )\n`);
      }
    }

    if (matchCount === 0) {
      console.log('⚠️  No automatic matches found by SKU.');
      console.log('   You will need to link products manually.\n');
    } else {
      console.log(`\n✅ Found ${matchCount} potential matches!`);
      console.log('   Copy the commands above to link them.\n');
    }

    // Generate bulk linking script
    if (matchCount > 0) {
      console.log('\n📝 BULK LINKING SCRIPT (MongoDB Shell):');
      console.log('======================================\n');
      console.log('// Copy and paste this into MongoDB shell:\n');
      
      for (const fp of unlinked) {
        const match = mainProducts.find(mp => mp.sku === fp.sku);
        if (match) {
          console.log(`db.franchiseproducts.updateOne({ _id: ObjectId("${fp._id}") }, { $set: { bharatmartProductId: ObjectId("${match._id}") } });`);
        }
      }
      console.log('\n');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

// Run the checker
checkProductLinkingStatus();
