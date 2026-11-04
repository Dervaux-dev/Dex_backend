const express = require('express');
const { body, param } = require('express-validator');
const rateLimit = require('express-rate-limit');
const {
  requestPasswordReset,
  confirmPasswordReset,
} = require('../controllers/passwordResetController');
const { handleValidationErrors, strongPassword } = require('../utils/validation');

const router = express.Router();

// Rate limiting to prevent brute force and abuse on password reset endpoint
const resetRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // max 5 reset requests per 15 minutes per IP
  message: {
    success: false,
    message: 'Too many password reset requests from this IP. Please try again after 15 minutes.',
  },
  keyGenerator: (req) => req.ip || req.headers['x-forwarded-for'] || 'unknown',
  skip: (req) => req.method === 'OPTIONS',
});

// Validation rules for requesting a reset link
const validateRequestReset = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  handleValidationErrors,
];

// Validation rules for confirming password reset
const validateConfirmReset = [
  param('userId')
    .isMongoId()
    .withMessage('Invalid user identifier format'),
  param('token')
    .notEmpty()
    .isHexadecimal()
    .withMessage('Invalid reset token format'),
  strongPassword('password'),
  handleValidationErrors,
];

/**
 * Step 2 Routes:
 * POST /password-reset
 * POST /password-reset/:userId/:token
 */
router.post('/', resetRequestLimiter, validateRequestReset, requestPasswordReset);
router.post('/:userId/:token', validateConfirmReset, confirmPasswordReset);

module.exports = router;
