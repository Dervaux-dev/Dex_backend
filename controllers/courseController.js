const Course = require('../models/courseModel');
const Enrollment = require('../models/enrollmentModel');
const User = require('../models/registerModel');

const getAllCourses = async (req, res, next) => {
  try {
    const { limit = 20, sort = '-createdAt', category } = req.query;
    const filter = {};
    if (category) filter.category = category;

    const courses = await Course.find(filter)
      .sort(sort)
      .limit(Number(limit));

    res.status(200).json({
      success: true,
      data: {
        courses,
      }
    });
  } catch (error) {
    next(error);
  }
};

const getCourseById = async (req, res, next) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }
    res.status(200).json({ success: true, data: { course } });
  } catch (error) {
    next(error);
  }
};

// Enroll the authenticated user in a course
const enrollInCourse = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const courseId = req.params.id;

    // Verify the course exists
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    // Check if already enrolled
    const existingEnrollment = await Enrollment.findOne({ user: userId, course: courseId });

    // If user already has the course in their enrolledCourses but no enrollment doc, still block
    const user = await User.findById(userId);
    const alreadyEnrolled =
      existingEnrollment ||
      (user && user.enrolledCourses.some((c) => c.toString() === courseId.toString()));

    if (alreadyEnrolled) {
      return res.status(400).json({ success: false, message: 'You are already enrolled in this course' });
    }

    // Create the enrollment record
    const enrollment = await Enrollment.create({
      user: userId,
      course: courseId,
      status: 'active',
      progress: 0
    });

    // Add course to user's enrolledCourses
    await User.findByIdAndUpdate(
      userId,
      { $addToSet: { enrolledCourses: courseId } },
      { new: true }
    );

    res.status(201).json({
      success: true,
      message: 'Enrolled successfully',
      data: { enrollment }
    });
  } catch (error) {
    next(error);
  }
};

// Get the authenticated user's enrolled courses (with progress)
const getEnrolledCourses = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const enrollments = await Enrollment.find({ user: userId, status: { $ne: 'dropped' } })
      .populate('course', 'title description category level price instructor rating');

    res.status(200).json({
      success: true,
      data: { enrollments }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllCourses,
  getCourseById,
  enrollInCourse,
  getEnrolledCourses,
};
