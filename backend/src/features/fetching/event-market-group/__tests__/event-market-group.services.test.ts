// Unit tests for Event-Market Group Services
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mocks
const mockPolymarketClient = vi.hoisted(() => ({
  getEvents: vi.fn(),
}));

const mockMongoDB = vi.hoisted(() => ({
  collection: vi.fn(),
}));

const mockNormalizeMarket = vi.hoisted(() => vi.fn());

// Mock dependencies
vi.mock('../../../../lib/polymarket-client.js', () => ({
  getPolymarketClient: vi.fn(() => mockPolymarketClient),
}));

vi.mock('../../../../lib/mongodb.js', () => ({
  getDatabase: vi.fn(() => Promise.resolve(mockMongoDB)),
}));

vi.mock('../../market-data/market-data.services.js', () => ({
  normalizeMarket: mockNormalizeMarket,
}));

// Import service AFTER mocks
import * as eventMarketGroupService from '../event-market-group.services.js';

describe('Event-Market Group Services', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchAndSaveEventMarketGroups', () => {
    const mockEvent = {
      id: 'event-123',
      title: 'Test Event',
      description: 'Test description',
      slug: 'test-event',
      image: 'https://example.com/image.jpg',
      icon: 'https://example.com/icon.jpg',
      category: 'politics',
      active: true,
      closed: false,
      archived: false,
      markets: [
        {
          conditionId: 'condition-1',
          question: 'Market 1?',
          outcomes: ['Yes', 'No'],
        },
      ],
    };

    const mockNormalizedMarket = {
      conditionId: 'condition-1',
      question: 'Market 1?',
      thisOption: 'Yes',
      thatOption: 'No',
      status: 'active',
      liquidity: '1000',
      volume: '5000',
    };

    it('should fetch and save event-market groups successfully', async () => {
      mockPolymarketClient.getEvents.mockResolvedValue([mockEvent]);
      mockNormalizeMarket.mockReturnValue(mockNormalizedMarket);

      const marketsCollection = {
        updateOne: vi.fn().mockResolvedValue({} as any),
      };
      const eventsCollection = {
        updateOne: vi.fn().mockResolvedValue({} as any),
      };
      
      mockMongoDB.collection
        .mockReturnValueOnce(eventsCollection) // First call for events collection
        .mockReturnValueOnce(marketsCollection); // Second call for markets collection

      const result = await eventMarketGroupService.fetchAndSaveEventMarketGroups();

      expect(result.saved).toBe(1);
      expect(result.errors).toBe(0);
      expect(eventsCollection.updateOne).toHaveBeenCalled();
    });

    it('should skip events without markets', async () => {
      const eventWithoutMarkets = {
        ...mockEvent,
        markets: [],
      };

      mockPolymarketClient.getEvents.mockResolvedValue([eventWithoutMarkets]);

      const marketsCollection = {
        updateOne: vi.fn().mockResolvedValue({} as any),
      };
      const eventsCollection = {
        updateOne: vi.fn().mockResolvedValue({} as any),
      };
      
      mockMongoDB.collection
        .mockReturnValueOnce(eventsCollection)
        .mockReturnValueOnce(marketsCollection);

      const result = await eventMarketGroupService.fetchAndSaveEventMarketGroups();

      expect(result.saved).toBe(0);
      expect(result.errors).toBe(0);
    });

    it('should handle active filter', async () => {
      mockPolymarketClient.getEvents.mockResolvedValue([]);

      await eventMarketGroupService.fetchAndSaveEventMarketGroups({ active: true });

      expect(mockPolymarketClient.getEvents).toHaveBeenCalledWith({
        closed: false,
        limit: 50,
      });
    });

    it('should handle limit option', async () => {
      mockPolymarketClient.getEvents.mockResolvedValue([]);

      await eventMarketGroupService.fetchAndSaveEventMarketGroups({ limit: 10 });

      expect(mockPolymarketClient.getEvents).toHaveBeenCalledWith({
        closed: false,
        limit: 10,
      });
    });

    it('should handle errors gracefully', async () => {
      const eventWithError = {
        ...mockEvent,
        markets: [{}], // Invalid market data
      };

      mockPolymarketClient.getEvents.mockResolvedValue([eventWithError]);
      mockNormalizeMarket.mockImplementation(() => {
        throw new Error('Normalization error');
      });

      const marketsCollection = {
        updateOne: vi.fn().mockResolvedValue({} as any),
      };
      const eventsCollection = {
        updateOne: vi.fn().mockResolvedValue({} as any),
      };
      
      mockMongoDB.collection
        .mockReturnValueOnce(eventsCollection)
        .mockReturnValueOnce(marketsCollection);

      const result = await eventMarketGroupService.fetchAndSaveEventMarketGroups();

      expect(result.errors).toBe(1);
      expect(result.saved).toBe(0);
    });

    it('should determine event status correctly', async () => {
      const archivedEvent = { ...mockEvent, archived: true, active: false };
      mockPolymarketClient.getEvents.mockResolvedValue([archivedEvent]);
      mockNormalizeMarket.mockReturnValue(mockNormalizedMarket);

      const marketsCollection = {
        updateOne: vi.fn().mockResolvedValue({} as any),
      };
      const eventsCollection = {
        updateOne: vi.fn().mockResolvedValue({} as any),
      };
      
      mockMongoDB.collection
        .mockReturnValueOnce(eventsCollection)
        .mockReturnValueOnce(marketsCollection);

      await eventMarketGroupService.fetchAndSaveEventMarketGroups();

      expect(eventsCollection.updateOne).toHaveBeenCalledWith(
        { eventId: 'event-123' },
        expect.objectContaining({
          $set: expect.objectContaining({
            status: 'archived',
          }),
        }),
        { upsert: true }
      );
    });
  });

  describe('getAllEventMarketGroups', () => {
    it('should return all event-market groups', async () => {
      const mockGroups = [
        {
          eventId: 'event-1',
          eventTitle: 'Event 1',
          markets: [],
        },
      ];

      // Create a proper cursor chain mock using mockReturnThis
      const findCursor = {
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue(mockGroups),
      };

      const collection = {
        find: vi.fn().mockReturnValue(findCursor),
      };
      mockMongoDB.collection.mockReturnValue(collection);

      const result = await eventMarketGroupService.getAllEventMarketGroups();

      expect(result).toEqual(mockGroups);
    });

    it('should filter by status', async () => {
      const findCursor = {
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue([]),
      };

      const collection = {
        find: vi.fn().mockReturnValue(findCursor),
      };
      mockMongoDB.collection.mockReturnValue(collection);

      await eventMarketGroupService.getAllEventMarketGroups({ status: 'active' });

      expect(collection.find).toHaveBeenCalledWith({ status: 'active' });
    });

    it('should filter by category', async () => {
      const findCursor = {
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue([]),
      };

      const collection = {
        find: vi.fn().mockReturnValue(findCursor),
      };
      mockMongoDB.collection.mockReturnValue(collection);

      await eventMarketGroupService.getAllEventMarketGroups({ category: 'politics' });

      expect(collection.find).toHaveBeenCalledWith({ category: 'politics' });
    });

    it('should apply limit and skip', async () => {
      const findCursor = {
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue([]),
      };

      const collection = {
        find: vi.fn().mockReturnValue(findCursor),
      };
      mockMongoDB.collection.mockReturnValue(collection);

      await eventMarketGroupService.getAllEventMarketGroups({ limit: 20, skip: 10 });

      expect(findCursor.limit).toHaveBeenCalledWith(20);
      expect(findCursor.skip).toHaveBeenCalledWith(10);
    });
  });

  describe('getEventMarketGroup', () => {
    it('should return event-market group by ID', async () => {
      const mockGroup = {
        eventId: 'event-123',
        eventTitle: 'Test Event',
        markets: [],
      };

      const collection = {
        findOne: vi.fn().mockResolvedValue(mockGroup),
      };
      mockMongoDB.collection.mockReturnValue(collection);

      const result = await eventMarketGroupService.getEventMarketGroup('event-123');

      expect(result).toEqual(mockGroup);
      expect(collection.findOne).toHaveBeenCalledWith({ eventId: 'event-123' });
    });

    it('should return null if event not found', async () => {
      const collection = {
        findOne: vi.fn().mockResolvedValue(null),
      };
      mockMongoDB.collection.mockReturnValue(collection);

      const result = await eventMarketGroupService.getEventMarketGroup('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getEventMarketGroupStats', () => {
    it('should return statistics', async () => {
      const aggregateMock = {
        toArray: vi.fn().mockResolvedValue([
          { _id: 'politics', count: 40 },
          { _id: 'sports', count: 30 },
        ]),
      };

      const collection = {
        countDocuments: vi.fn()
          .mockResolvedValueOnce(100) // total
          .mockResolvedValueOnce(50) // active
          .mockResolvedValueOnce(30) // closed
          .mockResolvedValueOnce(20), // archived
        aggregate: vi.fn().mockReturnValue(aggregateMock),
      };
      mockMongoDB.collection.mockReturnValue(collection);

      const stats = await eventMarketGroupService.getEventMarketGroupStats();

      expect(stats).toEqual({
        totalEvents: 100,
        activeEvents: 50,
        closedEvents: 30,
        archivedEvents: 20,
        categoryCounts: {
          politics: 40,
          sports: 30,
        },
        lastUpdated: expect.any(Date),
      });
    });
  });
});

