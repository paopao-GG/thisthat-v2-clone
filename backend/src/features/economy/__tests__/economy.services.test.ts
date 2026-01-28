// Unit tests for Economy Services
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Create hoisted mock object
const mockPrisma = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  creditTransaction: {
    create: vi.fn(),
  },
  dailyReward: {
    create: vi.fn(),
  },
  stock: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  stockHolding: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  stockTransaction: {
    create: vi.fn(),
  },
  $transaction: vi.fn(),
}));

// Mock Prisma
vi.mock('../../../lib/database.js', () => ({
  prisma: mockPrisma,
}));

// Mock transaction signer
vi.mock('../../../lib/transaction-signer.js', () => ({
  generateTransactionHash: vi.fn(() => 'mock-hash-123'),
}));

// Import service AFTER mocks
import * as economyService from '../economy.services.js';

describe('Economy Services', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      return callback(mockPrisma);
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('calculateDailyCredits', () => {
    it('should return 1000 credits for day 1', () => {
      const result = economyService.calculateDailyCredits(1);
      expect(result).toBe(1000);
    });

    it('should return 1500 credits for day 2', () => {
      const result = economyService.calculateDailyCredits(2);
      expect(result).toBe(1500);
    });

    it('should return 10000 credits for day 18', () => {
      const result = economyService.calculateDailyCredits(18);
      expect(result).toBe(10000);
    });

    it('should stay at 10000 credits for streaks beyond day 18', () => {
      expect(economyService.calculateDailyCredits(19)).toBe(10000);
      expect(economyService.calculateDailyCredits(30)).toBe(10000);
    });
  });

  describe('processDailyCreditAllocation', () => {
    const userId = 'user-123';
    const mockUser = {
      id: userId,
      creditBalance: 1000,
      availableCredits: 1000,
      consecutiveDaysOnline: 1,
      lastDailyRewardAt: null,
      lastLoginAt: null,
    };

    it('should allocate daily credits for first claim', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any);
      mockPrisma.user.update.mockResolvedValue({
        ...mockUser,
        creditBalance: 2000,
        availableCredits: 2000,
        consecutiveDaysOnline: 1,
        lastDailyRewardAt: new Date(),
      } as any);
      mockPrisma.creditTransaction.create.mockResolvedValue({} as any);
      mockPrisma.dailyReward.create.mockResolvedValue({} as any);

      const result = await economyService.processDailyCreditAllocation(userId);

      expect(result.creditsAwarded).toBe(1000);
      expect(result.consecutiveDays).toBe(1);
      expect(mockPrisma.user.update).toHaveBeenCalled();
    });

    it('should increment consecutive days on next day claim', async () => {
      vi.setSystemTime(new Date('2025-01-02T10:00:00Z'));
      const userWithStreak = {
        ...mockUser,
        consecutiveDaysOnline: 5,
        lastDailyRewardAt: new Date('2025-01-01T03:00:00Z'),
        lastLoginAt: new Date('2025-01-01T03:00:00Z'),
      };

      mockPrisma.user.findUnique.mockResolvedValue(userWithStreak as any);
      mockPrisma.user.update.mockResolvedValue({
        ...userWithStreak,
        consecutiveDaysOnline: 6,
        creditBalance: 4000,
        availableCredits: 4000,
      } as any);
      mockPrisma.creditTransaction.create.mockResolvedValue({} as any);
      mockPrisma.dailyReward.create.mockResolvedValue({} as any);

      const result = await economyService.processDailyCreditAllocation(userId);

      expect(result.consecutiveDays).toBe(6);
      expect(result.creditsAwarded).toBe(3500); // 1000 + (6-1)*500
    });

    it('should return 0 credits if claimed within same UTC day', async () => {
      const recentlyClaimedUser = {
        ...mockUser,
        lastDailyRewardAt: new Date('2025-01-01T02:00:00Z'), // Same UTC day
      };

      mockPrisma.user.findUnique.mockResolvedValue(recentlyClaimedUser as any);

      const result = await economyService.processDailyCreditAllocation(userId);

      expect(result.creditsAwarded).toBe(0);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('should reset streak if gap is 2+ days', async () => {
      vi.setSystemTime(new Date('2025-01-10T12:00:00Z'));
      const brokenStreakUser = {
        ...mockUser,
        consecutiveDaysOnline: 10,
        lastDailyRewardAt: new Date('2025-01-07T08:00:00Z'), // 3 days ago
      };

      mockPrisma.user.findUnique.mockResolvedValue(brokenStreakUser as any);
      mockPrisma.user.update.mockResolvedValue({
        ...brokenStreakUser,
        consecutiveDaysOnline: 1,
      } as any);
      mockPrisma.creditTransaction.create.mockResolvedValue({} as any);
      mockPrisma.dailyReward.create.mockResolvedValue({} as any);

      const result = await economyService.processDailyCreditAllocation(userId);

      expect(result.consecutiveDays).toBe(1);
      expect(result.creditsAwarded).toBe(1000);
    });

    it('should award 10000 credits once streak hits max threshold', async () => {
      const highStreakUser = {
        ...mockUser,
        consecutiveDaysOnline: 18,
        lastDailyRewardAt: new Date('2024-12-31T08:00:00Z'),
      };

      mockPrisma.user.findUnique.mockResolvedValue(highStreakUser as any);
      mockPrisma.user.update.mockResolvedValue({
        ...highStreakUser,
        consecutiveDaysOnline: 19,
      } as any);
      mockPrisma.creditTransaction.create.mockResolvedValue({} as any);
      mockPrisma.dailyReward.create.mockResolvedValue({} as any);

      const result = await economyService.processDailyCreditAllocation(userId);

      expect(result.creditsAwarded).toBe(10000);
      expect(result.consecutiveDays).toBe(19);
    });
  });

  describe('buyStock', () => {
    const userId = 'user-123';
    const mockUser = {
      id: userId,
      availableCredits: 10000,
      expendedCredits: 0,
    };

    const mockStock = {
      id: 'stock-123',
      symbol: 'TEST',
      currentPrice: 100,
      maxLeverage: 10,
      status: 'active',
      circulatingSupply: 1000,
      marketCap: 100000,
    };

    it('should buy stock successfully', async () => {
      const input = {
        stockId: 'stock-123',
        shares: 10,
        leverage: 2,
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any);
      mockPrisma.stock.findUnique.mockResolvedValue(mockStock as any);
      mockPrisma.stockHolding.findUnique.mockResolvedValue(null);
      mockPrisma.stockHolding.create.mockResolvedValue({
        id: 'holding-123',
        shares: 10,
        averageBuyPrice: 100,
      } as any);
      mockPrisma.user.update.mockResolvedValue({
        ...mockUser,
        availableCredits: 8000, // 10000 - (10 * 100 * 2)
      } as any);
      mockPrisma.stock.update.mockResolvedValue(mockStock as any);
      mockPrisma.stockTransaction.create.mockResolvedValue({
        id: 'tx-123',
      } as any);
      mockPrisma.creditTransaction.create.mockResolvedValue({} as any);

      const result = await economyService.buyStock(userId, input);

      expect(result.newBalance).toBe(8000);
      expect(result.holding).toBeDefined();
    });

    it('should throw error if insufficient credits', async () => {
      const poorUser = { ...mockUser, availableCredits: 100 };
      mockPrisma.user.findUnique.mockResolvedValue(poorUser as any);
      mockPrisma.stock.findUnique.mockResolvedValue(mockStock as any);

      await expect(
        economyService.buyStock(userId, {
          stockId: 'stock-123',
          shares: 10,
          leverage: 2,
        })
      ).rejects.toThrow('Insufficient credits');
    });

    it('should throw error if leverage exceeds max', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any);
      mockPrisma.stock.findUnique.mockResolvedValue(mockStock as any);

      await expect(
        economyService.buyStock(userId, {
          stockId: 'stock-123',
          shares: 10,
          leverage: 20, // Exceeds maxLeverage of 10
        })
      ).rejects.toThrow('Maximum leverage is 10x');
    });
  });

  describe('sellStock', () => {
    const userId = 'user-123';
    const mockUser = {
      id: userId,
      availableCredits: 5000,
      overallPnL: 0,
    };

    const mockStock = {
      id: 'stock-123',
      symbol: 'TEST',
      currentPrice: 120, // Price increased
      status: 'active',
      circulatingSupply: 1000,
      marketCap: 120000,
    };

    const mockHolding = {
      id: 'holding-123',
      userId,
      stockId: 'stock-123',
      shares: 10,
      averageBuyPrice: 100,
      totalInvested: 1000,
      leverage: 1,
    };

    it('should sell stock successfully', async () => {
      const input = {
        stockId: 'stock-123',
        shares: 10,
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any);
      mockPrisma.stock.findUnique.mockResolvedValue(mockStock as any);
      mockPrisma.stockHolding.findUnique.mockResolvedValue(mockHolding as any);
      mockPrisma.stockHolding.delete.mockResolvedValue(mockHolding as any);
      mockPrisma.user.update.mockResolvedValue({
        ...mockUser,
        availableCredits: 6200, // 5000 + (10 * 120)
        overallPnL: 200, // Profit: (120 - 100) * 10
      } as any);
      mockPrisma.stock.update.mockResolvedValue(mockStock as any);
      mockPrisma.stockTransaction.create.mockResolvedValue({
        id: 'tx-123',
      } as any);
      mockPrisma.creditTransaction.create.mockResolvedValue({} as any);

      const result = await economyService.sellStock(userId, input);

      expect(result.newBalance).toBe(6200);
      expect(result.profit).toBe(200);
    });

    it('should throw error if insufficient shares', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any);
      mockPrisma.stock.findUnique.mockResolvedValue(mockStock as any);
      mockPrisma.stockHolding.findUnique.mockResolvedValue(mockHolding as any);

      await expect(
        economyService.sellStock(userId, {
          stockId: 'stock-123',
          shares: 20, // More than held
        })
      ).rejects.toThrow('Insufficient shares');
    });
  });

  describe('getUserPortfolio', () => {
    it('should return user portfolio', async () => {
      const userId = 'user-123';
      const mockHoldings = [
        {
          id: 'holding-1',
          userId,
          stockId: 'stock-1',
          shares: 10,
          averageBuyPrice: 100,
          totalInvested: 1000,
          leverage: 1,
          stock: {
            id: 'stock-1',
            symbol: 'TEST',
            currentPrice: 120,
          },
        },
      ];

      mockPrisma.stockHolding.findMany.mockResolvedValue(mockHoldings as any);

      const result = await economyService.getUserPortfolio(userId);

      expect(result).toHaveLength(1);
      expect(result[0].currentValue).toBe(1200); // 10 * 120
      expect(result[0].profit).toBe(200); // 1200 - 1000
    });
  });
});

