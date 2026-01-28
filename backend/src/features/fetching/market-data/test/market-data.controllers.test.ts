// Unit tests for market data controllers (API routes)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { fetchMarkets, getMarkets, getMarketStats } from '../market-data.controllers.js';
import type { FlattenedMarket, MarketStats } from '../market-data.models.js';

// Mock the service module
vi.mock('../market-data.services.js', () => ({
  fetchAndSaveMarkets: vi.fn(),
  getAllMarkets: vi.fn(),
  getMarketStats: vi.fn(),
}));

import * as marketService from '../market-data.services.js';

const mockedMarketService = vi.mocked(marketService);

describe('Market Data Controllers (API Routes)', () => {
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

  describe('fetchMarkets', () => {
    it('should fetch and save markets successfully', async () => {
      // Arrange
      mockRequest.query = { active: 'true', limit: '50' };
      mockedMarketService.fetchAndSaveMarkets.mockResolvedValue({
        saved: 50,
        errors: 0,
      });

      // Act
      await fetchMarkets(
        mockRequest as FastifyRequest<{ Querystring: { active?: string; limit?: string } }>,
        mockReply as FastifyReply
      );

      // Assert
      expect(mockedMarketService.fetchAndSaveMarkets).toHaveBeenCalledWith({
        active: true,
        limit: 50,
      });
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        message: 'Fetched and saved 50 markets',
        data: { saved: 50, errors: 0 },
      });
    });

    it('should handle active=false query parameter', async () => {
      // Arrange
      mockRequest.query = { active: 'false', limit: '100' };
      mockedMarketService.fetchAndSaveMarkets.mockResolvedValue({
        saved: 100,
        errors: 0,
      });

      // Act
      await fetchMarkets(
        mockRequest as FastifyRequest<{ Querystring: { active?: string; limit?: string } }>,
        mockReply as FastifyReply
      );

      // Assert
      expect(mockedMarketService.fetchAndSaveMarkets).toHaveBeenCalledWith({
        active: false,
        limit: 100,
      });
    });

    it('should use default limit when not provided', async () => {
      // Arrange
      mockRequest.query = { active: 'true' };
      mockedMarketService.fetchAndSaveMarkets.mockResolvedValue({
        saved: 100,
        errors: 0,
      });

      // Act
      await fetchMarkets(
        mockRequest as FastifyRequest<{ Querystring: { active?: string; limit?: string } }>,
        mockReply as FastifyReply
      );

      // Assert
      expect(mockedMarketService.fetchAndSaveMarkets).toHaveBeenCalledWith({
        active: true,
        limit: 100, // Default
      });
    });

    it('should handle undefined active parameter', async () => {
      // Arrange
      mockRequest.query = { limit: '20' };
      mockedMarketService.fetchAndSaveMarkets.mockResolvedValue({
        saved: 20,
        errors: 0,
      });

      // Act
      await fetchMarkets(
        mockRequest as FastifyRequest<{ Querystring: { active?: string; limit?: string } }>,
        mockReply as FastifyReply
      );

      // Assert
      expect(mockedMarketService.fetchAndSaveMarkets).toHaveBeenCalledWith({
        active: undefined,
        limit: 20,
      });
    });

    it('should handle service errors and return 500', async () => {
      // Arrange
      mockRequest.query = { active: 'true', limit: '10' };
      const error = new Error('Service error');
      mockedMarketService.fetchAndSaveMarkets.mockRejectedValue(error);

      // Act
      await fetchMarkets(
        mockRequest as FastifyRequest<{ Querystring: { active?: string; limit?: string } }>,
        mockReply as FastifyReply
      );

      // Assert
      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to fetch markets',
        details: 'Service error',
      });
    });

    it('should handle non-Error exceptions', async () => {
      // Arrange
      mockRequest.query = { active: 'true' };
      mockedMarketService.fetchAndSaveMarkets.mockRejectedValue('String error');

      // Act
      await fetchMarkets(
        mockRequest as FastifyRequest<{ Querystring: { active?: string; limit?: string } }>,
        mockReply as FastifyReply
      );

      // Assert
      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to fetch markets',
        details: 'Unknown error',
      });
    });

    it('should parse limit as integer', async () => {
      // Arrange
      mockRequest.query = { limit: '25' };
      mockedMarketService.fetchAndSaveMarkets.mockResolvedValue({
        saved: 25,
        errors: 0,
      });

      // Act
      await fetchMarkets(
        mockRequest as FastifyRequest<{ Querystring: { active?: string; limit?: string } }>,
        mockReply as FastifyReply
      );

      // Assert
      expect(mockedMarketService.fetchAndSaveMarkets).toHaveBeenCalledWith({
        active: undefined,
        limit: 25, // Parsed as integer
      });
    });
  });

  describe('getMarkets', () => {
    it('should return markets successfully', async () => {
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
        {
          conditionId: '0x2',
          question: 'Market 2?',
          thisOption: 'Yes',
          thatOption: 'No',
          thisOdds: 0.5,
          thatOdds: 0.5,
          status: 'active',
          source: 'polymarket',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockRequest.query = {};
      mockedMarketService.getAllMarkets.mockResolvedValue(mockMarkets);

      // Act
      await getMarkets(
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
      expect(mockedMarketService.getAllMarkets).toHaveBeenCalledWith({
        status: undefined,
        category: undefined,
        featured: undefined,
        limit: 100,
        skip: 0,
      });
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        count: 2,
        data: mockMarkets,
      });
    });

    it('should filter by status', async () => {
      // Arrange
      mockRequest.query = { status: 'active' };
      mockedMarketService.getAllMarkets.mockResolvedValue([]);

      // Act
      await getMarkets(
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
      expect(mockedMarketService.getAllMarkets).toHaveBeenCalledWith({
        status: 'active',
        category: undefined,
        featured: undefined,
        limit: 100,
        skip: 0,
      });
    });

    it('should filter by category', async () => {
      // Arrange
      mockRequest.query = { category: 'crypto' };
      mockedMarketService.getAllMarkets.mockResolvedValue([]);

      // Act
      await getMarkets(
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
      expect(mockedMarketService.getAllMarkets).toHaveBeenCalledWith({
        status: undefined,
        category: 'crypto',
        featured: undefined,
        limit: 100,
        skip: 0,
      });
    });

    it('should filter by featured', async () => {
      // Arrange
      mockRequest.query = { featured: 'true' };
      mockedMarketService.getAllMarkets.mockResolvedValue([]);

      // Act
      await getMarkets(
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
      expect(mockedMarketService.getAllMarkets).toHaveBeenCalledWith({
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
      mockedMarketService.getAllMarkets.mockResolvedValue([]);

      // Act
      await getMarkets(
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
      expect(mockedMarketService.getAllMarkets).toHaveBeenCalledWith({
        status: undefined,
        category: undefined,
        featured: undefined, // false becomes undefined
        limit: 100,
        skip: 0,
      });
    });

    it('should handle pagination', async () => {
      // Arrange
      mockRequest.query = { limit: '20', skip: '10' };
      mockedMarketService.getAllMarkets.mockResolvedValue([]);

      // Act
      await getMarkets(
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
      expect(mockedMarketService.getAllMarkets).toHaveBeenCalledWith({
        status: undefined,
        category: undefined,
        featured: undefined,
        limit: 20,
        skip: 10,
      });
    });

    it('should handle multiple filters', async () => {
      // Arrange
      mockRequest.query = {
        status: 'active',
        category: 'politics',
        featured: 'true',
        limit: '50',
        skip: '5',
      };
      mockedMarketService.getAllMarkets.mockResolvedValue([]);

      // Act
      await getMarkets(
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
      expect(mockedMarketService.getAllMarkets).toHaveBeenCalledWith({
        status: 'active',
        category: 'politics',
        featured: true,
        limit: 50,
        skip: 5,
      });
    });

    it('should handle service errors and return 500', async () => {
      // Arrange
      mockRequest.query = {};
      const error = new Error('Database error');
      mockedMarketService.getAllMarkets.mockRejectedValue(error);

      // Act
      await getMarkets(
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
        error: 'Failed to get markets',
        details: 'Database error',
      });
    });
  });

  describe('getMarketStats', () => {
    it('should return market statistics successfully', async () => {
      // Arrange
      const mockStats: MarketStats = {
        totalMarkets: 1000,
        activeMarkets: 800,
        closedMarkets: 150,
        archivedMarkets: 50,
        featuredMarkets: 100,
        categoryCounts: {
          crypto: 300,
          politics: 250,
          sports: 200,
        },
        lastUpdated: new Date(),
      };

      mockRequest.query = {};
      mockedMarketService.getMarketStats.mockResolvedValue(mockStats);

      // Act
      await getMarketStats(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockedMarketService.getMarketStats).toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: mockStats,
      });
    });

    it('should handle service errors and return 500', async () => {
      // Arrange
      const error = new Error('Stats error');
      mockedMarketService.getMarketStats.mockRejectedValue(error);

      // Act
      await getMarketStats(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to get market stats',
        details: 'Stats error',
      });
    });

    it('should handle empty statistics', async () => {
      // Arrange
      const emptyStats: MarketStats = {
        totalMarkets: 0,
        activeMarkets: 0,
        closedMarkets: 0,
        archivedMarkets: 0,
        featuredMarkets: 0,
        categoryCounts: {},
        lastUpdated: new Date(),
      };

      mockedMarketService.getMarketStats.mockResolvedValue(emptyStats);

      // Act
      await getMarketStats(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: emptyStats,
      });
    });
  });
});
