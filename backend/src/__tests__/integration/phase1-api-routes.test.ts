// Integration tests for Phase 1 API routes
// Tests the full flow: API routes → controllers → services → MongoDB
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import marketDataRoutes from '../../features/fetching/market-data/market-data.routes.js';
import eventDataRoutes from '../../features/fetching/event-data/event-data.routes.js';

// Mock MongoDB and Polymarket client
vi.mock('../../lib/mongodb.js', () => ({
  connectMongoDB: vi.fn(),
  closeMongoDB: vi.fn(),
  getDatabase: vi.fn(),
}));

vi.mock('../../lib/polymarket-client.js', () => ({
  getPolymarketClient: vi.fn(),
}));

import { getDatabase } from '../../lib/mongodb.js';
import { getPolymarketClient } from '../../lib/polymarket-client.js';

const mockedGetDatabase = vi.mocked(getDatabase);
const mockedGetPolymarketClient = vi.mocked(getPolymarketClient);

describe('Phase 1 API Routes Integration', () => {
  let app: any;
  let mockCollection: any;
  let mockDb: any;
  let mockClient: any;

  beforeEach(async () => {
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
      getEvents: vi.fn().mockResolvedValue([]),
    };

    mockedGetDatabase.mockResolvedValue(mockDb);
    mockedGetPolymarketClient.mockReturnValue(mockClient);

    // Create Fastify app
    app = Fastify({ logger: false });

    // Register routes
    await app.register(marketDataRoutes, { prefix: '/api/v1/markets' });
    await app.register(eventDataRoutes, { prefix: '/api/v1/events' });

    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.restoreAllMocks();
  });

  describe('Market Routes', () => {
    describe('GET /api/v1/markets/fetch', () => {
      it('should fetch markets successfully', async () => {
        // Arrange
        const mockMarkets = [
          {
            condition_id: '0x1',
            question: 'Test Market?',
            outcomes: ['Yes', 'No'],
            end_date_iso: '2025-12-31T23:59:59Z',
            question_id: 'q1',
            market_slug: 'test',
            accepting_orders: true,
          },
        ];

        mockClient.getMarkets.mockResolvedValue(mockMarkets);

        // Act
        const response = await app.inject({
          method: 'GET',
          url: '/api/v1/markets/fetch?active=true&limit=10',
        });

        // Assert
        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body.message).toContain('Fetched and saved');
        expect(body.data).toHaveProperty('saved');
        expect(body.data).toHaveProperty('errors');
      });

      it('should handle POST method (backward compatibility)', async () => {
        // Arrange
        mockClient.getMarkets.mockResolvedValue([]);

        // Act
        const response = await app.inject({
          method: 'POST',
          url: '/api/v1/markets/fetch?active=true&limit=5',
        });

        // Assert
        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
      });
    });

    describe('GET /api/v1/markets', () => {
      it('should return markets from database', async () => {
        // Arrange
        const mockMarkets = [
          {
            conditionId: '0x1',
            question: 'Test Market?',
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
        const response = await app.inject({
          method: 'GET',
          url: '/api/v1/markets?limit=10',
        });

        // Assert
        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body.count).toBe(1);
        expect(body.data).toHaveLength(1);
        expect(body.data[0].conditionId).toBe('0x1');
        expect(body.data[0].question).toBe('Test Market?');
      });

      it('should filter by status', async () => {
        // Arrange
        mockCollection.toArray.mockResolvedValue([]);

        // Act
        const response = await app.inject({
          method: 'GET',
          url: '/api/v1/markets?status=active',
        });

        // Assert
        expect(response.statusCode).toBe(200);
        expect(mockCollection.find).toHaveBeenCalledWith({ status: 'active' });
      });

      it('should filter by category', async () => {
        // Arrange
        mockCollection.toArray.mockResolvedValue([]);

        // Act
        const response = await app.inject({
          method: 'GET',
          url: '/api/v1/markets?category=crypto',
        });

        // Assert
        expect(response.statusCode).toBe(200);
        expect(mockCollection.find).toHaveBeenCalledWith({ category: 'crypto' });
      });

      it('should handle pagination', async () => {
        // Arrange
        mockCollection.toArray.mockResolvedValue([]);

        // Act
        const response = await app.inject({
          method: 'GET',
          url: '/api/v1/markets?limit=20&skip=10',
        });

        // Assert
        expect(response.statusCode).toBe(200);
        expect(mockCollection.limit).toHaveBeenCalledWith(20);
        expect(mockCollection.skip).toHaveBeenCalledWith(10);
      });
    });

    describe('GET /api/v1/markets/stats', () => {
      it('should return market statistics', async () => {
        // Arrange
        mockCollection.countDocuments
          .mockResolvedValueOnce(100) // total
          .mockResolvedValueOnce(60) // active
          .mockResolvedValueOnce(30) // closed
          .mockResolvedValueOnce(5) // archived
          .mockResolvedValueOnce(10); // featured

        mockCollection.aggregate.mockReturnValue({
          toArray: vi.fn().mockResolvedValue([
            { _id: 'crypto', count: 40 },
            { _id: 'politics', count: 30 },
          ]),
        });

        // Act
        const response = await app.inject({
          method: 'GET',
          url: '/api/v1/markets/stats',
        });

        // Assert
        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body.data).toHaveProperty('totalMarkets');
        expect(body.data).toHaveProperty('activeMarkets');
        expect(body.data).toHaveProperty('categoryCounts');
      });
    });
  });

  describe('Event Routes', () => {
    describe('GET /api/v1/events/fetch', () => {
      it('should fetch events successfully', async () => {
        // Arrange
        const mockEvents = [
          {
            id: 'event1',
            slug: 'test-event',
            title: 'Test Event',
          },
        ];

        mockClient.getEvents.mockResolvedValue(mockEvents);

        // Act
        const response = await app.inject({
          method: 'GET',
          url: '/api/v1/events/fetch?active=true&limit=10',
        });

        // Assert
        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body.message).toContain('Fetched and saved');
        expect(body.data).toHaveProperty('saved');
      });

      it('should handle POST method (backward compatibility)', async () => {
        // Arrange
        mockClient.getEvents.mockResolvedValue([]);

        // Act
        const response = await app.inject({
          method: 'POST',
          url: '/api/v1/events/fetch?active=true&limit=5',
        });

        // Assert
        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
      });
    });

    describe('GET /api/v1/events', () => {
      it('should return events from database', async () => {
        // Arrange
        const mockEvents = [
          {
            eventId: 'event1',
            slug: 'test-event',
            title: 'Test Event',
            status: 'active',
            source: 'polymarket',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ];

        mockCollection.toArray.mockResolvedValue(mockEvents);

        // Act
        const response = await app.inject({
          method: 'GET',
          url: '/api/v1/events?limit=10',
        });

        // Assert
        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body.count).toBe(1);
        expect(body.data).toHaveLength(1);
        expect(body.data[0].eventId).toBe('event1');
        expect(body.data[0].title).toBe('Test Event');
      });

      it('should filter by status', async () => {
        // Arrange
        mockCollection.toArray.mockResolvedValue([]);

        // Act
        const response = await app.inject({
          method: 'GET',
          url: '/api/v1/events?status=active',
        });

        // Assert
        expect(response.statusCode).toBe(200);
        expect(mockCollection.find).toHaveBeenCalledWith({ status: 'active' });
      });
    });

    describe('GET /api/v1/events/stats', () => {
      it('should return event statistics', async () => {
        // Arrange
        mockCollection.countDocuments
          .mockResolvedValueOnce(50) // total
          .mockResolvedValueOnce(30) // active
          .mockResolvedValueOnce(15) // closed
          .mockResolvedValueOnce(3) // archived
          .mockResolvedValueOnce(5); // featured

        mockCollection.aggregate.mockReturnValue({
          toArray: vi.fn().mockResolvedValue([
            { _id: 'politics', count: 20 },
          ]),
        });

        // Act
        const response = await app.inject({
          method: 'GET',
          url: '/api/v1/events/stats',
        });

        // Assert
        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body.data).toHaveProperty('totalEvents');
        expect(body.data).toHaveProperty('activeEvents');
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle service errors gracefully', async () => {
      // Arrange
      mockClient.getMarkets.mockRejectedValue(new Error('API Error'));

      // Act
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/markets/fetch',
      });

      // Assert
      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Failed to fetch markets');
    });

    it('should handle database errors gracefully', async () => {
      // Arrange
      mockCollection.toArray.mockRejectedValue(new Error('DB Error'));

      // Act
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/markets',
      });

      // Assert
      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Failed to get markets');
    });
  });
});

