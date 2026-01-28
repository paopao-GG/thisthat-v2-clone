/**
 * Infinite Markets Hook
 * 
 * Fetches markets in small batches (e.g. 5) and automatically
 * prefetches the next batch when the local buffer gets low.
 * Also exposes a way to consume markets so stale/used markets
 * are cleaned up from the client-side cache.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchMarkets } from '@shared/services/marketService';
import { fetchUserPositions } from '@shared/services/userService';
import { useAuth } from '@shared/hooks/useAuth';
import type { Market } from '@shared/types';
import { getImageUrlForMarket, getImageUrlForOption } from '@shared/utils/imageFetcher';

/**
 * Shuffle markets with event diversity - prevents consecutive markets from same event
 * Uses a greedy algorithm to maximize distance between markets with same title prefix
 * (markets from same event often share title prefixes like "NFL Playoffs:")
 */
function shuffleWithEventDiversity(markets: Market[]): Market[] {
  if (markets.length <= 1) return markets;

  // Helper: Extract event prefix from title (e.g. "NFL Playoffs: " from "NFL Playoffs: Team A vs Team B")
  const getEventPrefix = (title: string): string => {
    const match = title.match(/^([^:]+):/);
    return match ? match[1].trim() : title.slice(0, 20); // Fallback: first 20 chars
  };

  // Group markets by event prefix
  const eventGroups = new Map<string, Market[]>();
  for (const market of markets) {
    const prefix = getEventPrefix(market.title);
    if (!eventGroups.has(prefix)) {
      eventGroups.set(prefix, []);
    }
    eventGroups.get(prefix)!.push(market);
  }

  // Shuffle each event group internally (for variety within same event)
  for (const group of eventGroups.values()) {
    for (let i = group.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [group[i], group[j]] = [group[j], group[i]];
    }
  }

  // Convert to array of [prefix, markets[]] and shuffle order of events
  const shuffledEvents = Array.from(eventGroups.entries());
  for (let i = shuffledEvents.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledEvents[i], shuffledEvents[j]] = [shuffledEvents[j], shuffledEvents[i]];
  }

  // Interleave markets from different events using round-robin
  const result: Market[] = [];
  let eventIndex = 0;
  const eventQueues = shuffledEvents.map(([, markets]) => markets);

  while (result.length < markets.length) {
    // Find next non-empty queue (round-robin)
    let attempts = 0;
    while (attempts < eventQueues.length) {
      const queue = eventQueues[eventIndex % eventQueues.length];
      if (queue.length > 0) {
        result.push(queue.shift()!);
        break;
      }
      eventIndex++;
      attempts++;
    }
    eventIndex++;
  }

  return result;
}

interface UseInfiniteMarketsOptions {
  category?: string;
  status?: 'open' | 'closed' | 'resolved';
  filter?: 'ending_soon' | 'popular'; // NEW
  /** How many markets to fetch per batch (will auto-adjust for power users) */
  batchSize?: number;
  /** When markets.length falls at or below this, prefetch the next batch */
  prefetchThreshold?: number;
}

interface UseInfiniteMarketsResult {
  markets: Market[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  /** Remove a market from the client buffer when it has been fully consumed (e.g. after a bet) */
  consumeMarket: (marketId: string) => void;
  /** Manually trigger loading the next batch (optional escape hatch) */
  loadMore: () => Promise<void>;
  /** Reset state and refetch from the beginning (used on category changes) */
  reset: () => void;
}

export function useInfiniteMarkets(
  options: UseInfiniteMarketsOptions = {}
): UseInfiniteMarketsResult {
  const {
    category,
    status = 'open',
    filter, // NEW
    batchSize = 5,
    prefetchThreshold = 2,
  } = options;

  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const { isAuthenticated } = useAuth();

  const offsetRef = useRef(0);
  const hasMoreRef = useRef(true);
  const isInitialisedRef = useRef(false);
  // Track markets the user already consumed so they never re-appear,
  // even if the backend pagination/order returns duplicates.
  const consumedIdsRef = useRef<Set<string>>(new Set());
  // Track markets the user has already bet on (from their positions)
  const bettedMarketIdsRef = useRef<Set<string>>(new Set());
  // Track previous category for optimization
  const previousCategoryRef = useRef<string | undefined>(category);
  // Track bet frequency for dynamic batch sizing
  const betsInLastHourRef = useRef<number[]>([]);
  // Track when markets were last seen (for 24h rotation)
  const marketSeenTimestampsRef = useRef<Map<string, number>>(new Map());

  /**
   * Calculate dynamic batch size based on user activity
   * Power users (>10 bets/hour) get larger batches for better performance
   */
  const getDynamicBatchSize = useCallback((): number => {
    // Clean up old timestamps (older than 1 hour)
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    betsInLastHourRef.current = betsInLastHourRef.current.filter(ts => ts > oneHourAgo);

    const recentBetCount = betsInLastHourRef.current.length;

    // Power user (>10 bets/hour): fetch 50 markets at once
    if (recentBetCount > 10) {
      return 50;
    }
    // Active user (5-10 bets/hour): fetch 30 markets
    if (recentBetCount >= 5) {
      return 30;
    }
    // Regular user: use default batch size
    return batchSize;
  }, [batchSize]);

  /**
   * Record a bet to track user activity
   */
  const recordBet = useCallback(() => {
    betsInLastHourRef.current.push(Date.now());
  }, []);

  /**
   * Check if a market should be filtered due to recent viewing
   * Markets are hidden for 24 hours after being bet on, then become available again
   */
  const shouldFilterMarket = useCallback((marketId: string): boolean => {
    const SEEN_MARKETS_TTL = 24 * 60 * 60 * 1000; // 24 hours
    const now = Date.now();

    // Always filter consumed markets (bet on in this session)
    if (consumedIdsRef.current.has(marketId)) {
      return true;
    }

    // Check if market was seen recently
    const lastSeenTime = marketSeenTimestampsRef.current.get(marketId);
    if (lastSeenTime) {
      const timeSinceLastSeen = now - lastSeenTime;
      // Filter if seen within last 24 hours
      if (timeSinceLastSeen < SEEN_MARKETS_TTL) {
        return true;
      } else {
        // Expired - remove from tracking to allow re-display
        marketSeenTimestampsRef.current.delete(marketId);
      }
    }

    // Check current betting status (from positions)
    if (bettedMarketIdsRef.current.has(marketId)) {
      return true;
    }

    return false;
  }, []);

  // Load user's betted market IDs
  const loadBettedMarketIds = useCallback(async () => {
    if (!isAuthenticated) {
      bettedMarketIdsRef.current = new Set();
      return;
    }

    try {
      // Fetch both active and closed positions to get all market IDs user has bet on
      const [activePos, closedPos] = await Promise.all([
        fetchUserPositions('active').catch(() => []),
        fetchUserPositions('closed').catch(() => []),
      ]);
      
      const allPositions = [...activePos, ...closedPos];
      const marketIds = new Set<string>();
      allPositions.forEach(pos => {
        if (pos.marketId) {
          marketIds.add(pos.marketId);
        }
      });
      
      bettedMarketIdsRef.current = marketIds;
    } catch (error) {
      console.error('Failed to load betted market IDs:', error);
      // On error, just use empty set - better to show markets than hide them all
      bettedMarketIdsRef.current = new Set();
    }
  }, [isAuthenticated]);

  const reset = useCallback(() => {
    const isCategoryChange = previousCategoryRef.current !== category;

    // Always clear markets on reset - the API will fetch fresh ones for the new category
    // The useMemo filter at the end will ensure only correct markets are shown
    setMarkets([]);
    
    // Clear consumed IDs on category change so markets can appear again in new category
    if (isCategoryChange) {
      consumedIdsRef.current = new Set();
    }

    setLoading(true);
    setLoadingMore(false);
    setError(null);
    offsetRef.current = 0;
    hasMoreRef.current = true;
    isInitialisedRef.current = false;
    previousCategoryRef.current = category;
    
    // Reload betted market IDs on reset (in case user placed new bets)
    void loadBettedMarketIds();
  }, [category, loadBettedMarketIds]);

  const loadMore = useCallback(async () => {
    if (!hasMoreRef.current) return;
    if (loadingMore) return;

    // If we haven't done the first load yet, treat this as initial
    const isInitialLoad = !isInitialisedRef.current;

    // Use dynamic batch size based on user activity
    const effectiveBatchSize = getDynamicBatchSize();

    try {
      if (isInitialLoad) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      setError(null);

      const rawBatch = await fetchMarkets({
        category,
        status,
        filter, // NEW
        limit: effectiveBatchSize,
        skip: offsetRef.current,
      });

      // Attach image URLs and drop any already-consumed ids or markets user has bet on
      // Also filter out markets seen within last 24 hours (smart rotation)
      // IMPORTANT: Use backend imageUrl when available, only fall back to generated placeholder
      const nextBatch: Market[] = rawBatch
        .filter((m) => !shouldFilterMarket(m.id))
        .map((market) => {
        if (market.marketType === 'two-image') {
          return {
            ...market,
            // Use backend URLs if available, otherwise generate placeholders
            thisImageUrl: market.thisImageUrl || getImageUrlForOption(market.thisOption, market.category),
            thatImageUrl: market.thatImageUrl || getImageUrlForOption(market.thatOption, market.category),
          };
        }

        return {
          ...market,
          // Use backend imageUrl if available, otherwise generate placeholder
          imageUrl: market.imageUrl || getImageUrlForMarket(market),
        };
      });

      // Update offset and hasMore flags
      offsetRef.current += nextBatch.length;
      if (nextBatch.length < effectiveBatchSize) {
        hasMoreRef.current = false;
      }

      // OPTIMIZATION: Replace markets on initial load (category change), append otherwise
      setMarkets((prev) => {
        // If this is the first batch (offset was 0), replace all markets
        // This happens on category changes for instant switching
        if (offsetRef.current === nextBatch.length) {
          // Shuffle initial batch too when no filter is applied
          return !filter ? shuffleWithEventDiversity(nextBatch) : nextBatch;
        }

        // Otherwise, merge with existing markets, de-duplicating by id
        if (prev.length === 0) {
          return !filter ? shuffleWithEventDiversity(nextBatch) : nextBatch;
        }
        const existingIds = new Set(prev.map((m) => m.id));
        const deduped = nextBatch.filter(
          (m) => !existingIds.has(m.id) && !shouldFilterMarket(m.id)
        );
        const merged = [...prev, ...deduped];

        // Re-shuffle merged array ONLY when no filter is applied
        // This prevents consecutive markets from the same event after pagination
        // Backend shuffles each batch, but we need to mix batches together
        const shouldShuffle = !filter;
        return shouldShuffle ? shuffleWithEventDiversity(merged) : merged;
      });

      isInitialisedRef.current = true;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to load markets';
      setError(errorMessage);
      // If the very first load fails, we should clear markets
      if (!isInitialisedRef.current) {
        setMarkets([]);
      }
    } finally {
      if (isInitialLoad) {
        setLoading(false);
      } else {
        setLoadingMore(false);
      }
    }
  }, [batchSize, category, status, filter, loadingMore, getDynamicBatchSize, shouldFilterMarket]);

  // Load betted market IDs when authenticated state changes
  useEffect(() => {
    void loadBettedMarketIds().then(() => {
      // After loading betted IDs, filter out those markets from existing markets
      setMarkets((prev) => 
        prev.filter((m) => !bettedMarketIdsRef.current.has(m.id))
      );
    });
  }, [loadBettedMarketIds]);

  // Initial load & reset when filters change
  useEffect(() => {
    reset();
  }, [category, status, filter, batchSize, reset]); // Add filter

  useEffect(() => {
    // After a reset, kick off the first load
    if (!isInitialisedRef.current) {
      void loadMore();
    }
  }, [loadMore]);

  // Auto-prefetch when buffer is getting low
  useEffect(() => {
    if (!isInitialisedRef.current) return;
    if (!hasMoreRef.current) return;
    if (loadingMore) return;

    if (markets.length <= prefetchThreshold) {
      void loadMore();
    }
  }, [markets.length, prefetchThreshold, loadingMore, loadMore]);

  const consumeMarket = useCallback((marketId: string) => {
    const now = Date.now();
    consumedIdsRef.current.add(marketId);
    bettedMarketIdsRef.current.add(marketId); // Also add to betted markets
    marketSeenTimestampsRef.current.set(marketId, now); // Record timestamp for 24h rotation
    recordBet(); // Track bet for dynamic batch sizing
    setMarkets((prev) => prev.filter((m) => m.id !== marketId));
  }, [recordBet]);

  return {
    markets,
    loading,
    loadingMore,
    error,
    consumeMarket,
    loadMore,
    reset,
  };
}
