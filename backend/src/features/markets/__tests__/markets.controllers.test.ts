// Unit tests for Markets Controllers
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
import * as marketsControllers from '../markets.controllers.js';
import * as marketsService from '../markets.services.js';

// Mock the service
vi.mock('../markets.services.js');

describe('Markets Controllers', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRequest = {
      query: {},
      params: {},
      log: {
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
      } as any,
    };

    mockReply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };
  });

  describe('getRandomMarketsHandler', () => {
    it('should return random markets', async () => {
      const mockMarkets = [
        {
          id: 'market-1',
          title: 'Test Market',
          polymarketId: '0x123',
        },
      ];

      vi.mocked(marketsService.getRandomMarkets).mockResolvedValue(mockMarkets as any);
      mockRequest.query = { count: '10' };

      await marketsControllers.getRandomMarketsHandler(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: mockMarkets,
        count: 1,
      });
    });

    it('should limit count to 50', async () => {
      vi.mocked(marketsService.getRandomMarkets).mockResolvedValue([]);
      mockRequest.query = { count: '100' };

      await marketsControllers.getRandomMarketsHandler(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(marketsService.getRandomMarkets).toHaveBeenCalledWith(50);
    });

    it('should handle errors', async () => {
      vi.mocked(marketsService.getRandomMarkets).mockRejectedValue(new Error('DB error'));

      await marketsControllers.getRandomMarketsHandler(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to get random markets',
        details: 'DB error',
      });
    });
  });

  describe('getMarketLiveHandler', () => {
    it('should return live price data', async () => {
      const mockMarket = {
        id: 'market-1',
        polymarketId: '0x123',
      };

      const mockLiveData = {
        polymarketId: '0x123',
        thisOdds: 0.7,
        thatOdds: 0.3,
        liquidity: 1000,
        volume: 5000,
        volume24hr: 2000,
        acceptingOrders: true,
      };

      vi.mocked(marketsService.getMarketById).mockResolvedValue(mockMarket as any);
      vi.mocked(marketsService.fetchLivePriceData).mockResolvedValue(mockLiveData);
      mockRequest.params = { id: 'market-1' };

      await marketsControllers.getMarketLiveHandler(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: mockLiveData,
        marketId: 'market-1',
      });
    });

    it('should return 404 if market not found', async () => {
      vi.mocked(marketsService.getMarketById).mockResolvedValue(null);
      mockRequest.params = { id: 'invalid-id' };

      await marketsControllers.getMarketLiveHandler(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });

    it('should return 400 if market has no polymarketId', async () => {
      const mockMarket = {
        id: 'market-1',
        polymarketId: null,
      };

      vi.mocked(marketsService.getMarketById).mockResolvedValue(mockMarket as any);
      mockRequest.params = { id: 'market-1' };

      await marketsControllers.getMarketLiveHandler(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });
  });

  describe('getMarketFullHandler', () => {
    it('should return market with live data', async () => {
      const mockMarketWithLive = {
        id: 'market-1',
        title: 'Test Market',
        live: {
          thisOdds: 0.7,
          thatOdds: 0.3,
        },
      };

      vi.mocked(marketsService.getMarketWithLiveData).mockResolvedValue(
        mockMarketWithLive as any
      );
      mockRequest.params = { id: 'market-1' };

      await marketsControllers.getMarketFullHandler(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: mockMarketWithLive,
      });
    });
  });
});

