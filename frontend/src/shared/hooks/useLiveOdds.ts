/**
 * Live Odds Hook - P1 Polymarket Integration
 *
 * Polls live prices from Polymarket CLOB API for a specific market.
 * Polls every 10 seconds to display real-time Polymarket prices.
 * Handles service unavailability gracefully with isServiceDown flag.
 */

import { useEffect, useState } from 'react';
import { fetchLiveOdds } from '@shared/services/marketService';

interface LiveOdds {
  thisOdds: number;
  thatOdds: number;
  liquidity: number;
  spread?: number;
  isLive?: boolean;
  lastUpdated?: string;
}

interface UseLiveOddsResult {
  liveOdds: LiveOdds | null;
  loading: boolean;
  error: string | null;
  isServiceDown: boolean; // P1: Polymarket service unavailable
}

// P1: Poll interval (10 seconds - aligned with cache TTL)
const POLL_INTERVAL_MS = 10000;

export function useLiveOdds(marketId: string | null, isActive: boolean, refreshKey?: number): UseLiveOddsResult {
  const [liveOdds, setLiveOdds] = useState<LiveOdds | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isServiceDown, setIsServiceDown] = useState<boolean>(false);

  useEffect(() => {
    // Only fetch live odds if this card is active and we have a marketId
    if (!isActive || !marketId) {
      return;
    }

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const fetchOdds = async () => {
      if (cancelled || !marketId) return;

      try {
        const odds = await fetchLiveOdds(marketId);

        if (cancelled) return; // Don't update state if component unmounted

        // P1: Check if Polymarket service is down
        if (odds.isServiceDown) {
          setIsServiceDown(true);
          console.warn('[useLiveOdds] Polymarket service is unavailable');
        } else {
          setIsServiceDown(false);
          setLiveOdds({
            thisOdds: odds.thisOdds,
            thatOdds: odds.thatOdds,
            liquidity: odds.liquidity,
            spread: odds.spread,
            isLive: odds.isLive,
            lastUpdated: odds.lastUpdated,
          });
        }

        setError(null);
        setLoading(false);
      } catch (err) {
        if (cancelled) return; // Don't update state if component unmounted

        // Don't treat failed live odds as a critical error
        // Just fall back to database odds (already in market object)
        console.error('[useLiveOdds] Error fetching live odds:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch live odds');
        setLoading(false);
      }
    };

    // Fetch immediately
    void fetchOdds();

    // P1: Poll every 10 seconds (aligned with Polymarket cache TTL)
    intervalId = setInterval(() => {
      void fetchOdds();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [marketId, isActive, refreshKey]);

  return { liveOdds, loading, error, isServiceDown };
}
