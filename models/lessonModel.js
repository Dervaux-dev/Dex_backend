// Lesson model - represents a chapter/lesson within a course, with a PDF and AI summary
const mongoose = require('mongoose');

const lessonSchema = new mongoose.Schema({
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true,
  },
  chapter: {
    type: Number,
    required: true,
    min: 1,
  },
  curriculumUnitNumber: {
    type: Number,
    min: 1,
  },
  curriculumUnitTitle: {
    type: String,
    default: '',
  },
  curriculumLessonNumber: {
    type: String,
    default: '',
  },
  curriculumSourceId: {
    type: String,
    default: undefined,
  },
  title: {
    type: String,
    required: true,
  },
  content: {
    type: String,
    default: '',
  },
  pdfFile: {
    type: String,
    default: '', // original filename
  },
  pdfPath: {
    type: String,
    default: '', // stored path relative to /uploads
  },
  pdfUrl: {
    type: String,
    default: '', // external PDF URL, e.g. phone-hosted or shared link
  },
  aiProvider: {
    type: String,
    enum: ['gemini', 'anthropic', 'local'],
    default: 'gemini',
  },
  summary: {
    type: String,
    default: '',
  },
  // Structured AI study notes for a polished learning presentation
  studyNotes: {
    overview: { type: String, default: '' },
    keyPoints: { type: [String], default: [] },
    vocabulary: { type: [{ term: String, definition: String }], default: [] },
    keyFacts: { type: [String], default: [] },
    _id: false,
  },
  readingTime: {
    type: Number,
    default: 5, // estimated reading time in minutes
  },
  wordCount: {
    type: Number,
    default: 0,
  },
  rawText: {
    type: String,
    default: '', // extracted text from PDF (used for AI generation)
  },
}, { timestamps: true });

// A course can have multiple lessons, unique per chapter
lessonSchema.index({ course: 1, chapter: 1 }, { unique: true });
lessonSchema.index({ curriculumSourceId: 1 }, { unique: true, sparse: true });

const Lesson = mongoose.model('Lesson', lessonSchema);
module.exports = Lesson;
