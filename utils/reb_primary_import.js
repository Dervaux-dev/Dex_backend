// Import REB primary Pupil Books (notes) into the Dex MongoDB as
// one Course + Chapter-1 Lesson per grade+subject. Idempotent.
// Usage: node utils/reb_primary_import.js [--dry]
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const Course = require('../models/courseModel');
const Lesson = require('../models/lessonModel');
const { localSummarize, localStudyNotes } = require('../services/aiService');

const ROOT = process.env.REB_PRIMARY_ROOT || 'D:/dd/pdfs/primary';
const TEXT_DIR = path.join(ROOT, '_text');
const UPLOADS_DIR = path.resolve(__dirname, '..', 'uploads');
const MANIFEST = path.join(ROOT, 'manifest.json');
const dry = process.argv.includes('--dry');

const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, ''));
const readText = (f) => fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '');

const SUBJECTS = {
  mathematics: {
    label: 'Mathematics',
    category: 'mathematics',
    emoji: '🔢',
    instructor: { name: 'Teacher Sarah', bio: 'Primary Math Educator' },
  },
  science: {
    label: 'Science & Elementary Technology',
    category: 'science',
    emoji: '💻',
    instructor: { name: 'Teacher Alex', bio: 'Science & Technology Instructor' },
  },
  english: {
    label: 'English',
    category: 'english',
    emoji: '📖',
    instructor: { name: 'Teacher Daniel', bio: 'Early Literacy Specialist' },
  },
  kinyarwanda: {
    label: 'Kinyarwanda',
    category: 'kinyarwanda',
    emoji: '🇷🇼',
    instructor: { name: 'Teacher Aline', bio: 'Kinyarwanda Language Educator' },
  },
  french: {
    label: 'French',
    category: 'french',
    emoji: '🇫🇷',
    instructor: { name: 'Teacher Claire', bio: 'Primary French Educator' },
  },
  'creative-arts': {
    label: 'Creative Arts',
    category: 'creative-arts',
    emoji: '🎨',
    instructor: { name: 'Teacher Leo', bio: 'Art & Design Instructor' },
  },
  'physical-education': {
    label: 'Physical Education & Sport',
    category: 'physical-education',
    emoji: '⚽',
    instructor: { name: 'Coach Eric', bio: 'Physical Education Instructor' },
  },
  'social-studies': {
    label: 'Social Studies & Religious Education',
    category: 'social-studies',
    emoji: '🌍',
    instructor: { name: 'Teacher Mark', bio: 'Social Studies & Geography' },
  },
};

const gradeNum = (g) => Number(String(g).replace(/\D/g, ''));
const levelForGrade = (g) => {
  const n = gradeNum(g);
  return n <= 2 ? 'beginner' : n <= 4 ? 'intermediate' : 'advanced';
};

const desc = (n, label) =>
  `The official REB Primary ${n} ${label} pupil book (learner notes) for the 2026-2027 revised curriculum. ` +
  `Study the chapter content, key vocabulary and concepts, then test yourself with the lesson quiz.`;

async function main() {
  if (!fs.existsSync(MANIFEST)) {
    console.error('Manifest not found:', MANIFEST);
    process.exit(1);
  }
  const manifest = readJson(MANIFEST).filter((m) => m.type === 'PB');
  if (!dry) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/Dex_Elearning';
    await mongoose.connect(uri);
    console.log('MongoDB connected:', mongoose.connection.host, '/', mongoose.connection.db.databaseName);
  }

  let createdCourses = 0;
  let updatedCourses = 0;
  let createdLessons = 0;
  let updatedLessons = 0;
  const skipped = [];

  for (const m of manifest) {
    const cfg = SUBJECTS[m.subject];
    if (!cfg) {
      skipped.push(`${m.grade} ${m.subject}: no subject mapping`);
      continue;
    }
    const n = gradeNum(m.grade);
    const title = `Primary ${n} ${cfg.label} Notes`;
    const txtPath = path.join(TEXT_DIR, `${m.grade}_${m.type}_${m.subject}.txt`);
    if (!fs.existsSync(txtPath)) {
      skipped.push(`${title}: extracted text missing`);
      continue;
    }
    const cleanText = readText(txtPath);

    if (dry) {
      console.log(`[dry] ${title} <- ${m.name} (${cleanText.length} chars)`);
      continue;
    }

    let course = await Course.findOne({ title, gradeLevel: `Primary ${n}` });
    if (!course) {
      course = await Course.create({
        title,
        description: desc(n, cfg.label),
        gradeLevel: `Primary ${n}`,
        category: cfg.category,
        level: levelForGrade(m.grade),
        price: 0,
        thumbnailEmoji: cfg.emoji,
        instructor: cfg.instructor,
      });
      createdCourses++;
    } else {
      course.description = desc(n, cfg.label);
      course.category = cfg.category;
      course.level = levelForGrade(m.grade);
      course.thumbnailEmoji = cfg.emoji;
      course.instructor = cfg.instructor;
      await course.save();
      updatedCourses++;
    }

    const hash = crypto.createHash('sha1').update(fs.readFileSync(m.path)).digest('hex').slice(0, 12);
    const storageName = `reb-${m.grade.toLowerCase()}-${m.subject}-${hash}.pdf`;
    const storagePath = path.join(UPLOADS_DIR, storageName);
    if (!fs.existsSync(storagePath)) {
      fs.copyFileSync(m.path, storagePath);
    }

    const summary = localSummarize(cleanText);
    const studyNotes = localStudyNotes(cleanText);
    const wordCount = cleanText.split(/\s+/).filter(Boolean).length;

    const payload = {
      course: course._id,
      chapter: 1,
      title: `Chapter 1: ${cfg.label} Pupil Book`,
      pdfFile: m.name,
      pdfPath: storageName,
      pdfUrl: '',
      aiProvider: 'gemini',
      summary,
      studyNotes,
      readingTime: Math.max(1, Math.ceil(wordCount / 180)),
      wordCount,
      rawText: cleanText.slice(0, 300000),
    };

    let lesson = await Lesson.findOne({ course: course._id, chapter: 1 });
    if (lesson) {
      Object.assign(lesson, payload);
      await lesson.save();
      updatedLessons++;
    } else {
      await Lesson.create(payload);
      createdLessons++;
    }

    console.log(
      `[ok] ${title}: ${wordCount} words -> ${storageName} (summary ${summary.length} chars)`
    );
  }

  console.log('');
  console.log(
    `Courses created ${createdCourses}, updated ${updatedCourses} | Lessons created ${createdLessons}, updated ${updatedLessons}`
  );
  if (skipped.length) {
    console.log('Skipped:');
    skipped.forEach((s) => console.log('  -', s));
  }
  if (!dry) await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error('Import failed:', e);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});
