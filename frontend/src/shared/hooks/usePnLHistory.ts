/**
 * PnL History Hook
 *
 * Fetches user's PnL history from the backend based on time filter.
 * Returns historical PnL data points for chart rendering.
 */

import { useEffect, useState, useCallback } from 'react';
import { fetchPnLHistory, type PnLDataPoint } from '@shared/services/userService';

export type TimeFilter = '1D' | '1W' | '1M' | 'ALL';

interface UsePnLHistoryResult {
  pnlHistory: PnLDataPoint[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function usePnLHistory(timeFilter: TimeFilter = 'ALL'): UsePnLHistoryResult {
  const [pnlHistory, setPnlHistory] = useState<PnLDataPoint[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await fetchPnLHistory(timeFilter);
      setPnlHistory(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch PnL history';
      setError(errorMessage);
      setPnlHistory([]);
    } finally {
      setLoading(false);
    }
  }, [timeFilter]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return { pnlHistory, loading, error, refetch: fetchData };
}
