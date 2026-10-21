// One-off utility: remove a user by email (and their enrollments/quiz attempts)
// Usage: node utils/removeUserByEmail.js someone@example.com
require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');
const User = require('../models/registerModel');
const Enrollment = require('../models/enrollmentModel');
const QuizAttempt = require('../models/quizAttemptModel');

const email = (process.argv[2] || '').toLowerCase().trim();

const run = async () => {
  if (!email || !email.includes('@')) {
    console.error('Usage: node utils/removeUserByEmail.js <email>');
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/Dex_Elearning';
  await mongoose.connect(uri);
  console.log('Connected to MongoDB.');

  const user = await User.findOne({ email });
  if (!user) {
    console.log(`No user found with email ${email}. Nothing to remove.`);
    await mongoose.disconnect();
    process.exit(0);
  }

  console.log(`Found: ${user.fullname} <${user.email}> (role: ${user.role}, active: ${user.isActive})`);

  const [enrollments, attempts] = await Promise.all([
    Enrollment.deleteMany({ user: user._id }),
    QuizAttempt.deleteMany({ user: user._id }),
  ]);
  await User.findByIdAndDelete(user._id);

  console.log(`Removed user, ${enrollments.deletedCount} enrollment(s), ${attempts.deletedCount} quiz attempt(s).`);
  console.log(`Email ${email} is now free.`);
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
