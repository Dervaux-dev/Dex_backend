const Enrollment = require('../models/enrollmentModel');
const Lesson = require('../models/lessonModel');
const Quiz = require('../models/quizModel');
const QuizAttempt = require('../models/quizAttemptModel');

/**
 * Calculates and updates user's enrollment progress for a specific course.
 */
const recalculateCourseProgress = async (userId, courseId) => {
  try {
    const enrollment = await Enrollment.findOne({ user: userId, course: courseId });
    if (!enrollment) return null;

    // Get all lessons for the course
    const lessons = await Lesson.find({ course: courseId }).select('_id');
    const lessonIds = lessons.map((l) => l._id.toString());
    const totalLessons = lessonIds.length;

    // Get all quizzes for the course
    const quizzes = await Quiz.find({ course: courseId }).select('_id');
    const quizIds = quizzes.map((q) => q._id);
    const totalQuizzes = quizIds.length;

    if (totalLessons === 0 && totalQuizzes === 0) {
      return enrollment;
    }

    // Number of completed lessons by user
    const completedLessonSet = new Set(
      (enrollment.completedLessons || []).map((id) => id.toString())
    );
    const completedLessonsCount = lessonIds.filter((id) => completedLessonSet.has(id)).length;

    // Unique quizzes passed by the user
    const passedAttempts = await QuizAttempt.find({
      user: userId,
      quiz: { $in: quizIds },
      passed: true,
    }).select('quiz');

    const passedQuizSet = new Set(passedAttempts.map((a) => a.quiz.toString()));
    const passedQuizzesCount = passedQuizSet.size;

    // Progress computation: weighted average of lessons read (40%) and quizzes passed (60%)
    // Or equal weighting if only one category exists
    let progress = 0;
    if (totalLessons > 0 && totalQuizzes > 0) {
      const lessonRatio = completedLessonsCount / totalLessons;
      const quizRatio = passedQuizzesCount / totalQuizzes;
      progress = Math.round((lessonRatio * 40) + (quizRatio * 60));
    } else if (totalLessons > 0) {
      progress = Math.round((completedLessonsCount / totalLessons) * 100);
    } else if (totalQuizzes > 0) {
      progress = Math.round((passedQuizzesCount / totalQuizzes) * 100);
    }

    progress = Math.max(0, Math.min(100, progress));
    enrollment.progress = progress;

    if (progress >= 100) {
      enrollment.status = 'completed';
      if (!enrollment.completedAt) enrollment.completedAt = new Date();
    } else {
      enrollment.status = 'active';
      enrollment.completedAt = null;
    }

    await enrollment.save();
    return enrollment;
  } catch (err) {
    console.error('Error recalculating course progress:', err.message);
    return null;
  }
};

module.exports = {
  recalculateCourseProgress,
};
