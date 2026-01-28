import React, { useState, useEffect, useRef, useMemo } from 'react';
import { toast } from 'sonner';
import SwipeableCard from '@features/betting/components/SwipeableCard';
import { useCategoryFilter } from '@shared/contexts/CategoryFilterContext';
import { useAuth, useInfiniteMarkets } from '@shared/hooks';
import type { Market } from '@shared/types';
import { placeBet, skipMarket } from '@shared/services';
import { ApiError } from '@shared/services/api';
import '@/styles/betting/style.css';

// Internal component that manages card state
const CardStack: React.FC<{
  markets: Market[];
  onMarketConsumed: (marketId: string) => void;
  categoryFilter: string; // Track category to reset index on change
  maxHeight?: string;
  loading?: boolean;
  isSmallScreen?: boolean;
}> = ({ markets, onMarketConsumed, categoryFilter, maxHeight, loading = false, isSmallScreen: _isSmallScreen = false }) => {
  const [currentMarketIndex, setCurrentMarketIndex] = useState(0);
  const [screenHeight, setScreenHeight] = useState<number>(window.innerHeight);
  const cardStackRef = useRef<HTMLDivElement>(null);
  const pendingTopMarketIdRef = useRef<string | null>(null);
  const previousCategoryRef = useRef<string>(categoryFilter);
  // Store index per category to avoid resetting when switching categories
  const categoryIndexMapRef = useRef<Map<string, number>>(new Map());
  // Track the last restored category+marketsHash to avoid re-restoring
  const lastRestoredRef = useRef<{ category: string; marketsHash: string } | null>(null);
  const { refetchSilent: refetchUser, user } = useAuth();

  // Prevent race conditions: only allow one bet request at a time
  const isBetInProgressRef = useRef<boolean>(false);

  // Track screen height for responsive card count
  useEffect(() => {
    const updateScreenHeight = () => {
      setScreenHeight(window.innerHeight);
    };
    updateScreenHeight();
    window.addEventListener('resize', updateScreenHeight);
    return () => window.removeEventListener('resize', updateScreenHeight);
  }, []);

  const goToNextMarket = () => {
    setCurrentMarketIndex((prev) => {
      const len = markets.length;
      if (len === 0) return 0;
      return (prev + 1) % len;
    });
  };

  const goToPreviousMarket = () => {
    setCurrentMarketIndex((prev) => {
      const len = markets.length;
      if (len === 0) return 0;
      if (prev <= 0) return 0;
      return prev - 1;
    });
  };

  /**
   * Shared error handler for bet placement failures
   * Handles expired markets, insufficient credits, and generic errors
   */
  const handleBetError = async (
    error: unknown,
    market: { id: string; category?: string },
    amount: number,
    onMarketConsumed: (id: string) => void,
    refetchUser: () => Promise<void>
  ): Promise<void> => {
    const errorMessage = error instanceof Error ? error.message : 'Failed to place bet. Please try again.';

    // Check for specific error types
    const isExpiredMarket = errorMessage.toLowerCase().includes('expired');
    const isEndingSoonInsufficientCredits = errorMessage.toLowerCase().includes('ends soon') ||
      errorMessage.toLowerCase().includes('purchased credits');
    const isInsufficientCredits =
      (error instanceof ApiError && error.statusCode === 400) ||
      errorMessage.toLowerCase().includes('insufficient') ||
      errorMessage.toLowerCase().includes('not enough') ||
      errorMessage.toLowerCase().includes('balance') ||
      errorMessage.toLowerCase().includes('credits');

    if (isExpiredMarket) {
      console.warn('[Bet Error] Market expired:', {
        marketId: market.id.substring(0, 8),
        error: errorMessage
      });
      // Consume the expired market so it doesn't show up again
      onMarketConsumed(market.id);
      toast.error('This market has expired. Moving to next market...');
    } else if (isEndingSoonInsufficientCredits) {
      console.error('[Bet Error] Insufficient purchased credits for ending-soon market:', {
        needed: amount,
        error: errorMessage
      });
      // Refresh user data immediately to show accurate balance
      await refetchUser();
      toast.error('Insufficient purchased credits. Buy more credits to bet on ending soon markets.');
    } else if (isInsufficientCredits) {
      console.error('[Bet Error] Insufficient credits:', {
        needed: amount,
        error: errorMessage
      });
      // Refresh user data immediately to show accurate balance
      await refetchUser();
      toast.error(`Not enough credits to place this bet. Your balance has been refreshed.`);
    } else {
      console.error('[Bet Error]', errorMessage);
      toast.error(errorMessage);
    }
  };

  const handleSwipeLeft = async (marketId: string, amount: number): Promise<boolean> => {
    // Prevent race condition: only allow one bet at a time
    if (isBetInProgressRef.current) {
      console.warn('[Bet Blocked] Another bet is in progress');
      toast.error('Please wait for the previous bet to complete');
      return false;
    }

    const market = markets.find((m) => m.id === marketId);
    if (!market) {
      console.error('[Bet Error] Market not found:', marketId);
      return false;
    }

    try {
      isBetInProgressRef.current = true;
      console.log('[Bet Start] Placing bet:', { marketId: market.id.substring(0, 8), amount });

      // Refresh user credits BEFORE placing bet to ensure we have latest balance
      await refetchUser();

      const response = await placeBet({
        marketId: market.id,
        side: 'this',
        amount,
      });

      // Bet succeeded - consume market and move to next
      const lenBefore = markets.length;
      const expectedNextTopId =
        lenBefore > 1 ? markets[(currentMarketIndex + 1) % lenBefore]?.id ?? null : null;

      goToNextMarket();
      pendingTopMarketIdRef.current = expectedNextTopId;
      onMarketConsumed(market.id);

      // Refresh user credits after bet (silently)
      await refetchUser();

      // P5: Show which wallet was used for the bet
      const walletLabel = response.creditSource === 'purchased' ? 'purchased' : 'free';
      const formattedAmount = amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });

      toast.success(
        `Bet placed! ${formattedAmount} ${walletLabel} credits on THIS`,
        { duration: 3000 }
      );
      return true;
    } catch (error) {
      await handleBetError(error, market, amount, onMarketConsumed, refetchUser);
      return false;
    } finally {
      isBetInProgressRef.current = false;
    }
  };

  const handleSwipeRight = async (marketId: string, amount: number): Promise<boolean> => {
    // Prevent race condition: only allow one bet at a time
    if (isBetInProgressRef.current) {
      console.warn('[Bet Blocked] Another bet is in progress');
      toast.error('Please wait for the previous bet to complete');
      return false;
    }

    const market = markets.find((m) => m.id === marketId);
    if (!market) {
      console.error('[Bet Error] Market not found:', marketId);
      return false;
    }

    try {
      isBetInProgressRef.current = true;
      console.log('[Bet Start] Placing bet:', { marketId: market.id.substring(0, 8), amount });

      // Refresh user credits BEFORE placing bet to ensure we have latest balance
      await refetchUser();

      const response = await placeBet({
        marketId: market.id,
        side: 'that',
        amount,
      });

      // Bet succeeded - consume market and move to next
      const lenBefore = markets.length;
      const expectedNextTopId =
        lenBefore > 1 ? markets[(currentMarketIndex + 1) % lenBefore]?.id ?? null : null;

      goToNextMarket();
      pendingTopMarketIdRef.current = expectedNextTopId;
      onMarketConsumed(market.id);

      // Refresh user credits after bet (silently)
      await refetchUser();

      // P5: Show which wallet was used for the bet
      const walletLabel = response.creditSource === 'purchased' ? 'purchased' : 'free';
      const formattedAmount = amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });

      toast.success(
        `Bet placed! ${formattedAmount} ${walletLabel} credits on THAT`,
        { duration: 3000 }
      );
      return true;
    } catch (error) {
      await handleBetError(error, market, amount, onMarketConsumed, refetchUser);
      return false;
    } finally {
      isBetInProgressRef.current = false;
    }
  };

  const handleSwipeUp = (marketId: string) => {
    // Consume the market locally (instant feedback, removes from buffer)
    onMarketConsumed(marketId);

    // Persist skip to backend (fire-and-forget for better UX)
    // This ensures the market won't appear again for 3 days
    skipMarket(marketId).catch((error) => {
      // Don't show error to user - skip is already applied locally
      // Backend skip just prevents it from appearing on future fetches
      console.warn('[Skip] Failed to persist skip to backend:', error);
    });
  };

  const handleSwipeDown = () => {
    goToPreviousMarket();
  };

  // Save index per category
  useEffect(() => {
    if (categoryFilter && markets.length > 0 && currentMarketIndex >= 0 &&
        previousCategoryRef.current === categoryFilter) {
      const validIndex = Math.min(currentMarketIndex, markets.length - 1);
      categoryIndexMapRef.current.set(categoryFilter, validIndex);
    }
  }, [currentMarketIndex, categoryFilter, markets.length]);

  // Restore index when category changes AND markets are loaded
  useEffect(() => {
    // Only restore if we have markets for the current category
    if (markets.length === 0 || !categoryFilter) return;

    // Create a deterministic hash of ALL visible markets to detect when category's markets change
    const marketsHash = markets.map(m => m.id).join('|');

    // Check if we've already restored for this category+markets combo
    if (lastRestoredRef.current?.category === categoryFilter &&
        lastRestoredRef.current?.marketsHash === marketsHash) {
      return; // Already restored, skip
    }

    // Save previous category's index before switching
    if (previousCategoryRef.current !== categoryFilter && previousCategoryRef.current) {
      const prevIndex = categoryIndexMapRef.current.get(previousCategoryRef.current);
      if (prevIndex !== undefined && prevIndex !== currentMarketIndex) {
        categoryIndexMapRef.current.set(previousCategoryRef.current, currentMarketIndex);
      }
    }

    // Restore index for new category (safely clamped to valid range)
    const savedIndex = categoryIndexMapRef.current.get(categoryFilter) ?? 0;
    const validIndex = Math.min(savedIndex, markets.length - 1);

    // Only update if different from current
    if (validIndex !== currentMarketIndex) {
      setTimeout(() => {
        setCurrentMarketIndex(validIndex);
      }, 0);
    }

    // Mark as restored
    lastRestoredRef.current = { category: categoryFilter, marketsHash };
    previousCategoryRef.current = categoryFilter;
    pendingTopMarketIdRef.current = null;
  }, [categoryFilter, markets, currentMarketIndex]);

  // Clamp index if markets shrink
  useEffect(() => {
    if (markets.length === 0) return;
    if (currentMarketIndex < markets.length) return;

    const timeoutId = window.setTimeout(() => {
      setCurrentMarketIndex(0);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [markets.length, currentMarketIndex]);

  // After consuming a market (or any buffer update), keep the current visible market stable.
  useEffect(() => {
    const pendingId = pendingTopMarketIdRef.current;
    if (!pendingId) return;
    const idx = markets.findIndex((m) => m.id === pendingId);
    pendingTopMarketIdRef.current = null;
    if (idx === -1) return;
    if (idx === currentMarketIndex) return;
    setCurrentMarketIndex(idx);
  }, [markets, currentMarketIndex]);

  // Build visible cards - responsive card count based on screen height
  // <= 667px: 1 card (iPhone SE and smaller), <= 704px: 2 cards, 705-750px: 3 cards, > 750px: 4 cards
  const visibleCards = useMemo(() => {
    if (markets.length === 0) return [];
    const cards: Array<{ index: number; market: Market }> = [];
    let displayCount: number;
    if (screenHeight <= 667) {
      displayCount = 1;
    } else if (screenHeight <= 704) {
      displayCount = 2;
    } else if (screenHeight <= 750) {
      displayCount = 3;
    } else {
      displayCount = 4;
    }
    for (let i = 0; i < displayCount; i++) {
      const marketIdx = (currentMarketIndex + i) % markets.length;
      cards.push({ index: i, market: markets[marketIdx] });
    }
    return cards;
  }, [markets, currentMarketIndex, screenHeight]);

  // Show loading state when loading markets for a category
  if (loading && markets.length === 0) {
    const categoryDisplayName = categoryFilter === 'All' ? 'All Categories' : categoryFilter;
    return (
      <div className="relative w-full max-w-lg mx-auto flex items-center justify-center" style={{ marginTop: '32px', minHeight: '300px' }}>
        <div className="text-center text-[#f5f5f5]/60 text-sm">
          Loading Markets in {categoryDisplayName}...
        </div>
      </div>
    );
  }

  if (markets.length === 0 && !loading) {
    return (
      <div className="relative w-full max-w-lg mx-auto flex items-center justify-center" style={{ marginTop: '32px', minHeight: '300px' }}>
        <div className="text-center text-[#f5f5f5]/60">
          <div className="text-lg mb-2">No more markets available</div>
          <div className="text-sm">Check back later for new markets!</div>
        </div>
      </div>
    );
  }

  // Responsive margins based on card stack count
  // <= 667px: 1 card, <= 704px: 2 cards, 705-750px: 3 cards, > 750px: 4 cards
  let stackMarginTop: string;
  let baseBottomMargin: number;
  if (screenHeight <= 667) {
    stackMarginTop = '-5px';
    baseBottomMargin = 40;
  } else if (screenHeight <= 704) {
    stackMarginTop = '20px';
    baseBottomMargin = 35;
  } else if (screenHeight <= 750) {
    stackMarginTop = '28px';
    baseBottomMargin = 30;
  } else {
    stackMarginTop = '44px';
    baseBottomMargin = 20;
  }
  const bottomScaleFactor = Math.max(0, (screenHeight - 600) / 600);
  const stackMarginBottom = `${baseBottomMargin + (bottomScaleFactor * 20)}px`;

  return (
    <div
      ref={cardStackRef}
      className="relative w-full max-w-full mx-auto betting-card-stack"
      style={{
        marginTop: stackMarginTop,
        marginBottom: stackMarginBottom,
        maxHeight: maxHeight,
        overflow: 'visible',
        zIndex: 10,
      }}
    >
      {visibleCards.map(({ index, market }) => (
        <SwipeableCard
          key={`${market.id}-${index}`}
          market={market}
          index={index}
          totalCards={visibleCards.length}
          onSwipeLeft={async (amount) => handleSwipeLeft(market.id, amount)}
          onSwipeRight={async (amount) => handleSwipeRight(market.id, amount)}
          onSwipeUp={() => handleSwipeUp(market.id)}
          onSwipeDown={handleSwipeDown}
          isActive={index === 0}
          canSwipeDown={currentMarketIndex > 0}
        />
      ))}
    </div>
  );
};

const BettingPage: React.FC = () => {
  const [activeFilter, setActiveFilter] = useState<'ending_soon' | 'popular' | undefined>(undefined);
  const { selectedCategory: categoryFilter, setSelectedCategory: setCategoryFilter, categories, loading: categoriesLoading } = useCategoryFilter();
  const { markets, loading, error, consumeMarket } = useInfiniteMarkets({
    category: categoryFilter === 'All' ? undefined : categoryFilter,
    status: 'open',
    filter: activeFilter, // NEW
    batchSize: 20,  // Increased from 5 for better performance (payment-system optimization)
    prefetchThreshold: 8,  // Increased from 2 for smoother UX (payment-system optimization)
  });

  const categoryContainerRef = useRef<HTMLDivElement>(null);
  const filterContainerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const [cardStackMaxHeight, setCardStackMaxHeight] = useState<string | undefined>(undefined);
  const [isSmallScreen, setIsSmallScreen] = useState(false);
  const [sliderStyle, setSliderStyle] = useState<React.CSSProperties>({
    left: '0px',
    width: '0px',
    opacity: 0,
  });
  const [filterSliderStyle, setFilterSliderStyle] = useState<React.CSSProperties>({
    left: '0px',
    width: '0px',
    opacity: 0,
  });
  const [isSliderInitialized, setIsSliderInitialized] = useState(false);

  // Initialize slider when categories are loaded (handles navigation from other pages)
  useEffect(() => {
    // Don't initialize if categories are still loading
    if (categoriesLoading || categories.length === 0) return;

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
      setIsSliderInitialized(true);
    };

    // Multiple attempts to ensure DOM is ready (especially important when navigating from other pages)
    const timeouts = [0, 50, 100, 200];
    const timeoutIds = timeouts.map(delay => setTimeout(initializeSlider, delay));

    return () => {
      timeoutIds.forEach(id => clearTimeout(id));
    };
  }, [categories, categoryFilter, categoriesLoading]);

  // Update slider position when categoryFilter changes
  useEffect(() => {
    // Don't update if categories are still loading
    if (categoriesLoading || categories.length === 0) return;

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

      // Also mark as initialized if it wasn't already (fallback)
      if (!isSliderInitialized) {
        setIsSliderInitialized(true);
      }
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
  }, [categoryFilter, isSliderInitialized, categories, categoriesLoading]);

  // Update filter slider position when activeFilter changes
  useEffect(() => {
    const updateFilterSlider = () => {
      if (!filterContainerRef.current) return;

      // If no filter is active, hide the slider
      if (!activeFilter) {
        setFilterSliderStyle({
          left: '0px',
          width: '0px',
          opacity: 0,
        });
        return;
      }

      const container = filterContainerRef.current;
      const buttons = container.querySelectorAll('button');
      const activeIndex = activeFilter === 'ending_soon' ? 0 : 1;
      const activeButton = buttons[activeIndex] as HTMLElement;

      if (!activeButton) return;

      const containerRect = container.getBoundingClientRect();
      const buttonRect = activeButton.getBoundingClientRect();

      const left = buttonRect.left - containerRect.left;
      const width = buttonRect.width;

      setFilterSliderStyle({
        left: `${left}px`,
        width: `${width}px`,
        opacity: 1,
      });
    };

    // Use RAF to ensure layout is ready
    const rafId = requestAnimationFrame(() => {
      updateFilterSlider();
      requestAnimationFrame(updateFilterSlider);
    });

    // Update on resize
    const handleResize = () => {
      requestAnimationFrame(updateFilterSlider);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
    };
  }, [activeFilter]);

  // Track screen size
  useEffect(() => {
    const checkScreenSize = () => {
      setIsSmallScreen(window.innerHeight < 600);
    };
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  // Calculate available height for card stack
  // The card will size naturally, but we set a maxHeight to prevent overflow
  // CSS margin-bottom handles the space between card and navbar
  useEffect(() => {
    const calculateCardHeight = () => {
      if (!headerRef.current) return;

      // Find the bottom navigation bar
      const bottomNav = document.querySelector('.app-layout-navigation');
      const bottomNavTop = bottomNav ? bottomNav.getBoundingClientRect().top : window.innerHeight;

      // Measure header bottom position (end of title and categories)
      const headerBottom = headerRef.current.getBoundingClientRect().bottom;

      // Card stack margin from header
      const cardStackMarginTop = isSmallScreen ? 15 : 30;

      // Calculate proportional bottom margin (same as CSS rules)
      const screenHeight = window.innerHeight;
      const baseMargin = 20;
      const scaleFactor = Math.max(0, (screenHeight - 600) / 600);
      const bottomMargin = baseMargin + (scaleFactor * 20);

      // Available height is from header to navbar, minus top margin and bottom margin
      const availableHeight = bottomNavTop - headerBottom - cardStackMarginTop - bottomMargin;

      // Ensure minimum height for usability
      const minHeight = isSmallScreen ? 280 : 320;
      const calculatedHeight = Math.max(minHeight, availableHeight);

      setCardStackMaxHeight(`${calculatedHeight}px`);
    };

    // Calculate on mount and resize
    calculateCardHeight();
    window.addEventListener('resize', calculateCardHeight);

    // Also recalculate on orientation change for mobile devices
    window.addEventListener('orientationchange', () => {
      setTimeout(calculateCardHeight, 100);
    });

    // Recalculate when categories change (header height might change)
    const timeoutId = setTimeout(calculateCardHeight, 100);

    return () => {
      window.removeEventListener('resize', calculateCardHeight);
      clearTimeout(timeoutId);
    };
  }, [categoryFilter, categories, isSmallScreen]);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevBodyOverscroll = document.body.style.overscrollBehavior;
    const prevHtmlOverscroll = document.documentElement.style.overscrollBehavior;
    document.body.style.overflow = 'hidden';
    // Avoid pull-to-refresh / scroll-chaining "reload flashes" during swipes.
    document.body.style.overscrollBehavior = 'none';
    document.documentElement.style.overscrollBehavior = 'none';
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.overscrollBehavior = prevBodyOverscroll;
      document.documentElement.style.overscrollBehavior = prevHtmlOverscroll;
    };
  }, []);

  // Reset category to default when user leaves the betting page
  useEffect(() => {
    return () => {
      setCategoryFilter('All');
    };
  }, [setCategoryFilter]);

  // Show loading state only on very first page load (when we have no markets yet and categories are loading)
  if (categoriesLoading && markets.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-[#f5f5f5]/60 text-sm font-normal">
          Loading categories...
        </div>
      </div>
    );
  }

  // Show error state only on initial page load
  if (error && markets.length === 0 && !loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-3">
        <div className="text-center">
          <div className="text-red-400 mb-3 text-sm">⚠️ {error}</div>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 text-sm text-white rounded-lg font-medium"
            style={{
              background: 'rgba(74, 144, 184, 0.15)',
              border: '1px solid rgba(74, 144, 184, 0.4)',
              backdropFilter: 'blur(8px)'
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-start py-3 relative betting-page-container" style={{ height: '100%', overflow: 'visible', maxHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Hide webkit scrollbar */}
      <style>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>

      {/* Header with Title and Categories */}
      <div ref={headerRef} className="w-full mb-4 relative z-0">
        <div className="flex items-center justify-between mb-[15px]">
          <h1 className="text-2xl font-extralight text-[#f5f5f5] tracking-tight">
            Predictions
          </h1>

          {/* Sort/Filter options - top right */}
          <div ref={filterContainerRef} className="flex items-end gap-1.5 relative">
            {/* Sliding glass background for filters */}
            <div
              className="absolute top-0 bottom-0 rounded pointer-events-none"
              style={{
                ...filterSliderStyle,
                background: 'rgba(74, 144, 184, 0.15)',
                border: '1px solid rgba(74, 144, 184, 0.4)',
                backdropFilter: 'blur(8px)',
                transition: 'left 200ms cubic-bezier(0.4, 0, 0.2, 1), width 200ms cubic-bezier(0.4, 0, 0.2, 1), opacity 200ms ease-in-out',
                willChange: 'left, width, opacity',
              }}
            />
            <button
              onClick={() => setActiveFilter(activeFilter === 'ending_soon' ? undefined : 'ending_soon')}
              className={`px-2 py-1 text-[9px] rounded transition-colors duration-200 flex items-center gap-1 relative z-10 ${
                activeFilter === 'ending_soon'
                  ? 'text-[#f5f5f5]'
                  : 'text-[#f5f5f5]/40 hover:text-[#f5f5f5]/60'
              }`}
              style={{
                border: activeFilter === 'ending_soon' ? 'none' : '1px solid rgba(255, 255, 255, 0.1)',
              }}
            >
              Ending Soon
              {activeFilter === 'ending_soon' && (
                <span className="text-[#f5f5f5]/50 text-[8px]">✕</span>
              )}
            </button>
            <button
              onClick={() => setActiveFilter(activeFilter === 'popular' ? undefined : 'popular')}
              className={`px-2 py-1 text-[9px] rounded transition-colors duration-200 flex items-center gap-1 relative z-10 ${
                activeFilter === 'popular'
                  ? 'text-[#f5f5f5]'
                  : 'text-[#f5f5f5]/40 hover:text-[#f5f5f5]/60'
              }`}
              style={{
                border: activeFilter === 'popular' ? 'none' : '1px solid rgba(255, 255, 255, 0.1)',
              }}
            >
              Popular
              {activeFilter === 'popular' && (
                <span className="text-[#f5f5f5]/50 text-[8px]">✕</span>
              )}
            </button>
          </div>
        </div>

        {/* Category Filter - Horizontal Scrollable */}
        <div className="overflow-x-auto scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          <div
            ref={categoryContainerRef}
            className="flex gap-2 min-w-max relative items-center z-0"
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
                  onClick={() => setCategoryFilter(category)}
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

      {/* Card stack - always mounted to preserve state during category switches */}
      <CardStack
        markets={markets}
        onMarketConsumed={consumeMarket}
        categoryFilter={categoryFilter}
        maxHeight={cardStackMaxHeight}
        loading={loading}
        isSmallScreen={isSmallScreen}
      />
    </div>
  );
};

export default BettingPage;
