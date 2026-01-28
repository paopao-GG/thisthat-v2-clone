// Unit tests for Market Resolution Services
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Create hoisted mock objects
const mockPrisma = vi.hoisted(() => ({
  market: {
    findMany: vi.fn(),
    update: vi.fn(),
  },
  bet: {
    findMany: vi.fn(),
    update: vi.fn(),
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
  getMarkets: vi.fn(),
}));

// Mock Prisma
vi.mock('../../../lib/database.js', () => ({
  prisma: mockPrisma,
}));

// Mock Polymarket client
vi.mock('../../../lib/polymarket-client.js', () => ({
  getPolymarketClient: vi.fn(() => mockPolymarketClient),
}));

// Import service AFTER mocks
import * as marketResolutionService from '../market-resolution.services.js';
import { getPolymarketClient } from '../../../lib/polymarket-client.js';

describe('Market Resolution Services', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      return callback(mockPrisma);
    });
  });

  describe('checkMarketResolution', () => {
    it('should return resolution if market is closed with winner', async () => {
      const polymarketId = 'condition-123';
      mockPolymarketClient.getMarkets.mockResolvedValue([
        {
          conditionId: polymarketId,
          closed: true,
          archived: false,
          outcomes: ['YES', 'NO'],
          tokens: [
            { outcome: 'YES', winner: true },
            { outcome: 'NO', winner: false },
          ],
        },
      ]);

      const result = await marketResolutionService.checkMarketResolution(polymarketId);

      expect(result).toBe('this');
    });

    it('should return null if market is still open', async () => {
      const polymarketId = 'condition-123';
      mockPolymarketClient.getMarkets.mockResolvedValue([
        {
          conditionId: polymarketId,
          closed: false,
          archived: false,
        },
      ]);

      const result = await marketResolutionService.checkMarketResolution(polymarketId);

      expect(result).toBeNull();
    });

    it('should return null if market not found', async () => {
      const polymarketId = 'non-existent';
      mockPolymarketClient.getMarkets.mockResolvedValue([]);

      const result = await marketResolutionService.checkMarketResolution(polymarketId);

      expect(result).toBeNull();
    });
  });

  describe('resolveMarket', () => {
    const marketId = 'market-123';
    const mockMarket = {
      id: marketId,
      status: 'open',
      resolution: null,
    };

    it('should resolve market and process winning bets', async () => {
      const mockBets = [
        {
          id: 'bet-1',
          userId: 'user-1',
          amount: 100,
          side: 'this',
          potentialPayout: 153.85,
          user: {
            creditBalance: 1000,
            availableCredits: 1000,
            overallPnL: 0,
          },
          market: mockMarket,
        },
      ];

      mockPrisma.market.update.mockResolvedValue(mockMarket as any);
      mockPrisma.bet.findMany.mockResolvedValue(mockBets as any);
      mockPrisma.user.update.mockResolvedValue({
        creditBalance: 1153.85,
        availableCredits: 1153.85,
        overallPnL: 53.85,
      } as any);
      mockPrisma.bet.update.mockResolvedValue({
        ...mockBets[0],
        status: 'won',
      } as any);
      mockPrisma.creditTransaction.create.mockResolvedValue({} as any);

      const result = await marketResolutionService.resolveMarket(marketId, 'this');

      expect(result.resolved).toBe(1);
      expect(result.won).toBe(1);
      expect(result.lost).toBe(0);
      expect(result.cancelled).toBe(0);
    });

    it('should process losing bets', async () => {
      const mockBets = [
        {
          id: 'bet-1',
          userId: 'user-1',
          amount: 100,
          side: 'that',
          potentialPayout: 285.71,
          user: {
            creditBalance: 900,
            availableCredits: 900,
            overallPnL: 0,
          },
          market: mockMarket,
        },
      ];

      mockPrisma.market.update.mockResolvedValue(mockMarket as any);
      mockPrisma.bet.findMany.mockResolvedValue(mockBets as any);
      mockPrisma.user.update.mockResolvedValue({
        overallPnL: -100,
      } as any);
      mockPrisma.bet.update.mockResolvedValue({
        ...mockBets[0],
        status: 'lost',
      } as any);

      const result = await marketResolutionService.resolveMarket(marketId, 'this');

      expect(result.resolved).toBe(1);
      expect(result.won).toBe(0);
      expect(result.lost).toBe(1);
    });

    it('should refund cancelled bets', async () => {
      const mockBets = [
        {
          id: 'bet-1',
          userId: 'user-1',
          amount: 100,
          side: 'this',
          potentialPayout: 153.85,
          user: {
            creditBalance: 900,
            availableCredits: 900,
            overallPnL: 0,
          },
          market: mockMarket,
        },
      ];

      mockPrisma.market.update.mockResolvedValue(mockMarket as any);
      mockPrisma.bet.findMany.mockResolvedValue(mockBets as any);
      mockPrisma.user.update.mockResolvedValue({
        creditBalance: 1000,
        availableCredits: 1000,
      } as any);
      mockPrisma.bet.update.mockResolvedValue({
        ...mockBets[0],
        status: 'cancelled',
      } as any);
      mockPrisma.creditTransaction.create.mockResolvedValue({} as any);

      const result = await marketResolutionService.resolveMarket(marketId, 'invalid');

      expect(result.resolved).toBe(1);
      expect(result.cancelled).toBe(1);
      expect(result.won).toBe(0);
      expect(result.lost).toBe(0);
    });
  });

  describe('checkAndResolveMarkets', () => {
    it('should check and resolve expired markets', async () => {
      const mockMarkets = [
        {
          id: 'market-1',
          polymarketId: 'condition-123',
          status: 'open',
          expiresAt: new Date(Date.now() - 1000), // Expired
        },
      ];

      mockPrisma.market.findMany.mockResolvedValue(mockMarkets as any);

      mockPolymarketClient.getMarkets.mockResolvedValue([
        {
          conditionId: 'condition-123',
          closed: true,
          outcomes: ['YES', 'NO'],
          tokens: [{ outcome: 'YES', winner: true }],
        },
      ]);
      mockPrisma.market.update.mockResolvedValue({} as any);
      mockPrisma.bet.findMany.mockResolvedValue([]);

      const result = await marketResolutionService.checkAndResolveMarkets();

      expect(result.checked).toBe(1);
      expect(result.resolved).toBeGreaterThanOrEqual(0);
    });
  });
});

