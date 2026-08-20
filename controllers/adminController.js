const User = require('../models/registerModel');
const Course = require('../models/courseModel');
const Lesson = require('../models/lessonModel');
const Quiz = require('../models/quizModel');
const Enrollment = require('../models/enrollmentModel');
const QuizAttempt = require('../models/quizAttemptModel');
const bcrypt = require('bcryptjs');

// Get dashboard statistics
const getDashboardStats = async (req, res, next) => {
  try {
    const [totalUsers, totalCourses, totalLessons, totalQuizzes, totalEnrollments, totalQuizAttempts] =
      await Promise.all([
        User.countDocuments(),
        Course.countDocuments(),
        Lesson.countDocuments(),
        Quiz.countDocuments(),
        Enrollment.countDocuments(),
        QuizAttempt.countDocuments(),
      ]);

    const recentUsers = await User.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select('fullname email role isActive createdAt');

    const recentCourses = await Course.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select('title category gradeLevel createdAt');

    const activeUsers = await User.countDocuments({ isActive: true });
    const adminCount = await User.countDocuments({ role: 'admin' });

    res.status(200).json({
      success: true,
      data: {
        stats: {
          totalUsers,
          totalCourses,
          totalLessons,
          totalQuizzes,
          totalEnrollments,
          totalQuizAttempts,
          activeUsers,
          adminCount,
        },
        recentUsers,
        recentCourses,
      },
    });
  } catch (error) {
    next(error);
  }
};

// List all users with pagination and search
const listUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search = '', role = '' } = req.query;
    const filter = {};

    if (search) {
      filter.$or = [
        { fullname: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    if (role) {
      filter.role = role;
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [users, total] = await Promise.all([
      User.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .select('-password'),
      User.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: {
        users,
        pagination: {
          total,
          page: Number(page),
          pages: Math.ceil(total / Number(limit)),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get single user details
const getUserById = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.status(200).json({ success: true, data: { user } });
  } catch (error) {
    next(error);
  }
};

// Admin creates a new user account (manual account creation)
const createUser = async (req, res, next) => {
  try {
    const { fullname, email, password, role } = req.body;

    if (!fullname || !email || !password) {
      return res.status(400).json({ success: false, message: 'Full name, email, and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'A user with this email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 7);

    const newUser = await User.create({
      fullname: fullname.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      role: role === 'admin' ? 'admin' : 'user',
    });

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data: {
        user: {
          id: newUser._id,
          fullname: newUser.fullname,
          email: newUser.email,
          role: newUser.role,
          isActive: newUser.isActive,
          createdAt: newUser.createdAt,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// Update user role or active status
const updateUser = async (req, res, next) => {
  try {
    const { role, isActive, fullname, email } = req.body;
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'You cannot modify your own account from here' });
    }

    if (role !== undefined) {
      if (!['user', 'admin'].includes(role)) {
        return res.status(400).json({ success: false, message: 'Invalid role' });
      }
      user.role = role;
    }

    if (isActive !== undefined) {
      user.isActive = isActive;
    }

    if (fullname) {
      user.fullname = fullname.trim();
    }

    if (email && email !== user.email) {
      const emailExists = await User.findOne({ email: email.toLowerCase().trim(), _id: { $ne: user._id } });
      if (emailExists) {
        return res.status(400).json({ success: false, message: 'Email is already in use' });
      }
      user.email = email.toLowerCase().trim();
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data: {
        user: {
          id: user._id,
          fullname: user.fullname,
          email: user.email,
          role: user.role,
          isActive: user.isActive,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// Delete a user
const deleteUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'You cannot delete your own account' });
    }

    await User.findByIdAndDelete(req.params.id);

    res.status(200).json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// List all courses for admin (with lesson/quiz counts)
const listCoursesAdmin = async (req, res, next) => {
  try {
    const courses = await Course.find().sort({ createdAt: -1 });

    const coursesWithCounts = await Promise.all(
      courses.map(async (course) => {
        const [lessonCount, quizCount, enrollmentCount] = await Promise.all([
          Lesson.countDocuments({ course: course._id }),
          Quiz.countDocuments({ course: course._id }),
          Enrollment.countDocuments({ course: course._id }),
        ]);
        return {
          ...course.toObject(),
          lessonCount,
          quizCount,
          enrollmentCount,
        };
      })
    );

    res.status(200).json({
      success: true,
      data: { courses: coursesWithCounts },
    });
  } catch (error) {
    next(error);
  }
};

// List all enrollments for admin
const listEnrollments = async (req, res, next) => {
  try {
    const enrollments = await Enrollment.find()
      .sort({ createdAt: -1 })
      .populate('user', 'fullname email')
      .populate('course', 'title category gradeLevel');

    res.status(200).json({
      success: true,
      data: { enrollments, count: enrollments.length },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDashboardStats,
  listUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  listCoursesAdmin,
  listEnrollments,
};
