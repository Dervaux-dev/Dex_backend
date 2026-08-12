// Lesson routes
const express = require('express');
const router = express.Router();
const {
  upload,
  uploadLesson,
  getLessonsByCourse,
  getLessonById,
  getLessonPdf,
} = require('../controllers/lessonController');
const { auth, adminAuth } = require('../middleware/auth');

// Public: get lessons for a course (enrolled users can view)
router.get('/course/:courseId', auth, getLessonsByCourse);
router.get('/:id', auth, getLessonById);
router.get('/:id/pdf', auth, getLessonPdf);

// Admin: upload a PDF lesson
router.post('/upload', auth, adminAuth, upload.single('pdf'), uploadLesson);

module.exports = router;