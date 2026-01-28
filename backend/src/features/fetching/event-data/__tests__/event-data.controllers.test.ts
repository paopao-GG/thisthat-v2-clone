// Unit tests for event data controllers (API routes)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { fetchEvents, getEvents, getEventStats } from '../event-data.controllers.js';
import type { FlattenedEvent, EventStats } from '../event-data.models.js';

// Mock the service module
vi.mock('../event-data.services.js', () => ({
  fetchAndSaveEvents: vi.fn(),
  getAllEvents: vi.fn(),
  getEventStats: vi.fn(),
}));

import * as eventService from '../event-data.services.js';

const mockedEventService = vi.mocked(eventService);

describe('Event Data Controllers (API Routes)', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock Fastify reply object
    mockReply = {
      send: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
    };

    // Mock Fastify request object
    mockRequest = {
      query: {},
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchEvents', () => {
    it('should fetch and save events successfully', async () => {
      // Arrange
      mockRequest.query = { active: 'true', limit: '30' };
      mockedEventService.fetchAndSaveEvents.mockResolvedValue({
        saved: 30,
        errors: 0,
      });

      // Act
      await fetchEvents(
        mockRequest as FastifyRequest<{ Querystring: { active?: string; limit?: string } }>,
        mockReply as FastifyReply
      );

      // Assert
      expect(mockedEventService.fetchAndSaveEvents).toHaveBeenCalledWith({
        active: true,
        limit: 30,
      });
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        message: 'Fetched and saved 30 events',
        data: { saved: 30, errors: 0 },
      });
    });

    it('should handle active=false query parameter', async () => {
      // Arrange
      mockRequest.query = { active: 'false', limit: '50' };
      mockedEventService.fetchAndSaveEvents.mockResolvedValue({
        saved: 50,
        errors: 0,
      });

      // Act
      await fetchEvents(
        mockRequest as FastifyRequest<{ Querystring: { active?: string; limit?: string } }>,
        mockReply as FastifyReply
      );

      // Assert
      expect(mockedEventService.fetchAndSaveEvents).toHaveBeenCalledWith({
        active: false,
        limit: 50,
      });
    });

    it('should use default limit when not provided', async () => {
      // Arrange
      mockRequest.query = { active: 'true' };
      mockedEventService.fetchAndSaveEvents.mockResolvedValue({
        saved: 100,
        errors: 0,
      });

      // Act
      await fetchEvents(
        mockRequest as FastifyRequest<{ Querystring: { active?: string; limit?: string } }>,
        mockReply as FastifyReply
      );

      // Assert
      expect(mockedEventService.fetchAndSaveEvents).toHaveBeenCalledWith({
        active: true,
        limit: 100, // Default
      });
    });

    it('should handle missing active parameter (defaults to false)', async () => {
      // Arrange
      mockRequest.query = { limit: '20' };
      mockedEventService.fetchAndSaveEvents.mockResolvedValue({
        saved: 20,
        errors: 0,
      });

      // Act
      await fetchEvents(
        mockRequest as FastifyRequest<{ Querystring: { active?: string; limit?: string } }>,
        mockReply as FastifyReply
      );

      // Assert
      expect(mockedEventService.fetchAndSaveEvents).toHaveBeenCalledWith({
        active: false, // Defaults to false when not provided
        limit: 20,
      });
    });

    it('should handle service errors and return 500', async () => {
      // Arrange
      mockRequest.query = { active: 'true', limit: '10' };
      const error = new Error('Service error');
      mockedEventService.fetchAndSaveEvents.mockRejectedValue(error);

      // Act
      await fetchEvents(
        mockRequest as FastifyRequest<{ Querystring: { active?: string; limit?: string } }>,
        mockReply as FastifyReply
      );

      // Assert
      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to fetch events',
        details: 'Service error',
      });
    });

    it('should handle non-Error exceptions', async () => {
      // Arrange
      mockRequest.query = { active: 'true' };
      mockedEventService.fetchAndSaveEvents.mockRejectedValue('String error');

      // Act
      await fetchEvents(
        mockRequest as FastifyRequest<{ Querystring: { active?: string; limit?: string } }>,
        mockReply as FastifyReply
      );

      // Assert
      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to fetch events',
        details: 'Unknown error',
      });
    });

    it('should parse limit as integer', async () => {
      // Arrange
      mockRequest.query = { limit: '15' };
      mockedEventService.fetchAndSaveEvents.mockResolvedValue({
        saved: 15,
        errors: 0,
      });

      // Act
      await fetchEvents(
        mockRequest as FastifyRequest<{ Querystring: { active?: string; limit?: string } }>,
        mockReply as FastifyReply
      );

      // Assert
      expect(mockedEventService.fetchAndSaveEvents).toHaveBeenCalledWith({
        active: false,
        limit: 15, // Parsed as integer
      });
    });
  });

  describe('getEvents', () => {
    it('should return events successfully', async () => {
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
        {
          eventId: 'event2',
          slug: 'event-2',
          title: 'Event 2',
          status: 'active',
          source: 'polymarket',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockRequest.query = {};
      mockedEventService.getAllEvents.mockResolvedValue(mockEvents);

      // Act
      await getEvents(
        mockRequest as FastifyRequest<{
          Querystring: {
            status?: 'active' | 'closed' | 'archived';
            category?: string;
            featured?: string;
            limit?: string;
            skip?: string;
          };
        }>,
        mockReply as FastifyReply
      );

      // Assert
      expect(mockedEventService.getAllEvents).toHaveBeenCalledWith({
        status: undefined,
        category: undefined,
        featured: undefined,
        limit: 100,
        skip: 0,
      });
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        count: 2,
        data: mockEvents,
      });
    });

    it('should filter by status', async () => {
      // Arrange
      mockRequest.query = { status: 'closed' };
      mockedEventService.getAllEvents.mockResolvedValue([]);

      // Act
      await getEvents(
        mockRequest as FastifyRequest<{
          Querystring: {
            status?: 'active' | 'closed' | 'archived';
            category?: string;
            featured?: string;
            limit?: string;
            skip?: string;
          };
        }>,
        mockReply as FastifyReply
      );

      // Assert
      expect(mockedEventService.getAllEvents).toHaveBeenCalledWith({
        status: 'closed',
        category: undefined,
        featured: undefined,
        limit: 100,
        skip: 0,
      });
    });

    it('should filter by category', async () => {
      // Arrange
      mockRequest.query = { category: 'politics' };
      mockedEventService.getAllEvents.mockResolvedValue([]);

      // Act
      await getEvents(
        mockRequest as FastifyRequest<{
          Querystring: {
            status?: 'active' | 'closed' | 'archived';
            category?: string;
            featured?: string;
            limit?: string;
            skip?: string;
          };
        }>,
        mockReply as FastifyReply
      );

      // Assert
      expect(mockedEventService.getAllEvents).toHaveBeenCalledWith({
        status: undefined,
        category: 'politics',
        featured: undefined,
        limit: 100,
        skip: 0,
      });
    });

    it('should filter by featured', async () => {
      // Arrange
      mockRequest.query = { featured: 'true' };
      mockedEventService.getAllEvents.mockResolvedValue([]);

      // Act
      await getEvents(
        mockRequest as FastifyRequest<{
          Querystring: {
            status?: 'active' | 'closed' | 'archived';
            category?: string;
            featured?: string;
            limit?: string;
            skip?: string;
          };
        }>,
        mockReply as FastifyReply
      );

      // Assert
      expect(mockedEventService.getAllEvents).toHaveBeenCalledWith({
        status: undefined,
        category: undefined,
        featured: true,
        limit: 100,
        skip: 0,
      });
    });

    it('should handle featured=false', async () => {
      // Arrange
      mockRequest.query = { featured: 'false' };
      mockedEventService.getAllEvents.mockResolvedValue([]);

      // Act
      await getEvents(
        mockRequest as FastifyRequest<{
          Querystring: {
            status?: 'active' | 'closed' | 'archived';
            category?: string;
            featured?: string;
            limit?: string;
            skip?: string;
          };
        }>,
        mockReply as FastifyReply
      );

      // Assert
      expect(mockedEventService.getAllEvents).toHaveBeenCalledWith({
        status: undefined,
        category: undefined,
        featured: undefined, // false becomes undefined
        limit: 100,
        skip: 0,
      });
    });

    it('should handle pagination', async () => {
      // Arrange
      mockRequest.query = { limit: '25', skip: '5' };
      mockedEventService.getAllEvents.mockResolvedValue([]);

      // Act
      await getEvents(
        mockRequest as FastifyRequest<{
          Querystring: {
            status?: 'active' | 'closed' | 'archived';
            category?: string;
            featured?: string;
            limit?: string;
            skip?: string;
          };
        }>,
        mockReply as FastifyReply
      );

      // Assert
      expect(mockedEventService.getAllEvents).toHaveBeenCalledWith({
        status: undefined,
        category: undefined,
        featured: undefined,
        limit: 25,
        skip: 5,
      });
    });

    it('should handle multiple filters', async () => {
      // Arrange
      mockRequest.query = {
        status: 'active',
        category: 'sports',
        featured: 'true',
        limit: '40',
        skip: '10',
      };
      mockedEventService.getAllEvents.mockResolvedValue([]);

      // Act
      await getEvents(
        mockRequest as FastifyRequest<{
          Querystring: {
            status?: 'active' | 'closed' | 'archived';
            category?: string;
            featured?: string;
            limit?: string;
            skip?: string;
          };
        }>,
        mockReply as FastifyReply
      );

      // Assert
      expect(mockedEventService.getAllEvents).toHaveBeenCalledWith({
        status: 'active',
        category: 'sports',
        featured: true,
        limit: 40,
        skip: 10,
      });
    });

    it('should handle service errors and return 500', async () => {
      // Arrange
      mockRequest.query = {};
      const error = new Error('Database error');
      mockedEventService.getAllEvents.mockRejectedValue(error);

      // Act
      await getEvents(
        mockRequest as FastifyRequest<{
          Querystring: {
            status?: 'active' | 'closed' | 'archived';
            category?: string;
            featured?: string;
            limit?: string;
            skip?: string;
          };
        }>,
        mockReply as FastifyReply
      );

      // Assert
      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to get events',
        details: 'Database error',
      });
    });
  });

  describe('getEventStats', () => {
    it('should return event statistics successfully', async () => {
      // Arrange
      const mockStats: EventStats = {
        totalEvents: 500,
        activeEvents: 400,
        closedEvents: 80,
        archivedEvents: 20,
        featuredEvents: 50,
        categoryCounts: {
          politics: 150,
          sports: 120,
          crypto: 100,
        },
        lastUpdated: new Date(),
      };

      mockRequest.query = {};
      mockedEventService.getEventStats.mockResolvedValue(mockStats);

      // Act
      await getEventStats(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockedEventService.getEventStats).toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: mockStats,
      });
    });

    it('should handle service errors and return 500', async () => {
      // Arrange
      const error = new Error('Stats error');
      mockedEventService.getEventStats.mockRejectedValue(error);

      // Act
      await getEventStats(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to get event stats',
        details: 'Stats error',
      });
    });

    it('should handle empty statistics', async () => {
      // Arrange
      const emptyStats: EventStats = {
        totalEvents: 0,
        activeEvents: 0,
        closedEvents: 0,
        archivedEvents: 0,
        featuredEvents: 0,
        categoryCounts: {},
        lastUpdated: new Date(),
      };

      mockedEventService.getEventStats.mockResolvedValue(emptyStats);

      // Act
      await getEventStats(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: emptyStats,
      });
    });
  });
});
