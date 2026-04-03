import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Profile from '../models/Profile.js';

dotenv.config();

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://arghyanextbusinesssolution_db_user:HIoHvpDclQ9ei0NO@cluster0.ulsxizj.mongodb.net/?appName=Cluster0';

async function approveAllProfiles() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find all complete but unapproved profiles
    const profiles = await Profile.find({
      isComplete: true,
      isApproved: false
    });

    console.log(`📋 Found ${profiles.length} profiles to approve`);

    if (profiles.length === 0) {
      console.log('✅ No profiles need approval');
      process.exit(0);
    }

    // Approve all profiles
    let approved = 0;
    for (const profile of profiles) {
      profile.isApproved = true;
      profile.approvalStatus = 'approved';
      await profile.save();
      approved++;
      console.log(`✅ Approved profile: ${profile.name} (${profile.user})`);
    }

    console.log(`\n🎉 Successfully approved ${approved} profiles!`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

approveAllProfiles();
