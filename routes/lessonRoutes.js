// Lesson routes
const express = require('express');
const router = express.Router();
const {
  upload,
  uploadLesson,
  getLessonsByCourse,
  getLessonById,
  markLessonComplete,
  getLessonPdf,
} = require('../controllers/lessonController');
const { auth, adminAuth } = require('../middleware/auth');

// Public/student: get lessons for a course (enrolled users can view)
router.get('/course/:courseId', auth, getLessonsByCourse);
router.get('/:id', auth, getLessonById);
router.get('/:id/pdf', auth, getLessonPdf);
router.post('/:id/complete', auth, markLessonComplete);

// Admin: upload a PDF lesson
router.post('/upload', auth, adminAuth, upload.single('pdf'), uploadLesson);

module.exports = router;