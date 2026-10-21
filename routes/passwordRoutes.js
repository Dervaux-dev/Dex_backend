const express = require('express');
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');
const { forgotPassword, resetPassword } = require('../controllers/passwordController');
const { strongPassword, handleValidationErrors } = require('../utils/validation');

const router = express.Router();

// Tight limiter: reset emails are expensive and abusable
const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many reset requests. Please wait 15 minutes and try again.' },
  keyGenerator: (req) => req.ip || req.headers['x-forwarded-for'] || 'unknown',
  skip: (req) => req.method === 'OPTIONS',
});

const validateForgot = [
  body('email').isEmail().withMessage('Please provide a valid email'),
  handleValidationErrors,
];

const validateReset = [
  body('token')
    .isLength({ min: 64, max: 64 })
    .matches(/^[a-f0-9]+$/)
    .withMessage('Invalid reset token'),
  strongPassword('password'),
  handleValidationErrors,
];

router.post('/forgot-password', forgotLimiter, validateForgot, forgotPassword);
router.post('/reset-password', validateReset, resetPassword);

module.exports = router;
