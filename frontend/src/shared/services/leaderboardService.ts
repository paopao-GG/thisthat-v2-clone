/**
 * Leaderboard Service
 * Handles leaderboard and ranking API calls
 */

import { get } from './api';
import type { LeaderboardEntry } from '@shared/types';

/**
 * Backend leaderboard entry
 */
interface BackendLeaderboardEntry {
  userId: string;
  username: string;
  displayName?: string;
  profileImageUrl?: string | null;
  avatar?: string;
  rank: number;
  totalVolume: number;
  totalPnl: number;
  winRate: number;
  totalBets: number;
  tokenAllocation?: number;
}

/**
 * Transform backend entry to frontend format
 */
function transformLeaderboardEntry(entry: BackendLeaderboardEntry): LeaderboardEntry {
  return {
    rank: entry.rank,
    userId: entry.userId,
    username: entry.displayName || entry.username || 'Anonymous',
    profileImageUrl: entry.profileImageUrl,
    avatar: entry.avatar || entry.profileImageUrl || undefined,
    volume: entry.totalVolume,
    pnl: entry.totalPnl,
    winRate: entry.winRate,
    totalBets: entry.totalBets,
    tokenAllocation: entry.tokenAllocation || 0,
  };
}

/**
 * Fetch global leaderboard by PnL
 * Backend queries PostgreSQL database (cached in Redis)
 */
export async function fetchLeaderboardByPnL(limit = 100): Promise<LeaderboardEntry[]> {
  const response = await get<{ success: boolean; data: BackendLeaderboardEntry[] }>(
    `/api/v1/leaderboard/pnl?limit=${limit}`
  );
  const data = Array.isArray(response) ? response : (response.data || []);
  return data.map(transformLeaderboardEntry);
}

/**
 * Fetch global leaderboard by volume
 * Backend queries PostgreSQL database (cached in Redis)
 * Supports time filtering (today, weekly, monthly, all) and category filtering
 */
export async function fetchLeaderboardByVolume(
  limit = 100,
  category?: string,
  timeFilter?: 'today' | 'weekly' | 'monthly' | 'all'
): Promise<LeaderboardEntry[]> {
  const params = new URLSearchParams({ limit: limit.toString() });
  if (category && category !== 'All') {
    params.append('category', category);
  }
  if (timeFilter) {
    params.append('timeFilter', timeFilter);
  }
  const response = await get<{ success: boolean; data: BackendLeaderboardEntry[] }>(
    `/api/v1/leaderboard/volume?${params.toString()}`
  );
  const data = Array.isArray(response) ? response : (response.data || []);
  return data.map(transformLeaderboardEntry);
}

/**
 * Fetch current user's leaderboard position
 * Backend queries PostgreSQL database
 */
export async function fetchMyLeaderboardPosition(): Promise<{
  pnlRank: number;
  volumeRank: number;
  nearbyUsersPnl: LeaderboardEntry[];
  nearbyUsersVolume: LeaderboardEntry[];
}> {
  const response = await get<{
    success: boolean;
    data: {
      pnlRank: number;
      volumeRank: number;
      nearbyUsersPnl: BackendLeaderboardEntry[];
      nearbyUsersVolume: BackendLeaderboardEntry[];
    };
  }>('/api/v1/leaderboard/me', true);

  const data = response.data || response;

  return {
    pnlRank: data.pnlRank,
    volumeRank: data.volumeRank,
    nearbyUsersPnl: (data.nearbyUsersPnl || []).map(transformLeaderboardEntry),
    nearbyUsersVolume: (data.nearbyUsersVolume || []).map(transformLeaderboardEntry),
  };
}



