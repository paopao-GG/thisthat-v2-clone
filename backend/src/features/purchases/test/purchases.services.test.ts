import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  creditPurchase: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
  user: {
    update: vi.fn(),
  },
  creditTransaction: {
    create: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock('../../../lib/database.js', () => ({
  prisma: mockPrisma,
}));

import { createCreditPurchase, getUserPurchases } from '../purchases.services.js';

describe('Purchase Services', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (callback: any) => callback(mockPrisma));
  });

  it('creates a credit purchase and returns the new balance', async () => {
    mockPrisma.creditPurchase.create.mockResolvedValue({
      id: 'purchase-1',
      packageId: 'starter',
      creditsGranted: 500,
      usdAmount: 4.99,
      status: 'completed',
      provider: 'manual',
      createdAt: new Date(),
    });

    mockPrisma.user.update.mockResolvedValue({
      creditBalance: 1500,
    });

    mockPrisma.creditTransaction.create.mockResolvedValue({});

    const result = await createCreditPurchase('user-1', 'starter');

    expect(result.newBalance).toBe(1500);
    expect(mockPrisma.creditPurchase.create).toHaveBeenCalled();
    expect(mockPrisma.creditTransaction.create).toHaveBeenCalled();
  });

  it('rejects invalid packages', async () => {
    await expect(createCreditPurchase('user-1', 'invalid' as any)).rejects.toThrow(
      'Invalid credit package'
    );
  });

  it('returns mapped purchase history', async () => {
    mockPrisma.creditPurchase.findMany.mockResolvedValue([
      {
        id: 'purchase-1',
        packageId: 'starter',
        creditsGranted: 500,
        usdAmount: 4.99,
        status: 'completed',
        provider: 'manual',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
      },
    ]);

    const purchases = await getUserPurchases('user-1');

    expect(purchases).toHaveLength(1);
    expect(purchases[0].creditsGranted).toBe(500);
  });
});

