import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
  },
}));

vi.mock('../../../lib/database.js', () => ({
  prisma: mockPrisma,
}));

import { getReferralStats } from '../referral.services.js';

describe('Referral Services', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns referral stats for the user', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      referralCode: 'ABC12345',
      referralCount: 3,
      referralCreditsEarned: 600,
      referredUsers: [
        { id: 'u1', username: 'alice', createdAt: new Date('2025-01-01T00:00:00.000Z') },
      ],
    });

    const stats = await getReferralStats('user-1');

    expect(stats.referralCode).toBe('ABC12345');
    expect(stats.referralCount).toBe(3);
    expect(stats.referralCreditsEarned).toBe(600);
    expect(stats.referredUsers).toHaveLength(1);
  });

  it('throws when user is missing', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await expect(getReferralStats('missing')).rejects.toThrow('User not found');
  });
});

