// Login controller for user authentication
const User = require('../models/registerModel');
const bcrypt = require('bcryptjs');
const { generateToken } = require('../utils/jwt');

// Login user
const loginUser = async (req, res, next) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email or full name and password are required'
      });
    }

    // Find user by email or fullname (case-insensitive)
    const user = await User.findOne({
      $or: [
        { email: identifier.toLowerCase().trim() },
        { fullname: { $regex: new RegExp(`^${identifier.trim()}$`, 'i') } }
      ]
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email, name, or password'
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Your account has been deactivated. Please contact support.'
      });
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email, name, or password'
      });
    }

    // Generate JWT token
    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      data: {
        user: {
          id: user._id,
          fullname: user.fullname,
          email: user.email,
          role: user.role
        },
        token
      }
    });
  } catch (error) {
    next(error);
  }
};

// Export login controller
module.exports = { loginUser };

