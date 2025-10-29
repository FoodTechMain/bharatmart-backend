import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import User, { IUser } from '../models/User/User';

dotenv.config();

interface SuperAdminData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: 'superadmin';
  phone: string;
  address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  isEmailVerified: boolean;
  isActive: boolean;
}

const createSuperAdmin = async (): Promise<void> => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI!);
    console.log('Connected to MongoDB');

    // Check if superadmin already exists
    const existingSuperAdmin = await User.findOne({ role: 'superadmin' });
    
    if (existingSuperAdmin) {
      console.log('Superadmin already exists!');
      console.log('Email:', existingSuperAdmin.email);
      console.log('You can use the existing superadmin account or create a new one.');
      process.exit(0);
    }

    // Create superadmin user
    const superAdminData: SuperAdminData = {
      firstName: 'Super',
      lastName: 'Admin',
      email: 'superadmin1@bharatmart.com',
      password: 'superadmin123',
      role: 'superadmin',
      phone: '+91-9876543210',
      address: {
        street: '123 Admin Street',
        city: 'Mumbai',
        state: 'Maharashtra',
        zipCode: '400001',
        country: 'India'
      },
      isEmailVerified: true,
      isActive: true
    };

    // Hash password
    const salt = await bcrypt.genSalt(12);
    superAdminData.password = await bcrypt.hash(superAdminData.password, salt);

    // Create user
    const superAdmin = new User(superAdminData);
    await superAdmin.save();

    console.log('✅ Superadmin created successfully!');
    console.log('📧 Email:', superAdminData.email);
    console.log('🔑 Password:', 'superadmin123');
    console.log('👤 Role: Superadmin');
    console.log('\n🚀 You can now login to the admin dashboard with these credentials.');

  } catch (error) {
    console.error('❌ Error creating superadmin:', (error as Error).message);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    process.exit(0);
  }
};

// Run the script
createSuperAdmin();
