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
  title: {
    type: String,
    required: true,
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
  summary: {
    type: String,
    default: '',
  },
  rawText: {
    type: String,
    default: '', // extracted text from PDF (used for AI generation)
  },
}, { timestamps: true });

// A course can have multiple lessons, unique per chapter
lessonSchema.index({ course: 1, chapter: 1 }, { unique: true });

const Lesson = mongoose.model('Lesson', lessonSchema);
module.exports = Lesson;
