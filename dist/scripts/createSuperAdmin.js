"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const dotenv_1 = __importDefault(require("dotenv"));
const User_1 = __importDefault(require("../models/User"));
dotenv_1.default.config();
const createSuperAdmin = async () => {
    try {
        // Connect to MongoDB
        await mongoose_1.default.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');
        // Check if superadmin already exists
        const existingSuperAdmin = await User_1.default.findOne({ role: 'superadmin' });
        if (existingSuperAdmin) {
            console.log('Superadmin already exists!');
            console.log('Email:', existingSuperAdmin.email);
            console.log('You can use the existing superadmin account or create a new one.');
            process.exit(0);
        }
        // Create superadmin user
        const superAdminData = {
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
        const salt = await bcryptjs_1.default.genSalt(12);
        superAdminData.password = await bcryptjs_1.default.hash(superAdminData.password, salt);
        // Create user
        const superAdmin = new User_1.default(superAdminData);
        await superAdmin.save();
        console.log('✅ Superadmin created successfully!');
        console.log('📧 Email:', superAdminData.email);
        console.log('🔑 Password:', 'superadmin123');
        console.log('👤 Role: Superadmin');
        console.log('\n🚀 You can now login to the admin dashboard with these credentials.');
    }
    catch (error) {
        console.error('❌ Error creating superadmin:', error.message);
    }
    finally {
        await mongoose_1.default.disconnect();
        console.log('Disconnected from MongoDB');
        process.exit(0);
    }
};
// Run the script
createSuperAdmin();
//# sourceMappingURL=createSuperAdmin.js.map