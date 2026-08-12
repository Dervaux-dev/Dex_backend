// Quiz routes
const express = require('express');
const router = express.Router();
const {
  createQuiz,
  getQuizByLesson,
  getQuizAdmin,
  updateQuiz,
  submitQuiz,
  getQuizResults,
} = require('../controllers/quizController');
const { auth, adminAuth } = require('../middleware/auth');

// Student routes (authenticated)
router.get('/lesson/:lessonId', auth, getQuizByLesson);
router.get('/lesson/:lessonId/results', auth, getQuizResults);
router.post('/:id/submit', auth, submitQuiz);

// Admin routes
router.post('/create', auth, adminAuth, createQuiz);
router.get('/admin/:id', auth, adminAuth, getQuizAdmin);
router.put('/:id', auth, adminAuth, updateQuiz);

module.exports = router;

