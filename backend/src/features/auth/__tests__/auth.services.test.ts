// Unit tests for Auth Services
import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcrypt';

// ✅ Hoisted Prisma mock object (no imports inside!)
const mockPrisma = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  creditTransaction: {
    create: vi.fn(),
  },
  refreshToken: {
    create: vi.fn(),
    findMany: vi.fn(),
    delete: vi.fn(),
  },
  $transaction: vi.fn(),
}));

// ✅ Mock Prisma module
vi.mock('../../../lib/database.js', () => ({
  prisma: mockPrisma,
}));

// ✅ Mock bcrypt
vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn(),
    compare: vi.fn(),
  },
}));

// Import service *after* mocks (Vitest hoists anyway, but this is clearer)
import * as authService from '../auth.services.js';

// Mock JWT
const mockJwt = {
  sign: vi.fn((payload: any, options: any) => `mock-token-${payload.userId || 'default'}`),
};

describe('Auth Services', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set up $transaction mock
    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      return callback(mockPrisma);
    });
  });

  describe('hashPassword', () => {
    it('should hash password using bcrypt', async () => {
      const password = 'testpassword123';
      const hashedPassword = '$2b$12$hashed';

      vi.mocked(bcrypt.hash).mockResolvedValue(hashedPassword as never);

      const result = await authService.hashPassword(password);

      expect(bcrypt.hash).toHaveBeenCalledWith(password, 12);
      expect(result).toBe(hashedPassword);
    });
  });

  describe('verifyPassword', () => {
    it('should verify password correctly', async () => {
      const password = 'testpassword123';
      const hash = '$2b$12$hashed';

      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

      const result = await authService.verifyPassword(password, hash);

      expect(bcrypt.compare).toHaveBeenCalledWith(password, hash);
      expect(result).toBe(true);
    });

    it('should return false for invalid password', async () => {
      vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

      const result = await authService.verifyPassword('wrong', 'hash');

      expect(result).toBe(false);
    });
  });

  describe('registerUser', () => {
    const signupInput = {
      email: 'test@example.com',
      username: 'testuser',
      password: 'password123',
      name: 'Test User',
    };

    it('should register a new user successfully', async () => {
      const hashedPassword = '$2b$12$hashed';
      const mockUser = {
        id: 'user-123',
        email: signupInput.email,
        username: signupInput.username,
        name: signupInput.name,
        passwordHash: hashedPassword,
        creditBalance: 1000,
        availableCredits: 1000,
        expendedCredits: 0,
        consecutiveDaysOnline: 1,
        lastLoginAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(bcrypt.hash).mockResolvedValue(hashedPassword as never);
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(mockUser as any);
      mockPrisma.creditTransaction.create.mockResolvedValue({} as any);
      mockPrisma.refreshToken.create.mockResolvedValue({} as any);

      const result = await authService.registerUser(signupInput, mockJwt as any);

      expect(mockPrisma.user.findUnique).toHaveBeenCalledTimes(3); // Referral code uniqueness + email + username
      expect(mockPrisma.user.create).toHaveBeenCalled();
      expect(result.user.email).toBe(signupInput.email);
      expect(result.user.creditBalance).toBe(1000);
      expect(result.tokens.accessToken).toBeDefined();
      expect(result.tokens.refreshToken).toBeDefined();
    });

    it('should throw error if email already exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'existing' } as any);

      await expect(
        authService.registerUser(signupInput, mockJwt as any),
      ).rejects.toThrow('Email already registered');
    });

    it('should throw error if username already exists', async () => {
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(null) // Email check passes
        .mockResolvedValueOnce({ id: 'existing' } as any); // Username check fails

      await expect(
        authService.registerUser(signupInput, mockJwt as any),
      ).rejects.toThrow('Username already taken');
    });
  });

  describe('authenticateUser', () => {
    const loginInput = {
      email: 'test@example.com',
      password: 'password123',
    };

    const mockUser = {
      id: 'user-123',
      email: loginInput.email,
      username: 'testuser',
      name: 'Test User',
      passwordHash: '$2b$12$hashed',
      creditBalance: 1000,
      availableCredits: 1000,
      expendedCredits: 0,
      consecutiveDaysOnline: 1,
      lastLoginAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // Yesterday
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should authenticate user successfully', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
      mockPrisma.user.update.mockResolvedValue(mockUser as any);
      mockPrisma.refreshToken.create.mockResolvedValue({} as any);

      const result = await authService.authenticateUser(loginInput, mockJwt as any);

      expect(bcrypt.compare).toHaveBeenCalledWith(
        loginInput.password,
        mockUser.passwordHash,
      );
      expect(result.user.email).toBe(loginInput.email);
      expect(result.tokens.accessToken).toBeDefined();
      expect(result.tokens.refreshToken).toBeDefined();
    });

    it('should throw error for invalid email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        authService.authenticateUser(loginInput, mockJwt as any),
      ).rejects.toThrow('Invalid email or password');
    });

    it('should throw error for invalid password', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any);
      vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

      await expect(
        authService.authenticateUser(loginInput, mockJwt as any),
      ).rejects.toThrow('Invalid email or password');
    });

    it('should increment consecutive days on next day login', async () => {
      const userWithStreak = {
        ...mockUser,
        consecutiveDaysOnline: 5,
        lastLoginAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // Yesterday
      };

      mockPrisma.user.findUnique.mockResolvedValue(userWithStreak as any);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
      mockPrisma.user.update.mockResolvedValue({
        ...userWithStreak,
        consecutiveDaysOnline: 6,
      } as any);
      mockPrisma.refreshToken.create.mockResolvedValue({} as any);

      await authService.authenticateUser(loginInput, mockJwt as any);

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            consecutiveDaysOnline: 6,
          }),
        }),
      );
    });

    it('should reset streak if gap is 2+ days', async () => {
      const userWithBrokenStreak = {
        ...mockUser,
        consecutiveDaysOnline: 5,
        lastLoginAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
      };

      mockPrisma.user.findUnique.mockResolvedValue(userWithBrokenStreak as any);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
      mockPrisma.user.update.mockResolvedValue({
        ...userWithBrokenStreak,
        consecutiveDaysOnline: 1,
      } as any);
      mockPrisma.refreshToken.create.mockResolvedValue({} as any);

      await authService.authenticateUser(loginInput, mockJwt as any);

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            consecutiveDaysOnline: 1,
          }),
        }),
      );
    });
  });

  describe('getUserProfile', () => {
    it('should return user profile', async () => {
      const mockUser = {
        id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        name: 'Test User',
        creditBalance: 1000,
        availableCredits: 1000,
        expendedCredits: 0,
        consecutiveDaysOnline: 1,
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any);

      const result = await authService.getUserProfile('user-123');

      expect(result).toBeDefined();
      expect(result?.id).toBe('user-123');
      expect(result?.email).toBe('test@example.com');
    });

    it('should return null if user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await authService.getUserProfile('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('refreshAccessToken', () => {
    it('should refresh access token successfully', async () => {
      const refreshToken = 'valid-refresh-token';
      const mockRefreshToken = {
        id: 'token-123',
        userId: 'user-123',
        tokenHash: 'hashed-token',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        user: {
          id: 'user-123',
          email: 'test@example.com',
        },
      };

      mockPrisma.refreshToken.findMany.mockResolvedValue([mockRefreshToken] as any);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

      const result = await authService.refreshAccessToken(refreshToken, mockJwt as any);

      expect(result.accessToken).toBeDefined();
      expect(mockJwt.sign).toHaveBeenCalled();
    });

    it('should throw error for invalid refresh token', async () => {
      mockPrisma.refreshToken.findMany.mockResolvedValue([]);

      await expect(
        authService.refreshAccessToken('invalid-token', mockJwt as any),
      ).rejects.toThrow('Invalid or expired refresh token');
    });
  });

  describe('logoutUser', () => {
    it('should logout user successfully', async () => {
      const refreshToken = 'valid-refresh-token';
      const mockRefreshToken = {
        id: 'token-123',
        userId: 'user-123',
        tokenHash: 'hashed-token',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };

      mockPrisma.refreshToken.findMany.mockResolvedValue([mockRefreshToken] as any);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
      mockPrisma.refreshToken.delete.mockResolvedValue(mockRefreshToken as any);

      await authService.logoutUser(refreshToken);

      expect(mockPrisma.refreshToken.delete).toHaveBeenCalledWith({
        where: { id: 'token-123' },
      });
    });

    it('should not throw error if token not found', async () => {
      mockPrisma.refreshToken.findMany.mockResolvedValue([]);

      await expect(authService.logoutUser('invalid-token')).resolves.not.toThrow();
    });
  });
});
