// Create (or promote) an SEO editor account that can manage blogs at /seo
// Usage: node scripts/create-seo-user.js <email> <password>
// Optional: DB_NAME=test node scripts/create-seo-user.js ...  (target a specific database)
import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../models/User.js';
import validator from 'validator';

const [email, password] = process.argv.slice(2);

if (!email || !password) {
  console.error('Usage: node scripts/create-seo-user.js <email> <password>');
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI, process.env.DB_NAME ? { dbName: process.env.DB_NAME } : {});
console.log(`🔌 Connected to database: ${mongoose.connection.name}`);

try {
  // Same normalization as /api/auth/register and /login (express-validator normalizeEmail):
  // e.g. Gmail dots are removed, so the login lookup matches.
  const normalizedEmail = validator.normalizeEmail(email.trim());
  let user = await User.findOne({ email: normalizedEmail });

  if (user) {
    user.role = 'seo';
    user.password = password; // re-hashed by the pre-save hook
    await user.save();
    console.log(`✅ Existing user ${normalizedEmail} updated to role "seo" (password reset)`);
  } else {
    user = await User.create({
      email: normalizedEmail,
      password,
      role: 'seo',
      isEmailVerified: true
    });
    console.log(`✅ SEO user created: ${normalizedEmail} (id ${user._id})`);
  }
} catch (error) {
  console.error('❌ Failed to create SEO user:', error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
