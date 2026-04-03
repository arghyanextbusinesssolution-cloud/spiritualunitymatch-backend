import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';

// Load environment variables
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://arghyanextbusinesssolution_db_user:HIoHvpDclQ9ei0NO@cluster0.ulsxizj.mongodb.net/?appName=Cluster0';

async function seedAdmin() {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: 'admin@platform.com' });

    if (existingAdmin) {
      console.log('⚠️  Admin user already exists');
      // Update password in case it changed
      existingAdmin.password = 'Admin@12345';
      await existingAdmin.save();
      console.log('✅ Admin password updated');
    } else {
      // Create admin user
      const admin = await User.create({
        email: 'admin@platform.com',
        password: 'Admin@12345',
        role: 'admin',
        isEmailVerified: true
      });
      console.log('✅ Admin user created:', admin.email);
    }

    console.log('✅ Admin seeding completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding admin:', error);
    process.exit(1);
  }
}

seedAdmin();

