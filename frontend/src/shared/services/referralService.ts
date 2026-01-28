/**
 * Referral Service
 * Handles referral codes and rewards
 */

import { get } from './api';

/**
 * Referral stats from backend
 */
interface BackendReferralStats {
  referralCode: string;
  referralCount: number;
  referralCreditsEarned: number;
  referredUsers: Array<{
    id: string;
    username: string;
    joinedAt: Date;
  }>;
}

/**
 * Referral stats
 */
export interface ReferralStats {
  userId: string;
  referralCode: string;
  totalReferrals: number;
  totalCreditsEarned: number;
  referrals: Array<{
    referredUserId: string;
    referredUsername?: string;
    createdAt: string;
    creditsAwarded: number;
  }>;
}

/**
 * Fetch user's referral stats
 * Backend queries PostgreSQL database
 */
export async function fetchReferralStats(): Promise<ReferralStats> {
  const response = await get<{ success: boolean } & BackendReferralStats>(
    '/api/v1/referrals/me',
    true
  );
  
  // Transform backend format to frontend format
  return {
    userId: '', // Not provided by backend, but not needed
    referralCode: response.referralCode,
    totalReferrals: response.referralCount,
    totalCreditsEarned: response.referralCreditsEarned,
    referrals: response.referredUsers.map(user => ({
      referredUserId: user.id,
      referredUsername: user.username,
      createdAt: new Date(user.joinedAt).toISOString(),
      creditsAwarded: 100, // Placeholder - needs to be tracked per referral
    })),
  };
}

/**
 * Generate referral link
 * Uses thisthat.xyz as the canonical domain for referral links
 */
export function generateReferralLink(referralCode: string): string {
  const baseUrl = window.location.origin;
  return `${baseUrl}/?ref=${referralCode}`;
}



