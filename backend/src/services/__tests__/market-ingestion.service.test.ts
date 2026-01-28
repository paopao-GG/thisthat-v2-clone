// Unit tests for Market Ingestion Service
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Create hoisted mock objects
const mockPrisma = vi.hoisted(() => ({
  market: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
}));

const mockPolymarketClient = vi.hoisted(() => ({
  getMarkets: vi.fn(),
}));

// Mock Prisma
vi.mock('../../lib/database.js', () => ({
  prisma: mockPrisma,
}));

// Mock Polymarket Client
vi.mock('../../lib/polymarket-client.js', () => ({
  getPolymarketClient: vi.fn(() => mockPolymarketClient),
}));

// Mock retry utility
vi.mock('../../lib/retry.js', () => ({
  retryWithBackoff: vi.fn((fn: () => Promise<any>) => fn()),
}));

// Import service AFTER mocks
import * as ingestionService from '../market-ingestion.service.js';
import type { PolymarketMarket } from '../../lib/polymarket-client.js';

describe('Market Ingestion Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ingestMarketsFromPolymarket', () => {
    const mockMarket: PolymarketMarket = {
      conditionId: '0x123',
      question: 'Will it rain tomorrow?',
      description: 'Weather prediction',
      outcomes: ['YES', 'NO'],
      accepting_orders: true,
      endDateIso: '2025-12-31T00:00:00Z',
      submitted_by: 'user123',
      category: 'weather',
    };

    it('should create new markets', async () => {
      mockPolymarketClient.getMarkets.mockResolvedValue([mockMarket]);
      mockPrisma.market.findUnique.mockResolvedValue(null);
      mockPrisma.market.create.mockResolvedValue({ id: 'market-1' });

      const result = await ingestionService.ingestMarketsFromPolymarket({
        limit: 10,
        activeOnly: true,
      });

      expect(result.total).toBe(1);
      expect(result.created).toBe(1);
      expect(result.updated).toBe(0);
      expect(result.errors).toBe(0);
      expect(mockPrisma.market.create).toHaveBeenCalled();
    });

    it('should update existing markets', async () => {
      mockPolymarketClient.getMarkets.mockResolvedValue([mockMarket]);
      mockPrisma.market.findUnique.mockResolvedValue({
        id: 'market-1',
        polymarketId: '0x123',
      });
      mockPrisma.market.update.mockResolvedValue({ id: 'market-1' });

      const result = await ingestionService.ingestMarketsFromPolymarket({
        limit: 10,
        activeOnly: true,
      });

      expect(result.total).toBe(1);
      expect(result.created).toBe(0);
      expect(result.updated).toBe(1);
      expect(mockPrisma.market.update).toHaveBeenCalled();
    });

    it('should skip markets with missing required fields', async () => {
      const invalidMarket = {
        ...mockMarket,
        conditionId: '',
        question: '',
      };

      mockPolymarketClient.getMarkets.mockResolvedValue([invalidMarket]);

      const result = await ingestionService.ingestMarketsFromPolymarket();

      expect(result.total).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.created).toBe(0);
      expect(result.updated).toBe(0);
    });

    it('should handle errors gracefully and continue processing', async () => {
      const market1 = { ...mockMarket, conditionId: '0x111' };
      const market2 = { ...mockMarket, conditionId: '0x222' };

      mockPolymarketClient.getMarkets.mockResolvedValue([market1, market2]);
      mockPrisma.market.findUnique
        .mockResolvedValueOnce(null) // First market - new
        .mockResolvedValueOnce(null); // Second market - new
      
      // First create fails, second succeeds
      let createCallCount = 0;
      mockPrisma.market.create.mockImplementation(async (args: any) => {
        createCallCount++;
        if (createCallCount === 1) {
          // Throw error synchronously to ensure it's caught
          const error = new Error('DB error');
          return Promise.reject(error);
        }
        return Promise.resolve({ id: 'market-2' });
      });

      const result = await ingestionService.ingestMarketsFromPolymarket();

      expect(result.total).toBe(2);
      expect(result.errors).toBe(1); // First market failed
      expect(result.created).toBe(1); // Second market succeeded
      expect(mockPrisma.market.create).toHaveBeenCalledTimes(2);
    });

    it('should handle API errors gracefully', async () => {
      mockPolymarketClient.getMarkets.mockResolvedValue(null); // Invalid response

      const result = await ingestionService.ingestMarketsFromPolymarket();

      expect(result.total).toBe(0);
      expect(result.created).toBe(0);
      expect(result.errors).toBe(0);
    });

    it('should extract static data correctly', async () => {
      const marketWithStringOutcomes = {
        ...mockMarket,
        outcomes: '["YES", "NO"]', // JSON string
      };

      mockPolymarketClient.getMarkets.mockResolvedValue([marketWithStringOutcomes]);
      mockPrisma.market.findUnique.mockResolvedValue(null);
      mockPrisma.market.create.mockResolvedValue({ id: 'market-1' });

      await ingestionService.ingestMarketsFromPolymarket();

      expect(mockPrisma.market.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          polymarketId: '0x123',
          title: 'Will it rain tomorrow?',
          description: 'Weather prediction',
          thisOption: 'YES',
          thatOption: 'NO',
          category: 'weather',
          status: 'open',
          marketType: 'polymarket',
        }),
      });
    });

    it('should determine status correctly', async () => {
      const archivedMarket = { ...mockMarket, archived: true };
      const closedMarket = { ...mockMarket, accepting_orders: false };
      const openMarket = { ...mockMarket, accepting_orders: true };

      mockPolymarketClient.getMarkets.mockResolvedValue([
        archivedMarket,
        closedMarket,
        openMarket,
      ]);
      mockPrisma.market.findUnique.mockResolvedValue(null);
      mockPrisma.market.create.mockResolvedValue({ id: 'market-1' });

      await ingestionService.ingestMarketsFromPolymarket();

      expect(mockPrisma.market.create).toHaveBeenCalledTimes(3);
      const calls = mockPrisma.market.create.mock.calls;
      expect(calls[0][0].data.status).toBe('closed'); // archived
      expect(calls[1][0].data.status).toBe('closed'); // accepting_orders: false
      expect(calls[2][0].data.status).toBe('open'); // accepting_orders: true
    });
  });

  describe('getMarketCounts', () => {
    it('should return correct counts', async () => {
      mockPrisma.market.count
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(50) // open
        .mockResolvedValueOnce(30) // closed
        .mockResolvedValueOnce(20) // resolved
        .mockResolvedValueOnce(5); // expiringSoon

      const counts = await ingestionService.getMarketCounts();

      expect(counts).toEqual({
        total: 100,
        open: 50,
        closed: 30,
        resolved: 20,
        expiringSoon: 5,
      });
    });
  });
});

