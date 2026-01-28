// Unit tests for Transactions Services
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Create hoisted mock object
const mockPrisma = vi.hoisted(() => ({
  creditTransaction: {
    findMany: vi.fn(),
    create: vi.fn(),
    count: vi.fn(),
  },
}));

// Mock Prisma
vi.mock('../../../lib/database.js', () => ({
  prisma: mockPrisma,
}));

// Import service AFTER mocks
import * as transactionService from '../transactions.services.js';

describe('Transactions Services', () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getUserTransactions', () => {
    it('should return user transactions', async () => {
      const userId = 'user-123';
      const mockTransactions = [
        {
          id: 'tx-1',
          userId,
          amount: 100,
          transactionType: 'bet_placed',
          referenceId: 'bet-123',
          balanceAfter: 900,
          createdAt: new Date(),
        },
        {
          id: 'tx-2',
          userId,
          amount: 1000,
          transactionType: 'daily_reward',
          referenceId: null,
          balanceAfter: 1900,
          createdAt: new Date(),
        },
      ];

      mockPrisma.creditTransaction.findMany.mockResolvedValue(mockTransactions as any);
      mockPrisma.creditTransaction.count.mockResolvedValue(2);

      const result = await transactionService.getUserTransactions(userId);

      expect(result.transactions).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.limit).toBe(50); // Default
      expect(result.offset).toBe(0);
    });

    it('should filter by transaction type', async () => {
      const userId = 'user-123';
      const mockTransactions = [
        {
          id: 'tx-1',
          userId,
          amount: 1000,
          transactionType: 'daily_reward',
          referenceId: null,
          balanceAfter: 1000,
          createdAt: new Date(),
        },
      ];

      mockPrisma.creditTransaction.findMany.mockResolvedValue(mockTransactions as any);
      mockPrisma.creditTransaction.count.mockResolvedValue(1);

      const result = await transactionService.getUserTransactions(userId, {
        type: 'daily_reward',
      });

      expect(mockPrisma.creditTransaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            transactionType: 'daily_reward',
          }),
        })
      );
    });

    it('should respect pagination', async () => {
      const userId = 'user-123';
      mockPrisma.creditTransaction.findMany.mockResolvedValue([]);
      mockPrisma.creditTransaction.count.mockResolvedValue(100);

      const result = await transactionService.getUserTransactions(userId, {
        limit: 20,
        offset: 10,
      });

      expect(result.limit).toBe(20);
      expect(result.offset).toBe(10);
      expect(mockPrisma.creditTransaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 20,
          skip: 10,
        })
      );
    });

    it('should cap limit at 200', async () => {
      const userId = 'user-123';
      mockPrisma.creditTransaction.findMany.mockResolvedValue([]);
      mockPrisma.creditTransaction.count.mockResolvedValue(0);

      await transactionService.getUserTransactions(userId, {
        limit: 500, // Above max
      });

      expect(mockPrisma.creditTransaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 200, // Capped at 200
        })
      );
    });
  });
});

