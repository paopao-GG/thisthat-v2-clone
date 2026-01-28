/**
 * Custom hook for fetching markets
 * Example of how to use the market service in components
 */

import { useState, useEffect, useCallback } from 'react';
import { fetchMarkets } from '@shared/services/marketService';
import type { Market } from '@shared/types';

interface UseMarketsOptions {
  category?: string;
  status?: 'open' | 'closed' | 'resolved';
  filter?: 'ending_soon' | 'popular'; // NEW
  limit?: number;
  autoLoad?: boolean;
}

interface UseMarketsResult {
  markets: Market[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hook for fetching markets from backend
 * Backend will query PostgreSQL database
 * 
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { markets, loading, error, refetch } = useMarkets({ 
 *     status: 'open',
 *     limit: 20 
 *   });
 * 
 *   if (loading) return <div>Loading...</div>;
 *   if (error) return <div>Error: {error}</div>;
 * 
 *   return (
 *     <div>
 *       {markets.map(m => <MarketCard key={m.id} market={m} />)}
 *       <button onClick={refetch}>Refresh</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useMarkets(options: UseMarketsOptions = {}): UseMarketsResult {
  const { category, status = 'open', filter, limit = 50, autoLoad = true } = options;

  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(autoLoad);
  const [error, setError] = useState<string | null>(null);

  const loadMarkets = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Call backend API - backend fetches from PostgreSQL
      const data = await fetchMarkets({
        category,
        status,
        filter, // NEW
        limit,
      });

      setMarkets(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load markets';
      setError(errorMessage);
      console.error('Error loading markets:', err);
    } finally {
      setLoading(false);
    }
  }, [category, status, filter, limit]); // Add filter to dependencies

  useEffect(() => {
    if (autoLoad) {
      loadMarkets();
    }
  }, [loadMarkets, autoLoad]);

  return {
    markets,
    loading,
    error,
    refetch: loadMarkets,
  };
}



