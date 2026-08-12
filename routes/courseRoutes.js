// Course routes
const express = require('express');
const router = express.Router();
const {
  getAllCourses,
  getCourseById,
  enrollInCourse,
  getEnrolledCourses,
} = require('../controllers/courseController');
const { auth } = require('../middleware/auth');

// Public routes
router.get('/', getAllCourses);
router.get('/:id', getCourseById);

// Protected routes
router.get('/enrolled', auth, getEnrolledCourses);
router.post('/:id/enroll', auth, enrollInCourse);

module.exports = router;
