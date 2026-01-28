// Unit tests for Markets Service (Lazy Loading)
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Create hoisted mock objects
const mockPrisma = vi.hoisted(() => ({
  market: {
    count: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    groupBy: vi.fn(),
  },
}));

const mockPolymarketClient = vi.hoisted(() => ({
  getMarket: vi.fn(),
}));

// Mock Prisma
vi.mock('../../../lib/database.js', () => ({
  prisma: mockPrisma,
}));

// Mock Polymarket Client
vi.mock('../../../lib/polymarket-client.js', () => ({
  getPolymarketClient: vi.fn(() => mockPolymarketClient),
}));

// Mock retry utility
vi.mock('../../../lib/retry.js', () => ({
  retryWithBackoffSilent: vi.fn((fn: () => Promise<any>) => fn()),
}));

// Import service AFTER mocks
import * as marketsService from '../markets.services.js';

describe('Markets Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getRandomMarkets', () => {
    it('should return random markets', async () => {
      mockPrisma.market.count.mockResolvedValue(100);
      mockPrisma.market.findMany.mockResolvedValue([
        {
          id: 'market-1',
          polymarketId: '0x123',
          title: 'Test Market',
          description: 'Test',
          thisOption: 'YES',
          thatOption: 'NO',
          author: 'user1',
          category: 'test',
          imageUrl: null,
          status: 'open',
          expiresAt: new Date(),
        },
      ]);

      const result = await marketsService.getRandomMarkets(10);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('market-1');
      expect(mockPrisma.market.findMany).toHaveBeenCalled();
    });

    it('should return empty array if no open markets', async () => {
      mockPrisma.market.count.mockResolvedValue(0);

      const result = await marketsService.getRandomMarkets(10);

      expect(result).toEqual([]);
      expect(mockPrisma.market.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getMarketsByCategory', () => {
    it('should return markets by category', async () => {
      mockPrisma.market.findMany.mockResolvedValue([
        {
          id: 'market-1',
          polymarketId: '0x123',
          title: 'Test Market',
          category: 'crypto',
        },
      ]);

      const result = await marketsService.getMarketsByCategory('crypto', 20);

      expect(result).toHaveLength(1);
      expect(mockPrisma.market.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: 'open',
            category: { equals: 'crypto', mode: 'insensitive' },
          },
          take: 20,
          skip: expect.any(Number),
          orderBy: expect.any(Object),
          select: expect.any(Object),
        })
      );
    });
  });

  describe('getMarketById', () => {
    it('should return market by ID', async () => {
      const mockMarket = {
        id: 'market-1',
        polymarketId: '0x123',
        title: 'Test Market',
        description: null,
        thisOption: 'YES',
        thatOption: 'NO',
        category: null,
        status: 'open',
        expiresAt: null,
        marketType: 'polymarket',
      };

      mockPrisma.market.findUnique.mockResolvedValue(mockMarket as any);

      const result = await marketsService.getMarketById('market-1');

      expect(result).toEqual(expect.objectContaining({
        id: 'market-1',
        polymarketId: '0x123',
        title: 'Test Market',
        author: null,
        imageUrl: null,
      }));
      expect(mockPrisma.market.findUnique).toHaveBeenCalledWith({
        where: { id: 'market-1' },
        select: expect.any(Object),
      });
    });

    it('should return null if market not found', async () => {
      mockPrisma.market.findUnique.mockResolvedValue(null);

      const result = await marketsService.getMarketById('invalid-id');

      expect(result).toBeNull();
    });
  });

  describe('fetchLivePriceData', () => {
    it('should fetch live price data from Polymarket', async () => {
      const polymarketMarket = {
        conditionId: '0x123',
        outcomes: ['YES', 'NO'],
        tokens: [
          { outcome: 'YES', price: 0.7 },
          { outcome: 'NO', price: 0.3 },
        ],
        liquidity: 1000,
        volume: 5000,
        volume_24hr: 2000,
        accepting_orders: true,
      };

      mockPolymarketClient.getMarket.mockResolvedValue(polymarketMarket);

      const result = await marketsService.fetchLivePriceData('0x123');

      expect(result).toEqual({
        polymarketId: '0x123',
        thisOdds: 0.7,
        thatOdds: 0.3,
        liquidity: 1000,
        volume: 5000,
        volume24hr: 2000,
        acceptingOrders: true,
      });
    });

    it('should handle string outcomes', async () => {
      const polymarketMarket = {
        conditionId: '0x123',
        outcomes: '["YES", "NO"]',
        tokens: [
          { outcome: 'YES', price: 0.6 },
          { outcome: 'NO', price: 0.4 },
        ],
        liquidity: 500,
        volume: 1000,
        volume_24hr: 500,
        accepting_orders: true,
      };

      mockPolymarketClient.getMarket.mockResolvedValue(polymarketMarket);

      const result = await marketsService.fetchLivePriceData('0x123');

      expect(result?.thisOdds).toBe(0.6);
      expect(result?.thatOdds).toBe(0.4);
    });

    it('should return null if market not found', async () => {
      mockPolymarketClient.getMarket.mockResolvedValue(null);

      const result = await marketsService.fetchLivePriceData('invalid-id');

      expect(result).toBeNull();
    });

    it('should return null on error', async () => {
      mockPolymarketClient.getMarket.mockRejectedValue(new Error('API error'));

      const result = await marketsService.fetchLivePriceData('0x123');

      expect(result).toBeNull();
    });
  });

  describe('fetchBatchLivePriceData', () => {
    it('should fetch live prices for multiple markets', async () => {
      mockPolymarketClient.getMarket
        .mockResolvedValueOnce({
          conditionId: '0x111',
          outcomes: ['YES', 'NO'],
          tokens: [{ outcome: 'YES', price: 0.5 }, { outcome: 'NO', price: 0.5 }],
          liquidity: 100,
          volume: 200,
          volume_24hr: 100,
          accepting_orders: true,
        })
        .mockResolvedValueOnce({
          conditionId: '0x222',
          outcomes: ['YES', 'NO'],
          tokens: [{ outcome: 'YES', price: 0.8 }, { outcome: 'NO', price: 0.2 }],
          liquidity: 200,
          volume: 400,
          volume_24hr: 200,
          accepting_orders: true,
        });

      const result = await marketsService.fetchBatchLivePriceData(['0x111', '0x222']);

      expect(result.size).toBe(2);
      expect(result.get('0x111')?.thisOdds).toBe(0.5);
      expect(result.get('0x222')?.thisOdds).toBe(0.8);
    });

    it('should return empty map for empty array', async () => {
      const result = await marketsService.fetchBatchLivePriceData([]);

      expect(result.size).toBe(0);
    });
  });

  describe('getMarketWithLiveData', () => {
    it('should combine static and live data', async () => {
      const staticMarket = {
        id: 'market-1',
        polymarketId: '0x123',
        title: 'Test Market',
        description: 'Test',
        thisOption: 'YES',
        thatOption: 'NO',
        category: 'test',
        status: 'open',
        expiresAt: new Date(),
        marketType: 'polymarket',
      };

      const liveData = {
        polymarketId: '0x123',
        thisOdds: 0.7,
        thatOdds: 0.3,
        liquidity: 1000,
        volume: 5000,
        volume24hr: 2000,
        acceptingOrders: true,
      };

      mockPrisma.market.findUnique.mockResolvedValue(staticMarket as any);
      mockPolymarketClient.getMarket.mockResolvedValue({
        conditionId: '0x123',
        outcomes: ['YES', 'NO'],
        tokens: [{ outcome: 'YES', price: 0.7 }, { outcome: 'NO', price: 0.3 }],
        liquidity: 1000,
        volume: 5000,
        volume_24hr: 2000,
        accepting_orders: true,
      });

      const result = await marketsService.getMarketWithLiveData('market-1');

      expect(result?.id).toBe('market-1');
      expect(result?.live).toEqual(liveData);
    });

    it('should return null if market not found', async () => {
      mockPrisma.market.findUnique.mockResolvedValue(null);

      const result = await marketsService.getMarketWithLiveData('invalid-id');

      expect(result).toBeNull();
    });
  });

  describe('getCategories', () => {
    it('should return all categories', async () => {
      mockPrisma.market.groupBy.mockResolvedValue([
        { category: 'crypto', _count: { category: 10 } },
        { category: 'politics', _count: { category: 5 } },
      ]);

      const result = await marketsService.getCategories();

      expect(result).toEqual(['crypto', 'politics']);
    });
  });
});

