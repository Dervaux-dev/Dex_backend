const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../models/registerModel');
const { sendPasswordResetEmail, isEmailConfigured } = require('../services/emailService');

const RESET_TOKEN_TTL_MINUTES = 30;

const hashToken = (token) =>
  crypto.createHash('sha256').update(token).digest('hex');

// POST /api/auth/forgot-password
// Always answers with the same generic message so email addresses can't be probed.
const forgotPassword = async (req, res, next) => {
  try {
    if (!isEmailConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'Password reset is not available right now. Please contact support.',
      });
    }

    const email = req.body.email.toLowerCase().trim();
    const user = await User.findOne({ email, isActive: true });

    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      user.resetPasswordToken = hashToken(token);
      user.resetPasswordExpires = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);
      await user.save();

      const appUrl = (process.env.APP_URL || 'http://localhost:5173').replace(/\/+$/, '');
      const resetUrl = `${appUrl}/reset-password?token=${token}`;

      try {
        await sendPasswordResetEmail({ to: user.email, fullname: user.fullname, resetUrl });
      } catch (err) {
        console.error('Failed to send password reset email:', err.message);
        // Invalidate the token again so a failed send never leaves a dangling link
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();
        return res.status(503).json({
          success: false,
          message: 'Could not send the reset email. Please try again later.',
        });
      }
    }

    res.status(200).json({
      success: true,
      message: `If an account exists for that email, a password reset link has been sent. It expires in ${RESET_TOKEN_TTL_MINUTES} minutes.`,
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/auth/reset-password
const resetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body;

    const user = await User.findOne({
      resetPasswordToken: hashToken(token),
      resetPasswordExpires: { $gt: new Date() },
      isActive: true,
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'This reset link is invalid or has expired. Please request a new one.',
      });
    }

    user.password = await bcrypt.hash(password, 10);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password reset successfully. You can now sign in with your new password.',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { forgotPassword, resetPassword };
