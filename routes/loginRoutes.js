// Login routes
const express = require('express');
const router = express.Router();
const { loginUser } = require('../controllers/loginController');
const { validateUserLogin } = require('../utils/validation');

// Login user
router.post('/', validateUserLogin, loginUser);

// Export login routes
module.exports = router;
