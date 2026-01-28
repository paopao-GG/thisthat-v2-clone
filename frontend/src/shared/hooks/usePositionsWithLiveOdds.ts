/**
 * usePositionsWithLiveOdds Hook
 *
 * Fetches user positions and enriches them with live Polymarket odds.
 * This creates a single source of truth for position data used by both
 * PositionsTable and PositionDetailModal.
 */

import { useState, useEffect, useCallback } from 'react';
import { fetchUserPositions, type UserPosition } from '@shared/services/userService';
import { fetchLiveOdds } from '@shared/services/marketService';

interface UsePositionsWithLiveOddsResult {
  positions: UserPosition[];
  loading: boolean;
  error: string | null;
  refreshPositions: () => Promise<void>;
}

export function usePositionsWithLiveOdds(
  filter: 'active' | 'closed' = 'active',
  isActive: boolean = true
): UsePositionsWithLiveOddsResult {
  const [positions, setPositions] = useState<UserPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Manual refresh function (triggers re-render by changing dependencies)
   */
  const [refreshKey, setRefreshKey] = useState(0);
  const refreshPositions = useCallback(async () => {
    setRefreshKey(prev => prev + 1);
  }, []);

  /**
   * Fetch on mount and when dependencies change
   */
  useEffect(() => {
    let cancelled = false;

    const fetchWithCancellation = async () => {
      if (!isActive || cancelled) return;

      try {
        setLoading(true);
        setError(null);

        // Step 1: Fetch base position data from backend
        const basePositions = await fetchUserPositions(filter);

        if (cancelled) return; // Don't update state if dependencies changed

        // Step 2: Get unique market IDs
        const uniqueMarketIds = Array.from(
          new Set(basePositions.map(p => p.marketId))
        );

        // Step 3: Fetch live odds for each unique market in parallel
        const liveOddsPromises = uniqueMarketIds.map(async (marketId) => {
          try {
            const odds = await fetchLiveOdds(marketId);
            return { marketId, odds };
          } catch (err) {
            console.warn(`Failed to fetch live odds for market ${marketId}:`, err);
            return { marketId, odds: null };
          }
        });

        const liveOddsResults = await Promise.all(liveOddsPromises);

        if (cancelled) return; // Don't update state if dependencies changed

        // Step 4: Create a map of marketId -> live odds
        const liveOddsMap = new Map(
          liveOddsResults.map(({ marketId, odds }) => [marketId, odds])
        );

        // Step 5: Enrich positions with live odds
        const enrichedPositions = basePositions.map((position) => {
          const liveOdds = liveOddsMap.get(position.marketId);

          if (!liveOdds) {
            // No live odds available, return position as-is
            return position;
          }

          if (liveOdds.isServiceDown) {
            // Polymarket is down
            return {
              ...position,
              isServiceDown: true,
            };
          }

          // Calculate current price using live odds
          const liveCurrentPrice = position.side === 'this'
            ? liveOdds.thisOdds
            : liveOdds.thatOdds;

          // Recalculate value and PnL using live odds
          const liveValue = position.shares * liveCurrentPrice;
          const costBasis = position.shares * position.avgPrice;
          const livePnl = liveValue - costBasis;
          const livePnlPercent = costBasis > 0 ? (livePnl / costBasis) * 100 : 0;

          return {
            ...position,
            currentPrice: liveCurrentPrice,
            value: liveValue,
            pnl: livePnl,
            pnlPercent: livePnlPercent,
            liveOdds: {
              thisOdds: liveOdds.thisOdds,
              thatOdds: liveOdds.thatOdds,
              liquidity: liveOdds.liquidity,
              spread: liveOdds.spread,
              isLive: liveOdds.isLive,
              lastUpdated: liveOdds.lastUpdated,
            },
          };
        });

        if (cancelled) return; // Don't update state if dependencies changed

        setPositions(enrichedPositions);
      } catch (err) {
        if (cancelled) return; // Don't update state if dependencies changed

        console.error('Error fetching enriched positions:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch positions');
        setPositions([]);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void fetchWithCancellation();

    return () => {
      cancelled = true;
    };
  }, [filter, isActive, refreshKey]);

  return {
    positions,
    loading,
    error,
    refreshPositions,
  };
}
