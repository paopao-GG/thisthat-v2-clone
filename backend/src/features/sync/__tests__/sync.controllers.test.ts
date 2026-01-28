// Unit tests for Sync Controllers
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';

// Hoisted service mock
const mockSyncService = vi.hoisted(() => ({
  syncAllMarketsToPostgres: vi.fn(),
  getMarketCounts: vi.fn(),
}));

// Mock sync service
vi.mock('../mongodb-to-postgres.sync.js', () => ({
  syncAllMarketsToPostgres: mockSyncService.syncAllMarketsToPostgres,
  getMarketCounts: mockSyncService.getMarketCounts,
}));

// Import controllers AFTER mocks
import * as syncControllers from '../sync.controllers.js';

describe('Sync Controllers', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRequest = {
      query: {},
      log: {
        error: vi.fn(),
      } as any,
    };

    mockReply = {
      send: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
    };
  });

  describe('syncMarketsHandler', () => {
    it('should sync markets successfully', async () => {
      mockSyncService.syncAllMarketsToPostgres.mockResolvedValue({
        synced: 10,
        errors: 0,
        skipped: 2,
      });

      await syncControllers.syncMarketsHandler(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockSyncService.syncAllMarketsToPostgres).toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          synced: 10,
          errors: 0,
          skipped: 2,
        })
      );
    });

    it('should handle status query parameter', async () => {
      mockRequest.query = { status: 'active' };
      mockSyncService.syncAllMarketsToPostgres.mockResolvedValue({
        synced: 5,
        errors: 0,
        skipped: 0,
      });

      await syncControllers.syncMarketsHandler(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockSyncService.syncAllMarketsToPostgres).toHaveBeenCalledWith({
        status: 'active',
        limit: undefined,
      });
    });

    it('should handle limit query parameter', async () => {
      mockRequest.query = { limit: '50' };
      mockSyncService.syncAllMarketsToPostgres.mockResolvedValue({
        synced: 50,
        errors: 0,
        skipped: 0,
      });

      await syncControllers.syncMarketsHandler(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockSyncService.syncAllMarketsToPostgres).toHaveBeenCalledWith({
        status: undefined,
        limit: 50,
      });
    });

    it('should handle service errors', async () => {
      const error = new Error('Sync failed');
      mockSyncService.syncAllMarketsToPostgres.mockRejectedValue(error);

      await syncControllers.syncMarketsHandler(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Sync failed',
      });
      expect(mockRequest.log?.error).toHaveBeenCalled();
    });
  });

  describe('getMarketCountsHandler', () => {
    it('should return market counts successfully', async () => {
      const counts = {
        mongodb: 100,
        postgresql: 95,
        activeMongoDB: 50,
        activePostgreSQL: 45,
      };

      mockSyncService.getMarketCounts.mockResolvedValue(counts);

      await syncControllers.getMarketCountsHandler(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockSyncService.getMarketCounts).toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        counts,
      });
    });

    it('should handle service errors', async () => {
      const error = new Error('Database error');
      mockSyncService.getMarketCounts.mockRejectedValue(error);

      await syncControllers.getMarketCountsHandler(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to get market counts',
      });
      expect(mockRequest.log?.error).toHaveBeenCalled();
    });
  });
});




