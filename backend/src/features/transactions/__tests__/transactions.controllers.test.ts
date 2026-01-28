// Unit tests for Transactions Controllers
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as transactionControllers from '../transactions.controllers.js';
import * as transactionService from '../transactions.services.js';

vi.mock('../transactions.services.js');

describe('Transactions Controllers', () => {
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRequest = {
      query: {},
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

  describe('getUserTransactionsHandler', () => {
    it('should return user transactions', async () => {
      const mockResult = {
        transactions: [
          {
            id: 'tx-1',
            amount: 100,
            transactionType: 'bet_placed',
          },
        ],
        total: 1,
        limit: 50,
        offset: 0,
      };

      vi.mocked(transactionService.getUserTransactions).mockResolvedValue(mockResult);

      await transactionControllers.getUserTransactionsHandler(mockRequest, mockReply);

      expect(transactionService.getUserTransactions).toHaveBeenCalledWith('user-123', {
        type: undefined,
        limit: 50,
        offset: 0,
      });
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        ...mockResult,
      });
    });

    it('should filter by transaction type', async () => {
      mockRequest.query = { type: 'daily_reward' };

      const mockResult = {
        transactions: [],
        total: 0,
        limit: 50,
        offset: 0,
      };

      vi.mocked(transactionService.getUserTransactions).mockResolvedValue(mockResult);

      await transactionControllers.getUserTransactionsHandler(mockRequest, mockReply);

      expect(transactionService.getUserTransactions).toHaveBeenCalledWith('user-123', {
        type: 'daily_reward',
        limit: 50,
        offset: 0,
      });
    });

    it('should return 401 if user not authenticated', async () => {
      mockRequest.user = null;

      await transactionControllers.getUserTransactionsHandler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });
  });
});




