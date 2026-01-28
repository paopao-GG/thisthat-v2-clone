/**
 * Economy Service
 * Handles credits, purchases, and daily rewards
 */

import { get, post } from './api';

/**
 * Daily credits claim response (matches backend response)
 */
export interface DailyCreditsResponse {
  success: boolean;
  creditsAwarded: number;
  consecutiveDays: number;
  nextAvailableAt: string;
}

/**
 * Credit package
 */
export interface CreditPackage {
  id: string;
  name: string;
  credits: number;
  price: number;
  priceDisplay: string;
  popular?: boolean;
}

/**
 * Purchase history item
 */
export interface PurchaseRecord {
  id: string;
  userId: string;
  packageId: string;
  credits: number;
  amount: number;
  provider: string;
  externalId?: string;
  createdAt: string;
}

/**
 * Claim daily credits
 * Backend: checks last claim, awards credits, updates streak in PostgreSQL
 */
export async function claimDailyCredits(): Promise<DailyCreditsResponse> {
  return post<DailyCreditsResponse>('/api/v1/economy/daily-credits', {}, true);
}

/**
 * Fetch available credit packages
 * Backend queries PostgreSQL database
 */
export async function fetchCreditPackages(): Promise<CreditPackage[]> {
  const response = await get<{ success: boolean; data: CreditPackage[] }>(
    '/api/v1/purchases/packages'
  );
  return response.data;
}

/**
 * Purchase credits
 * Backend: creates purchase record, adds credits to user in PostgreSQL
 */
export async function purchaseCredits(
  packageId: string,
  provider: string,
  externalId?: string
): Promise<{
  success: boolean;
  data: PurchaseRecord;
  message: string;
}> {
  return post(
    '/api/v1/purchases',
    {
      packageId,
      provider,
      externalId,
    },
    true
  );
}

/**
 * Fetch user's purchase history
 * Backend queries PostgreSQL database
 */
export async function fetchPurchaseHistory(params?: {
  limit?: number;
  skip?: number;
}): Promise<PurchaseRecord[]> {
  const queryParams = new URLSearchParams();
  
  if (params?.limit) queryParams.append('limit', params.limit.toString());
  if (params?.skip) queryParams.append('skip', params.skip.toString());

  const endpoint = `/api/v1/purchases/me${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
  
  const response = await get<{ success: boolean; data: PurchaseRecord[] }>(endpoint, true);
  return response.data;
}




