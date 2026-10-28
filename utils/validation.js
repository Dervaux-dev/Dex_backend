const { body, validationResult } = require('express-validator');

// Handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// User validation rules
const validateUserRegistration = [
  body('fullname')
    .isString()
    .withMessage('Full name must be a string')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Full name must be between 2 and 100 characters'),

  body('email')
    .isString()
    .withMessage('Email must be a string')
    .trim()
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),

  body('password')
    .isString()
    .withMessage('Password must be a string')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one symbol'),

  handleValidationErrors
];

// Reusable strong-password rule for other endpoints (e.g. change password)
const strongPassword = (fieldName = 'newPassword') =>
  body(fieldName)
    .isString()
    .withMessage(`${fieldName} must be a string`)
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one symbol');

const validateUserLogin = [
  body('identifier')
    .isString()
    .withMessage('Email or full name must be a string')
    .trim()
    .notEmpty()
    .withMessage('Email or full name is required'),

  body('password')
    .isString()
    .withMessage('Password must be a string')
    .notEmpty()
    .withMessage('Password is required'),

  handleValidationErrors
];

// Course validation rules
const validateCourseCreation = [
  body('title')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Title is required and must be less than 100 characters'),

  body('description')
    .trim()
    .isLength({ min: 1, max: 1000 })
    .withMessage('Description is required and must be less than 1000 characters'),

  body('category')
    .isIn(['programming', 'design', 'business', 'marketing', 'data-science', 'other'])
    .withMessage('Invalid category'),

  body('level')
    .optional()
    .isIn(['beginner', 'intermediate', 'advanced'])
    .withMessage('Invalid level'),

  body('price')
    .isFloat({ min: 0 })
    .withMessage('Price must be a positive number'),

  handleValidationErrors
];

// Quiz validation rules
const validateQuizCreation = [
  body('title')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Title is required and must be less than 100 characters'),

  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Description must be less than 500 characters'),

  body('timeLimit')
    .optional()
    .isInt({ min: 1, max: 180 })
    .withMessage('Time limit must be between 1 and 180 minutes'),

  body('passingScore')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Passing score must be between 0 and 100'),

  body('maxAttempts')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Maximum attempts must be at least 1'),

  handleValidationErrors
];

// Question validation rules
const validateQuestionCreation = [
  body('questionText')
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('Question text is required and must be less than 500 characters'),

  body('questionType')
    .isIn(['multiple-choice', 'true-false', 'short-answer'])
    .withMessage('Invalid question type'),

  body('points')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Points must be at least 1'),

  body('order')
    .isInt({ min: 1 })
    .withMessage('Order must be at least 1'),

  handleValidationErrors
];

module.exports = {
  strongPassword,
  validateUserRegistration,
  validateUserLogin,
  validateCourseCreation,
  validateQuizCreation,
  validateQuestionCreation,
  handleValidationErrors
};