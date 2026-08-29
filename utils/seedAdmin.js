require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/registerModel');

const connectDB = async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/Dex_Elearning';
  await mongoose.connect(uri);
  console.log('MongoDB connected for seeding admin account.');
};

const seed = async () => {
  try {
    await connectDB();

    // Customize these credentials before running.
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@dexelearning.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@12345';
    const adminFullname = process.env.ADMIN_FULLNAME || 'Platform Admin';

    const existing = await User.findOne({ email: adminEmail.toLowerCase().trim() });
    if (existing) {
      if (existing.role === 'admin') {
        console.log(`Admin already exists for ${adminEmail} (role: admin). No changes made.`);
        process.exit(0);
      }
      existing.role = 'admin';
      existing.isActive = true;
      await existing.save();
      console.log(`Promoted existing user ${adminEmail} to admin.`);
      process.exit(0);
    }

    const hashedPassword = await bcrypt.hash(adminPassword, 7);
    await User.create({
      fullname: adminFullname,
      email: adminEmail.toLowerCase().trim(),
      password: hashedPassword,
      isActive: true,
      role: 'admin',
    });

    console.log('Admin account created successfully:');
    console.log(`  Email:    ${adminEmail.toLowerCase().trim()}`);
    console.log(`  Password: ${adminPassword}`);
    console.log('You can now log in and access /admin (Admin Portal).');
    process.exit(0);
  } catch (err) {
    console.error('Seeding admin error:', err);
    process.exit(1);
  }
};

seed();
