const jwt = require('jsonwebtoken');
const User = require('../models/registerModel');

const getSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('CRITICAL: JWT_SECRET environment variable is missing in production!');
      return null;
    }
    return 'your-secret-key';
  }
  return secret;
};

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '') || req.query.token;

    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    // Demo admin bypass allowed only in development or testing
    if (token === 'demo-admin-token') {
      if (process.env.NODE_ENV === 'production') {
        return res.status(401).json({ message: 'Demo tokens are disabled in production' });
      }
      req.user = {
        _id: 'admin-dex-id',
        fullname: 'NZANYWAYIMANA Ineza Yves Delvo',
        email: 'admin@dexelearning.com',
        role: 'admin',
        isActive: true,
      };
      return next();
    }

    const secret = getSecret();
    if (!secret) {
      return res.status(500).json({ message: 'Server authentication misconfiguration' });
    }

    const decoded = jwt.verify(token, secret);
    const user = await User.findById(decoded.userId).select('-password');

    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    if (!user.isActive) {
      return res.status(401).json({ message: 'Account is deactivated' });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
};

const adminAuth = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
};

const optionalAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '') || req.query.token;

    if (token) {
      if (token === 'demo-admin-token') {
        if (process.env.NODE_ENV !== 'production') {
          req.user = {
            _id: 'admin-dex-id',
            fullname: 'NZANYWAYIMANA Ineza Yves Delvo',
            email: 'admin@dexelearning.com',
            role: 'admin',
            isActive: true,
          };
        }
        return next();
      }

      const secret = getSecret();
      if (!secret) return next();

      const decoded = jwt.verify(token, secret);
      const user = await User.findById(decoded.userId).select('-password');

      if (user && user.isActive) {
        req.user = user;
      }
    }
    next();
  } catch (error) {
    next();
  }
};

module.exports = { auth, adminAuth, optionalAuth };
