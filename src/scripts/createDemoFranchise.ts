import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import Franchise from '../models/Franchise';

dotenv.config();

interface DemoFranchiseData {
  name: string;
  description: string;
  industry: string;
  email: string;
  phone?: string;
  contactPerson: string;
  password: string;
  isVerified: boolean;
  isActive: boolean;
}

async function createDemoFranchise(): Promise<void> {
  try {
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://bharatmart-backend:YhfkY0d30O7G6RqC@bmbackend.qmcvt6e.mongodb.net/';
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // Check if demo franchise already exists
    const existingFranchise = await Franchise.findOne({ email: 'demo-franchise@bharatmart.com' });
    if (existingFranchise) {
      console.log('Demo franchise already exists. Removing existing...');
      await Franchise.deleteOne({ email: 'demo-franchise@bharatmart.com' });
    }

    const demoFranchiseData: DemoFranchiseData = {
      name: 'BharatMart Demo Franchise',
      description: 'Demo franchise for testing purposes',
      industry: 'Retail',
      email: 'demo-franchise@bharatmart.com',
      phone: '+91-9876543210',
      contactPerson: 'Demo Franchise Owner',
      password: 'demo123', // You can change this to any password you want
      isVerified: true,
      isActive: true,
    };

    // Hash password
    const salt = await bcrypt.genSalt(10);
    demoFranchiseData.password = await bcrypt.hash(demoFranchiseData.password, salt);

    // Create the franchise
    const franchise = new Franchise({
      ...demoFranchiseData,
      mustChangePassword: false, // Set to true if you want them to change on first login
    });

    await franchise.save();

    console.log('✅ Demo franchise created successfully!');
    console.log('\n📝 Login credentials:');
    console.log('📧 Email: demo-franchise@bharatmart.com');
    console.log('🔑 Password: demo123');
    console.log('📋 Industry: Retail');
    console.log('👤 Contact: Demo Franchise Owner');

    console.log('\n🚀 You can now login to the franchise portal with these credentials.');

    await mongoose.connection.close();
    console.log('\nMongoDB connection closed.');
  } catch (error) {
    console.error('❌ Error creating demo franchise:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  createDemoFranchise();
}

export default createDemoFranchise;