// Regenerate low-quality quizzes (the ones the old fallback generator produced
// with duplicated options) using the improved local generator.
// Force local generation so ALL are fixed in one run with no rate-limit issues.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Quiz = require('../models/quizModel');
const Lesson = require('../models/lessonModel');
const { localGenerateQuiz } = require('../services/aiService');

const connectDB = async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/Dex_Elearning';
  await mongoose.connect(uri);
  console.log('MongoDB connected for quiz regeneration.');
};

const isLowQuality = (questions) => {
  return questions.some(
    (q) =>
      (q.options && new Set(q.options).size < 2) ||
      /which of the following is correct/i.test(q.question || '')
  );
};

const seed = async () => {
  try {
    await connectDB();

    const quizzes = await Quiz.find().populate('lesson', 'rawText summary');
    let fixed = 0;
    let skipped = 0;

    for (const quiz of quizzes) {
      if (!isLowQuality(quiz.questions || [])) {
        skipped++;
        continue;
      }
      const lesson = quiz.lesson;
      const source = lesson?.rawText || lesson?.summary || '';
      const questions = localGenerateQuiz(source);
      if (questions.length === 0) {
        console.log(`  - SKIP (no text) ${lesson?.title || quiz._id}`);
        continue;
      }
      quiz.questions = questions;
      quiz.markModified('questions');
      await quiz.save();
      fixed++;
      console.log(`  ✓ fixed [${questions.length}q] ${lesson?.title || quiz._id}`);
    }

    console.log(`\n🎉 Done. Fixed ${fixed} quizzes, skipped ${skipped} (already good).`);
    process.exit(0);
  } catch (err) {
    console.error('Quiz regeneration error:', err);
    process.exit(1);
  }
};

seed();