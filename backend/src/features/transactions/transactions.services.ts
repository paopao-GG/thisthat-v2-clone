import { usersPrisma as prisma } from '../../lib/database.js';

export interface TransactionQueryParams {
  type?: string;
  limit?: number;
  offset?: number;
}

/**
 * Get user's credit transaction history
 */
export async function getUserTransactions(
  userId: string,
  params: TransactionQueryParams = {}
) {
  const limit = Math.min(params.limit || 50, 200);
  const offset = params.offset || 0;

  const where: any = {
    userId,
  };

  if (params.type) {
    where.transactionType = params.type;
  }

  const [transactions, total] = await Promise.all([
    prisma.creditTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.creditTransaction.count({ where }),
  ]);

  return {
    transactions: transactions.map((t) => ({
      id: t.id,
      amount: Number(t.amount),
      transactionType: t.transactionType,
      referenceId: t.referenceId,
      balanceAfter: Number(t.balanceAfter),
      createdAt: t.createdAt,
    })),
    total,
    limit,
    offset,
  };
}




