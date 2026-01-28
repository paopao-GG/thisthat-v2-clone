// Unit tests for Economy Controllers
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Create hoisted mock object
const mockPrisma = vi.hoisted(() => ({
  stock: {
    findMany: vi.fn(),
  },
}));

// Mock services
vi.mock('../economy.services.js');
vi.mock('../../../lib/database.js', () => ({
  prisma: mockPrisma,
}));

vi.mock('../economy.models.js', () => ({
  buyStockSchema: {
    parse: vi.fn((data) => data),
  },
  sellStockSchema: {
    parse: vi.fn((data) => data),
  },
}));

// Import controllers AFTER mocks
import * as economyControllers from '../economy.controllers.js';
import * as economyService from '../economy.services.js';

describe('Economy Controllers', () => {
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRequest = {
      body: {},
      user: { userId: 'user-123' },
      log: {
        error: vi.fn(),
      },
    };

    mockReply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };
  });

  describe('claimDailyCreditsHandler', () => {
    it('should claim daily credits successfully', async () => {
      const mockResult = {
        creditsAwarded: 1000,
        consecutiveDays: 1,
        nextAvailableAt: new Date(),
      };

      vi.mocked(economyService.processDailyCreditAllocation).mockResolvedValue(mockResult);

      await economyControllers.claimDailyCreditsHandler(mockRequest, mockReply);

      expect(economyService.processDailyCreditAllocation).toHaveBeenCalledWith('user-123');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        ...mockResult,
      });
    });

    it('should return 401 if user not authenticated', async () => {
      mockRequest.user = null;

      await economyControllers.claimDailyCreditsHandler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });
  });

  describe('buyStockHandler', () => {
    it('should buy stock successfully', async () => {
      const buyData = {
        stockId: 'stock-123',
        shares: 10,
        leverage: 2,
      };

      mockRequest.body = buyData;

      const mockResult = {
        transaction: { id: 'tx-123' },
        holding: { id: 'holding-123' },
        newBalance: 8000,
      };

      vi.mocked(economyService.buyStock).mockResolvedValue(mockResult);

      await economyControllers.buyStockHandler(mockRequest, mockReply);

      expect(economyService.buyStock).toHaveBeenCalledWith('user-123', buyData);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        ...mockResult,
      });
    });
  });

  describe('sellStockHandler', () => {
    it('should sell stock successfully', async () => {
      const sellData = {
        stockId: 'stock-123',
        shares: 10,
      };

      mockRequest.body = sellData;

      const mockResult = {
        transaction: { id: 'tx-123' },
        holding: null,
        newBalance: 6200,
        profit: 200,
      };

      vi.mocked(economyService.sellStock).mockResolvedValue(mockResult);

      await economyControllers.sellStockHandler(mockRequest, mockReply);

      expect(economyService.sellStock).toHaveBeenCalledWith('user-123', sellData);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        ...mockResult,
      });
    });
  });

  describe('getPortfolioHandler', () => {
    it('should return user portfolio', async () => {
      const mockPortfolio = [
        {
          id: 'holding-1',
          shares: 10,
          currentValue: 1200,
          profit: 200,
        },
      ];

      vi.mocked(economyService.getUserPortfolio).mockResolvedValue(mockPortfolio);

      await economyControllers.getPortfolioHandler(mockRequest, mockReply);

      expect(economyService.getUserPortfolio).toHaveBeenCalledWith('user-123');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        portfolio: mockPortfolio,
      });
    });
  });

  describe('getStocksHandler', () => {
    it('should return all active stocks', async () => {
      const mockStocks = [
        {
          id: 'stock-1',
          symbol: 'TEST',
          currentPrice: 100,
        },
      ];

      mockPrisma.stock.findMany.mockResolvedValue(mockStocks as any);

      await economyControllers.getStocksHandler(mockRequest, mockReply);

      expect(mockPrisma.stock.findMany).toHaveBeenCalledWith({
        where: { status: 'active' },
        orderBy: { marketCap: 'desc' },
      });
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        stocks: mockStocks,
      });
    });
  });
});

