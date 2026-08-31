// Backfill script: generate an AI quiz for every lesson that doesn't have one.
// Uses the same generateQuiz() the admin upload flow uses (Gemini, JSON mode).
// Run with: npm run seed:quizzes
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Lesson = require('../models/lessonModel');
const Quiz = require('../models/quizModel');
const { generateQuiz } = require('../services/aiService');

const connectDB = async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/Dex_Elearning';
  await mongoose.connect(uri);
  console.log('MongoDB connected for quiz backfill.');
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const seed = async () => {
  try {
    await connectDB();

    const lessons = await Lesson.find().sort({ _id: 1 });
    const missing = [];
    for (const lesson of lessons) {
      const has = await Quiz.findOne({ lesson: lesson._id });
      if (!has) missing.push(lesson);
    }

    console.log(`Total lessons: ${lessons.length} | missing quizzes: ${missing.length}`);

    let created = 0;
    let failed = 0;

    for (const lesson of missing) {
      const source = lesson.rawText || lesson.summary || '';
      try {
        const questions = await generateQuiz(source);
        if (questions.length === 0) throw new Error('No questions generated');
        await Quiz.create({
          lesson: lesson._id,
          course: lesson.course,
          title: `Quiz: ${lesson.title}`,
          passingScore: 50,
          questions,
        });
        created++;
        console.log(`  ✓ ${lesson.title}`);
      } catch (err) {
        failed++;
        console.error(`  ✗ ${lesson.title}: ${err.message}`);
      }
      await sleep(500); // be gentle with free-tier rate limits
    }

    console.log(`\n🎉 Done. ${created} quizzes created, ${failed} failed.`);
    process.exit(failed > 0 && created === 0 ? 1 : 0);
  } catch (err) {
    console.error('Quiz backfill error:', err);
    process.exit(1);
  }
};

seed();