// Unit tests for Auth Controllers
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as authControllers from '../auth.controllers.js';
import * as authService from '../auth.services.js';
import { signupSchema, loginSchema } from '../auth.models.js';

// Mock auth services
vi.mock('../auth.services.js');

// Mock Zod schemas
vi.mock('../auth.models.js', () => ({
  signupSchema: {
    parse: vi.fn((data) => data),
  },
  loginSchema: {
    parse: vi.fn((data) => data),
  },
}));

describe('Auth Controllers', () => {
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset schema mocks
    vi.mocked(signupSchema.parse).mockImplementation((data) => data);
    vi.mocked(loginSchema.parse).mockImplementation((data) => data);

    mockRequest = {
      body: {},
      user: { userId: 'user-123' },
      server: {
        jwt: {
          sign: vi.fn(() => 'mock-token'),
        },
      },
      log: {
        error: vi.fn(),
      },
    };

    mockReply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };
  });

  describe('signupHandler', () => {
    it('should register user successfully', async () => {
      const signupData = {
        email: 'test@example.com',
        username: 'testuser',
        password: 'password123',
        name: 'Test User',
      };

      mockRequest.body = signupData;

      const mockResult = {
        user: {
          id: 'user-123',
          email: signupData.email,
          username: signupData.username,
          creditBalance: 1000,
        },
        tokens: {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
        },
      };

      vi.mocked(authService.registerUser).mockResolvedValue(mockResult);

      await authControllers.signupHandler(mockRequest, mockReply);

      expect(signupSchema.parse).toHaveBeenCalledWith(signupData);
      expect(authService.registerUser).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(201);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        user: mockResult.user,
        accessToken: mockResult.tokens.accessToken,
        refreshToken: mockResult.tokens.refreshToken,
      });
    });

    it('should return 400 for validation error', async () => {
      const zodError = {
        name: 'ZodError',
        errors: [{ path: ['email'], message: 'Invalid email' }],
      };

      vi.mocked(signupSchema.parse).mockImplementation(() => {
        throw zodError;
      });

      await authControllers.signupHandler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Validation error',
        details: zodError.errors,
      });
    });

    it('should return 409 for duplicate email', async () => {
      mockRequest.body = {
        email: 'test@example.com',
        username: 'testuser',
        password: 'password123',
      };

      const error: any = new Error('Email already registered');
      error.name = 'Error'; // Not ZodError
      vi.mocked(authService.registerUser).mockRejectedValue(error);

      await authControllers.signupHandler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(409);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Email already registered',
      });
    });

    it('should return 500 for server error', async () => {
      mockRequest.body = {
        email: 'test@example.com',
        username: 'testuser',
        password: 'password123',
      };

      const error: any = new Error('Database error');
      error.name = 'Error'; // Not ZodError
      vi.mocked(authService.registerUser).mockRejectedValue(error);

      await authControllers.signupHandler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  describe('loginHandler', () => {
    it('should login user successfully', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'password123',
      };

      mockRequest.body = loginData;

      const mockResult = {
        user: {
          id: 'user-123',
          email: loginData.email,
          creditBalance: 1000,
        },
        tokens: {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
        },
      };

      vi.mocked(authService.authenticateUser).mockResolvedValue(mockResult);

      await authControllers.loginHandler(mockRequest, mockReply);

      expect(loginSchema.parse).toHaveBeenCalledWith(loginData);
      expect(authService.authenticateUser).toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        user: mockResult.user,
        accessToken: mockResult.tokens.accessToken,
        refreshToken: mockResult.tokens.refreshToken,
      });
    });

    it('should return 401 for invalid credentials', async () => {
      vi.mocked(authService.authenticateUser).mockRejectedValue(
        new Error('Invalid email or password')
      );

      await authControllers.loginHandler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });
  });

  describe('getMeHandler', () => {
    it('should return user profile', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        username: 'testuser',
        creditBalance: 1000,
      };

      vi.mocked(authService.getUserProfile).mockResolvedValue(mockUser);

      await authControllers.getMeHandler(mockRequest, mockReply);

      expect(authService.getUserProfile).toHaveBeenCalledWith('user-123');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        user: mockUser,
      });
    });

    it('should return 401 if user not authenticated', async () => {
      mockRequest.user = null;

      await authControllers.getMeHandler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });

    it('should return 404 if user not found', async () => {
      vi.mocked(authService.getUserProfile).mockResolvedValue(null);

      await authControllers.getMeHandler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });
  });

  describe('refreshHandler', () => {
    it('should refresh access token successfully', async () => {
      mockRequest.body = { refreshToken: 'valid-refresh-token' };

      vi.mocked(authService.refreshAccessToken).mockResolvedValue({
        accessToken: 'new-access-token',
      });

      await authControllers.refreshHandler(mockRequest, mockReply);

      expect(authService.refreshAccessToken).toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        accessToken: 'new-access-token',
      });
    });

    it('should return 400 if refresh token missing', async () => {
      mockRequest.body = {};

      await authControllers.refreshHandler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });

    it('should return 401 for invalid refresh token', async () => {
      mockRequest.body = { refreshToken: 'invalid-token' };

      vi.mocked(authService.refreshAccessToken).mockRejectedValue(
        new Error('Invalid or expired refresh token')
      );

      await authControllers.refreshHandler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });
  });

  describe('logoutHandler', () => {
    it('should logout user successfully', async () => {
      mockRequest.body = { refreshToken: 'valid-refresh-token' };

      vi.mocked(authService.logoutUser).mockResolvedValue(undefined);

      await authControllers.logoutHandler(mockRequest, mockReply);

      expect(authService.logoutUser).toHaveBeenCalledWith('valid-refresh-token');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        message: 'Logged out successfully',
      });
    });

    it('should return 400 if refresh token missing', async () => {
      mockRequest.body = {};

      await authControllers.logoutHandler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });
  });
});

