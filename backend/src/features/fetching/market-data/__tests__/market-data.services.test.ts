// Unit tests for market data services
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { normalizeMarket, fetchAndSaveMarkets, getAllMarkets, getMarketStats } from '../market-data.services.js';
import type { PolymarketMarket } from '../../../../lib/polymarket-client.js';
import type { FlattenedMarket } from '../market-data.models.js';

// Mock dependencies
vi.mock('../../../../lib/polymarket-client.js', () => ({
  getPolymarketClient: vi.fn(),
}));

vi.mock('../../../../lib/mongodb.js', () => ({
  getDatabase: vi.fn(),
}));

import { getPolymarketClient } from '../../../../lib/polymarket-client.js';
import { getDatabase } from '../../../../lib/mongodb.js';

const mockedGetPolymarketClient = vi.mocked(getPolymarketClient);
const mockedGetDatabase = vi.mocked(getDatabase);

describe('Market Data Services', () => {
  let mockCollection: any;
  let mockDb: any;
  let mockClient: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock MongoDB collection
    mockCollection = {
      updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
      find: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue([]),
      countDocuments: vi.fn().mockResolvedValue(0),
      aggregate: vi.fn().mockReturnThis(),
    };

    // Mock MongoDB database
    mockDb = {
      collection: vi.fn().mockReturnValue(mockCollection),
    };

    // Mock Polymarket client
    mockClient = {
      getMarkets: vi.fn().mockResolvedValue([]),
    };

    mockedGetDatabase.mockResolvedValue(mockDb);
    mockedGetPolymarketClient.mockReturnValue(mockClient);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('normalizeMarket', () => {
    it('should normalize a complete market correctly', () => {
      // Arrange
      const polymarketMarket: PolymarketMarket = {
        condition_id: '0x123',
        question: 'Will Bitcoin reach $100k?',
        description: 'Bitcoin price prediction',
        outcomes: ['Yes', 'No'],
        end_date_iso: '2025-12-31T23:59:59Z',
        question_id: 'q1',
        market_slug: 'bitcoin-100k',
        volume: 1000000,
        volume_24hr: 50000,
        liquidity: 200000,
        category: 'crypto',
        tags: ['bitcoin', 'price'],
        accepting_orders: true,
        featured: true,
        game_start_time: '2025-01-01T00:00:00Z',
        tokens: [
          { token_id: 't1', outcome: 'Yes', price: 0.65 },
          { token_id: 't2', outcome: 'No', price: 0.35 },
        ],
      };

      // Act
      const result = normalizeMarket(polymarketMarket);

      // Assert
      expect(result.conditionId).toBe('0x123');
      expect(result.question).toBe('Will Bitcoin reach $100k?');
      expect(result.description).toBe('Bitcoin price prediction');
      expect(result.thisOption).toBe('Yes');
      expect(result.thatOption).toBe('No');
      expect(result.thisOdds).toBeUndefined();
      expect(result.thatOdds).toBeUndefined();
      expect(result.volume).toBeUndefined();
      expect(result.volume24hr).toBeUndefined();
      expect(result.liquidity).toBeUndefined();
      expect(result.category).toBe('crypto');
      expect(result.tags).toEqual(['bitcoin', 'price']);
      expect(result.status).toBe('active');
      expect(result.featured).toBe(true);
      expect(result.endDate).toBe('2025-12-31T23:59:59Z');
      expect(result.startDate).toBe('2025-01-01T00:00:00Z');
      expect(result.source).toBe('polymarket');
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
    });

    it('should use default values for missing fields', () => {
      // Arrange
      const minimalMarket: PolymarketMarket = {
        condition_id: '0x456',
        question: 'Test?',
        outcomes: [],
        end_date_iso: '2025-12-31T23:59:59Z',
        question_id: 'q2',
        market_slug: 'test',
      };

      // Act
      const result = normalizeMarket(minimalMarket);

      // Assert
      expect(result.thisOption).toBe('YES'); // Default
      expect(result.thatOption).toBe('NO'); // Default
      expect(result.thisOdds).toBeUndefined(); // Prices stored separately
      expect(result.thatOdds).toBeUndefined();
      expect(result.status).toBe('closed'); // Default when no accepting_orders
    });

    it('should determine status as archived when archived is true', () => {
      // Arrange
      const archivedMarket: PolymarketMarket = {
        condition_id: '0x789',
        question: 'Archived?',
        outcomes: ['Yes', 'No'],
        end_date_iso: '2025-12-31T23:59:59Z',
        question_id: 'q3',
        market_slug: 'archived',
        archived: true,
        accepting_orders: true, // Should be ignored
      };

      // Act
      const result = normalizeMarket(archivedMarket);

      // Assert
      expect(result.status).toBe('archived');
    });

    it('should determine status as active when accepting_orders is true', () => {
      // Arrange
      const activeMarket: PolymarketMarket = {
        condition_id: '0xabc',
        question: 'Active?',
        outcomes: ['Yes', 'No'],
        end_date_iso: '2025-12-31T23:59:59Z',
        question_id: 'q4',
        market_slug: 'active',
        accepting_orders: true,
        closed: true, // Should be ignored
      };

      // Act
      const result = normalizeMarket(activeMarket);

      // Assert
      expect(result.status).toBe('active');
    });

    it('should determine status as closed when accepting_orders is false', () => {
      // Arrange
      const closedMarket: PolymarketMarket = {
        condition_id: '0xdef',
        question: 'Closed?',
        outcomes: ['Yes', 'No'],
        end_date_iso: '2025-12-31T23:59:59Z',
        question_id: 'q5',
        market_slug: 'closed',
        accepting_orders: false,
      };

      // Act
      const result = normalizeMarket(closedMarket);

      // Assert
      expect(result.status).toBe('closed');
    });

    it('should fallback to closed field when accepting_orders is undefined', () => {
      // Arrange
      const fallbackMarket: PolymarketMarket = {
        condition_id: '0xghi',
        question: 'Fallback?',
        outcomes: ['Yes', 'No'],
        end_date_iso: '2025-12-31T23:59:59Z',
        question_id: 'q6',
        market_slug: 'fallback',
        closed: true,
      };

      // Act
      const result = normalizeMarket(fallbackMarket);

      // Assert
      expect(result.status).toBe('closed');
    });

    it('should fallback to active field when accepting_orders and closed are undefined', () => {
      // Arrange
      const fallbackActiveMarket: PolymarketMarket = {
        condition_id: '0xjkl',
        question: 'Fallback Active?',
        outcomes: ['Yes', 'No'],
        end_date_iso: '2025-12-31T23:59:59Z',
        question_id: 'q7',
        market_slug: 'fallback-active',
        active: true,
      };

      // Act
      const result = normalizeMarket(fallbackActiveMarket);

      // Assert
      expect(result.status).toBe('active');
    });

    it('should extract odds from tokens correctly', () => {
      // Arrange
      const marketWithTokens: PolymarketMarket = {
        condition_id: '0xtokens',
        question: 'With tokens?',
        outcomes: ['OptionA', 'OptionB'],
        end_date_iso: '2025-12-31T23:59:59Z',
        question_id: 'q8',
        market_slug: 'tokens',
        tokens: [
          { token_id: 't1', outcome: 'OptionA', price: 0.75 },
          { token_id: 't2', outcome: 'OptionB', price: 0.25 },
        ],
      };

      // Act
      const result = normalizeMarket(marketWithTokens);

      // Assert
      expect(result.thisOdds).toBeUndefined();
      expect(result.thatOdds).toBeUndefined();
    });
  });

  describe('fetchAndSaveMarkets', () => {
    it('should fetch and save markets successfully', async () => {
      // Arrange
      const mockMarkets: PolymarketMarket[] = [
        {
          condition_id: '0x1',
          question: 'Market 1?',
          outcomes: ['Yes', 'No'],
          end_date_iso: '2025-12-31T23:59:59Z',
          question_id: 'q1',
          market_slug: 'market-1',
          accepting_orders: true,
        },
        {
          condition_id: '0x2',
          question: 'Market 2?',
          outcomes: ['Yes', 'No'],
          end_date_iso: '2025-12-31T23:59:59Z',
          question_id: 'q2',
          market_slug: 'market-2',
          accepting_orders: true,
        },
      ];

      mockClient.getMarkets.mockResolvedValue(mockMarkets);
      mockCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });

      // Act
      const result = await fetchAndSaveMarkets({ active: true, limit: 10 });

      // Assert
      expect(result.saved).toBe(2);
      expect(result.errors).toBe(0);
      expect(mockClient.getMarkets).toHaveBeenCalledWith({
        closed: false,
        limit: 10,
        offset: 0,
      });
      expect(mockCollection.updateOne).toHaveBeenCalledTimes(2);
    });

    it('should filter active markets when active=true', async () => {
      // Arrange
      const mockMarkets: PolymarketMarket[] = [
        {
          condition_id: '0x1',
          question: 'Active?',
          outcomes: ['Yes', 'No'],
          end_date_iso: '2025-12-31T23:59:59Z',
          question_id: 'q1',
          market_slug: 'active',
          accepting_orders: true,
        },
        {
          condition_id: '0x2',
          question: 'Inactive?',
          outcomes: ['Yes', 'No'],
          end_date_iso: '2025-12-31T23:59:59Z',
          question_id: 'q2',
          market_slug: 'inactive',
          accepting_orders: false,
        },
      ];

      mockClient.getMarkets.mockResolvedValue(mockMarkets);

      // Act
      const result = await fetchAndSaveMarkets({ active: true, limit: 10 });

      // Assert
      expect(result.saved).toBe(1); // Only active market saved
    });

    it('should handle errors when saving individual markets', async () => {
      // Arrange
      const mockMarkets: PolymarketMarket[] = [
        {
          condition_id: '0x1',
          question: 'Good?',
          outcomes: ['Yes', 'No'],
          end_date_iso: '2025-12-31T23:59:59Z',
          question_id: 'q1',
          market_slug: 'good',
          accepting_orders: true,
        },
        {
          condition_id: '0x2',
          question: 'Bad?',
          outcomes: ['Yes', 'No'],
          end_date_iso: '2025-12-31T23:59:59Z',
          question_id: 'q2',
          market_slug: 'bad',
          accepting_orders: true,
        },
      ];

      mockClient.getMarkets.mockResolvedValue(mockMarkets);
      mockCollection.updateOne
        .mockResolvedValueOnce({ modifiedCount: 1 })
        .mockRejectedValueOnce(new Error('DB Error'));

      // Act
      const result = await fetchAndSaveMarkets({ active: true, limit: 10 });

      // Assert
      expect(result.saved).toBe(1);
      expect(result.errors).toBe(1);
    });

    it('should throw error when API returns non-array', async () => {
      // Arrange
      mockClient.getMarkets.mockResolvedValue({ data: 'invalid' });

      // Act & Assert
      await expect(fetchAndSaveMarkets()).rejects.toThrow('Invalid response from Polymarket API');
    });

    it('should throw error when API call fails', async () => {
      // Arrange
      mockClient.getMarkets.mockRejectedValue(new Error('API Error'));

      // Act & Assert
      await expect(fetchAndSaveMarkets()).rejects.toThrow('API Error');
    });

    it('should apply limit after filtering', async () => {
      // Arrange
      const mockMarkets: PolymarketMarket[] = Array.from({ length: 20 }, (_, i) => ({
        condition_id: `0x${i}`,
        question: `Market ${i}?`,
        outcomes: ['Yes', 'No'],
        end_date_iso: '2025-12-31T23:59:59Z',
        question_id: `q${i}`,
        market_slug: `market-${i}`,
        accepting_orders: true,
      }));

      mockClient.getMarkets.mockResolvedValue(mockMarkets);

      // Act
      const result = await fetchAndSaveMarkets({ active: true, limit: 5 });

      // Assert
      expect(result.saved).toBe(5);
      expect(mockCollection.updateOne).toHaveBeenCalledTimes(5);
    });
  });

  describe('getAllMarkets', () => {
    it('should return all markets without filters', async () => {
      // Arrange
      const mockMarkets: FlattenedMarket[] = [
        {
          conditionId: '0x1',
          question: 'Market 1?',
          thisOption: 'Yes',
          thatOption: 'No',
          thisOdds: 0.6,
          thatOdds: 0.4,
          status: 'active',
          source: 'polymarket',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockCollection.toArray.mockResolvedValue(mockMarkets);

      // Act
      const result = await getAllMarkets();

      // Assert
      expect(result).toEqual(mockMarkets);
      expect(mockCollection.find).toHaveBeenCalledWith({});
      expect(mockCollection.sort).toHaveBeenCalledWith({ updatedAt: -1 });
      expect(mockCollection.limit).toHaveBeenCalledWith(100);
      expect(mockCollection.skip).toHaveBeenCalledWith(0);
    });

    it('should filter by status', async () => {
      // Arrange
      mockCollection.toArray.mockResolvedValue([]);

      // Act
      await getAllMarkets({ status: 'active' });

      // Assert
      expect(mockCollection.find).toHaveBeenCalledWith({ status: 'active' });
    });

    it('should filter by category', async () => {
      // Arrange
      mockCollection.toArray.mockResolvedValue([]);

      // Act
      await getAllMarkets({ category: 'crypto' });

      // Assert
      expect(mockCollection.find).toHaveBeenCalledWith({ category: 'crypto' });
    });

    it('should filter by featured', async () => {
      // Arrange
      mockCollection.toArray.mockResolvedValue([]);

      // Act
      await getAllMarkets({ featured: true });

      // Assert
      expect(mockCollection.find).toHaveBeenCalledWith({ featured: true });
    });

    it('should apply pagination', async () => {
      // Arrange
      mockCollection.toArray.mockResolvedValue([]);

      // Act
      await getAllMarkets({ limit: 20, skip: 10 });

      // Assert
      expect(mockCollection.limit).toHaveBeenCalledWith(20);
      expect(mockCollection.skip).toHaveBeenCalledWith(10);
    });
  });

  describe('getMarketStats', () => {
    it('should return correct statistics', async () => {
      // Arrange
      mockCollection.countDocuments
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(60) // active
        .mockResolvedValueOnce(30) // closed
        .mockResolvedValueOnce(5) // archived
        .mockResolvedValueOnce(10); // featured

      const mockCategoryResults = [
        { _id: 'crypto', count: 40 },
        { _id: 'politics', count: 30 },
        { _id: 'sports', count: 30 },
      ];

      mockCollection.aggregate.mockReturnValue({
        toArray: vi.fn().mockResolvedValue(mockCategoryResults),
      });

      // Act
      const result = await getMarketStats();

      // Assert
      expect(result.totalMarkets).toBe(100);
      expect(result.activeMarkets).toBe(60);
      expect(result.closedMarkets).toBe(30);
      expect(result.archivedMarkets).toBe(5);
      expect(result.featuredMarkets).toBe(10);
      expect(result.categoryCounts).toEqual({
        crypto: 40,
        politics: 30,
        sports: 30,
      });
      expect(result.lastUpdated).toBeInstanceOf(Date);
    });

    it('should handle empty category counts', async () => {
      // Arrange
      mockCollection.countDocuments.mockResolvedValue(0);
      mockCollection.aggregate.mockReturnValue({
        toArray: vi.fn().mockResolvedValue([]),
      });

      // Act
      const result = await getMarketStats();

      // Assert
      expect(result.categoryCounts).toEqual({});
    });
  });
});

