// Unit tests for Event-Market Group Controllers
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';

// Hoisted service mocks
const mockEventMarketGroupService = vi.hoisted(() => ({
  fetchAndSaveEventMarketGroups: vi.fn(),
  getAllEventMarketGroups: vi.fn(),
  getEventMarketGroup: vi.fn(),
  getEventMarketGroupStats: vi.fn(),
}));

// Mock service
vi.mock('../event-market-group.services.js', () => ({
  fetchAndSaveEventMarketGroups: mockEventMarketGroupService.fetchAndSaveEventMarketGroups,
  getAllEventMarketGroups: mockEventMarketGroupService.getAllEventMarketGroups,
  getEventMarketGroup: mockEventMarketGroupService.getEventMarketGroup,
  getEventMarketGroupStats: mockEventMarketGroupService.getEventMarketGroupStats,
}));

// Import controllers AFTER mocks
import * as controllers from '../event-market-group.controllers.js';

describe('Event-Market Group Controllers', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRequest = {
      query: {},
      params: {},
    };

    mockReply = {
      send: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
    };
  });

  describe('fetchEventMarketGroups', () => {
    it('should fetch and save event-market groups successfully', async () => {
      mockEventMarketGroupService.fetchAndSaveEventMarketGroups.mockResolvedValue({
        saved: 10,
        errors: 0,
      });

      await controllers.fetchEventMarketGroups(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        message: 'Fetched and saved 10 event-market groups',
        data: { saved: 10, errors: 0 },
      });
    });

    it('should handle active query parameter', async () => {
      mockRequest.query = { active: 'true' };
      mockEventMarketGroupService.fetchAndSaveEventMarketGroups.mockResolvedValue({
        saved: 5,
        errors: 0,
      });

      await controllers.fetchEventMarketGroups(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockEventMarketGroupService.fetchAndSaveEventMarketGroups).toHaveBeenCalledWith({
        active: true,
        limit: 50,
      });
    });

    it('should handle limit query parameter', async () => {
      mockRequest.query = { limit: '20' };
      mockEventMarketGroupService.fetchAndSaveEventMarketGroups.mockResolvedValue({
        saved: 20,
        errors: 0,
      });

      await controllers.fetchEventMarketGroups(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockEventMarketGroupService.fetchAndSaveEventMarketGroups).toHaveBeenCalledWith({
        active: undefined,
        limit: 20,
      });
    });

    it('should handle service errors', async () => {
      const error = new Error('Fetch failed');
      mockEventMarketGroupService.fetchAndSaveEventMarketGroups.mockRejectedValue(error);

      await controllers.fetchEventMarketGroups(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to fetch event-market groups',
        details: 'Fetch failed',
      });
    });
  });

  describe('getEventMarketGroups', () => {
    it('should return event-market groups successfully', async () => {
      const mockGroups = [
        {
          eventId: 'event-1',
          eventTitle: 'Event 1',
          markets: [],
        },
      ];

      mockEventMarketGroupService.getAllEventMarketGroups.mockResolvedValue(mockGroups);

      await controllers.getEventMarketGroups(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        count: 1,
        data: mockGroups,
      });
    });

    it('should handle query parameters', async () => {
      mockRequest.query = {
        status: 'active',
        category: 'politics',
        limit: '20',
        skip: '10',
      };

      mockEventMarketGroupService.getAllEventMarketGroups.mockResolvedValue([]);

      await controllers.getEventMarketGroups(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockEventMarketGroupService.getAllEventMarketGroups).toHaveBeenCalledWith({
        status: 'active',
        category: 'politics',
        limit: 20,
        skip: 10,
      });
    });

    it('should handle service errors', async () => {
      const error = new Error('Database error');
      mockEventMarketGroupService.getAllEventMarketGroups.mockRejectedValue(error);

      await controllers.getEventMarketGroups(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to get event-market groups',
        details: 'Database error',
      });
    });
  });

  describe('getEventMarketGroup', () => {
    it('should return event-market group by ID', async () => {
      const mockGroup = {
        eventId: 'event-123',
        eventTitle: 'Test Event',
        markets: [],
      };

      mockRequest.params = { eventId: 'event-123' };
      mockEventMarketGroupService.getEventMarketGroup.mockResolvedValue(mockGroup);

      await controllers.getEventMarketGroup(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: mockGroup,
      });
    });

    it('should return 404 if event not found', async () => {
      mockRequest.params = { eventId: 'nonexistent' };
      mockEventMarketGroupService.getEventMarketGroup.mockResolvedValue(null);

      await controllers.getEventMarketGroup(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Event-market group not found',
      });
    });

    it('should handle service errors', async () => {
      mockRequest.params = { eventId: 'event-123' };
      const error = new Error('Database error');
      mockEventMarketGroupService.getEventMarketGroup.mockRejectedValue(error);

      await controllers.getEventMarketGroup(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to get event-market group',
        details: 'Database error',
      });
    });
  });

  describe('getEventMarketGroupStats', () => {
    it('should return statistics successfully', async () => {
      const mockStats = {
        totalEvents: 100,
        activeEvents: 50,
        closedEvents: 30,
        archivedEvents: 20,
        categoryCounts: { politics: 40 },
      };

      mockEventMarketGroupService.getEventMarketGroupStats.mockResolvedValue(mockStats);

      await controllers.getEventMarketGroupStats(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: mockStats,
      });
    });

    it('should handle service errors', async () => {
      const error = new Error('Stats error');
      mockEventMarketGroupService.getEventMarketGroupStats.mockRejectedValue(error);

      await controllers.getEventMarketGroupStats(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to get event-market group stats',
        details: 'Stats error',
      });
    });
  });
});




