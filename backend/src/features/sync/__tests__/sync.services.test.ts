// Unit tests for Sync Services
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted Prisma mock
const mockPrisma = vi.hoisted(() => ({
  market: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
}));

// Hoisted MongoDB mock
const mockMongoDB = vi.hoisted(() => {
  const createFindCursor = () => ({
    limit: vi.fn(function(this: any) { return this; }),
    toArray: vi.fn().mockResolvedValue([]),
  });

  return {
    collection: vi.fn(() => ({
      find: vi.fn(() => createFindCursor()),
      countDocuments: vi.fn(),
      updateOne: vi.fn(),
    })),
  };
});

// Mock Prisma
vi.mock('../../../lib/database.js', () => ({
  prisma: mockPrisma,
}));

// Mock MongoDB
vi.mock('../../../lib/mongodb.js', () => ({
  getDatabase: vi.fn(() => Promise.resolve(mockMongoDB)),
}));

// Import service AFTER mocks
import * as syncService from '../mongodb-to-postgres.sync.js';

describe('Sync Services', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('syncMarketToPostgres', () => {
    const mockMarket = {
      conditionId: 'condition-123',
      question: 'Test Market?',
      description: 'Test description',
      thisOption: 'Yes',
      thatOption: 'No',
      author: 'Test Author',
      category: 'politics',
      status: 'active',
      endDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };

    it('should create new market when it does not exist', async () => {
      mockPrisma.market.findUnique.mockResolvedValue(null);
      mockPrisma.market.create.mockResolvedValue({ id: 'new-market-id' } as any);

      // Mock MongoDB collection to return our market data
      const findCursor = {
        limit: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue([mockMarket]),
      };

      const collection = {
        find: vi.fn().mockReturnValue(findCursor),
        countDocuments: vi.fn(),
      };

      mockMongoDB.collection.mockReturnValue(collection as any);

      const result = await syncService.syncAllMarketsToPostgres({ limit: 1 });

      expect(result.synced).toBe(1);
      expect(result.errors).toBe(0);
    });

    it('should update existing market when it exists', async () => {
      const existingMarket = {
        id: 'existing-id',
        polymarketId: 'condition-123',
      };

      mockPrisma.market.findUnique.mockResolvedValue(existingMarket as any);
      mockPrisma.market.update.mockResolvedValue(existingMarket as any);

      const findCursor = {
        limit: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue([mockMarket]),
      };

      const collection = {
        find: vi.fn().mockReturnValue(findCursor),
        countDocuments: vi.fn(),
      };

      mockMongoDB.collection.mockReturnValue(collection as any);

      const result = await syncService.syncAllMarketsToPostgres({ limit: 1 });

      expect(result.synced).toBe(1);
      expect(mockPrisma.market.update).toHaveBeenCalled();
    });

    it('should skip markets with missing required fields', async () => {
      const invalidMarket = {
        conditionId: null,
        question: '',
      };

      const findCursor = {
        limit: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue([invalidMarket]),
      };

      const collection = {
        find: vi.fn().mockReturnValue(findCursor),
        countDocuments: vi.fn(),
      };

      mockMongoDB.collection.mockReturnValue(collection as any);

      const result = await syncService.syncAllMarketsToPostgres({ limit: 1 });

      expect(result.skipped).toBe(1);
      expect(result.synced).toBe(0);
    });

    it('should handle sync errors gracefully', async () => {
      const findCursor = {
        limit: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue([mockMarket]),
      };

      const collection = {
        find: vi.fn().mockReturnValue(findCursor),
        countDocuments: vi.fn(),
      };

      mockMongoDB.collection.mockReturnValue(collection as any);
      mockPrisma.market.findUnique.mockRejectedValue(new Error('Database error'));

      const result = await syncService.syncAllMarketsToPostgres({ limit: 1 });

      expect(result.errors).toBe(1);
      expect(result.synced).toBe(0);
    });
  });

  describe('syncAllMarketsToPostgres', () => {
    it('should sync markets with status filter', async () => {
      const findCursor = {
        limit: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue([]),
      };

      const collection = {
        find: vi.fn().mockReturnValue(findCursor),
        countDocuments: vi.fn(),
      };

      mockMongoDB.collection.mockReturnValue(collection as any);

      await syncService.syncAllMarketsToPostgres({ status: 'active' });

      expect(collection.find).toHaveBeenCalledWith({ status: 'active' });
    });

    it('should sync markets with limit', async () => {
      const findCursor = {
        limit: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue([]),
      };

      const collection = {
        find: vi.fn().mockReturnValue(findCursor),
        countDocuments: vi.fn(),
      };

      mockMongoDB.collection.mockReturnValue(collection as any);

      await syncService.syncAllMarketsToPostgres({ limit: 10 });

      expect(findCursor.limit).toHaveBeenCalledWith(10);
    });

    it('should return correct sync statistics', async () => {
      const mockMarket = {
        conditionId: 'condition-123',
        question: 'Test?',
        thisOption: 'Yes',
        thatOption: 'No',
        status: 'active',
      };

      const findCursor = {
        limit: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue([mockMarket]),
      };

      const collection = {
        find: vi.fn().mockReturnValue(findCursor),
        countDocuments: vi.fn(),
      };

      mockMongoDB.collection.mockReturnValue(collection as any);
      mockPrisma.market.findUnique.mockResolvedValue(null);
      mockPrisma.market.create.mockResolvedValue({} as any);

      const result = await syncService.syncAllMarketsToPostgres();

      expect(result).toHaveProperty('synced');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('skipped');
    });
  });

  describe('syncActiveMarketsToPostgres', () => {
    it('should sync only active markets with limit', async () => {
      const findCursor = {
        limit: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue([]),
      };

      const collection = {
        find: vi.fn().mockReturnValue(findCursor),
        countDocuments: vi.fn(),
      };

      mockMongoDB.collection.mockReturnValue(collection as any);

      await syncService.syncActiveMarketsToPostgres();

      expect(collection.find).toHaveBeenCalledWith({ status: 'active' });
      expect(findCursor.limit).toHaveBeenCalledWith(1000);
    });
  });

  describe('getMarketCounts', () => {
    it('should return counts from both databases', async () => {
      const collection = {
        find: vi.fn(),
        countDocuments: vi.fn().mockResolvedValueOnce(100).mockResolvedValueOnce(50),
      };

      mockMongoDB.collection.mockReturnValue(collection as any);
      mockPrisma.market.count.mockResolvedValueOnce(95).mockResolvedValueOnce(45);

      const counts = await syncService.getMarketCounts();

      expect(counts).toEqual({
        mongodb: 100,
        postgresql: 95,
        activeMongoDB: 50,
        activePostgreSQL: 45,
      });
    });

    it('should handle errors when getting counts', async () => {
      const collection = {
        find: vi.fn(),
        countDocuments: vi.fn().mockRejectedValue(new Error('MongoDB error')),
      };

      mockMongoDB.collection.mockReturnValue(collection as any);

      await expect(syncService.getMarketCounts()).rejects.toThrow('MongoDB error');
    });
  });
});




