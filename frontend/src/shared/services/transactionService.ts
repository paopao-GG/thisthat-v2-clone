/**
 * Transaction Service
 * Handles credit transaction history
 */

import { get } from './api';

/**
 * Credit transaction types
 */
export type TransactionType =
  | 'daily_reward'
  | 'bet_placed'
  | 'bet_won'
  | 'bet_lost'
  | 'purchase'
  | 'referral_bonus'
  | 'bet_refund';

/**
 * Credit transaction
 */
export interface CreditTransaction {
  id: string;
  userId: string;
  type: TransactionType;
  amount: number;
  balanceAfter: number;
  description?: string;
  relatedBetId?: string;
  relatedPurchaseId?: string;
  createdAt: string;
}

/**
 * Fetch user's transaction history
 * Backend queries PostgreSQL database
 */
export async function fetchTransactionHistory(params?: {
  limit?: number;
  skip?: number;
  type?: TransactionType;
}): Promise<CreditTransaction[]> {
  const queryParams = new URLSearchParams();
  
  if (params?.limit) queryParams.append('limit', params.limit.toString());
  if (params?.skip) queryParams.append('skip', params.skip.toString());
  if (params?.type) queryParams.append('type', params.type);

  const endpoint = `/api/v1/transactions/me${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
  
  const response = await get<{ success: boolean; data: CreditTransaction[] }>(endpoint, true);
  return response.data;
}





























