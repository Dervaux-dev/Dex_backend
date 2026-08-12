// Quiz controller - handles AI quiz generation, retrieval, submission, and grading
const Quiz = require('../models/quizModel');
const QuizAttempt = require('../models/quizAttemptModel');
const Lesson = require('../models/lessonModel');
const { generateQuiz } = require('../services/aiService');

// Create a quiz for a lesson (AI-generated from lesson text)
const createQuiz = async (req, res, next) => {
  try {
    const { lessonId, title, passingScore } = req.body;
    if (!lessonId) {
      return res.status(400).json({ success: false, message: 'lessonId is required' });
    }

    const lesson = await Lesson.findById(lessonId);
    if (!lesson) {
      return res.status(404).json({ success: false, message: 'Lesson not found' });
    }

    // Check if quiz already exists for this lesson
    const existing = await Quiz.findOne({ lesson: lessonId });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Quiz already exists for this lesson' });
    }

    // Generate questions from lesson raw text
    const questions = await generateQuiz(lesson.rawText || lesson.summary || '');

    const quiz = await Quiz.create({
      lesson: lessonId,
      course: lesson.course,
      title: title || `Quiz: ${lesson.title}`,
      passingScore: passingScore || 50,
      questions,
    });

    res.status(201).json({
      success: true,
      message: 'Quiz created successfully',
      data: { quiz },
    });
  } catch (error) {
    next(error);
  }
};

// Get quiz by lesson (without correct answers for students)
const getQuizByLesson = async (req, res, next) => {
  try {
    const quiz = await Quiz.findOne({ lesson: req.params.lessonId });

    if (!quiz) {
      // Return success with a flag indicating no quiz exists, so frontend can offer creation
      return res.status(200).json({
        success: true,
        data: { quiz: null, hasQuiz: false },
      });
    }

    // Strip correctIndex for students
    const sanitized = quiz.toObject();
    sanitized.questions = sanitized.questions.map((q) => ({
      _id: q._id,
      question: q.question,
      options: q.options,
    }));
    sanitized.hasQuiz = true;

    res.status(200).json({ success: true, data: { quiz: sanitized } });
  } catch (error) {
    next(error);
  }
};

// Get quiz with correct answers (for admin review)
const getQuizAdmin = async (req, res, next) => {
  try {
    const quiz = await Quiz.findById(req.params.id);
    if (!quiz) {
      return res.status(404).json({ success: false, message: 'Quiz not found' });
    }
    res.status(200).json({ success: true, data: { quiz } });
  } catch (error) {
    next(error);
  }
};

// Manually update quiz questions (admin can edit AI output)
const updateQuiz = async (req, res, next) => {
  try {
    const { questions, title, passingScore } = req.body;
    const quiz = await Quiz.findById(req.params.id);
    if (!quiz) {
      return res.status(404).json({ success: false, message: 'Quiz not found' });
    }

    if (questions) quiz.questions = questions;
    if (title) quiz.title = title;
    if (passingScore !== undefined) quiz.passingScore = passingScore;

    await quiz.save();
    res.status(200).json({ success: true, message: 'Quiz updated', data: { quiz } });
  } catch (error) {
    next(error);
  }
};

// Submit quiz answers and grade automatically
const submitQuiz = async (req, res, next) => {
  try {
    const { answers } = req.body;
    const quizId = req.params.id;
    const userId = req.user._id;

    const quiz = await Quiz.findById(quizId);
    if (!quiz) {
      return res.status(404).json({ success: false, message: 'Quiz not found' });
    }

    if (!Array.isArray(answers) || answers.length !== quiz.questions.length) {
      return res.status(400).json({
        success: false,
        message: `Please answer all ${quiz.questions.length} questions`,
      });
    }

    // Grade
    let correct = 0;
    quiz.questions.forEach((q, i) => {
      if (answers[i] === q.correctIndex) correct += 1;
    });
    const score = Math.round((correct / quiz.questions.length) * 100);
    const passed = score >= quiz.passingScore;

    const attempt = await QuizAttempt.create({
      user: userId,
      quiz: quizId,
      lesson: quiz.lesson,
      answers,
      score,
      passed,
    });

    res.status(200).json({
      success: true,
      data: {
        attempt: {
          _id: attempt._id,
          score,
          passed,
          correct,
          total: quiz.questions.length,
          passingScore: quiz.passingScore,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get user's best attempt for a lesson quiz
const getQuizResults = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const quiz = await Quiz.findOne({ lesson: req.params.lessonId });
    if (!quiz) {
      return res.status(200).json({ success: true, data: { attempt: null, hasQuiz: false } });
    }

    const attempts = await QuizAttempt.find({ user: userId, quiz: quiz._id }).sort({ score: -1 });
    res.status(200).json({
      success: true,
      data: {
        hasQuiz: true,
        bestAttempt: attempts[0] || null,
        attempts: attempts.map((a) => ({ score: a.score, passed: a.passed, createdAt: a.createdAt })),
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createQuiz,
  getQuizByLesson,
  getQuizAdmin,
  updateQuiz,
  submitQuiz,
  getQuizResults,
};

