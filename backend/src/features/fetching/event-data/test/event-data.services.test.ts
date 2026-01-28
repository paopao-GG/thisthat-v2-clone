// Unit tests for event data services
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { normalizeEvent, fetchAndSaveEvents, getAllEvents, getEventStats } from '../event-data.services.js';
import type { PolymarketEvent } from '../../../../lib/polymarket-client.js';
import type { FlattenedEvent } from '../event-data.models.js';

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

describe('Event Data Services', () => {
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
      getEvents: vi.fn().mockResolvedValue([]),
    };

    mockedGetDatabase.mockResolvedValue(mockDb);
    mockedGetPolymarketClient.mockReturnValue(mockClient);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('normalizeEvent', () => {
    it('should normalize a complete event correctly', () => {
      // Arrange
      const polymarketEvent: PolymarketEvent = {
        id: 'event1',
        slug: 'us-election-2024',
        title: '2024 US Presidential Election',
        subtitle: 'Who will win?',
        description: 'Presidential election prediction',
        image: 'https://example.com/image.jpg',
        icon: 'https://example.com/icon.jpg',
        category: 'politics',
        active: true,
        featured: true,
        startDate: '2024-11-05T00:00:00Z',
        endDate: '2024-11-06T00:00:00Z',
        volume: 5000000,
        markets: [
          {
            condition_id: '0x1',
            question: 'Will candidate A win?',
            outcomes: ['Yes', 'No'],
            end_date_iso: '2024-11-06T00:00:00Z',
            question_id: 'q1',
            market_slug: 'candidate-a',
          },
        ],
      };

      // Act
      const result = normalizeEvent(polymarketEvent);

      // Assert
      expect(result.eventId).toBe('event1');
      expect(result.slug).toBe('us-election-2024');
      expect(result.title).toBe('2024 US Presidential Election');
      expect(result.description).toBe('Presidential election prediction');
      expect(result.imageUrl).toBe('https://example.com/image.jpg');
      expect(result.iconUrl).toBe('https://example.com/icon.jpg');
      expect(result.category).toBe('politics');
      expect(result.status).toBe('active');
      expect(result.featured).toBe(true);
      expect(result.startDate).toBe('2024-11-05T00:00:00Z');
      expect(result.endDate).toBe('2024-11-06T00:00:00Z');
      expect(result.marketCount).toBe(1);
      expect(result.marketIds).toEqual(['0x1']);
      expect(result.source).toBe('polymarket');
      expect(result.rawData).toEqual(polymarketEvent);
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
    });

    it('should use legacy fields when new fields are missing', () => {
      // Arrange
      const legacyEvent: PolymarketEvent = {
        id: 'event2',
        slug: 'legacy-event',
        title: 'Legacy Event',
        image_url: 'https://example.com/legacy-image.jpg',
        icon_url: 'https://example.com/legacy-icon.jpg',
        start_date_iso: '2024-01-01T00:00:00Z',
        end_date_iso: '2024-12-31T23:59:59Z',
      };

      // Act
      const result = normalizeEvent(legacyEvent);

      // Assert
      expect(result.imageUrl).toBe('https://example.com/legacy-image.jpg');
      expect(result.iconUrl).toBe('https://example.com/legacy-icon.jpg');
      expect(result.startDate).toBe('2024-01-01T00:00:00Z');
      expect(result.endDate).toBe('2024-12-31T23:59:59Z');
    });

    it('should use subtitle as description when description is missing', () => {
      // Arrange
      const eventWithSubtitle: PolymarketEvent = {
        id: 'event3',
        slug: 'subtitle-event',
        title: 'Event with Subtitle',
        subtitle: 'This is the subtitle',
      };

      // Act
      const result = normalizeEvent(eventWithSubtitle);

      // Assert
      expect(result.description).toBe('This is the subtitle');
    });

    it('should determine status as archived when archived is true', () => {
      // Arrange
      const archivedEvent: PolymarketEvent = {
        id: 'event4',
        slug: 'archived-event',
        title: 'Archived Event',
        archived: true,
        active: true, // Should be ignored
      };

      // Act
      const result = normalizeEvent(archivedEvent);

      // Assert
      expect(result.status).toBe('archived');
    });

    it('should determine status as closed when closed is true', () => {
      // Arrange
      const closedEvent: PolymarketEvent = {
        id: 'event5',
        slug: 'closed-event',
        title: 'Closed Event',
        closed: true,
      };

      // Act
      const result = normalizeEvent(closedEvent);

      // Assert
      expect(result.status).toBe('closed');
    });

    it('should determine status as closed when active is false', () => {
      // Arrange
      const inactiveEvent: PolymarketEvent = {
        id: 'event6',
        slug: 'inactive-event',
        title: 'Inactive Event',
        active: false,
      };

      // Act
      const result = normalizeEvent(inactiveEvent);

      // Assert
      expect(result.status).toBe('closed');
    });

    it('should default to active status', () => {
      // Arrange
      const defaultEvent: PolymarketEvent = {
        id: 'event7',
        slug: 'default-event',
        title: 'Default Event',
      };

      // Act
      const result = normalizeEvent(defaultEvent);

      // Assert
      expect(result.status).toBe('active');
    });

    it('should extract market IDs from markets array', () => {
      // Arrange
      const eventWithMarkets: PolymarketEvent = {
        id: 'event8',
        slug: 'markets-event',
        title: 'Event with Markets',
        markets: [
          {
            condition_id: '0x1',
            question: 'Market 1?',
            outcomes: ['Yes', 'No'],
            end_date_iso: '2025-12-31T23:59:59Z',
            question_id: 'q1',
            market_slug: 'market-1',
          },
          {
            condition_id: '0x2',
            question: 'Market 2?',
            outcomes: ['Yes', 'No'],
            end_date_iso: '2025-12-31T23:59:59Z',
            question_id: 'q2',
            market_slug: 'market-2',
          },
        ],
      };

      // Act
      const result = normalizeEvent(eventWithMarkets);

      // Assert
      expect(result.marketCount).toBe(2);
      expect(result.marketIds).toEqual(['0x1', '0x2']);
    });

    it('should use question_id as fallback for market IDs', () => {
      // Arrange
      const eventWithQuestionIds: PolymarketEvent = {
        id: 'event9',
        slug: 'question-ids-event',
        title: 'Event with Question IDs',
        markets: [
          {
            question_id: 'q1',
            question: 'Market 1?',
            outcomes: ['Yes', 'No'],
            end_date_iso: '2025-12-31T23:59:59Z',
            market_slug: 'market-1',
          },
        ],
      };

      // Act
      const result = normalizeEvent(eventWithQuestionIds);

      // Assert
      expect(result.marketIds).toEqual(['q1']);
    });
  });

  describe('fetchAndSaveEvents', () => {
    it('should fetch and save events successfully', async () => {
      // Arrange
      const mockEvents: PolymarketEvent[] = [
        {
          id: 'event1',
          slug: 'event-1',
          title: 'Event 1',
        },
        {
          id: 'event2',
          slug: 'event-2',
          title: 'Event 2',
        },
      ];

      mockClient.getEvents.mockResolvedValue(mockEvents);
      mockCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });

      // Act
      const result = await fetchAndSaveEvents({ active: true, limit: 10 });

      // Assert
      expect(result.saved).toBe(2);
      expect(result.errors).toBe(0);
      expect(mockClient.getEvents).toHaveBeenCalledWith({
        closed: false,
        limit: 10,
        order: 'id',
        ascending: false,
      });
      expect(mockCollection.updateOne).toHaveBeenCalledTimes(2);
    });

    it('should handle errors when saving individual events', async () => {
      // Arrange
      const mockEvents: PolymarketEvent[] = [
        {
          id: 'event1',
          slug: 'good-event',
          title: 'Good Event',
        },
        {
          id: 'event2',
          slug: 'bad-event',
          title: 'Bad Event',
        },
      ];

      mockClient.getEvents.mockResolvedValue(mockEvents);
      mockCollection.updateOne
        .mockResolvedValueOnce({ modifiedCount: 1 })
        .mockRejectedValueOnce(new Error('DB Error'));

      // Act
      const result = await fetchAndSaveEvents({ active: true, limit: 10 });

      // Assert
      expect(result.saved).toBe(1);
      expect(result.errors).toBe(1);
    });

    it('should throw error when API returns non-array', async () => {
      // Arrange
      mockClient.getEvents.mockResolvedValue({ data: 'invalid' });

      // Act & Assert
      await expect(fetchAndSaveEvents()).rejects.toThrow('Invalid response from Polymarket API');
    });

    it('should throw error when API call fails', async () => {
      // Arrange
      mockClient.getEvents.mockRejectedValue(new Error('API Error'));

      // Act & Assert
      await expect(fetchAndSaveEvents()).rejects.toThrow('API Error');
    });

    it('should use default limit when not specified', async () => {
      // Arrange
      const mockEvents: PolymarketEvent[] = Array.from({ length: 5 }, (_, i) => ({
        id: `event${i}`,
        slug: `event-${i}`,
        title: `Event ${i}`,
      }));

      mockClient.getEvents.mockResolvedValue(mockEvents);

      // Act
      const result = await fetchAndSaveEvents();

      // Assert
      expect(mockClient.getEvents).toHaveBeenCalledWith({
        closed: false,
        limit: 100,
        order: 'id',
        ascending: false,
      });
      expect(result.saved).toBe(5);
    });
  });

  describe('getAllEvents', () => {
    it('should return all events without filters', async () => {
      // Arrange
      const mockEvents: FlattenedEvent[] = [
        {
          eventId: 'event1',
          slug: 'event-1',
          title: 'Event 1',
          status: 'active',
          source: 'polymarket',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockCollection.toArray.mockResolvedValue(mockEvents);

      // Act
      const result = await getAllEvents();

      // Assert
      expect(result).toEqual(mockEvents);
      expect(mockCollection.find).toHaveBeenCalledWith({});
      expect(mockCollection.sort).toHaveBeenCalledWith({ updatedAt: -1 });
      expect(mockCollection.limit).toHaveBeenCalledWith(100);
      expect(mockCollection.skip).toHaveBeenCalledWith(0);
    });

    it('should filter by status', async () => {
      // Arrange
      mockCollection.toArray.mockResolvedValue([]);

      // Act
      await getAllEvents({ status: 'active' });

      // Assert
      expect(mockCollection.find).toHaveBeenCalledWith({ status: 'active' });
    });

    it('should filter by category', async () => {
      // Arrange
      mockCollection.toArray.mockResolvedValue([]);

      // Act
      await getAllEvents({ category: 'politics' });

      // Assert
      expect(mockCollection.find).toHaveBeenCalledWith({ category: 'politics' });
    });

    it('should filter by featured', async () => {
      // Arrange
      mockCollection.toArray.mockResolvedValue([]);

      // Act
      await getAllEvents({ featured: true });

      // Assert
      expect(mockCollection.find).toHaveBeenCalledWith({ featured: true });
    });

    it('should apply pagination', async () => {
      // Arrange
      mockCollection.toArray.mockResolvedValue([]);

      // Act
      await getAllEvents({ limit: 20, skip: 10 });

      // Assert
      expect(mockCollection.limit).toHaveBeenCalledWith(20);
      expect(mockCollection.skip).toHaveBeenCalledWith(10);
    });
  });

  describe('getEventStats', () => {
    it('should return correct statistics', async () => {
      // Arrange
      mockCollection.countDocuments
        .mockResolvedValueOnce(50) // total
        .mockResolvedValueOnce(30) // active
        .mockResolvedValueOnce(15) // closed
        .mockResolvedValueOnce(3) // archived
        .mockResolvedValueOnce(5); // featured

      const mockCategoryResults = [
        { _id: 'politics', count: 20 },
        { _id: 'sports', count: 15 },
        { _id: 'crypto', count: 15 },
      ];

      mockCollection.aggregate.mockReturnValue({
        toArray: vi.fn().mockResolvedValue(mockCategoryResults),
      });

      // Act
      const result = await getEventStats();

      // Assert
      expect(result.totalEvents).toBe(50);
      expect(result.activeEvents).toBe(30);
      expect(result.closedEvents).toBe(15);
      expect(result.archivedEvents).toBe(3);
      expect(result.featuredEvents).toBe(5);
      expect(result.categoryCounts).toEqual({
        politics: 20,
        sports: 15,
        crypto: 15,
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
      const result = await getEventStats();

      // Assert
      expect(result.categoryCounts).toEqual({});
    });
  });
});

