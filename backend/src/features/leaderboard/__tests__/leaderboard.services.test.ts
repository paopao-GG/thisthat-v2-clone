// Unit tests for Leaderboard Services
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Create hoisted mock objects
const mockPrisma = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
}));

const mockRedis = vi.hoisted(() => ({
  safeRedisGet: vi.fn(),
  safeRedisSetEx: vi.fn(),
  safeRedisDel: vi.fn(),
  safeRedisKeys: vi.fn(),
}));

// Mock Prisma
vi.mock('../../../lib/database.js', () => ({
  prisma: mockPrisma,
}));

// Mock Redis
vi.mock('../../../lib/redis.js', () => mockRedis);

// Import service AFTER mocks
import * as leaderboardService from '../leaderboard.services.js';
import { safeRedisGet, safeRedisSetEx, safeRedisDel, safeRedisKeys } from '../../../lib/redis.js';

describe('Leaderboard Services', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset Redis mocks
    vi.mocked(safeRedisGet).mockResolvedValue(null);
    vi.mocked(safeRedisSetEx).mockResolvedValue(undefined);
    vi.mocked(safeRedisDel).mockResolvedValue(0);
    vi.mocked(safeRedisKeys).mockResolvedValue([]);
  });

  describe('getPnLLeaderboard', () => {
    it('should return PnL leaderboard from cache', async () => {
      const cachedData = {
        leaderboard: [
          { rank: 1, user: { id: 'user-1', username: 'user1' }, overallPnL: 1000 },
        ],
        total: 1,
        limit: 100,
        offset: 0,
      };

      vi.mocked(safeRedisGet).mockResolvedValue(JSON.stringify(cachedData));

      const result = await leaderboardService.getPnLLeaderboard(100, 0);

      expect(result).toEqual(cachedData);
      expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
    });

    it('should query database if cache miss', async () => {
      vi.mocked(safeRedisGet).mockResolvedValue(null);

      const mockUsers = [
        {
          id: 'user-1',
          username: 'user1',
          overallPnL: 1000,
          totalVolume: 5000,
          rankByPnL: 1,
        },
      ];

      mockPrisma.user.findMany.mockResolvedValue(mockUsers as any);
      mockPrisma.user.count.mockResolvedValue(1);
      vi.mocked(safeRedisSetEx).mockResolvedValue(undefined);

      const result = await leaderboardService.getPnLLeaderboard(100, 0);

      expect(result.leaderboard).toHaveLength(1);
      expect(result.leaderboard[0].rank).toBe(1);
      expect(safeRedisSetEx).toHaveBeenCalled();
    });
  });

  describe('getVolumeLeaderboard', () => {
    it('should return volume leaderboard', async () => {
      vi.mocked(safeRedisGet).mockResolvedValue(null);

      const mockUsers = [
        {
          id: 'user-1',
          username: 'user1',
          totalVolume: 10000,
          overallPnL: 500,
          rankByVolume: 1,
        },
      ];

      mockPrisma.user.findMany.mockResolvedValue(mockUsers as any);
      mockPrisma.user.count.mockResolvedValue(1);
      vi.mocked(safeRedisSetEx).mockResolvedValue(undefined);

      const result = await leaderboardService.getVolumeLeaderboard(100, 0);

      expect(result.leaderboard).toHaveLength(1);
      expect(result.leaderboard[0].totalVolume).toBe(10000);
    });
  });

  describe('getUserRanking', () => {
    it('should return user ranking for PnL', async () => {
      const userId = 'user-123';
      const mockUser = {
        rankByPnL: 10,
        rankByVolume: 20,
        overallPnL: 500,
        totalVolume: 5000,
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any);
      mockPrisma.user.count.mockResolvedValue(100);

      const result = await leaderboardService.getUserRanking(userId, 'pnl');

      expect(result?.rank).toBe(10);
      expect(result?.totalUsers).toBe(100);
      expect(result?.overallPnL).toBe(500);
    });

    it('should return user ranking for volume', async () => {
      const userId = 'user-123';
      const mockUser = {
        rankByPnL: 10,
        rankByVolume: 5,
        overallPnL: 500,
        totalVolume: 10000,
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any);
      mockPrisma.user.count.mockResolvedValue(100);

      const result = await leaderboardService.getUserRanking(userId, 'volume');

      expect(result?.rank).toBe(5);
      expect(result?.totalVolume).toBe(10000);
    });

    it('should return null if user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await leaderboardService.getUserRanking('non-existent', 'pnl');

      expect(result).toBeNull();
    });
  });

  describe('updateAllRankings', () => {
    it('should update all user rankings', async () => {
      const pnlUsers = [
        { id: 'user-1' },
        { id: 'user-2' },
        { id: 'user-3' },
      ];

      const volumeUsers = [
        { id: 'user-1' },
        { id: 'user-2' },
        { id: 'user-3' },
      ];

      mockPrisma.user.findMany
        .mockResolvedValueOnce(pnlUsers as any)
        .mockResolvedValueOnce(volumeUsers as any);

      mockPrisma.user.update.mockResolvedValue({} as any);
      vi.mocked(safeRedisKeys).mockResolvedValue(['leaderboard:pnl:100:0']);
      vi.mocked(safeRedisDel).mockResolvedValue(1);

      const result = await leaderboardService.updateAllRankings();

      expect(result.pnlUpdated).toBe(3);
      expect(result.volumeUpdated).toBe(3);
      expect(safeRedisDel).toHaveBeenCalled();
    });
  });
});

