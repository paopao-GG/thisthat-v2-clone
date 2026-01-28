import React, { useState, useEffect } from 'react';
import type { LeaderboardEntry } from '@shared/types';
import LeaderboardTable from '@features/leaderboard/components/LeaderboardTable';
import { fetchLeaderboardByVolume } from '@shared/services';
import { useCategoryFilter } from '@shared/contexts/CategoryFilterContext';
import { useAuth } from '@shared/hooks';

const LeaderboardPage: React.FC = () => {
  const { categories, loading: categoriesLoading } = useCategoryFilter();
  const { user } = useAuth();

  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeFilter, setTimeFilter] = useState<'today' | 'weekly' | 'monthly' | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');

  useEffect(() => {
    const loadLeaderboard = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchLeaderboardByVolume(100, categoryFilter === 'All' ? undefined : categoryFilter, timeFilter);
        setLeaderboard(data);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load leaderboard';
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    if (!categoriesLoading) {
      loadLeaderboard();
    }
  }, [categoryFilter, timeFilter, categoriesLoading]);


  // Find current user in leaderboard
  const currentUserEntry = React.useMemo(() => {
    // Find by actual user ID
    if (user) {
      const found = leaderboard.find(entry => entry.userId === user.id);
      if (found) return found;
    }
    return null;
  }, [leaderboard, user]);

  // Sort leaderboard by rank to ensure correct order
  const sortedLeaderboard = React.useMemo(() => {
    return [...leaderboard].sort((a, b) => a.rank - b.rank);
  }, [leaderboard]);

  // Top 3 and rest of entries
  const topThree = React.useMemo(() => {
    return sortedLeaderboard.slice(0, 3);
  }, [sortedLeaderboard]);

  const restOfEntries = React.useMemo(() => {
    // Rank 4 and below (sorted by rank)
    const entries = sortedLeaderboard.slice(3);
    // Exclude current user if they're in rank 4+ 
    if (currentUserEntry && currentUserEntry.rank > 3) {
      return entries.filter(entry => entry.userId !== currentUserEntry.userId);
    }
    return entries;
  }, [sortedLeaderboard, currentUserEntry]);

  // Show loading state only on very first load (before categories are loaded)
  if (categoriesLoading && leaderboard.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-[#f5f5f5]/60 text-sm font-normal" style={{ fontFamily: 'Aeonik, -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif' }}>
          Loading categories...
        </div>
      </div>
    );
  }

  // Note: Loading state for filter changes is handled by LeaderboardTable component
  // to avoid page re-rendering when switching categories or time filters

  const handleRetry = async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await fetchLeaderboardByVolume(100, categoryFilter === 'All' ? undefined : categoryFilter, timeFilter);
      setLeaderboard(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load leaderboard';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Show error state
  if (error) {
    return (
      <div className="p-3 max-w-6xl mx-auto">
        <div className="text-center py-8">
          <div className="text-red-400 text-sm mb-3">Error: {error}</div>
          <button 
            onClick={handleRetry}
            className="mt-3 px-3 py-2 text-xs text-white rounded-lg transition-all font-semibold"
            style={{
              background: 'linear-gradient(135deg, #4A90B8 0%, #3D6B8A 100%)',
              backdropFilter: 'blur(20px) saturate(180%)',
              WebkitBackdropFilter: 'blur(20px) saturate(180%)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              boxShadow: '0 4px 16px rgba(74, 144, 184, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'linear-gradient(135deg, #5A9FC7 0%, #4D7B9A 100%)';
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(74, 144, 184, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.15)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'linear-gradient(135deg, #4A90B8 0%, #3D6B8A 100%)';
              e.currentTarget.style.boxShadow = '0 4px 16px rgba(74, 144, 184, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)';
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <LeaderboardTable
        entries={sortedLeaderboard}
        topThree={topThree}
        restOfEntries={restOfEntries}
        currentUserEntry={currentUserEntry}
        categories={categories}
        categoryFilter={categoryFilter}
        onCategoryChange={setCategoryFilter}
        timeFilter={timeFilter}
        onTimeFilterChange={setTimeFilter}
        loading={loading}
        error={error}
      />
    </div>
  );
};

export default LeaderboardPage;


