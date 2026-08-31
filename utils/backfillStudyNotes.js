// Backfill structured studyNotes for existing lessons that don't have them yet.
// Uses the local generator by default (no rate limits); set USE_GEMINI=1 to use Gemini.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Lesson = require('../models/lessonModel');
const { localStudyNotes, generateStudyNotes } = require('../services/aiService');

const useGemini = process.env.USE_GEMINI === '1';

(async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/Dex_Elearning';
  await mongoose.connect(uri);
  console.log('MongoDB connected. useGemini =', useGemini);

  const lessons = await Lesson.find();
  let updated = 0;
  let skipped = 0;

  for (const lesson of lessons) {
    // skip if already has non-empty study notes
    if (lesson.studyNotes && (lesson.studyNotes.keyPoints?.length || lesson.studyNotes.overview)) {
      skipped++;
      continue;
    }
    const source = lesson.rawText || lesson.summary || '';
    if (!source) {
      skipped++;
      continue;
    }
    const notes = useGemini ? await generateStudyNotes(source) : localStudyNotes(source);
    lesson.studyNotes = notes;
    lesson.markModified('studyNotes');
    await lesson.save();
    updated++;
    console.log(`  ✓ [${notes.keyPoints.length}pts, ${notes.vocabulary.length}voc] ${lesson.title}`);
  }

  console.log(`\n🎉 Done. Updated ${updated}, skipped ${skipped}.`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});