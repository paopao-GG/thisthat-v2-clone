import { usersPrisma as prisma } from '../../lib/database.js';

export interface ReferralStats {
  referralCode: string;
  referralCount: number;
  referralCreditsEarned: number;
  referredUsers: Array<{
    id: string;
    username: string;
    joinedAt: Date;
  }>;
}

export async function getReferralStats(userId: string): Promise<ReferralStats> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      referralCode: true,
      referralCount: true,
      referralCreditsEarned: true,
      referredUsers: {
        select: {
          id: true,
          username: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 25,
      },
    },
  });

  if (!user) {
    throw new Error('User not found');
  }

  return {
    referralCode: user.referralCode,
    referralCount: user.referralCount ?? 0,
    referralCreditsEarned: Number(user.referralCreditsEarned ?? 0),
    referredUsers: user.referredUsers.map((referredUser) => ({
      id: referredUser.id,
      username: referredUser.username,
      joinedAt: referredUser.createdAt,
    })),
  };
}

