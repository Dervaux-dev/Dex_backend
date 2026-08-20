const express = require('express');
const router = express.Router();
const {
  getDashboardStats,
  listUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  listCoursesAdmin,
  listEnrollments,
} = require('../controllers/adminController');
const { auth, adminAuth } = require('../middleware/auth');

// All admin routes require auth + admin role
router.use(auth, adminAuth);

// Dashboard
router.get('/stats', getDashboardStats);

// User management
router.get('/users', listUsers);
router.get('/users/:id', getUserById);
router.post('/users', createUser);
router.put('/users/:id', updateUser);
router.delete('/users/:id', deleteUser);

// Course management (admin view with counts)
router.get('/courses', listCoursesAdmin);

// Enrollment overview
router.get('/enrollments', listEnrollments);

module.exports = router;
