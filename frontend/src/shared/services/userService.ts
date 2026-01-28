/**
 * User Service
 * Handles user stats and profile data
 */

import { get } from './api';
import type { UserStats } from '@shared/types';

/**
 * Backend bet response structure for user positions
 */
interface BackendBetForPosition {
  id: string;
  userId: string;
  marketId: string;
  side: 'this' | 'that';
  amount: number;
  odds: number;
  status: 'pending' | 'won' | 'lost' | 'cancelled';
  actualPayout?: number;
  sharesReceived?: number;
  priceAtBet?: number; // Price (probability 0-1) when bet was placed
  creditSource?: 'free' | 'purchased';
  createdAt?: string;
  updatedAt?: string;
  market?: {
    id: string;
    title: string;
    category?: string;
    thisOdds?: number;
    thatOdds?: number;
  };
}

/**
 * Backend user stats response (from /api/v1/auth/me)
 */
interface BackendUserStats {
  id: string;
  username: string;
  email: string;
  name: string | null;
  profileImageUrl?: string | null;
  creditBalance: number;
  availableCredits: number;
  expendedCredits: number;
  // Separated credit balances
  freeCreditsBalance: number;
  purchasedCreditsBalance: number;
  consecutiveDaysOnline: number;
  referralCode: string;
  referralCount: number;
  referralCreditsEarned: number;
  totalVolume: number;
  overallPnL: number;
  lastDailyRewardAt: Date | null;
  rankByPnL: number | null;
  rankByVolume: number | null;
  totalBets: number;
  winRate: number;
  dailyStreak: number;
  tokenAllocation: number;
  lockedTokens: number;
  biggestWin: number;
}

/**
 * User position
 */
export interface UserPosition {
  id: string;
  betIds?: string[];
  marketId: string;
  marketTitle: string;
  marketCategory?: string;
  side: 'this' | 'that';
  shares: number;
  avgPrice: number;
  currentPrice: number;
  value: number;
  pnl: number;
  pnlPercent: number;
  status: 'open' | 'closed' | 'resolved';
  creditSource?: 'free' | 'purchased';
  createdAt?: string;
  updatedAt?: string;
  liveOdds?: {
    thisOdds: number;
    thatOdds: number;
    liquidity: number;
    spread?: number;
    isLive?: boolean;
    lastUpdated?: string;
  };
  isServiceDown?: boolean;
}

/**
 * Transform backend stats to frontend format
 */
function transformUserStats(stats: BackendUserStats): UserStats {
  return {
    userId: stats.id,
    username: stats.name || stats.username,
    profileImageUrl: stats.profileImageUrl,
    avatar: stats.profileImageUrl || undefined,
    credits: stats.creditBalance,
    // Separated credit balances
    freeCredits: stats.freeCreditsBalance || 0,
    purchasedCredits: stats.purchasedCreditsBalance || 0,
    totalVolume: stats.totalVolume,
    totalPnL: stats.overallPnL,
    rank: stats.rankByPnL || stats.rankByVolume || 0,
    winRate: stats.winRate,
    totalBets: stats.totalBets,
    dailyStreak: stats.dailyStreak,
    tokenAllocation: stats.tokenAllocation,
    lockedTokens: stats.lockedTokens,
    lastClaimDate: stats.lastDailyRewardAt ? new Date(stats.lastDailyRewardAt) : null,
    biggestWin: stats.biggestWin || 0,
  };
}

/**
 * Fetch current user's stats
 * Backend aggregates data from PostgreSQL database
 */
export async function fetchUserStats(): Promise<UserStats> {
  const response = await get<{ success: boolean; user: BackendUserStats } | BackendUserStats>(
    '/api/v1/auth/me', 
    true
  );
  
  // Handle both response formats (wrapped and direct)
  const stats = 'user' in response ? response.user : response;
  return transformUserStats(stats);
}

/**
 * Fetch user's positions (transformed from bets)
 * Backend queries PostgreSQL for bets, frontend transforms to positions
 * Positions are aggregated by market + side for active positions
 */
export async function fetchUserPositions(filter: 'active' | 'closed' = 'active'): Promise<UserPosition[]> {
  // Fetch bets from backend
  const params = new URLSearchParams();
  params.append('limit', '100');
  
  if (filter === 'active') {
    params.append('status', 'pending');
  }
  // For closed positions
  const response = await get<{ success: boolean; bets: BackendBetForPosition[]; total: number }>(
    `/api/v1/bets/me?${params.toString()}`,
    true
  );
  
  if (!response.bets || response.bets.length === 0) {
    return [];
  }
  
  // Show each bet separately for both active and closed
  const positions: UserPosition[] = [];
  
  for (const bet of response.bets) {
    // Filter by status
    if (filter === 'active' && bet.status !== 'pending') {
      continue;
    }
    if (filter === 'closed' && bet.status === 'pending') {
      continue;
    }
    
    const shares = Number(bet.sharesReceived) || 0;
    const amount = Number(bet.amount) || 0;
    const side = bet.side || 'this';
    
    // For active bets, use current market odds
    // For closed bets, use actual payout
    let avgPrice: number;
    let currentPrice: number;
    let value: number;
    let pnl: number;
    let pnlPercent: number;
    let status: 'open' | 'closed' | 'resolved';
    
    if (bet.status === 'pending') {
      const thisOdds = Number(bet.market?.thisOdds) || 0.5;
      const thatOdds = Number(bet.market?.thatOdds) || 0.5;

      // Odds are probabilities (0-1), use directly as current price
      const currentOdds = side === 'this' ? thisOdds : thatOdds;

      // avgPrice = amount / shares (the price you paid per share)
      avgPrice = shares > 0 ? amount / shares : 0;
      currentPrice = currentOdds;

      // Position Value = shares × current odds
      value = shares * currentOdds;

      // PnL = (current odds - avg price) × shares
      pnl = (currentOdds - avgPrice) * shares;
      pnlPercent = avgPrice > 0 ? ((currentOdds - avgPrice) / avgPrice) * 100 : 0;
      status = 'open';
    } else {
      // Closed position - use actual payout
      const actualPayout = Number(bet.actualPayout) || 0;

      // avgPrice = probability at purchase (from priceAtBet field)
      const priceAtBet = Number(bet.priceAtBet);
      avgPrice = priceAtBet || (shares > 0 ? amount / shares : 1);

      currentPrice = shares > 0 && actualPayout > 0 ? actualPayout / shares : 0;
      value = actualPayout;
      pnl = value - (shares * avgPrice);
      pnlPercent = (shares * avgPrice) > 0 ? (pnl / (shares * avgPrice)) * 100 : 0;
      status = bet.status === 'won' || bet.status === 'lost' ? 'resolved' : 'closed';
    }
    
    positions.push({
      id: bet.id,
      betIds: [bet.id],
      marketId: bet.marketId,
      marketTitle: bet.market?.title || 'Unknown Market',
      marketCategory: bet.market?.category,
      side,
      shares,
      avgPrice,
      currentPrice,
      value,
      pnl,
      pnlPercent,
      status,
      creditSource: bet.creditSource,
      createdAt: bet.createdAt,
      updatedAt: bet.updatedAt,
    });
  }
  
  return positions;
}

/**
 * PnL history data point
 */
export interface PnLDataPoint {
  timestamp: string;
  pnl: number;
  cumulativePnL: number;
}

/**
 * Fetch user's PnL history
 * Backend calculates cumulative PnL over time from resolved bets
 */
export async function fetchPnLHistory(
  timeFilter: '1D' | '1W' | '1M' | 'ALL' = 'ALL'
): Promise<PnLDataPoint[]> {
  const response = await get<{ success: boolean; data: PnLDataPoint[]; timeFilter: string }>(
    `/api/v1/auth/pnl-history?timeFilter=${timeFilter}`,
    true
  );

  // Handle both wrapped and direct responses
  if ('data' in response && Array.isArray(response.data)) {
    return response.data;
  }

  return [];
}
