// Enrich the imported REB primary "Notes" lessons with AI-generated
// summary + study notes + quiz. Resumable, per-grade, with provider fallback.
//
// Usage:
//   node utils/reb_primary_ai_enrich.js --provider anthropic
//   node utils/reb_primary_ai_enrich.js --provider anthropic --grade P1 --limit 2
//   node utils/reb_primary_ai_enrich.js --provider gemini --force
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Course = require('../models/courseModel');
const Lesson = require('../models/lessonModel');
const Quiz = require('../models/quizModel');
const { generateLessonFromSection } = require('../services/aiService');

const args = process.argv.slice(2);
const getArg = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const has = (name) => args.includes(name);

const primary = (getArg('--provider', 'anthropic') || 'anthropic').toLowerCase();
const secondary = primary === 'anthropic' ? 'gemini' : 'anthropic';
const gradeFilter = getArg('--grade', null);
const limit = Number(getArg('--limit', '0')) || 0;
const force = has('--force');
const delayMs = Number(getArg('--delay', '1500')) || 1500;
const retries = Math.max(1, Number(getArg('--retries', '3')) || 3);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function callProvider(lesson, course, provider) {
  let providerError = false;
  const origError = console.error;
  console.error = (...a) => {
    const msg = a.map(String).join(' ');
    if (/(section lesson error|study-notes error|summary error|quiz error)/i.test(msg)) {
      providerError = true;
    }
    origError(...a);
  };
  try {
    const result = await generateLessonFromSection(
      lesson.rawText,
      { title: course.title },
      provider
    );
    const valid =
      result &&
      result.summary &&
      result.studyNotes &&
      (result.studyNotes.keyPoints || []).length >= 3 &&
      (result.studyNotes.overview || '').length >= 20 &&
      Array.isArray(result.quiz) &&
      result.quiz.length >= 3;
    return { result: valid ? result : null, providerError };
  } finally {
    console.error = origError;
  }
}

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/Dex_Elearning';
  await mongoose.connect(uri);
  console.log('MongoDB connected:', mongoose.connection.host, '/', mongoose.connection.db.databaseName);
  console.log(`Primary provider: ${primary} | fallback: ${secondary}`);

  const query = { title: / Notes$/ };
  if (gradeFilter) query.gradeLevel = `Primary ${String(gradeFilter).replace(/\D/g, '')}`;
  let courses = await Course.find(query).sort({ gradeLevel: 1, title: 1 });
  if (limit) courses = courses.slice(0, limit);
  console.log(`Courses to enrich: ${courses.length}`);

  let done = 0;
  let skipped = 0;
  let failed = [];

  for (let i = 0; i < courses.length; i++) {
    const course = courses[i];
    const lesson = await Lesson.findOne({ course: course._id, chapter: 1 });
    if (!lesson || !lesson.rawText || lesson.rawText.length < 500) {
      console.log(`[skip] ${course.title} — no usable rawText`);
      skipped++;
      continue;
    }

    const existingQuiz = await Quiz.findOne({ lesson: lesson._id });
    const already =
      lesson.aiProvider &&
      lesson.studyNotes &&
      (lesson.studyNotes.keyPoints || []).length >= 3 &&
      existingQuiz &&
      (existingQuiz.questions || []).length >= 3;
    if (already && !force) {
      console.log(`[skip] ${course.title} — already AI-enriched (${lesson.aiProvider})`);
      skipped++;
      continue;
    }

    console.log(`\n[${i + 1}/${courses.length}] ${course.title} (${lesson.wordCount} words)`);

    let used = null;
    let result = null;
    for (const provider of [primary, secondary]) {
      for (let attempt = 1; attempt <= retries; attempt++) {
        const started = Date.now();
        const out = await callProvider(lesson, course, provider);
        const secs = Math.round((Date.now() - started) / 100) / 10;
        if (out.result && !out.providerError) {
          used = provider;
          result = out.result;
          console.log(`  ${provider}: ok in ${secs}s (attempt ${attempt}/${retries})`);
          break;
        }
        console.log(`  ${provider}: failed/fallback in ${secs}s (attempt ${attempt}/${retries})`);
        if (attempt < retries) await sleep(5000 * attempt);
      }
      if (result) break;
      await sleep(800);
    }

    if (!result) {
      console.log(`  FAILED — keeping existing local notes`);
      failed.push(course.title);
      await sleep(delayMs);
      continue;
    }

    lesson.summary = result.summary;
    lesson.studyNotes = {
      overview: result.studyNotes.overview || '',
      keyPoints: result.studyNotes.keyPoints || [],
      vocabulary: (result.studyNotes.vocabulary || []).filter((v) => v && v.term && v.definition),
      keyFacts: result.studyNotes.keyFacts || [],
    };
    lesson.aiProvider = used;
    await lesson.save();

    const questions = result.quiz
      .filter((q) => q && q.question && Array.isArray(q.options) && q.options.length >= 2)
      .map((q) => {
        const options = q.options.slice(0, 4);
        const idx = Math.max(0, Math.min(Number(q.correctIndex) || 0, options.length - 1));
        return { question: q.question, options, correctIndex: idx };
      });

    if (!questions.length) {
      console.log(`  no valid quiz questions — lesson notes saved without quiz`);
    } else {
      await Quiz.findOneAndUpdate(
        { lesson: lesson._id },
        {
          lesson: lesson._id,
          course: course._id,
          title: `Chapter 1 Quiz - ${course.title}`,
          passingScore: 50,
          questions,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    done++;
    console.log(
      `  saved: ${lesson.studyNotes.keyPoints.length} key points, ${lesson.studyNotes.vocabulary.length} vocab, ${questions.length} questions (${used})`
    );
    await sleep(delayMs);
  }

  console.log('\n=== Enrichment summary ===');
  console.log(`Updated: ${done} | Skipped: ${skipped} | Failed: ${failed.length}`);
  if (failed.length) failed.forEach((f) => console.log('  -', f));
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error('Enrichment crashed:', e);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});
