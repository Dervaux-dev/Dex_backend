const express = require('express');
const router = express.Router();
const {
  getUserProfile,
  updateUserProfile,
  changePassword,
} = require('../controllers/userController');
const { auth } = require('../middleware/auth');

router.get('/profile', auth, getUserProfile);
router.put('/profile', auth, updateUserProfile);
router.put('/change-password', auth, changePassword);

module.exports = router;
