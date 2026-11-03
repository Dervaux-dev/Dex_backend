require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const Course = require('../models/courseModel');
const Lesson = require('../models/lessonModel');
const { localSummarize, localStudyNotes } = require('../services/aiService');

const ROOT = process.env.REB_PRIMARY_ROOT || path.resolve(__dirname, '..', '..', 'pdfs', 'primary');
const MANIFEST_PATH = path.join(ROOT, 'manifest.json');
const STRUCTURED_DIR = path.join(ROOT, '_structured');
const UPLOADS_DIR = path.resolve(__dirname, '..', 'uploads');
const SUBJECTS = {
  mathematics: { label: 'Mathematics', emoji: '🔢' },
  science: { label: 'Science & Elementary Technology', emoji: '🔬' },
  english: { label: 'English', emoji: '📖' },
  kinyarwanda: { label: 'Kinyarwanda', emoji: '🇷🇼' },
  french: { label: 'French', emoji: '🇫🇷' },
  'creative-arts': { label: 'Creative Arts', emoji: '🎨' },
  'physical-education': { label: 'Physical Education & Sport', emoji: '⚽' },
  'social-studies': { label: 'Social Studies & Religious Education', emoji: '🌍' },
};

const readJson = (file) =>
  JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));

function gradeNumber(grade) {
  return Number(String(grade).replace(/\D/g, ''));
}

function levelForGrade(grade) {
  const number = gradeNumber(grade);
  return number <= 2 ? 'beginner' : number <= 4 ? 'intermediate' : 'advanced';
}

function courseSourceId(grade, subject) {
  return `reb-primary:${grade}:${subject}:course`;
}

function findUnitForUnnumberedContent(unit, book) {
  const content = String(unit.content || '');
  const candidates = (book.tableOfContents || [])
    .filter((tocUnit) => Number.isInteger(Number(tocUnit.number)) && Number(tocUnit.number) > 0)
    .filter((tocUnit) => String(tocUnit.title || '').trim().length >= 3)
    .sort((a, b) => String(b.title).length - String(a.title).length);

  return candidates.find((tocUnit) => {
    const escapedTitle = String(tocUnit.title).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escapedTitle}\\b`, 'i').test(content);
  });
}

function buildLessonRecords(book) {
  const records = [];
  let chapter = 1;
  const sourcePrefix = `reb-primary:${book.grade}:${book.subject}`;

  for (const unit of book.units || []) {
    const unitNumber = Number(unit.number);
    if (!Number.isInteger(unitNumber) || unitNumber < 1) {
      const matchedUnit = findUnitForUnnumberedContent(unit, book);
      if (!matchedUnit || !String(unit.content || '').trim()) {
        throw new Error(
          `Cannot map invalid unit number "${unit.number}" in ${book.grade} ${book.subject}`
        );
      }

      records.push({
        curriculumSourceId:
          `${sourcePrefix}:unit:${matchedUnit.number}:lesson:unit-${unit.number}-source`,
        chapter: chapter++,
        curriculumUnitNumber: Number(matchedUnit.number),
        curriculumUnitTitle: matchedUnit.title,
        curriculumLessonNumber: '',
        title: `${matchedUnit.title} (additional source text)`,
        content: String(unit.content).trim(),
      });
      continue;
    }

    const parsedLessons = (unit.lessons || []).filter(
      (lesson) => typeof lesson.content === 'string' && lesson.content.trim()
    );
    const lessons = parsedLessons.length > 0
      ? parsedLessons
      : [{ number: '', title: unit.title, content: unit.content || '' }];

    for (const lesson of lessons) {
      const content = String(lesson.content || '').trim();
      if (!content) continue;

      const sourceLessonNumber = lesson.number || 'unit';
      records.push({
        curriculumSourceId: `${sourcePrefix}:unit:${unitNumber}:lesson:${sourceLessonNumber}`,
        chapter: chapter++,
        curriculumUnitNumber: unitNumber,
        curriculumUnitTitle: unit.title || `Unit ${unitNumber}`,
        curriculumLessonNumber: lesson.number || '',
        title: lesson.title || unit.title || `Unit ${unitNumber}`,
        content,
      });
    }
  }

  return records;
}

function createLessonPayload({ record, courseId, pdfName, pdfPath, subject }) {
  const wordCount = record.content.split(/\s+/).filter(Boolean).length;
  const firstParagraph = record.content
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .find((paragraph) => paragraph.length > 30);
  const summary = subject === 'english'
    ? localSummarize(record.content)
    : (firstParagraph || record.content).slice(0, 600);
  const studyNotes = subject === 'english'
    ? localStudyNotes(record.content)
    : { overview: summary, keyPoints: [], vocabulary: [], keyFacts: [] };

  return {
    ...record,
    course: courseId,
    pdfFile: pdfName,
    pdfPath,
    pdfUrl: '',
    aiProvider: 'local',
    summary,
    studyNotes,
    readingTime: Math.max(1, Math.ceil(wordCount / 180)),
    wordCount,
  };
}

function parseArgs(argv) {
  const value = (name) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const allBooks = argv.includes('--all-books');
  const grade = value('--grade') || (allBooks ? undefined : 'P1');
  const subject = value('--subject') || (allBooks ? undefined : 'english');

  if (grade && !/^P[1-6]$/i.test(grade)) {
    throw new Error('--grade must be P1 through P6');
  }
  if (subject && !SUBJECTS[subject]) {
    throw new Error(`Unsupported --subject: ${subject}`);
  }
  if (!allBooks && (!grade || !subject)) {
    throw new Error('Provide both --grade and --subject, or use --all-books');
  }

  return {
    allBooks,
    grade: grade && grade.toUpperCase(),
    subject,
    apply: argv.includes('--apply'),
    refreshOwned: argv.includes('--refresh-owned'),
  };
}

function selectBooks(manifest, options) {
  return manifest.filter((entry) =>
    entry.type === 'PB' &&
    SUBJECTS[entry.subject] &&
    (options.allBooks || (
      entry.grade.toUpperCase() === options.grade &&
      entry.subject === options.subject
    ))
  );
}

async function findAvailableCourseTitle(baseTitle, gradeLevel) {
  let title = baseTitle;
  let suffix = 1;
  while (await Course.findOne({ title, gradeLevel }).select('_id').lean()) {
    suffix += 1;
    title = `${baseTitle} (REB ${suffix})`;
  }
  return title;
}

function prepareBook(entry) {
  const grade = entry.grade.toUpperCase();
  const number = gradeNumber(grade);
  const config = SUBJECTS[entry.subject];
  const structuredPath = path.join(
    STRUCTURED_DIR,
    `${grade}_PB_${entry.subject}_structured.json`
  );
  const sourcePdf = path.isAbsolute(entry.path)
    ? entry.path
    : path.resolve(ROOT, entry.path);

  if (!fs.existsSync(structuredPath)) {
    throw new Error(`Structured book not found: ${structuredPath}`);
  }
  if (!fs.existsSync(sourcePdf)) {
    throw new Error(`Source PDF not found: ${sourcePdf}`);
  }

  const book = readJson(structuredPath);
  const lessonRecords = buildLessonRecords(book);
  if (lessonRecords.length === 0) {
    throw new Error(`No unit or lesson content found in ${structuredPath}`);
  }
  if (lessonRecords.some((record) =>
    !Number.isInteger(record.curriculumUnitNumber) ||
    record.curriculumUnitNumber < 1 ||
    !Number.isInteger(record.chapter) ||
    record.chapter < 1
  )) {
    throw new Error(`Invalid unit or chapter number in ${structuredPath}`);
  }

  return { entry, grade, number, config, book, lessonRecords, sourcePdf };
}

async function importBook(prepared, options, stats) {
  const { entry, grade, number, config, book, lessonRecords, sourcePdf } = prepared;
  const sourceId = courseSourceId(grade, entry.subject);
  const title = `Primary ${number} ${config.label} Curriculum (REB)`;
  if (!options.apply) {
    console.log(
      `[dry] ${title}: ${book.unitCount} units, ${lessonRecords.length} lessons from ${entry.name}`
    );
    stats.books++;
    stats.lessons += lessonRecords.length;
    return;
  }

  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const pdfHash = crypto.createHash('sha1')
    .update(fs.readFileSync(sourcePdf))
    .digest('hex')
    .slice(0, 12);
  const pdfStorageName = `reb-${grade.toLowerCase()}-${entry.subject}-${pdfHash}.pdf`;
  const storedPdf = path.join(UPLOADS_DIR, pdfStorageName);
  if (!fs.existsSync(storedPdf)) fs.copyFileSync(sourcePdf, storedPdf);

  let course = await Course.findOne({ curriculumSourceId: sourceId });
  if (!course) {
    const gradeLevel = `Primary ${number}`;
    const uniqueTitle = await findAvailableCourseTitle(title, gradeLevel);
    course = await Course.create({
      curriculumSourceId: sourceId,
      title: uniqueTitle,
      description: `Official REB Primary ${number} ${config.label} pupil-book lessons, organized by unit.`,
      gradeLevel,
      category: entry.subject,
      level: levelForGrade(grade),
      price: 0,
      thumbnailEmoji: config.emoji,
      instructor: { name: 'REB Curriculum', bio: 'Rwanda Basic Education Board curriculum' },
    });
    stats.createdCourses++;
  }

  const existingLessons = await Lesson.find({ course: course._id })
    .select('chapter curriculumSourceId')
    .lean();
  const existingBySource = new Map(
    existingLessons
      .filter((lesson) => lesson.curriculumSourceId)
      .map((lesson) => [lesson.curriculumSourceId, lesson])
  );
  const usedChapters = new Set(existingLessons.map((lesson) => lesson.chapter));
  let nextChapter = Math.max(0, ...usedChapters) + 1;
  const operations = [];

  for (const record of lessonRecords) {
    const existing = existingBySource.get(record.curriculumSourceId);
    if (existing && !options.refreshOwned) {
      stats.unchangedLessons++;
      continue;
    }

    const chapter = existing ? existing.chapter : nextChapter++;
    const payload = createLessonPayload({
      record: { ...record, chapter },
      courseId: course._id,
      pdfName: entry.name,
      pdfPath: pdfStorageName,
      subject: entry.subject,
    });

    if (existing) {
      operations.push({
        updateOne: {
          filter: { _id: existing._id, curriculumSourceId: record.curriculumSourceId },
          update: { $set: payload },
        },
      });
    } else {
      operations.push({
        updateOne: {
          filter: { curriculumSourceId: record.curriculumSourceId },
          update: { $setOnInsert: payload },
          upsert: true,
        },
      });
    }
  }

  if (operations.length > 0) {
    const result = await Lesson.bulkWrite(operations, { ordered: true });
    stats.createdLessons += result.upsertedCount;
    stats.updatedLessons += result.modifiedCount;
  }

  stats.books++;
  stats.lessons += lessonRecords.length;
  console.log(
    `[ok] ${course.title}: ${lessonRecords.length} structured lessons (${entry.name})`
  );
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error(`Manifest not found: ${MANIFEST_PATH}`);
  }
  const entries = selectBooks(readJson(MANIFEST_PATH), options);
  if (entries.length === 0) {
    throw new Error('No matching Pupil Books found in the REB manifest');
  }
  const preparedBooks = entries.map(prepareBook);

  const stats = {
    books: 0,
    lessons: 0,
    createdCourses: 0,
    createdLessons: 0,
    updatedLessons: 0,
    unchangedLessons: 0,
  };

  if (options.apply) {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/Dex_Elearning';
    await mongoose.connect(uri);
    console.log(
      'MongoDB connected:',
      mongoose.connection.host,
      '/',
      mongoose.connection.db.databaseName
    );
  } else {
    console.log('Dry run only. Add --apply to write new curriculum records.');
  }

  try {
    for (const book of preparedBooks) await importBook(book, options, stats);
  } finally {
    if (options.apply) await mongoose.disconnect();
  }

  console.log(
    `Books ${stats.books}; lessons planned ${stats.lessons}; ` +
    `courses created ${stats.createdCourses}; lessons created ${stats.createdLessons}; ` +
    `lessons updated ${stats.updatedLessons}; existing lessons preserved ${stats.unchangedLessons}`
  );
}

if (require.main === module) {
  main().catch(async (error) => {
    console.error('Structured REB import failed:', error.message);
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    process.exitCode = 1;
  });
}

module.exports = {
  buildLessonRecords,
  createLessonPayload,
  parseArgs,
  prepareBook,
  selectBooks,
};
