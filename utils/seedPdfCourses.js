// Seed script: scans ../pdfs for scheme-of-work PDFs and creates a Course +
// Chapter-1 Lesson for each unique (grade, subject) so they appear in the app.
// Run with: npm run seed:pdfs
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const fs = require('fs');
const mongoose = require('mongoose');
const Course = require('../models/courseModel');
const Lesson = require('../models/lessonModel');
const { extractTextFromPdf, localSummarize } = require('../services/aiService');

const PDFS_DIR = path.resolve(__dirname, '..', '..', 'pdfs');
const UPLOADS_DIR = path.resolve(__dirname, '..', 'uploads');

// Subject -> course schema values
const SUBJECTS = {
  mathematics: {
    category: 'mathematics',
    label: 'Mathematics',
    emoji: '🔢',
    instructor: { name: 'Teacher Sarah', bio: 'Primary Math Educator' },
    desc: (g) =>
      `The official Primary ${g} Mathematics scheme of work: term-by-term topics in counting, addition, subtraction, multiplication, division, fractions, shape, and measurement with daily practice activities.`,
  },
  english: {
    category: 'english',
    label: 'English',
    emoji: '📖',
    instructor: { name: 'Teacher Daniel', bio: 'Early Literacy Specialist' },
    desc: (g) =>
      `The official Primary ${g} English scheme of work covering phonics, reading, grammar, vocabulary, and writing activities that build strong literacy skills step by step.`,
  },
  kinyarwanda: {
    category: 'kinyarwanda',
    label: 'Kinyarwanda',
    emoji: '🇷🇼',
    instructor: { name: 'Teacher Aline', bio: 'Kinyarwanda Language Educator' },
    desc: (g) =>
      `Umugabane w'ibikorwa by'ishuri ry'Ikinyarwanda ku rwego rwa Primary ${g}: gusoma, kwandika, ikibonezamvugo, n'ubusobanuro bw'amagambo mu mwaka wose w'ishuri.`,
  },
  french: {
    category: 'french',
    label: 'French',
    emoji: '🇫🇷',
    instructor: { name: 'Teacher Claire', bio: 'Primary French Educator' },
    desc: (g) =>
      `The official Primary ${g} French scheme of work covering vocabulary, grammar, conversation, listening, reading, and writing gradually across the school year.`,
  },
  music: {
    category: 'music',
    label: 'Music',
    emoji: '🎵',
    instructor: { name: 'Teacher Noel', bio: 'Music & Performing Arts' },
    desc: (g) =>
      `Primary ${g} Music scheme of work with songs, rhythms, musical instruments, notation basics, and creative performance activities.`,
  },
  pes: {
    category: 'physical-education',
    label: 'Physical Education & Sport',
    emoji: '⚽',
    instructor: { name: 'Coach Eric', bio: 'Physical Education Instructor' },
    desc: (g) =>
      `Primary ${g} Physical Education and Sport (PES) scheme of work with warm-ups, athletics, games, gymnastics, and healthy-living activities.`,
  },
  set: {
    category: 'science',
    label: 'Science & Elementary Technology',
    emoji: '💻',
    instructor: { name: 'Teacher Alex', bio: 'Science & Technology Instructor' },
    desc: (g) =>
      `Primary ${g} Science and Elementary Technology (SET) scheme of work exploring living things, materials, forces, energy, and hands-on technology projects.`,
  },
  ssre: {
    category: 'social-studies',
    label: 'Social Studies & Religious Education',
    emoji: '🌍',
    instructor: { name: 'Teacher Mark', bio: 'Social Studies & Geography' },
    desc: (g) =>
      `Primary ${g} Social Studies and Religious Education (SSRE) scheme of work covering community, geography, history, culture, and values.`,
  },
};

const SUBJECT_TOKEN_MAP = [
  ['mathematics', /MATHEMAT/],
  ['english', /ENGLISH/],
  ['kinyarwanda', /KINYARWANDA/],
  ['french', /FRENCH/],
  ['music', /MUSIC/],
  ['pes', /^PES$/],
  ['set', /^SET$/],
  ['ssre', /^(SSRE|SOCIAL|STUDIES|RELIGIOUS)$/],
];

const tokenize = (name) => {
  const raw = name
    .replace(/\.pdf$/i, '')
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((t) => t.toUpperCase());
  const out = [];
  for (const t of raw) {
    // Handle names like "P1Music" where grade and subject share one token
    const m = t.match(/^(P[1-6])([A-Z]{2,})$/);
    if (m) {
      out.push(m[1]);
      out.push(m[2]);
    } else {
      out.push(t);
    }
  }
  return out;
};

const parseFile = (file) => {
  const tokens = tokenize(file);
  const gradeToken = tokens.find((t) => /^P[1-6]$/.test(t));
  if (!gradeToken) return null;
  const grade = Number(gradeToken.slice(1));

  let subject = null;
  for (const [key, re] of SUBJECT_TOKEN_MAP) {
    if (tokens.some((t) => re.test(t))) {
      subject = key;
      break;
    }
  }
  if (!subject) return null;

  return { grade, subject, file };
};

const levelForGrade = (grade) =>
  grade <= 2 ? 'beginner' : grade <= 4 ? 'intermediate' : 'advanced';

const connectDB = async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/Dex_Elearning';
  await mongoose.connect(uri);
  console.log('MongoDB connected for seeding PDF courses.');
};

const seed = async () => {
  try {
    if (!fs.existsSync(PDFS_DIR)) {
      console.error(`PDFs directory not found: ${PDFS_DIR}`);
      process.exit(1);
    }
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });

    await connectDB();

    const files = fs.readdirSync(PDFS_DIR).filter((f) => f.toLowerCase().endsWith('.pdf'));
    const parsed = files.map(parseFile).filter(Boolean);

    // Group by grade+subject, prefer the file without "(1)" when duplicated
    const groups = new Map();
    for (const item of parsed) {
      const key = `${item.grade}-${item.subject}`;
      const hasDuplicateMarker = /\(\s*1\s*\)/.test(item.file);
      if (!groups.has(key) || !hasDuplicateMarker) {
        groups.set(key, item);
      }
    }

    const unique = [...groups.values()].sort(
      (a, b) => a.grade - b.grade || a.subject.localeCompare(b.subject)
    );

    console.log(`Found ${parsed.length} PDFs -> ${unique.length} unique courses.`);

    let created = 0;
    let updated = 0;

    for (const { grade, subject, file } of unique) {
      const cfg = SUBJECTS[subject];
      const title = `Primary ${grade} ${cfg.label} Scheme of Work`;
      const sourcePdf = path.join(PDFS_DIR, file);

      // Upsert course
      let course = await Course.findOne({ title });
      if (!course) {
        course = await Course.create({
          title,
          description: cfg.desc(grade),
          gradeLevel: `Primary ${grade}`,
          category: cfg.category,
          level: levelForGrade(grade),
          price: 0,
          thumbnailEmoji: cfg.emoji,
          instructor: cfg.instructor,
        });
        created++;
      } else {
        // Keep metadata in sync with the config
        course.description = cfg.desc(grade);
        course.category = cfg.category;
        course.level = levelForGrade(grade);
        course.thumbnailEmoji = cfg.emoji;
        await course.save();
        updated++;
      }

      // Copy PDF into /uploads (unique storage name) and create/refresh chapter 1 lesson
      const ext = path.extname(sourcePdf) || '.pdf';
      const storageName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
      const storagePath = path.join(UPLOADS_DIR, storageName);

      let lesson = await Lesson.findOne({ course: course._id, chapter: 1 });
      if (lesson && lesson.pdfPath && fs.existsSync(path.join(UPLOADS_DIR, lesson.pdfPath))) {
        console.log(`  • ${title} — lesson already present, skipped.`);
        continue;
      }

      fs.copyFileSync(sourcePdf, storagePath);
      console.log(`  • ${title} (${file}) — copying to /uploads and extracting text...`);

      let rawText = '';
      try {
        rawText = await extractTextFromPdf(fs.readFileSync(storagePath));
      } catch (err) {
        console.error(`    PDF parse failed for ${file}: ${err.message}`);
      }

      const lessonData = {
        course: course._id,
        chapter: 1,
        title: `Chapter 1: ${cfg.label} Scheme of Work`,
        pdfFile: file,
        pdfPath: storageName,
        pdfUrl: '',
        summary: localSummarize(rawText),
        rawText: rawText.slice(0, 200000),
      };

      if (lesson) {
        lesson.pdfFile = lessonData.pdfFile;
        lesson.pdfPath = lessonData.pdfPath;
        lesson.summary = lessonData.summary;
        await lesson.save();
      } else {
        await Lesson.create(lessonData);
      }
    }

    console.log(`\n🎉 Done. ${created} courses created, ${updated} updated.`);
    console.log(`Now run: npm run seed:courses (already done?) or check the site at /courses`);
    process.exit(0);
  } catch (err) {
    console.error('Seeding PDF courses error:', err);
    process.exit(1);
  }
};

seed();