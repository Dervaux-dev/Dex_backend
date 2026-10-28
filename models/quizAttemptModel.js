// Quiz attempt model - tracks a user's submission and score for a quiz
const mongoose = require('mongoose');

const quizAttemptSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Register',
      required: true,
    },
    quiz: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Quiz',
      required: true,
    },
    lesson: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lesson',
      required: true,
    },
    answers: {
      type: [Number],
      default: [],
    },
    score: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    passed: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Performance Indexes for fast quiz tracking and progress recalculation
quizAttemptSchema.index({ user: 1, quiz: 1, passed: 1 });
quizAttemptSchema.index({ user: 1, score: -1 });

const QuizAttempt = mongoose.model('QuizAttempt', quizAttemptSchema);
module.exports = QuizAttempt;
