const crypto = require('crypto');
const bcrypt = require('bcryptjs');

// Mock models and services (prefixed with 'mock')
const mockUsers = [];
const mockTokens = [];
const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'test-msg-id' });

jest.mock('../models/registerModel', () => ({
  findOne: jest.fn(async (query) => {
    if (query.email) {
      return mockUsers.find((u) => u.email === query.email) || null;
    }
    return null;
  }),
  findById: jest.fn(async (id) => {
    return mockUsers.find((u) => u._id === id) || null;
  }),
}));

jest.mock('../models/tokenModel', () => {
  function MockToken(data) {
    this.userId = data.userId;
    this.token = data.token;
    this.createdAt = data.createdAt;
    this.expiresAt = data.expiresAt;
    this.save = jest.fn(async () => {
      mockTokens.push(this);
      return this;
    });
    this.deleteOne = jest.fn(async () => {
      const idx = mockTokens.indexOf(this);
      if (idx !== -1) mockTokens.splice(idx, 1);
    });
  }

  MockToken.findOne = jest.fn(async (query) => {
    return mockTokens.find((t) => t.userId === query.userId) || null;
  });

  return MockToken;
});

jest.mock('../services/emailService', () => ({
  sendPasswordResetEmail: (...args) => mockSendMail(...args),
}));

const {
  requestPasswordReset,
  confirmPasswordReset,
} = require('./passwordResetController');

describe('Password Reset Controller End-to-End Flow', () => {
  beforeEach(() => {
    mockUsers.length = 0;
    mockTokens.length = 0;
    jest.clearAllMocks();

    mockUsers.push({
      _id: '64f123456789abcdef012345',
      email: 'student@example.com',
      fullname: 'Test Student',
      password: 'OldHashedPassword123!',
      save: jest.fn().mockResolvedValue(true),
    });
  });

  describe('Step 2: Request Reset (POST /password-reset)', () => {
    it('returns error if user does not exist', async () => {
      const req = { body: { email: 'nonexistent@example.com' } };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await requestPasswordReset(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: "User with given email doesn't exist",
        })
      );
    });

    it('generates random token, hashes with bcrypt, sets expiresAt, saves Token and emails link', async () => {
      const req = { body: { email: 'student@example.com' } };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await requestPasswordReset(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Password reset link sent to your email account',
        })
      );

      // Verify token record saved
      expect(mockTokens.length).toBe(1);
      const savedToken = mockTokens[0];
      expect(savedToken.userId).toBe('64f123456789abcdef012345');
      expect(savedToken.expiresAt.getTime()).toBeGreaterThan(Date.now());

      // Verify email service called with proper link
      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const emailArgs = mockSendMail.mock.calls[0][0];
      expect(emailArgs.to).toBe('student@example.com');
      expect(emailArgs.resetUrl).toContain('/password-reset/64f123456789abcdef012345/');
    });
  });

  describe('Step 2: Confirm Reset (POST /password-reset/:userId/:token)', () => {
    it('validates user and token, updates password with bcrypt hash, and deletes token on use', async () => {
      // Setup existing token
      const rawToken = crypto.randomBytes(32).toString('hex');
      const hashedToken = await bcrypt.hash(rawToken, 10);
      const TokenModel = require('../models/tokenModel');
      const tokenDoc = new TokenModel({
        userId: '64f123456789abcdef012345',
        token: hashedToken,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });
      await tokenDoc.save();

      const user = mockUsers[0];
      const req = {
        params: {
          userId: user._id,
          token: rawToken,
        },
        body: {
          password: 'NewStrongPassword123#',
        },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await confirmPasswordReset(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: expect.stringContaining('Password reset successfully'),
        })
      );

      // Token must be invalidated/deleted on use
      expect(tokenDoc.deleteOne).toHaveBeenCalled();
      expect(mockTokens.length).toBe(0);

      // User password must be updated and hashed
      expect(user.save).toHaveBeenCalled();
      const isPasswordUpdated = await bcrypt.compare('NewStrongPassword123#', user.password);
      expect(isPasswordUpdated).toBe(true);
    });

    it('rejects expired tokens', async () => {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const hashedToken = await bcrypt.hash(rawToken, 10);
      const TokenModel = require('../models/tokenModel');
      const tokenDoc = new TokenModel({
        userId: '64f123456789abcdef012345',
        token: hashedToken,
        createdAt: new Date(Date.now() - 7200000),
        expiresAt: new Date(Date.now() - 3600000), // Expired 1 hr ago
      });
      await tokenDoc.save();

      const req = {
        params: {
          userId: '64f123456789abcdef012345',
          token: rawToken,
        },
        body: {
          password: 'AnotherPassword123!',
        },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await confirmPasswordReset(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.stringContaining('expired'),
        })
      );
    });

    it('rejects invalid or tampered tokens', async () => {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const hashedToken = await bcrypt.hash(rawToken, 10);
      const TokenModel = require('../models/tokenModel');
      const tokenDoc = new TokenModel({
        userId: '64f123456789abcdef012345',
        token: hashedToken,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
      });
      await tokenDoc.save();

      const req = {
        params: {
          userId: '64f123456789abcdef012345',
          token: 'wrong-and-tampered-token',
        },
        body: {
          password: 'AnotherPassword123!',
        },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await confirmPasswordReset(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.stringContaining('Invalid or expired'),
        })
      );
    });
  });
});
