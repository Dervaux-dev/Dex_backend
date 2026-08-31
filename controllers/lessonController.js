// Lesson controller - handles PDF upload, text extraction, AI summary, and retrieval
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const Lesson = require('../models/lessonModel');
const Course = require('../models/courseModel');
const {
  extractTextFromPdf,
  generateSummary,
  generateStudyNotes,
} = require('../services/aiService');

// Ensure uploads dir exists
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname) || '.pdf';
    cb(null, `${unique}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf' || path.extname(file.originalname).toLowerCase() === '.pdf') {
    cb(null, true);
  } else {
    cb(new Error('Only PDF files are allowed'), false);
  }
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 20 * 1024 * 1024 } });

// Admin uploads a PDF lesson; AI extracts text + summary
const uploadLesson = async (req, res, next) => {
  try {
    const { courseId, chapter, title, pdfUrl } = req.body;
    if (!courseId || !chapter || !title) {
      return res.status(400).json({ success: false, message: 'courseId, chapter, and title are required' });
    }
    if (!req.file && !pdfUrl) {
      return res.status(400).json({ success: false, message: 'Please upload a PDF file or provide a PDF URL' });
    }

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    // Check if lesson chapter already exists
    const existing = await Lesson.findOne({ course: courseId, chapter });
    if (existing) {
      return res.status(400).json({ success: false, message: `Chapter ${chapter} already exists for this course` });
    }

    let rawText = '';
    let filePath = '';

    if (req.file) {
      filePath = req.file.path;
      rawText = await extractTextFromPdf(fs.readFileSync(filePath));
    } else if (pdfUrl) {
      rawText = `External PDF reference: ${pdfUrl}`;
    }

    // Generate AI summary + structured study notes
    const summary = await generateSummary(rawText);
    const studyNotes = await generateStudyNotes(rawText);

    const lesson = await Lesson.create({
      course: courseId,
      chapter: Number(chapter),
      title,
      pdfFile: req.file ? req.file.originalname : '',
      pdfPath: req.file ? path.basename(filePath) : '',
      pdfUrl: pdfUrl || '',
      summary,
      studyNotes,
      rawText,
    });

    res.status(201).json({
      success: true,
      message: 'Lesson uploaded and summarized successfully',
      data: { lesson },
    });
  } catch (error) {
    next(error);
  }
};

// Get all lessons for a course (summary only, no raw text to students)
const getLessonsByCourse = async (req, res, next) => {
  try {
    const lessons = await Lesson.find({ course: req.params.courseId })
      .sort({ chapter: 1 })
      .select('-rawText');
    res.status(200).json({ success: true, data: { lessons, count: lessons.length } });
  } catch (error) {
    next(error);
  }
};

// Get a single lesson (summary + pdf path)
const getLessonById = async (req, res, next) => {
  try {
    const lesson = await Lesson.findById(req.params.id).select('-rawText');
    if (!lesson) {
      return res.status(404).json({ success: false, message: 'Lesson not found' });
    }
    res.status(200).json({ success: true, data: { lesson } });
  } catch (error) {
    next(error);
  }
};

// Serve the PDF file
const getLessonPdf = async (req, res, next) => {
  try {
    const lesson = await Lesson.findById(req.params.id);
    if (!lesson || !lesson.pdfPath) {
      return res.status(404).json({ success: false, message: 'PDF not found' });
    }
    const filePath = path.join(uploadsDir, lesson.pdfPath);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'PDF file not found on disk' });
    }
    res.sendFile(filePath);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  upload,
  uploadLesson,
  getLessonsByCourse,
  getLessonById,
  getLessonPdf,
};
