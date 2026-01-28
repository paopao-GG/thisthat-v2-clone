// Unit tests for Betting Services
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Create hoisted mock object
const mockPrisma = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  market: {
    findUnique: vi.fn(),
  },
  bet: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  creditTransaction: {
    create: vi.fn(),
  },
  $transaction: vi.fn(),
}));

// Mock Prisma
vi.mock('../../../lib/database.js', () => ({
  prisma: mockPrisma,
}));

// Mock markets service for fetchLivePriceData (hoisted)
const mockFetchLivePriceData = vi.hoisted(() => vi.fn());
vi.mock('../../markets/markets.services.js', () => ({
  fetchLivePriceData: mockFetchLivePriceData,
}));

// Import service AFTER mocks
import * as bettingService from '../betting.services.js';

describe('Betting Services', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock $transaction to execute callback immediately
    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      return callback(mockPrisma);
    });
    // Reset and set default mock for fetchLivePriceData - returns odds matching mockMarket
    mockFetchLivePriceData.mockReset();
    mockFetchLivePriceData.mockResolvedValue({
      polymarketId: 'condition-123',
      thisOdds: 0.65,
      thatOdds: 0.35,
      liquidity: 1000,
      volume: 5000,
      volume24hr: 2000,
      acceptingOrders: true,
    });
  });

  describe('placeBet', () => {
    const userId = 'user-123';
    const mockUser = {
      id: userId,
      availableCredits: 5000,
      creditBalance: 5000,
      expendedCredits: 0,
      totalVolume: 0,
    };

    const mockMarket = {
      id: 'market-123',
      polymarketId: 'condition-123',
      status: 'open',
      thisOdds: 0.65,
      thatOdds: 0.35,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
    };

    it('should place bet successfully', async () => {
      const input = {
        marketId: 'condition-123',
        side: 'this' as const,
        amount: 100,
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any);
      mockPrisma.market.findUnique.mockResolvedValue(mockMarket as any);

      const mockBet = {
        id: 'bet-123',
        userId,
        marketId: mockMarket.id,
        amount: input.amount,
        side: input.side,
        oddsAtBet: mockMarket.thisOdds,
        potentialPayout: input.amount / mockMarket.thisOdds,
        status: 'pending',
        market: {
          id: mockMarket.id,
          title: 'Test Market',
        },
      };

      mockPrisma.bet.create.mockResolvedValue(mockBet as any);
      mockPrisma.user.update.mockResolvedValue({
        ...mockUser,
        availableCredits: 4900,
      } as any);
      mockPrisma.creditTransaction.create.mockResolvedValue({} as any);

      const result = await bettingService.placeBet(userId, input);

      expect(result.bet).toBeDefined();
      expect(result.newBalance).toBe(4900);
      // Payout = amount / odds = 100 / 0.65 = 153.846...
      expect(result.potentialPayout).toBeCloseTo(100 / 0.65, 2);
    });

    it('should throw error if user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        bettingService.placeBet(userId, {
          marketId: 'condition-123',
          side: 'this',
          amount: 100,
        })
      ).rejects.toThrow('User not found');
    });

    it('should throw error if market not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any);
      mockPrisma.market.findUnique.mockResolvedValue(null);

      await expect(
        bettingService.placeBet(userId, {
          marketId: 'non-existent',
          side: 'this',
          amount: 100,
        })
      ).rejects.toThrow('Market not found');
    });

    it('should throw error if market is not open', async () => {
      const closedMarket = { ...mockMarket, status: 'closed' };
      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any);
      mockPrisma.market.findUnique.mockResolvedValue(closedMarket as any);

      await expect(
        bettingService.placeBet(userId, {
          marketId: 'condition-123',
          side: 'this',
          amount: 100,
        })
      ).rejects.toThrow('Market is not open');
    });

    it('should throw error if bet amount below minimum', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any);
      mockPrisma.market.findUnique.mockResolvedValue(mockMarket as any);

      await expect(
        bettingService.placeBet(userId, {
          marketId: 'condition-123',
          side: 'this',
          amount: 5, // Below minimum of 10
        })
      ).rejects.toThrow('Minimum bet amount is 10 credits');
    });

    it('should throw error if bet amount above maximum', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any);
      mockPrisma.market.findUnique.mockResolvedValue(mockMarket as any);

      await expect(
        bettingService.placeBet(userId, {
          marketId: 'condition-123',
          side: 'this',
          amount: 20000, // Above maximum of 10000
        })
      ).rejects.toThrow('Maximum bet amount is 10000 credits');
    });

    it('should throw error if insufficient credits', async () => {
      const poorUser = { ...mockUser, availableCredits: 5 };
      mockPrisma.user.findUnique.mockResolvedValue(poorUser as any);
      mockPrisma.market.findUnique.mockResolvedValue(mockMarket as any);

      await expect(
        bettingService.placeBet(userId, {
          marketId: 'condition-123',
          side: 'this',
          amount: 100,
        })
      ).rejects.toThrow('Insufficient credits');
    });

    it('should calculate payout correctly for THIS side', async () => {
      // Mock fetchLivePriceData to return THIS odds
      mockFetchLivePriceData.mockResolvedValueOnce({
        polymarketId: 'condition-123',
        thisOdds: 0.65,
        thatOdds: 0.35,
        liquidity: 1000,
        volume: 5000,
        volume24hr: 2000,
        acceptingOrders: true,
      });

      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any);
      mockPrisma.market.findUnique.mockResolvedValue(mockMarket as any);
      mockPrisma.bet.create.mockResolvedValue({
        id: 'bet-123',
        potentialPayout: 100 / 0.65,
      } as any);
      mockPrisma.user.update.mockResolvedValue(mockUser as any);
      mockPrisma.creditTransaction.create.mockResolvedValue({} as any);

      const result = await bettingService.placeBet(userId, {
        marketId: 'condition-123',
        side: 'this',
        amount: 100,
      });

      // Payout = amount / odds = 100 / 0.65 = 153.846...
      expect(result.potentialPayout).toBeCloseTo(100 / 0.65, 2);
    });

    it('should calculate payout correctly for THAT side', async () => {
      // Mock fetchLivePriceData to return THAT odds (0.35)
      mockFetchLivePriceData.mockResolvedValueOnce({
        polymarketId: 'condition-123',
        thisOdds: 0.65,
        thatOdds: 0.35,
        liquidity: 1000,
        volume: 5000,
        volume24hr: 2000,
        acceptingOrders: true,
      });

      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any);
      mockPrisma.market.findUnique.mockResolvedValue(mockMarket as any);
      mockPrisma.bet.create.mockResolvedValue({
        id: 'bet-123',
        potentialPayout: 100 / 0.35,
      } as any);
      mockPrisma.user.update.mockResolvedValue(mockUser as any);
      mockPrisma.creditTransaction.create.mockResolvedValue({} as any);

      const result = await bettingService.placeBet(userId, {
        marketId: 'condition-123',
        side: 'that',
        amount: 100,
      });

      // Payout = amount / odds = 100 / 0.35 = 285.714...
      expect(result.potentialPayout).toBeCloseTo(100 / 0.35, 2);
    });
  });

  describe('getUserBets', () => {
    it('should return user bets with pagination', async () => {
      const userId = 'user-123';
      const query = {
        limit: 10,
        offset: 0,
      };

      const mockBets = [
        {
          id: 'bet-1',
          userId,
          amount: 100,
          side: 'this',
          status: 'pending',
          market: { id: 'market-1', title: 'Market 1' },
        },
        {
          id: 'bet-2',
          userId,
          amount: 200,
          side: 'that',
          status: 'won',
          market: { id: 'market-2', title: 'Market 2' },
        },
      ];

      mockPrisma.bet.findMany.mockResolvedValue(mockBets as any);
      mockPrisma.bet.count.mockResolvedValue(2);

      const result = await bettingService.getUserBets(userId, query);

      expect(result.bets).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.limit).toBe(10);
      expect(result.offset).toBe(0);
    });

    it('should filter by status', async () => {
      const userId = 'user-123';
      const query = {
        limit: 10,
        offset: 0,
        status: 'won' as const,
      };

      mockPrisma.bet.findMany.mockResolvedValue([]);
      mockPrisma.bet.count.mockResolvedValue(0);

      await bettingService.getUserBets(userId, query);

      expect(mockPrisma.bet.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'won',
          }),
        })
      );
    });
  });

  describe('getBetById', () => {
    it('should return bet by ID', async () => {
      const userId = 'user-123';
      const betId = 'bet-123';

      const mockBet = {
        id: betId,
        userId,
        amount: 100,
        side: 'this',
        status: 'pending',
        market: {
          id: 'market-123',
          title: 'Test Market',
        },
      };

      mockPrisma.bet.findFirst.mockResolvedValue(mockBet as any);

      const result = await bettingService.getBetById(betId, userId);

      expect(result).toBeDefined();
      expect(result?.id).toBe(betId);
      expect(mockPrisma.bet.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: betId,
            userId,
          },
        })
      );
    });

    it('should return null if bet not found', async () => {
      mockPrisma.bet.findFirst.mockResolvedValue(null);

      const result = await bettingService.getBetById('non-existent', 'user-123');

      expect(result).toBeNull();
    });
  });
});

