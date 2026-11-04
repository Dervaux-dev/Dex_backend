const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const Register = require('../models/registerModel');
const Token = require('../models/tokenModel');
const { sendPasswordResetEmail } = require('../services/emailService');

const TOKEN_EXPIRATION_HOURS = 1;

/**
 * Step 2: Request Reset (POST /password-reset)
 * Accepts the user's email, checks if the user exists, generates a secure
 * random token via Node's crypto module, hashes it, stores it in the database
 * with an expiration, and emails the reset link using Nodemailer.
 */
const requestPasswordReset = async (req, res, next) => {
  try {
    const email = req.body.email ? req.body.email.toLowerCase().trim() : '';

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required',
      });
    }

    const user = await Register.findOne({ email });
    if (!user) {
      return res.status(400).json({
        success: false,
        message: "User with given email doesn't exist",
      });
    }

    // Invalidate any existing password reset token for this user
    let tokenRecord = await Token.findOne({ userId: user._id });
    if (tokenRecord) {
      await tokenRecord.deleteOne();
    }

    // Step 2 & 3: Generate a secure random token via Node's crypto module
    const resetToken = crypto.randomBytes(32).toString('hex');

    // Security Best Practice: Hash token before saving to database
    const bcryptRounds = Number(process.env.BCRYPT_ROUNDS) || 10;
    const hashedToken = await bcrypt.hash(resetToken, bcryptRounds);

    // Security Best Practice: Set token expiration (1 hour)
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRATION_HOURS * 60 * 60 * 1000);

    await new Token({
      userId: user._id,
      token: hashedToken,
      createdAt: new Date(),
      expiresAt,
    }).save();

    // Security Best Practice: Enforce HTTPS in production links
    let baseUrl = process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:5173';
    baseUrl = baseUrl.replace(/\/+$/, '');
    if (process.env.NODE_ENV === 'production' && !baseUrl.startsWith('https://')) {
      baseUrl = baseUrl.replace(/^http:\/\//i, 'https://');
    }

    // Endpoint format: /password-reset/:userId/:token
    const resetLink = `${baseUrl}/password-reset/${user._id}/${resetToken}`;

    // Send reset link using Nodemailer
    await sendPasswordResetEmail({
      to: user.email,
      fullname: user.fullname,
      resetUrl: resetLink,
    });

    return res.status(200).json({
      success: true,
      message: 'Password reset link sent to your email account',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Step 2: Confirm Reset (POST /password-reset/:userId/:token)
 * Validates the user and token parameters, hashes the new password with bcrypt,
 * updates the database record, and deletes the token so it cannot be reused.
 */
const confirmPasswordReset = async (req, res, next) => {
  try {
    const { userId, token } = req.params;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: 'New password is required',
      });
    }

    // Validate user exists
    const user = await Register.findById(userId);
    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid link or user does not exist',
      });
    }

    // Validate token record exists for user
    const tokenRecord = await Token.findOne({ userId: user._id });
    if (!tokenRecord) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired password reset link',
      });
    }

    // Security Best Practice: Check expiration date
    if (tokenRecord.expiresAt && tokenRecord.expiresAt < new Date()) {
      await tokenRecord.deleteOne();
      return res.status(400).json({
        success: false,
        message: 'Password reset link has expired. Please request a new one.',
      });
    }

    // Security Best Practice: Validate token against stored hash
    const isValidToken = await bcrypt.compare(token, tokenRecord.token);
    if (!isValidToken) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired password reset link',
      });
    }

    // Hash new password using bcrypt
    const bcryptRounds = Number(process.env.BCRYPT_ROUNDS) || 10;
    user.password = await bcrypt.hash(password, bcryptRounds);
    await user.save();

    // Security Best Practice: Invalidate on Use - delete token so it cannot be reused
    await tokenRecord.deleteOne();

    return res.status(200).json({
      success: true,
      message: 'Password reset successfully. You can now log in with your new password.',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  requestPasswordReset,
  confirmPasswordReset,
};
