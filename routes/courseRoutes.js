const express = require('express');
const router = express.Router();
const {
  getAllCourses,
  getCoursesGroupedByGrade,
  getCourseById,
  enrollInCourse,
  getEnrolledCourses,
  createCourse,
  updateCourse,
  deleteCourse,
} = require('../controllers/courseController');
const { auth, adminAuth } = require('../middleware/auth');

// Public routes
router.get('/', getAllCourses);
router.get('/by-grade', getCoursesGroupedByGrade);


// Protected routes
router.get('/enrolled', auth, getEnrolledCourses);
router.get('/:id', getCourseById);
router.post('/:id/enroll', auth, enrollInCourse);

// Admin routes
router.post('/', auth, adminAuth, createCourse);
router.put('/:id', auth, adminAuth, updateCourse);
router.delete('/:id', auth, adminAuth, deleteCourse);

module.exports = router;

