import { usersPrisma as prisma } from '../../lib/database.js';

export const CREDIT_PACKAGES = {
  starter: { id: 'starter', credits: 500, usd: 4.99, label: 'Starter' },
  boost: { id: 'boost', credits: 1000, usd: 9.99, label: 'Boost' },
  pro: { id: 'pro', credits: 2500, usd: 19.99, label: 'Pro' },
  whale: { id: 'whale', credits: 5000, usd: 34.99, label: 'Whale' },
} as const;

export type CreditPackageId = keyof typeof CREDIT_PACKAGES;

export async function createCreditPurchase(userId: string, packageId: CreditPackageId) {
  const selectedPackage = CREDIT_PACKAGES[packageId];

  if (!selectedPackage) {
    throw new Error('Invalid credit package');
  }

  return prisma.$transaction(async (tx) => {
    const purchase = await tx.creditPurchase.create({
      data: {
        userId,
        packageId: selectedPackage.id,
        creditsGranted: selectedPackage.credits,
        usdAmount: selectedPackage.usd,
        status: 'completed',
        provider: 'manual',
      },
    });

    const updatedUser = await tx.user.update({
      where: { id: userId },
      data: {
        creditBalance: {
          increment: selectedPackage.credits,
        },
        availableCredits: {
          increment: selectedPackage.credits,
        },
      },
    });

    await tx.creditTransaction.create({
      data: {
        userId,
        amount: selectedPackage.credits,
        transactionType: 'credit_purchase',
        referenceId: purchase.id,
        balanceAfter: Number(updatedUser.creditBalance),
      },
    });

    return {
      purchase,
      newBalance: Number(updatedUser.creditBalance),
    };
  });
}

export async function getUserPurchases(userId: string) {
  const purchases = await prisma.creditPurchase.findMany({
    where: { userId },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return purchases.map((purchase) => ({
    id: purchase.id,
    packageId: purchase.packageId,
    creditsGranted: Number(purchase.creditsGranted),
    usdAmount: Number(purchase.usdAmount),
    status: purchase.status,
    provider: purchase.provider,
    createdAt: purchase.createdAt,
  }));
}

