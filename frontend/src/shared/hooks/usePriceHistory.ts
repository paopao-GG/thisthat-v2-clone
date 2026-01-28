/**
 * Price History Hook - P1 Polymarket Integration
 *
 * Fetches historical price data from Polymarket CLOB API for charts.
 * Supports multiple time intervals: 1h, 6h, 1d, 1w, max
 */

import { useEffect, useState, useCallback } from 'react';
import { fetchPriceHistory, type PriceInterval } from '@shared/services/marketService';

export interface PricePoint {
  timestamp: number;
  price: number;
}

interface UsePriceHistoryResult {
  history: PricePoint[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

// Map UI time filters to API intervals
// Polymarket CLOB API supports: 1h, 6h, 1d, all
export const timeFilterToInterval: Record<string, PriceInterval> = {
  '1H': '1h',
  '6H': '6h',
  '1D': '1d',
  'ALL': 'max',
};

export function usePriceHistory(
  marketId: string | null,
  interval: PriceInterval = '1d',
  side: 'this' | 'that' = 'this',
  isActive: boolean = true
): UsePriceHistoryResult {
  const [history, setHistory] = useState<PricePoint[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchKey, setFetchKey] = useState(0);

  const refetch = useCallback(() => {
    setFetchKey((prev) => prev + 1);
  }, []);

  useEffect(() => {
    // Only fetch if active and we have a market ID
    if (!isActive || !marketId) {
      return;
    }

    let cancelled = false;

    const fetchHistory = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetchPriceHistory(marketId, interval, side);

        if (cancelled) return;

        if (response && response.history) {
          setHistory(response.history);
        } else {
          // No data available - return empty array
          setHistory([]);
        }
      } catch (err) {
        if (cancelled) return;
        console.error('[usePriceHistory] Error:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch price history');
        setHistory([]);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchHistory();

    return () => {
      cancelled = true;
    };
  }, [marketId, interval, side, isActive, fetchKey]);

  return { history, loading, error, refetch };
}
