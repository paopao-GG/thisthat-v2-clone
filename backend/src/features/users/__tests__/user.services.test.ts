// Unit tests for User Services
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Create hoisted mock object
const mockPrisma = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock Prisma
vi.mock('../../../lib/database.js', () => ({
  prisma: mockPrisma,
}));

// Import service AFTER mocks
import * as userService from '../user.services.js';

describe('User Services', () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('updateUserProfile', () => {
    it('should update user profile successfully', async () => {
      const userId = 'user-123';
      const input = {
        name: 'Updated Name',
        username: 'newusername',
      };

      const mockUpdatedUser = {
        id: userId,
        username: input.username,
        name: input.name,
        creditBalance: 1000,
        totalVolume: 5000,
        overallPnL: 200,
        rankByPnL: 10,
        rankByVolume: 5,
        createdAt: new Date(),
      };

      mockPrisma.user.findUnique.mockResolvedValue(null); // Username not taken
      mockPrisma.user.update.mockResolvedValue(mockUpdatedUser as any);

      const result = await userService.updateUserProfile(userId, input);

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { username: input.username },
      });
      expect(mockPrisma.user.update).toHaveBeenCalled();
      expect(result.username).toBe(input.username);
      expect(result.name).toBe(input.name);
    });

    it('should throw error if username already taken', async () => {
      const userId = 'user-123';
      const input = {
        username: 'takenusername',
      };

      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'other-user',
      } as any);

      await expect(
        userService.updateUserProfile(userId, input)
      ).rejects.toThrow('Username already taken');
    });

    it('should allow updating same username for same user', async () => {
      const userId = 'user-123';
      const input = {
        username: 'sameusername',
      };

      const mockUpdatedUser = {
        id: userId,
        username: input.username,
        name: null,
        creditBalance: 1000,
        totalVolume: 0,
        overallPnL: 0,
        rankByPnL: null,
        rankByVolume: null,
        createdAt: new Date(),
      };

      mockPrisma.user.findUnique.mockResolvedValue({
        id: userId, // Same user
      } as any);
      mockPrisma.user.update.mockResolvedValue(mockUpdatedUser as any);

      const result = await userService.updateUserProfile(userId, input);

      expect(result.username).toBe(input.username);
    });

    it('should only update provided fields', async () => {
      const userId = 'user-123';
      const input = {
        name: 'New Name',
        // username not provided
      };

      const mockUpdatedUser = {
        id: userId,
        username: 'existingusername',
        name: input.name,
        creditBalance: 1000,
        totalVolume: 0,
        overallPnL: 0,
        rankByPnL: null,
        rankByVolume: null,
        createdAt: new Date(),
      };

      mockPrisma.user.update.mockResolvedValue(mockUpdatedUser as any);

      const result = await userService.updateUserProfile(userId, input);

      expect(result.name).toBe(input.name);
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled(); // Username check skipped
    });
  });

  describe('getUserById', () => {
    it('should return user profile', async () => {
      const userId = 'user-123';
      const mockUser = {
        id: userId,
        username: 'testuser',
        name: 'Test User',
        creditBalance: 1000,
        totalVolume: 5000,
        overallPnL: 200,
        rankByPnL: 10,
        rankByVolume: 5,
        createdAt: new Date(),
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any);

      const result = await userService.getUserById(userId);

      expect(result).toBeDefined();
      expect(result?.id).toBe(userId);
      expect(result?.username).toBe('testuser');
      expect(result?.creditBalance).toBe(1000);
    });

    it('should return null if user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await userService.getUserById('non-existent');

      expect(result).toBeNull();
    });
  });
});

