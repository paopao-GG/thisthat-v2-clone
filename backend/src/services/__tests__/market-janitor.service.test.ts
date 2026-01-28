// Unit tests for Market Janitor Service
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Create hoisted mock objects
const mockPrisma = vi.hoisted(() => ({
  market: {
    findMany: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  bet: {
    findMany: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  user: {
    update: vi.fn(),
  },
  creditTransaction: {
    create: vi.fn(),
  },
  $transaction: vi.fn(),
}));

const mockPolymarketClient = vi.hoisted(() => ({
  getMarket: vi.fn(),
}));

const mockPositionsService = vi.hoisted(() => ({
  settlePositionsForMarket: vi.fn(),
}));

// Mock Prisma
vi.mock('../../lib/database.js', () => ({
  prisma: mockPrisma,
}));

// Mock Polymarket Client
vi.mock('../../lib/polymarket-client.js', () => ({
  getPolymarketClient: vi.fn(() => mockPolymarketClient),
}));

// Mock Positions Service
vi.mock('../../features/positions/positions.services.js', () => ({
  settlePositionsForMarket: mockPositionsService.settlePositionsForMarket,
}));

// Mock retry utility
vi.mock('../../lib/retry.js', () => ({
  retryWithBackoffSilent: vi.fn((fn: () => Promise<any>) => fn()),
}));

// Import service AFTER mocks
import * as janitorService from '../market-janitor.service.js';

describe('Market Janitor Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock $transaction to execute callback with transaction context
    // Use the actual mockPrisma methods so calls are tracked
    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      // Create a transaction context that uses the same mocks
      const txContext = {
        bet: {
          update: mockPrisma.bet.update,
        },
        user: {
          update: mockPrisma.user.update,
        },
        creditTransaction: {
          create: mockPrisma.creditTransaction.create,
        },
      };
      return await callback(txContext);
    });
    // Set default return values
    mockPrisma.bet.update.mockResolvedValue({});
    mockPrisma.user.update.mockResolvedValue({});
    mockPrisma.creditTransaction.create.mockResolvedValue({});
  });

  describe('runJanitorTasks', () => {
    it('should close expired markets', async () => {
      const expiredMarket = {
        id: 'market-1',
        title: 'Expired Market',
        status: 'open',
        expiresAt: new Date('2020-01-01'),
      };

      mockPrisma.market.findMany
        .mockResolvedValueOnce([expiredMarket]) // expired markets
        .mockResolvedValueOnce([]); // closed unresolved markets
      mockPrisma.market.update.mockResolvedValue(expiredMarket);

      const result = await janitorService.runJanitorTasks();

      expect(result.closedMarkets).toBe(1);
      expect(result.checkedMarkets).toBe(1);
      expect(mockPrisma.market.update).toHaveBeenCalledWith({
        where: { id: 'market-1' },
        data: { status: 'closed' },
      });
    });

    it('should resolve markets from Polymarket', async () => {
      const closedMarket = {
        id: 'market-1',
        title: 'Closed Market',
        polymarketId: '0x123',
        status: 'closed',
        resolution: null,
      };

      const polymarketMarket = {
        conditionId: '0x123',
        outcomes: ['YES', 'NO'],
        tokens: [
          { outcome: 'YES', price: 0.8, winner: true },
          { outcome: 'NO', price: 0.2, winner: false },
        ],
      };

      mockPrisma.market.findMany
        .mockResolvedValueOnce([]) // no expired markets
        .mockResolvedValueOnce([closedMarket]); // closed unresolved markets
      mockPolymarketClient.getMarket.mockResolvedValue(polymarketMarket);
      mockPrisma.market.update.mockResolvedValue(closedMarket);
      mockPrisma.bet.findMany.mockResolvedValue([]);
      mockPositionsService.settlePositionsForMarket.mockResolvedValue({
        settled: 0,
        totalPayout: 0,
      });

      const result = await janitorService.runJanitorTasks();

      expect(result.resolvedMarkets).toBe(1);
      expect(mockPrisma.market.update).toHaveBeenCalledWith({
        where: { id: 'market-1' },
        data: {
          status: 'resolved',
          resolution: 'this',
          resolvedAt: expect.any(Date),
        },
      });
    });

    it('should process bet payouts for resolved markets', async () => {
      const closedMarket = {
        id: 'market-1',
        polymarketId: '0x123',
        status: 'closed',
        resolution: null,
      };

      const winningBet = {
        id: 'bet-1',
        userId: 'user-1',
        marketId: 'market-1',
        amount: 100,
        side: 'this',
        potentialPayout: 200,
        status: 'pending',
        user: {
          creditBalance: 1000,
        },
      };

      mockPrisma.market.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([closedMarket]);
      mockPolymarketClient.getMarket.mockResolvedValue({
        conditionId: '0x123',
        outcomes: ['YES', 'NO'],
        tokens: [{ outcome: 'YES', winner: true }],
      });
      mockPrisma.market.update.mockResolvedValue(closedMarket);
      mockPrisma.bet.findMany.mockResolvedValue([winningBet]);
      mockPositionsService.settlePositionsForMarket.mockResolvedValue({
        settled: 0,
        totalPayout: 0,
      });

      const result = await janitorService.runJanitorTasks();

      expect(result.processedPayouts).toBe(1);
      expect(mockPrisma.bet.update).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      const expiredMarket = {
        id: 'market-1',
        title: 'Expired Market',
        status: 'open',
        expiresAt: new Date('2020-01-01'),
      };

      mockPrisma.market.findMany
        .mockResolvedValueOnce([expiredMarket])
        .mockResolvedValueOnce([]);
      mockPrisma.market.update.mockRejectedValue(new Error('DB error'));

      const result = await janitorService.runJanitorTasks();

      expect(result.errors).toBe(1);
      expect(result.closedMarkets).toBe(0);
    });

    it('should skip markets without polymarketId', async () => {
      const closedMarket = {
        id: 'market-1',
        polymarketId: null,
        status: 'closed',
        resolution: null,
      };

      mockPrisma.market.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([closedMarket]);

      const result = await janitorService.runJanitorTasks();

      expect(result.resolvedMarkets).toBe(0);
      expect(mockPolymarketClient.getMarket).not.toHaveBeenCalled();
    });
  });

  describe('getJanitorStatus', () => {
    it('should return correct status counts', async () => {
      mockPrisma.market.count
        .mockResolvedValueOnce(5) // expiredOpenMarkets
        .mockResolvedValueOnce(10); // closedUnresolvedMarkets
      mockPrisma.bet.count.mockResolvedValueOnce(20); // pendingBets

      const status = await janitorService.getJanitorStatus();

      expect(status).toEqual({
        expiredOpenMarkets: 5,
        closedUnresolvedMarkets: 10,
        pendingBets: 20,
      });
    });
  });
});

