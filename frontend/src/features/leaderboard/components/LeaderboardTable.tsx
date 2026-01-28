import React, { useRef, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { User, ChevronDown } from 'lucide-react';
import type { LeaderboardEntry } from '@shared/types';
import { useAuth } from '@shared/hooks';
import '@/styles/leaderboard/style.css';

interface LeaderboardTableProps {
  entries: LeaderboardEntry[];
  topThree: LeaderboardEntry[];
  restOfEntries: LeaderboardEntry[];
  currentUserEntry: LeaderboardEntry | null;
  categories: string[];
  categoryFilter: string;
  onCategoryChange: (category: string) => void;
  timeFilter: 'today' | 'weekly' | 'monthly' | 'all';
  onTimeFilterChange: (timeFilter: 'today' | 'weekly' | 'monthly' | 'all') => void;
  loading: boolean;
  error: string | null;
}

// Avatar component helper
const Avatar: React.FC<{
  entry: LeaderboardEntry;
  size: number;
  borderColor?: string;
  borderWidth?: number;
  className?: string;
}> = ({ entry, size, borderColor, borderWidth = 2, className = '' }) => {
  const profileImageUrl = entry.profileImageUrl || entry.avatar;

  return (
    <div
      className={`rounded-full flex items-center justify-center overflow-hidden ${className}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        backgroundColor: profileImageUrl ? 'transparent' : '#d1d5db',
        borderColor: borderColor || 'rgba(255, 255, 255, 0.1)',
        borderWidth: `${borderWidth}px`,
        borderStyle: 'solid',
      }}
    >
      {profileImageUrl ? (
        <img
          src={profileImageUrl}
          alt={entry.username}
          className="w-full h-full object-cover"
          onError={(e) => {
            // Fallback to User icon if image fails to load
            const target = e.target as HTMLImageElement;
            target.style.display = 'none';
          }}
        />
      ) : (
        <User className="text-gray-600" size={size * 0.6} />
      )}
    </div>
  );
};

// Helper functions moved outside component
const formatPoints = (volume: number) => {
  return volume.toLocaleString();
};

const formatPercentage = (pnl: number, volume: number): { text: string; isZero: boolean; isPositive: boolean } => {
  let percentage: number;
  if (volume > 0.01) {
    percentage = (pnl / volume) * 100;
    if (Math.abs(percentage) > 10000) {
      percentage = pnl;
    }
  } else {
    percentage = pnl;
  }

  // Check if effectively zero (rounds to 0.00)
  const isZero = Math.abs(percentage) < 0.005;
  const isPositive = percentage >= 0;

  if (isZero) {
    return { text: '0.00%', isZero: true, isPositive: true };
  }

  const sign = percentage >= 0 ? '+' : '';
  return { text: `${sign}${percentage.toFixed(2)}%`, isZero: false, isPositive };
};

// Podium component for top 3
const PodiumView: React.FC<{ entries: LeaderboardEntry[]; shouldAnimate: boolean }> = ({ entries, shouldAnimate }) => {
  const [first, second, third] = entries;

  if (entries.length === 0) return null;

  return (
    <div className="mb-0">
      <div className={`flex items-end gap-4 leaderboard-podium-container ${
        entries.length === 1 ? 'justify-center' :
        entries.length === 2 ? 'justify-start' :
        'justify-center'
      }`}>
        {/* 2nd Place (Left) */}
        {entries.length >= 2 && second && (
          <div className="flex flex-col items-center flex-1" style={shouldAnimate ? { animation: 'growUpwards 0.4s ease-out 0.1s both' } : {}}>
            <div className="relative mb-4">
              <Avatar entry={second} size={42} borderColor="rgba(192, 192, 192, 1)" borderWidth={3} />
              <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(192, 192, 192, 1)', border: '2px solid rgba(160, 160, 160, 1)' }}>
                <span className="text-[#1a1a1a] text-[9px] font-bold">#2</span>
              </div>
            </div>
            <div className="text-center w-full">
              <div className="text-sm font-semibold text-[#f5f5f5] mb-2">{second.username}</div>
              <div
                className="flex flex-col items-center justify-center w-full"
                style={{
                  height: '120px',
                  background: 'linear-gradient(to bottom, rgba(192, 192, 192, 0.9) 0%, rgba(180, 180, 180, 0.7) 15%, rgba(170, 170, 170, 0.5) 30%, rgba(160, 160, 160, 0.3) 45%, rgba(150, 150, 150, 0.15) 60%, transparent 100%)',
                  backdropFilter: 'blur(20px) saturate(180%)',
                  WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                  borderTop: '1px solid rgba(192, 192, 192, 0.5)',
                  borderLeft: '1px solid rgba(192, 192, 192, 0.3)',
                  borderRight: '1px solid rgba(192, 192, 192, 0.3)',
                  borderTopLeftRadius: '16px',
                  borderTopRightRadius: '16px',
                  borderBottomLeftRadius: '0',
                  borderBottomRightRadius: '0',
                  padding: '12px 8px',
                }}
              >
                <div className="w-full space-y-2">
                  <div className="text-center">
                    <div className="text-xs sm:text-sm text-[#f5f5f5]/70 font-medium mb-1">Volume</div>
                    <div className="text-xs sm:text-sm text-[#f5f5f5]">{formatPoints(second.volume)}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs sm:text-sm text-[#f5f5f5]/70 font-medium mb-1">PnL</div>
                    {(() => {
                      const pnlData = formatPercentage(second.pnl, second.volume);
                      return (
                        <div className={`text-xs sm:text-sm ${pnlData.isZero ? 'text-[#f5f5f5]' : pnlData.isPositive ? 'text-green-400' : 'text-red-400'}`}>
                          {pnlData.text}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 1st Place (Center) */}
        {first && (
          <div className={`flex flex-col items-center ${
            entries.length === 1 ? '' : 'flex-1'
          }`} style={{
            ...(shouldAnimate ? { animation: 'growUpwards 0.4s ease-out 0.05s both' } : {}),
            ...(entries.length === 1 ? {
              width: 'calc((100% - 2 * 1.5rem) / 3)',
              maxWidth: 'calc((100% - 2 * 1.5rem) / 3)',
              flexShrink: 0
            } : {})
          }}>
            <div className="relative mb-4">
              <Avatar entry={first} size={48} borderColor="rgba(255, 215, 0, 1)" borderWidth={3} />
              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(255, 215, 0, 1)', border: '2px solid rgba(218, 165, 32, 1)' }}>
                <span className="text-[#1a1a1a] text-[10px] font-bold">#1</span>
              </div>
            </div>
            <div className="text-center w-full">
              <div className="text-base font-semibold text-[#f5f5f5] mb-2">{first.username}</div>
              <div
                className="flex flex-col items-center justify-center w-full"
                style={{
                  height: '160px',
                  background: 'linear-gradient(to bottom, rgba(255, 215, 0, 0.9) 0%, rgba(255, 200, 0, 0.7) 15%, rgba(255, 185, 0, 0.5) 30%, rgba(255, 170, 0, 0.3) 45%, rgba(255, 155, 0, 0.15) 60%, transparent 100%)',
                  backdropFilter: 'blur(20px) saturate(180%)',
                  WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                  borderTop: '1px solid rgba(255, 215, 0, 0.5)',
                  borderLeft: '1px solid rgba(255, 215, 0, 0.3)',
                  borderRight: '1px solid rgba(255, 215, 0, 0.3)',
                  borderTopLeftRadius: '16px',
                  borderTopRightRadius: '16px',
                  borderBottomLeftRadius: '0',
                  borderBottomRightRadius: '0',
                  padding: '8px',
                }}
              >
                <div className="w-full space-y-3">
                  <div className="text-center">
                    <div className="text-xs sm:text-sm text-[#f5f5f5]/70 font-medium mb-1">Volume</div>
                    <div className="text-xs sm:text-sm text-[#f5f5f5]">{formatPoints(first.volume)}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs sm:text-sm text-[#f5f5f5]/70 font-medium mb-1">PnL</div>
                    {(() => {
                      const pnlData = formatPercentage(first.pnl, first.volume);
                      return (
                        <div className={`text-xs sm:text-sm ${pnlData.isZero ? 'text-[#f5f5f5]' : pnlData.isPositive ? 'text-green-400' : 'text-red-400'}`}>
                          {pnlData.text}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 3rd Place (Right) */}
        {entries.length === 3 && third && (
          <div className="flex flex-col items-center flex-1" style={shouldAnimate ? { animation: 'growUpwards 0.4s ease-out 0.15s both' } : {}}>
            <div className="relative mb-4">
              <Avatar entry={third} size={42} borderColor="rgba(205, 127, 50, 1)" borderWidth={3} />
              <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(205, 127, 50, 1)', border: '2px solid rgba(166, 100, 40, 1)' }}>
                <span className="text-[#1a1a1a] text-[9px] font-bold">#3</span>
              </div>
            </div>
            <div className="text-center w-full">
              <div className="text-sm font-semibold text-[#f5f5f5] mb-2">{third.username}</div>
              <div
                className="flex flex-col items-center justify-center w-full"
                style={{
                  height: '95px',
                  background: 'linear-gradient(to bottom, rgba(205, 127, 50, 0.9) 0%, rgba(190, 115, 45, 0.7) 15%, rgba(175, 105, 40, 0.5) 30%, rgba(160, 95, 35, 0.3) 45%, rgba(145, 85, 30, 0.15) 60%, transparent 100%)',
                  backdropFilter: 'blur(20px) saturate(180%)',
                  WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                  borderTop: '1px solid rgba(205, 127, 50, 0.5)',
                  borderLeft: '1px solid rgba(205, 127, 50, 0.3)',
                  borderRight: '1px solid rgba(205, 127, 50, 0.3)',
                  borderTopLeftRadius: '16px',
                  borderTopRightRadius: '16px',
                  borderBottomLeftRadius: '0',
                  borderBottomRightRadius: '0',
                  padding: '8px',
                }}
              >
                <div className="w-full space-y-2">
                  <div className="text-center">
                    <div className="text-xs sm:text-sm text-[#f5f5f5]/70 font-medium mb-1">Volume</div>
                    <div className="text-xs sm:text-sm text-[#f5f5f5]">{formatPoints(third.volume)}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs sm:text-sm text-[#f5f5f5]/70 font-medium mb-1">PnL</div>
                    {(() => {
                      const pnlData = formatPercentage(third.pnl, third.volume);
                      return (
                        <div className={`text-xs sm:text-sm ${pnlData.isZero ? 'text-[#f5f5f5]' : pnlData.isPositive ? 'text-green-400' : 'text-red-400'}`}>
                          {pnlData.text}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {entries.length === 2 && <div className="flex-1"></div>}
      </div>
    </div>
  );
};

// Current user bar component
const CurrentUserBar: React.FC<{ entry: LeaderboardEntry; shouldAnimate: boolean; username?: string }> = ({ entry, shouldAnimate, username }) => {
  return (
    <div className="mt-4 mb-2 relative">
      <div
        className="flex items-center gap-4 px-5 py-5 rounded-xl leaderboard-frosted-glass relative overflow-hidden"
        style={{
          borderLeft: '5px solid rgba(74, 144, 184, 0.6)',
          ...(shouldAnimate ? { animation: 'fadeInSlideUp 0.3s ease-out 0.2s both' } : {})
        }}
      >
        <div className="text-lg font-bold min-w-[2rem] relative z-10 text-[#f5f5f5]">{entry.rank}</div>
        <div className="flex-shrink-0 relative z-10">
          <Avatar entry={entry} size={40} borderColor="rgba(74, 144, 184, 0.25)" />
        </div>
        <div className="flex-1 min-w-0 relative z-10">
          <div className="text-base font-semibold text-[#f5f5f5] truncate mb-1" style={{ letterSpacing: '0.3px' }}>
            {username || entry.username}
          </div>
          <div className="text-xs sm:text-sm">
            <div className="text-[#f5f5f5]/60">Volume: <span className="text-[#f5f5f5]">{formatPoints(entry.volume)}</span></div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs sm:text-sm">
            <div className="text-[#f5f5f5]/60">PnL</div>
            {(() => {
              const pnlData = formatPercentage(entry.pnl, entry.volume);
              return (
                <div className={`${pnlData.isZero ? 'text-[#f5f5f5]' : pnlData.isPositive ? 'text-green-400' : 'text-red-400'}`}>
                  {pnlData.text}
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
};

// Rank entry component
const RankEntry: React.FC<{ entry: LeaderboardEntry; index: number; shouldAnimate: boolean }> = ({ entry, index, shouldAnimate }) => {
  return (
    <div
      className="flex items-center gap-4 px-4 py-4 rounded-xl mb-2 leaderboard-frosted-glass hover:bg-white/5 transition-all duration-300"
      style={shouldAnimate ? { animation: `fadeInSlideUp 0.3s ease-out ${0.2 + (index * 0.03)}s both` } : {}}
    >
      <div className="text-xl font-bold text-[#f5f5f5]/40 min-w-[2rem]">{entry.rank}</div>
      <div className="flex-shrink-0">
        <Avatar entry={entry} size={40} borderColor="rgba(255, 255, 255, 0.1)" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-base font-semibold text-[#f5f5f5] truncate mb-1">{entry.username}</div>
        <div className="text-xs sm:text-sm">
          <div className="text-[#f5f5f5]/60">Volume: <span className="text-[#f5f5f5]">{formatPoints(entry.volume)}</span></div>
        </div>
      </div>
      <div className="text-right">
        <div className="text-xs sm:text-sm">
          <div className="text-[#f5f5f5]/60">PnL</div>
          {(() => {
            const pnlData = formatPercentage(entry.pnl, entry.volume);
            return (
              <div className={`${pnlData.isZero ? 'text-[#f5f5f5]' : pnlData.isPositive ? 'text-green-400' : 'text-red-400'}`}>
                {pnlData.text}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
};

const LeaderboardTable: React.FC<LeaderboardTableProps> = ({
  entries,
  topThree,
  restOfEntries,
  currentUserEntry,
  categories,
  categoryFilter,
  onCategoryChange,
  timeFilter,
  onTimeFilterChange,
  loading,
  error,
}) => {
  const { user } = useAuth();
  const location = useLocation();
  const categoryContainerRef = useRef<HTMLDivElement>(null);
  const fixedContainerRef = useRef<HTMLDivElement>(null);
  const [sliderStyle, setSliderStyle] = useState<React.CSSProperties>({
    left: '0px',
    width: '0px',
    opacity: 0,
  });
  const [isInitialized, setIsInitialized] = useState(false);
  const [shouldAnimate, setShouldAnimate] = useState(false);
  const [showLoadingMessage, setShowLoadingMessage] = useState(false);
  const [isTimeFilterOpen, setIsTimeFilterOpen] = useState(false);
  const timeFilterRef = useRef<HTMLDivElement>(null);
  const previousPathRef = useRef<string>('');
  const previousCategoryRef = useRef<string>(categoryFilter);
  const previousLoadingRef = useRef<boolean | null>(null);
  const pendingAnimationRef = useRef<boolean>(true);
  const animationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAnimatingRef = useRef<boolean>(false);

  useEffect(() => {
    const isLeaderboardPage = location.pathname === '/app/leaderboard';
    const wasLeaderboardPage = previousPathRef.current === '/app/leaderboard';

    if (isLeaderboardPage && !wasLeaderboardPage) {
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
        animationTimeoutRef.current = null;
      }
      isAnimatingRef.current = false;
      pendingAnimationRef.current = true;
      previousLoadingRef.current = null;
      queueMicrotask(() => {
        setShouldAnimate(false);
        setShowLoadingMessage(false);
      });
    }

    previousPathRef.current = location.pathname;
  }, [location.pathname]);

  useEffect(() => {
    if (previousCategoryRef.current !== categoryFilter) {
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
        animationTimeoutRef.current = null;
      }
      isAnimatingRef.current = false;
      pendingAnimationRef.current = true;
      previousLoadingRef.current = null;
      previousCategoryRef.current = categoryFilter;
      setIsTimeFilterOpen(false);
      queueMicrotask(() => {
        setShouldAnimate(false);
        setShowLoadingMessage(true);
      });
    }
  }, [categoryFilter]);

  // Close time filter dropdown when time filter changes
  useEffect(() => {
    setIsTimeFilterOpen(false);
  }, [timeFilter]);

  // Close time filter dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (timeFilterRef.current && !timeFilterRef.current.contains(event.target as Node)) {
        setIsTimeFilterOpen(false);
      }
    };

    if (isTimeFilterOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isTimeFilterOpen]);

  useEffect(() => {
    const wasLoading = previousLoadingRef.current;
    const isLoading = loading;

    if (!isLoading && entries.length > 0 && pendingAnimationRef.current) {
      if (wasLoading === null || wasLoading === true) {
        if (!isAnimatingRef.current) {
          pendingAnimationRef.current = false;
          queueMicrotask(() => {
            setShowLoadingMessage(false);
            setShouldAnimate(true);
          });
        }
      } else if (showLoadingMessage) {
        queueMicrotask(() => {
          setShowLoadingMessage(false);
        });
      }
    }

    // Clear loading message when loading finishes but there are no entries
    if (!isLoading && entries.length === 0 && showLoadingMessage) {
      queueMicrotask(() => {
        setShowLoadingMessage(false);
      });
    }

    previousLoadingRef.current = loading;
  }, [loading, entries.length, showLoadingMessage]);

  useEffect(() => {
    if (!shouldAnimate || loading) {
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
        animationTimeoutRef.current = null;
      }
      if (!shouldAnimate) {
        isAnimatingRef.current = false;
      }
      return;
    }

    if (entries.length > 0 && !isAnimatingRef.current) {
      isAnimatingRef.current = true;
      animationTimeoutRef.current = setTimeout(() => {
        setShouldAnimate(false);
        isAnimatingRef.current = false;
        animationTimeoutRef.current = null;
      }, 1200);
    }

    return () => {
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
        animationTimeoutRef.current = null;
      }
    };
  }, [shouldAnimate, entries.length, loading]);

  // Initialize slider on component mount
  useEffect(() => {
    const initializeSlider = () => {
      if (!categoryContainerRef.current) return;

      const container = categoryContainerRef.current;
      const buttons = container.querySelectorAll('button');
      const activeIndex = categories.indexOf(categoryFilter);
      const activeButton = activeIndex >= 0 ? buttons[activeIndex] : buttons[0];
      
      if (!activeButton) return;

      const containerRect = container.getBoundingClientRect();
      const buttonRect = activeButton.getBoundingClientRect();
      
      const left = buttonRect.left - containerRect.left;
      const width = buttonRect.width;

      setSliderStyle({
        left: `${left}px`,
        width: `${width}px`,
        opacity: 1,
      });
      setIsInitialized(true);
    };

    // Multiple attempts to ensure DOM is ready
    const timeouts = [0, 50, 100, 200];
    timeouts.forEach(delay => {
      setTimeout(initializeSlider, delay);
    });
  }, []); // Run only once on mount

  // Update slider position when categoryFilter changes
  useEffect(() => {
    if (!isInitialized) return; // Wait for initialization
    const updateSliderPosition = () => {
      if (!categoryContainerRef.current) return;

      const activeIndex = categories.indexOf(categoryFilter);
      if (activeIndex === -1) return;

      const container = categoryContainerRef.current;
      const buttons = container.querySelectorAll('button');
      const activeButton = buttons[activeIndex] as HTMLElement;
      
      if (!activeButton) return;

      const containerRect = container.getBoundingClientRect();
      const buttonRect = activeButton.getBoundingClientRect();
      
      const left = buttonRect.left - containerRect.left;
      const width = buttonRect.width;

      setSliderStyle({
        left: `${left}px`,
        width: `${width}px`,
        opacity: 1,
      });
    };

    // Use multiple RAF calls and setTimeout to ensure layout is ready
    const rafId = requestAnimationFrame(() => {
      updateSliderPosition();
      // Double RAF to ensure layout is complete
      requestAnimationFrame(() => {
        updateSliderPosition();
        // Additional timeout for insurance
        setTimeout(updateSliderPosition, 50);
      });
    });
    
    // Update on resize
    const handleResize = () => {
      requestAnimationFrame(updateSliderPosition);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
    };
  }, [categoryFilter, isInitialized, categories]);

  if (error) {
    return (
      <div className="text-center py-8">
        <div className="text-red-400 text-sm mb-3">
          Error: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <style>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
      {/* Container for Title, Categories, and Top 3 */}
      <div
        ref={fixedContainerRef}
        className="leaderboard-frosted-glass px-2 pt-2.5 w-full rounded-xl"
        style={{
          borderTopLeftRadius: '0',
          borderTopRightRadius: '0',
          borderBottomLeftRadius: '12px',
          borderBottomRightRadius: '12px',
          overflow: 'visible',
        }}
      >

        {/* Header */}
        <div className="mb-4" style={{ overflow: 'visible' }}>
          <div className="flex items-center justify-between mb-[15px] pr-1" style={{ overflow: 'visible' }}>
            <h1 className="text-2xl font-extralight text-[#f5f5f5] tracking-tight">
              Leaderboard
            </h1>

            {/* Time Filter Dropdown */}
            <div ref={timeFilterRef} className="relative">
              <button
                onClick={() => setIsTimeFilterOpen(!isTimeFilterOpen)}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-normal transition-all whitespace-nowrap rounded-full relative z-10 ${
                  isTimeFilterOpen
                    ? 'text-[#f5f5f5]'
                    : 'text-[#f5f5f5]/50 hover:text-[#f5f5f5]/70'
                }`}
                style={{
                  background: isTimeFilterOpen ? 'rgba(74, 144, 184, 0.15)' : 'transparent',
                  backgroundColor: 'transparent',
                  border: isTimeFilterOpen ? '1px solid rgba(74, 144, 184, 0.3)' : '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                <span>
                  {timeFilter === 'today' ? 'Today' :
                   timeFilter === 'weekly' ? 'This Week' :
                   timeFilter === 'monthly' ? 'This Month' :
                   'All Time'}
                </span>
                <ChevronDown
                  size={12}
                  className={`transition-transform ${isTimeFilterOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {isTimeFilterOpen && (
                <div
                  className="absolute top-full right-0 mt-2 z-50 min-w-[140px] rounded-xl overflow-hidden"
                  style={{
                    background: 'rgba(15, 15, 15, 0.95)',
                    backdropFilter: 'blur(20px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
                  }}
                >
                  {(['all', 'today', 'weekly', 'monthly'] as const).map((option) => {
                    const isSelected = timeFilter === option;
                    return (
                      <button
                        key={option}
                        onClick={() => {
                          onTimeFilterChange(option);
                          setIsTimeFilterOpen(false);
                        }}
                        className={`w-full text-left px-4 py-2.5 text-xs font-normal transition-all ${
                          isSelected
                            ? 'text-[#f5f5f5]'
                            : 'text-[#f5f5f5]/50 hover:text-[#f5f5f5]/70 hover:bg-white/5'
                        }`}
                        style={{
                          background: isSelected ? 'rgba(74, 144, 184, 0.15)' : 'transparent',
                        }}
                      >
                        {option === 'today' ? 'Today' :
                         option === 'weekly' ? 'This Week' :
                         option === 'monthly' ? 'This Month' :
                         'All Time'}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Categories - Horizontal Scrollable */}
          <div className="overflow-x-auto -mx-3 px-3 scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            <div
              ref={categoryContainerRef}
              className="flex gap-2 min-w-max relative"
            >
              {/* Sliding gradient background */}
              <div
                className="absolute top-0 bottom-0 rounded-full pointer-events-none z-0"
                style={{
                  ...sliderStyle,
                  background: 'linear-gradient(90deg, rgba(74, 144, 184, 0.25) 0%, rgba(61, 107, 138, 0.2) 100%)',
                  border: '1px solid rgba(74, 144, 184, 0.3)',
                  boxShadow: '0 0 20px rgba(74, 144, 184, 0.15)',
                  transition: 'left 250ms cubic-bezier(0.4, 0, 0.2, 1), width 250ms cubic-bezier(0.4, 0, 0.2, 1), opacity 150ms ease-in-out',
                  willChange: 'left, width, opacity',
                }}
              />
              {categories.map((category) => {
                const isSelected = categoryFilter === category;
                return (
                  <button
                    key={category}
                    onClick={() => onCategoryChange(category)}
                    className={`px-4 py-2 text-xs font-normal transition-all whitespace-nowrap flex-shrink-0 rounded-full relative z-10 ${
                      isSelected
                        ? 'text-[#f5f5f5]'
                        : 'text-[#f5f5f5]/50 hover:text-[#f5f5f5]/70'
                    }`}
                    style={{
                      background: 'transparent',
                      backgroundColor: 'transparent',
                      border: isSelected ? 'none' : '1px solid rgba(255, 255, 255, 0.08)',
                    }}
                  >
                    {category === 'All' ? 'All Categories' : category}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Top 3 Podium */}
        {(loading || showLoadingMessage) ? (
          <div className="flex items-center justify-center min-h-[40vh] mt-8">
            <div className="text-[#f5f5f5]/60 text-sm font-normal">
              Loading Ranks in {categoryFilter === 'All' ? 'All Categories' : categoryFilter}...
            </div>
          </div>
        ) : (
          topThree.length > 0 && <div className="mt-8"><PodiumView entries={topThree.slice(0, 3)} shouldAnimate={shouldAnimate} /></div>
        )}
      </div>

      {!loading && !showLoadingMessage && (
        <div className="w-full px-3 mt-8">
          {/* Current User's Rank - Show if not in top 3 */}
          {currentUserEntry && currentUserEntry.rank > 3 && (
            <CurrentUserBar entry={currentUserEntry} shouldAnimate={shouldAnimate} username={user?.username} />
          )}

          {/* Rest of Entries */}
          {restOfEntries.length > 0 && (
            <div>
              {restOfEntries.map((entry, index) => (
                <RankEntry key={entry.userId} entry={entry} index={index} shouldAnimate={shouldAnimate} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Show message if no entries and not loading */}
      {!loading && !showLoadingMessage && entries.length === 0 && topThree.length === 0 && restOfEntries.length === 0 && (
        <div className="text-center py-12">
          <div className="text-[#f5f5f5]/60 text-sm">
            No users found
          </div>
        </div>
      )}
    </div>
  );
};

export default LeaderboardTable;


