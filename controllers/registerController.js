//create register controller
const User = require('../models/registerModel');
const bcrypt = require('bcryptjs');
const { generateToken } = require('../utils/jwt');

//register user
const registerUser = async (req, res, next) => {
  try {
    const { fullname, email, password } = req.body;

    //check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ 
        success: false,
        message: 'User already exists' 
      });
    }

    //hash password
    const hashedPassword = await bcrypt.hash(password, 7);

    //create new user
    const newUser = await User.create({
      fullname,
      email,
      password: hashedPassword
    });

    //generate JWT token
    const token = generateToken(newUser._id);

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: newUser._id,
          fullname: newUser.fullname,
          email: newUser.email,
          role: newUser.role
        },
        token
      }
    });
  } catch (error) {
    next(error);
  }
};

//export register controller
module.exports = { registerUser };

