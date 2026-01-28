/**
 * Betting Service
 * Handles all betting-related API calls
 */

import { get, post } from './api';
import type { Bet } from '@shared/types';

/**
 * Backend bet response
 */
interface BackendBet {
  id: string;
  userId: string;
  marketId: string;
  side: 'this' | 'that';
  amount: number;
  odds: number;
  potentialPayout: number;
  status: 'pending' | 'won' | 'lost' | 'sold';
  placedAt: string;
  settledAt?: string;
  actualPayout?: number;
  creditSource?: 'free' | 'purchased'; // NEW: P5 - which wallet funded this bet
}

/**
 * Place bet request
 */
export interface PlaceBetRequest {
  marketId: string;
  side: 'this' | 'that';
  amount: number;
}

/**
 * Place bet response (includes AMM data)
 */
export interface PlaceBetResponse {
  success: boolean;
  bet: BackendBet;
  newBalance: number;
  sharesReceived: number;
  priceImpact: number;
  newProbability: number;
  creditSource?: 'free' | 'purchased'; // NEW: P5 - which wallet was used
  freeCreditsBalance?: number; // NEW: P5 - updated free balance
  purchasedCreditsBalance?: number; // NEW: P5 - updated purchased balance
}

/**
 * Transform backend bet to frontend format
 */
function transformBet(backendBet: BackendBet): Bet {
  return {
    id: backendBet.id,
    marketId: backendBet.marketId,
    userId: backendBet.userId,
    option: backendBet.side === 'this' ? 'THIS' : 'THAT',
    amount: backendBet.amount,
    odds: backendBet.odds,
    timestamp: new Date(backendBet.placedAt),
    status: backendBet.status === 'sold' ? 'cancelled' : backendBet.status,
    payout: backendBet.actualPayout,
    creditSource: backendBet.creditSource, // NEW: P5
  };
}

/**
 * Place a bet with AMM
 * Backend: locks credits, creates bet record in PostgreSQL, logs transaction
 * Returns full AMM data including shares received, price impact, and new probability
 */
export async function placeBet(bet: PlaceBetRequest): Promise<PlaceBetResponse> {
  const response = await post<PlaceBetResponse>('/api/v1/bets', bet, true);
  return {
    success: response.success,
    bet: response.bet,
    newBalance: response.newBalance,
    sharesReceived: response.sharesReceived,
    priceImpact: response.priceImpact,
    newProbability: response.newProbability,
    creditSource: response.creditSource, // NEW: P5 - pass through wallet source
    freeCreditsBalance: response.freeCreditsBalance, // NEW: P5 - pass through updated balance
    purchasedCreditsBalance: response.purchasedCreditsBalance, // NEW: P5 - pass through updated balance
  };
}

/**
 * Get user's bet history
 * Backend queries PostgreSQL database
 */
export async function getUserBets(params?: {
  limit?: number;
  offset?: number;
}): Promise<Bet[]> {
  const queryParams = new URLSearchParams();
  
  if (params?.limit) queryParams.append('limit', params.limit.toString());
  if (params?.offset) queryParams.append('offset', params.offset.toString());

  const endpoint = `/api/v1/bets/me${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
  
  const response = await get<{ success: boolean; bets: BackendBet[]; total: number; limit: number; offset: number }>(endpoint, true);
  return response.bets.map(transformBet);
}

/**
 * Get single bet details
 * Backend queries PostgreSQL database
 */
export async function getBetById(betId: string): Promise<Bet> {
  const backendBet = await get<BackendBet>(`/api/v1/bets/${betId}`, true);
  return transformBet(backendBet);
}

/**
 * Sell/exit a position early
 * Backend: calculates payout, updates bet status, returns credits to user in PostgreSQL
 */
export async function sellPosition(betId: string, amount?: number): Promise<{
  creditsReceived: number;
  profit: number;
  priceImpact: number;
  payout?: number;
}> {
  const body = amount ? { amount } : {};
  const response = await post<{
    success: boolean;
    creditsReceived: number;
    profit: number;
    priceImpact: number;
  }>(`/api/v1/bets/${betId}/sell`, body, true);
  
  if (typeof response === 'object' && response !== null && 'creditsReceived' in response) {
    return {
      creditsReceived: Number(response.creditsReceived) || 0,
      profit: Number(response.profit) || 0,
      priceImpact: Number(response.priceImpact) || 0,
    };
  }
  
  return response as any;
}




