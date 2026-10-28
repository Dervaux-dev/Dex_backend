const jwt = require('jsonwebtoken');

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL SECURITY ERROR: JWT_SECRET must be set in production!');
    }
    return 'your-secret-key';
  }
  return secret;
};

const getRefreshSecret = () => {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL SECURITY ERROR: JWT_REFRESH_SECRET must be set in production!');
    }
    return 'your-refresh-secret-key';
  }
  return secret;
};

const generateToken = (userId) => {
  return jwt.sign({ userId }, getJwtSecret(), {
    expiresIn: process.env.JWT_EXPIRE || '7d'
  });
};

const generateRefreshToken = (userId) => {
  return jwt.sign({ userId }, getRefreshSecret(), {
    expiresIn: process.env.JWT_REFRESH_EXPIRE || '30d'
  });
};

module.exports = {
  generateToken,
  generateRefreshToken,
  getJwtSecret
};
