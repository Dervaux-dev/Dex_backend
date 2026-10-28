// Lesson controller - handles PDF upload, text extraction, AI summary, and retrieval
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const Lesson = require('../models/lessonModel');
const Course = require('../models/courseModel');
const Enrollment = require('../models/enrollmentModel');
const Quiz = require('../models/quizModel');
const {
  extractTextFromPdf,
  generateCourseOutline,
  generateLessonFromSection,
} = require('../services/aiService');
const { extractAndCleanPdf, computeTextStats } = require('../services/pdfService');
const { recalculateCourseProgress } = require('../utils/progressHelper');

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

const upload = multer({ storage, fileFilter, limits: { fileSize: 25 * 1024 * 1024 } });

// Admin uploads a PDF lesson; AI extracts text + summary
const uploadLesson = async (req, res, next) => {
  try {
    const { courseId, chapter, title, pdfUrl } = req.body;
    const aiProvider = String(req.body.aiProvider || 'gemini').toLowerCase();
    if (!courseId || !chapter || !title) {
      return res.status(400).json({ success: false, message: 'courseId, chapter, and title are required' });
    }
    if (!['gemini', 'anthropic'].includes(aiProvider)) {
      return res.status(400).json({ success: false, message: 'aiProvider must be either gemini or anthropic' });
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
    let textStats = { wordCount: 0, readingTimeMinutes: 5, pageCount: 1 };

    if (req.file) {
      filePath = req.file.path;
      const pdfData = await extractAndCleanPdf(fs.readFileSync(filePath));
      rawText = pdfData.cleanText || pdfData.rawText;
      textStats = pdfData.stats;
      if (!rawText.trim()) {
        const error = new Error('No readable text was found in this PDF. Scanned PDFs need OCR before upload.');
        error.statusCode = 422;
        throw error;
      }
    } else if (pdfUrl) {
      rawText = `External PDF reference: ${pdfUrl}`;
      textStats = computeTextStats(rawText, 1);
    }

    // Hybrid approach: outline-first + section-by-section generation
    let lesson;
    let outline = [];
    let generated = null;

    try {
      outline = await generateCourseOutline(rawText, aiProvider);
    } catch (outlineErr) {
      console.warn('Outline generation failed, falling back to direct generation:', outlineErr.message);
      outline = [];
    }

    const chapterNum = Number(chapter);
    const chapterMeta = Array.isArray(outline)
      ? outline.find((o) => Number(o.chapter) === chapterNum)
      : null;

    generated = await generateLessonFromSection(rawText, chapterMeta || { title }, aiProvider);

    lesson = await Lesson.create({
      course: courseId,
      chapter: chapterNum,
      title,
      pdfFile: req.file ? req.file.originalname : '',
      pdfPath: req.file ? path.basename(filePath) : '',
      pdfUrl: pdfUrl || '',
      aiProvider,
      summary: generated.summary || '',
      studyNotes: generated.studyNotes || {
        overview: '',
        keyPoints: [],
        vocabulary: [],
        keyFacts: [],
      },
      readingTime: textStats.readingTimeMinutes || 5,
      wordCount: textStats.wordCount || 0,
      rawText,
    });

    if (generated.quiz && Array.isArray(generated.quiz) && generated.quiz.length > 0) {
      try {
        const existingQuiz = await Quiz.findOne({ lesson: lesson._id });
        if (!existingQuiz) {
          await Quiz.create({
            lesson: lesson._id,
            course: lesson.course,
            title: `Quiz: ${lesson.title}`,
            passingScore: 50,
            questions: generated.quiz,
          });
        }
      } catch (quizErr) {
        console.warn('Quiz auto-creation failed:', quizErr.message);
      }
    }

    res.status(201).json({
      success: true,
      message: 'Lesson uploaded and generated successfully',
      data: { lesson, outline, stats: textStats },
    });
  } catch (error) {
    next(error);
  }
};

// Get all lessons for a course (summary only, no raw text to students, with student progress)
const getLessonsByCourse = async (req, res, next) => {
  try {
    const lessons = await Lesson.find({ course: req.params.courseId })
      .sort({ chapter: 1 })
      .select('-rawText')
      .lean();

    let completedLessons = [];
    let progress = 0;
    let passedQuizzes = [];

    if (req.user && req.user._id) {
      const enrollment = await Enrollment.findOne({
        user: req.user._id,
        course: req.params.courseId,
      });
      if (enrollment) {
        completedLessons = (enrollment.completedLessons || []).map((id) => id.toString());
        progress = enrollment.progress || 0;
      }

      // Check quizzes passed by the student
      const quizzes = await Quiz.find({ course: req.params.courseId }).select('_id lesson');
      const quizIds = quizzes.map((q) => q._id);
      if (quizIds.length > 0) {
        const QuizAttempt = require('../models/quizAttemptModel');
        const passedAttempts = await QuizAttempt.find({
          user: req.user._id,
          quiz: { $in: quizIds },
          passed: true,
        }).select('quiz lesson');
        passedQuizzes = [...new Set(passedAttempts.map((a) => a.quiz.toString()))];
      }
    }

    res.status(200).json({
      success: true,
      data: {
        lessons,
        count: lessons.length,
        completedLessons,
        passedQuizzes,
        progress,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get a single lesson (summary + pdf path)
const getLessonById = async (req, res, next) => {
  try {
    const lesson = await Lesson.findById(req.params.id).select('-rawText').lean();
    if (!lesson) {
      return res.status(404).json({ success: false, message: 'Lesson not found' });
    }
    res.status(200).json({ success: true, data: { lesson } });
  } catch (error) {
    next(error);
  }
};

// Student marks a lesson as read / completed
const markLessonComplete = async (req, res, next) => {
  try {
    const lesson = await Lesson.findById(req.params.id);
    if (!lesson) {
      return res.status(404).json({ success: false, message: 'Lesson not found' });
    }
    const userId = req.user._id;
    const enrollment = await Enrollment.findOne({ user: userId, course: lesson.course });
    if (!enrollment) {
      return res.status(400).json({ success: false, message: 'You are not enrolled in this course' });
    }

    const isAlreadyCompleted = (enrollment.completedLessons || []).some(
      (id) => id.toString() === lesson._id.toString()
    );

    if (isAlreadyCompleted && req.body && req.body.toggle) {
      await Enrollment.findByIdAndUpdate(enrollment._id, {
        $pull: { completedLessons: lesson._id },
      });
    } else {
      await Enrollment.findByIdAndUpdate(enrollment._id, {
        $addToSet: { completedLessons: lesson._id },
      });
    }

    const updated = await recalculateCourseProgress(userId, lesson.course);

    res.status(200).json({
      success: true,
      message: isAlreadyCompleted && req.body && req.body.toggle ? 'Lesson unmarked' : 'Lesson marked as completed',
      data: {
        progress: updated ? updated.progress : enrollment.progress,
        status: updated ? updated.status : enrollment.status,
        completedLessons: updated ? updated.completedLessons : enrollment.completedLessons,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Serve the PDF file
const getLessonPdf = async (req, res, next) => {
  try {
    const lesson = await Lesson.findById(req.params.id);
    if (!lesson) {
      return res.status(404).json({ success: false, message: 'Lesson not found' });
    }
    if (lesson.pdfUrl) {
      return res.redirect(lesson.pdfUrl);
    }
    if (!lesson.pdfPath) {
      return res.status(404).json({ success: false, message: 'PDF file not found for this lesson' });
    }
    const filePath = path.join(uploadsDir, lesson.pdfPath);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'PDF file not found on disk' });
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(lesson.pdfFile || 'lesson.pdf')}"`);
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
  markLessonComplete,
  getLessonPdf,
};
