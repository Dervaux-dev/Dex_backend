// Quiz model - holds questions for a lesson (AI-generated or manually edited)
const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema(
  {
    question: { type: String, required: true },
    options: {
      type: [String],
      required: true,
      validate: {
        validator: (v) => Array.isArray(v) && v.length >= 2,
        message: 'A question must have at least 2 options',
      },
    },
    correctIndex: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: true }
);

const quizSchema = new mongoose.Schema(
  {
    lesson: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lesson',
      required: true,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
    },
    title: {
      type: String,
      default: 'Chapter Quiz',
    },
    passingScore: {
      type: Number,
      default: 50,
      min: 0,
      max: 100,
    },
    questions: [questionSchema],
  },
  { timestamps: true }
);

// One quiz per lesson
quizSchema.index({ lesson: 1 }, { unique: true });

const Quiz = mongoose.model('Quiz', quizSchema);
module.exports = Quiz;
