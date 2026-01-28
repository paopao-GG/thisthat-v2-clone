import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { type UserPosition } from '@shared/services';
import { fetchMarketById, placeBet, sellPosition, fetchLiveOdds } from '@shared/services';
import { useAuth, usePriceHistory, timeFilterToInterval } from '@shared/hooks';
import type { Market } from '@shared/types';
import '@/styles/profile/style.css';

interface PositionDetailModalProps {
  position: UserPosition;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void; // Callback to refresh positions after buy/sell
  onPositionSold?: (positionId: string) => void; // Callback to immediately remove sold position
}

// Distribution Chart Component (THIS vs THAT)
// Uses real Polymarket price history data - Crypto trading style
interface DistributionChartProps {
  thisHistory: Array<{ timestamp: number; price: number }>;
  thatHistory: Array<{ timestamp: number; price: number }>;
  thisOption: string;
  thatOption: string;
  currentThisPercent: number;
  currentThatPercent: number;
  loading?: boolean;
  timeFilter: '1H' | '6H' | '1D' | 'ALL';
  onTimeFilterChange: (filter: '1H' | '6H' | '1D' | 'ALL') => void;
}

const DistributionChart: React.FC<DistributionChartProps> = ({
  thisHistory,
  thatHistory,
  thisOption,
  thatOption,
  currentThisPercent,
  currentThatPercent,
  loading,
  timeFilter,
  onTimeFilterChange,
}) => {
  const timeFilterRef = useRef<HTMLDivElement>(null);
  const [timeFilterSliderStyle, setTimeFilterSliderStyle] = useState<React.CSSProperties>({});

  // Update slider position when timeFilter changes
  useEffect(() => {
    if (!timeFilterRef.current) return;
    const filterOrder: ('1H' | '6H' | '1D' | 'ALL')[] = ['1H', '6H', '1D', 'ALL'];
    const activeIndex = filterOrder.indexOf(timeFilter);
    const buttons = timeFilterRef.current.querySelectorAll('button');
    const activeButton = buttons[activeIndex] as HTMLElement;
    if (activeButton) {
      setTimeFilterSliderStyle({
        left: `${activeButton.offsetLeft}px`,
        width: `${activeButton.offsetWidth}px`,
      });
    }
  }, [timeFilter]);

  const width = 200;
  const height = 80;
  const topMargin = 5;
  const bottomMargin = 5;
  const chartHeight = height - topMargin - bottomMargin;

  // Convert price history to graph coordinates
  // Price is 0-1 representing probability, we map 0-100% to chart height
  const thisPoints: Array<{ x: number; y: number }> = [];
  const thatPoints: Array<{ x: number; y: number }> = [];

  const dataLength = Math.max(thisHistory.length, thatHistory.length);

  if (dataLength > 0) {
    for (let i = 0; i < dataLength; i++) {
      const thisPoint = thisHistory[Math.min(i, thisHistory.length - 1)];
      const thatPoint = thatHistory[Math.min(i, thatHistory.length - 1)];

      // Price is already 0-1, convert to percentage (0-100)
      const thisPercent = (thisPoint?.price ?? 0.5) * 100;
      const thatPercent = (thatPoint?.price ?? 0.5) * 100;

      // Map to graph coordinates (x = time, y = inverted percentage: 100% at top, 0% at bottom)
      const x = dataLength > 1 ? (i / (dataLength - 1)) * width : width;
      const thisY = topMargin + (chartHeight * (100 - thisPercent) / 100);
      const thatY = topMargin + (chartHeight * (100 - thatPercent) / 100);

      thisPoints.push({ x, y: thisY });
      thatPoints.push({ x, y: thatY });
    }
  }

  // Ensure first point is always at x=0 for full width display
  if (thisPoints.length > 0) {
    if (thisPoints[0].x !== 0) {
      thisPoints.unshift({ x: 0, y: thisPoints[0].y });
      thatPoints.unshift({ x: 0, y: thatPoints[0].y });
    }
  }

  // Ensure last point is at x=width for full width display
  if (thisPoints.length > 0) {
    if (thisPoints[thisPoints.length - 1].x !== width) {
      thisPoints.push({ x: width, y: thisPoints[thisPoints.length - 1].y });
      thatPoints.push({ x: width, y: thatPoints[thatPoints.length - 1].y });
    }
  }

  // Show loading state
  if (loading) {
    return (
      <div className="w-full">
        {/* Live prices display placeholder */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-baseline gap-1.5">
            <span className="text-base sm:text-lg font-medium text-[#4ade80]">--.--%</span>
            <span className="text-[10px] sm:text-xs text-[#f5f5f5]/30">{thisOption}</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[10px] sm:text-xs text-[#f5f5f5]/30">{thatOption}</span>
            <span className="text-base sm:text-lg font-medium text-[#f87171]">--.--%</span>
          </div>
        </div>
        {/* Chart container */}
        <div className="rounded-xl overflow-hidden"
          style={{
            background: 'linear-gradient(180deg, rgba(0, 0, 0, 0.3) 0%, rgba(0, 0, 0, 0.5) 100%)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          {/* Time filter tabs */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-[#f5f5f5]/5">
            <div ref={timeFilterRef} className="flex gap-0.5 relative">
              {(['1H', '6H', '1D', 'ALL'] as const).map((filter) => (
                <button
                  key={filter}
                  className={`py-1.5 px-2.5 text-[10px] font-medium rounded relative z-10 ${
                    timeFilter === filter
                      ? 'text-[#f5f5f5]'
                      : 'text-[#f5f5f5]/40'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>
          <div className="p-3 h-32 sm:h-36 flex items-center justify-center" style={{ background: '#0d1117' }}>
            <span className="text-xs text-[#f5f5f5]/50">Loading chart...</span>
          </div>
        </div>
      </div>
    );
  }

  // Create smooth bezier curve path using Catmull-Rom splines
  const createSmoothPath = (pts: Array<{x: number, y: number}>) => {
    if (pts.length < 2) return '';

    let path = `M ${pts[0].x},${pts[0].y}`;

    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];

      const tension = 0.4;
      const cp1x = p1.x + (p2.x - p0.x) * tension;
      const cp1y = p1.y + (p2.y - p0.y) * tension;
      const cp2x = p2.x - (p3.x - p1.x) * tension;
      const cp2y = p2.y - (p3.y - p1.y) * tension;

      path += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
    }

    return path;
  };

  // Find min/max for each line to normalize display
  let thisMin = 1, thisMax = 0, thatMin = 1, thatMax = 0;
  thisHistory.forEach((h) => {
    thisMin = Math.min(thisMin, h.price);
    thisMax = Math.max(thisMax, h.price);
  });
  thatHistory.forEach((h) => {
    thatMin = Math.min(thatMin, h.price);
    thatMax = Math.max(thatMax, h.price);
  });

  // Add padding to ranges (at least 1% range)
  const thisRange = Math.max(thisMax - thisMin, 0.01);
  const thatRange = Math.max(thatMax - thatMin, 0.01);

  // Split chart: THIS in top half, THAT in bottom half
  const topHalfHeight = chartHeight / 2 - 3;
  const bottomHalfStart = height / 2 + 3;

  // Generate points for THIS line (top half)
  const thisLinePoints: Array<{x: number, y: number}> = [];
  // Generate points for THAT line (bottom half)
  const thatLinePoints: Array<{x: number, y: number}> = [];

  for (let i = 0; i < dataLength; i++) {
    const thisProb = thisHistory[Math.min(i, thisHistory.length - 1)]?.price ?? 0.5;
    const thatProb = thatHistory[Math.min(i, thatHistory.length - 1)]?.price ?? 0.5;

    const x = dataLength > 1 ? (i / (dataLength - 1)) * width : width;

    // THIS in top half (normalized within its own range)
    const thisNorm = (thisProb - thisMin) / thisRange;
    const thisY = topMargin + topHalfHeight - (thisNorm * topHalfHeight);
    thisLinePoints.push({ x, y: thisY });

    // THAT in bottom half (normalized within its own range)
    const thatNorm = (thatProb - thatMin) / thatRange;
    const thatY = bottomHalfStart + topHalfHeight - (thatNorm * topHalfHeight);
    thatLinePoints.push({ x, y: thatY });
  }

  const thisLinePath = createSmoothPath(thisLinePoints);
  const thatLinePath = createSmoothPath(thatLinePoints);

  return (
    <div className="w-full">
      {/* Live prices display */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-baseline gap-1.5">
          <span className="text-base sm:text-lg font-medium text-[#4ade80]">{currentThisPercent.toFixed(2)}%</span>
          <span className="text-[10px] sm:text-xs text-[#f5f5f5]/30">{thisOption}</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-[10px] sm:text-xs text-[#f5f5f5]/30">{thatOption}</span>
          <span className="text-base sm:text-lg font-medium text-[#f87171]">{currentThatPercent.toFixed(2)}%</span>
        </div>
      </div>

      {/* Chart container */}
      <div className="rounded-xl overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, rgba(0, 0, 0, 0.3) 0%, rgba(0, 0, 0, 0.5) 100%)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
        }}
      >
        {/* Time filter tabs */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-[#f5f5f5]/5">
          <div ref={timeFilterRef} className="flex gap-0.5 relative">
            {/* Sliding pill background */}
            <div
              className="absolute top-0 bottom-0 rounded pointer-events-none z-0"
              style={{
                ...timeFilterSliderStyle,
                background: 'rgba(74, 144, 184, 0.15)',
                border: '1px solid rgba(74, 144, 184, 0.4)',
                backdropFilter: 'blur(8px)',
                transition: 'left 200ms cubic-bezier(0.4, 0, 0.2, 1), width 200ms cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            />
            {(['1H', '6H', '1D', 'ALL'] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => onTimeFilterChange(filter)}
                className={`py-1.5 px-2.5 text-[10px] font-medium transition-colors rounded relative z-10 ${
                  timeFilter === filter
                    ? 'text-[#f5f5f5]'
                    : 'text-[#f5f5f5]/40 hover:text-[#f5f5f5]/60'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>

        {/* Chart - Line Graph: THIS on top, THAT on bottom */}
        <div className="p-3" style={{ background: '#0d1117' }}>
          <div className="h-32 sm:h-36 w-full relative">
            <svg className="w-full h-full" viewBox="0 0 200 80" preserveAspectRatio="none">
              {/* THIS line (green) - top half */}
              <path
                d={thisLinePath}
                fill="none"
                stroke="#4ade80"
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
              />

              {/* THAT line (red) - bottom half */}
              <path
                d={thatLinePath}
                fill="none"
                stroke="#f87171"
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
};

const PositionDetailModal: React.FC<PositionDetailModalProps> = ({
  position,
  isOpen,
  onClose,
  onUpdate,
  onPositionSold,
}) => {
  const { user } = useAuth();
  const [market, setMarket] = useState<Market | null>(null);
  const [loading, setLoading] = useState(true);
  const [isBuying, setIsBuying] = useState(false);
  const [isSelling, setIsSelling] = useState(false);
  const [buyAmount, setBuyAmount] = useState(100);
  const [draftBuyAmount, setDraftBuyAmount] = useState('100');
  const [selectedSide, setSelectedSide] = useState<'this' | 'that'>(position.side);
  const [activeMode, setActiveMode] = useState<'buy' | 'sell'>('buy');
  const scrollYRef = useRef<number>(0);

  // Local state for live odds (polled every 10 seconds)
  const [liveOdds, setLiveOdds] = useState<{
    thisOdds: number;
    thatOdds: number;
    isServiceDown?: boolean;
  } | null>(null);

  // For ending soon markets, only purchased credits can be used
  // For regular markets, only free credits can be used
  const isEndingSoon = market?.isEndingSoon ?? false;
  const maxCredits = isEndingSoon
    ? (user?.purchasedCreditsBalance || 0)
    : (user?.freeCreditsBalance || 0);

  // Helper to format input with commas while typing
  const formatWithCommas = (value: string, allowDecimal = true): string => {
    if (allowDecimal) {
      const cleaned = value.replace(/,/g, '').replace(/[^0-9.]/g, '');
      const parts = cleaned.split('.');
      if (parts.length > 2) return formatWithCommas(parts[0] + '.' + parts.slice(1).join(''), true);
      const intPart = parts[0] ? parseInt(parts[0], 10).toLocaleString() : '0';
      if (parts.length === 2) {
        return intPart + '.' + parts[1].slice(0, 2);
      }
      if (cleaned.endsWith('.')) {
        return intPart + '.';
      }
      return intPart === '0' && !parts[0] ? '' : intPart;
    }
    const numericValue = value.replace(/,/g, '').replace(/[^0-9]/g, '');
    if (!numericValue) return '';
    return parseInt(numericValue, 10).toLocaleString();
  };

  // Parse draft amount to number
  const parseDraftAmount = (draft: string): number => {
    const numericValue = draft.replace(/,/g, '').replace(/[^0-9.]/g, '');
    if (!numericValue) return 0;
    const value = parseFloat(numericValue);
    return Number.isFinite(value) ? value : 0;
  };

  // Use local polled live odds first, then position props, then market odds
  const displayOdds = {
    thisOdds: liveOdds?.thisOdds ?? position.liveOdds?.thisOdds ?? market?.thisOdds ?? 0.5,
    thatOdds: liveOdds?.thatOdds ?? position.liveOdds?.thatOdds ?? market?.thatOdds ?? 0.5,
  };

  // Check if Polymarket is down from local state or position data
  const tradingDisabled = liveOdds?.isServiceDown || position.isServiceDown || false;
  
  const thisOdds = displayOdds.thisOdds;
  const thatOdds = displayOdds.thatOdds;

  // Convert prices (0-1 probabilities) to percentages for display
  // Backend returns prices directly as probabilities, not odds
  const thisOddsPercent = thisOdds * 100;
  const thatOddsPercent = thatOdds * 100;

  // liveOdds from backend are already probabilities (0-1)
  // Position Value = shares × current odds
  // PnL = (current odds - avg price) × shares
  const currentOdds = position.side === 'this' ? thisOdds : thatOdds;
  const currentValue = position.shares * currentOdds;
  const currentPnl = (currentOdds - position.avgPrice) * position.shares;
  const currentPnlPercent = position.avgPrice > 0 ? ((currentOdds - position.avgPrice) / position.avgPrice) * 100 : 0;
  const hasMarketData = market !== null;

  // Time filter state
  const [timeFilter, setTimeFilter] = useState<'1H' | '6H' | '1D' | 'ALL'>('ALL');

  // P1: Fetch real price history from Polymarket CLOB API
  const priceInterval = timeFilterToInterval[timeFilter] || '1d';
  const { history: thisHistory, loading: thisLoading } = usePriceHistory(
    position.marketId,
    priceInterval,
    'this',
    isOpen
  );
  const { history: thatHistory, loading: thatLoading } = usePriceHistory(
    position.marketId,
    priceInterval,
    'that',
    isOpen
  );
  const priceHistoryLoading = thisLoading || thatLoading;

  // Poll live odds every 10 seconds when modal is open
  useEffect(() => {
    if (!isOpen || !position.marketId) return;

    // Fetch live odds immediately on mount
    const fetchOdds = async () => {
      try {
        const odds = await fetchLiveOdds(position.marketId);
        setLiveOdds({
          thisOdds: odds.thisOdds,
          thatOdds: odds.thatOdds,
          isServiceDown: odds.isServiceDown,
        });
      } catch (error) {
        console.warn('Failed to fetch live odds:', error);
      }
    };

    // Initial fetch
    void fetchOdds();

    // Set up polling interval
    const interval = setInterval(fetchOdds, 10000); // 10 seconds

    return () => {
      clearInterval(interval);
      setLiveOdds(null); // Reset on close
    };
  }, [isOpen, position.marketId]);

  // Disable body scrolling when modal is open
  useEffect(() => {
    if (isOpen) {
      // Save current scroll position
      scrollYRef.current = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollYRef.current}px`;
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';
      
      return () => {
        // Restore scrolling
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        document.body.style.overflow = '';
        window.scrollTo(0, scrollYRef.current);
      };
    }
  }, [isOpen]);

  // Fetch market details when modal opens or position changes
  useEffect(() => {
    const loadMarketDetails = async () => {
      try {
        setLoading(true);
        const marketData = await fetchMarketById(position.marketId);
        setMarket(marketData);
      } catch (error) {
        console.error('Failed to load market details:', error);
        toast.error('Failed to load market details');
      } finally {
        setLoading(false);
      }
    };

    if (isOpen && position.marketId) {
      loadMarketDetails();
    }
  }, [isOpen, position.marketId, position.shares, position.value]); // Re-fetch when position data changes

  const handleBuyMore = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    // Parse the draft amount in case user didn't blur
    const amount = parseDraftAmount(draftBuyAmount);
    const clampedAmount = Math.min(Math.max(amount, 0), maxCredits);
    setBuyAmount(clampedAmount);

    if (clampedAmount === 0 || clampedAmount > maxCredits) {
      return;
    }

    try {
      setIsBuying(true);

      await placeBet({
        marketId: position.marketId,
        side: selectedSide,
        amount: clampedAmount,
      });

      const formattedAmount = clampedAmount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });

      toast.success(
        `Bet placed! ${formattedAmount} credits on ${selectedSide.toUpperCase()}`,
        { duration: 4000 }
      );
      
      // Refresh market data to get updated odds after a short delay
      if (position.marketId) {
        setTimeout(async () => {
          try {
            const updatedMarket = await fetchMarketById(position.marketId);
            setMarket(updatedMarket);
          } catch {
            // Silently fail - odds will update on next poll
          }
        }, 500); // 500ms delay to allow backend to process
      }
      
      // Close modal immediately
      onClose();
      
      setTimeout(() => {
        onUpdate();
      }, 150);
    } catch (error) {
      console.error('Failed to buy more:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to place bet';

      // Close modal first so user can see the toast
      onClose();

      // Check if it's an insufficient credits error
      if (errorMessage.toLowerCase().includes('insufficient credits') || errorMessage.toLowerCase().includes('insufficient balance')) {
        toast.error('Insufficient credits. You need more credits to place this bet.');
      } else {
        toast.error(errorMessage);
      }
    } finally {
      setIsBuying(false);
    }
  };

  const handleSellPosition = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    try {
      setIsSelling(true);
      
      // Get all bet IDs to sell (for aggregated positions)
      const betIdsToSell = position.betIds && position.betIds.length > 0 
        ? position.betIds 
        : [position.id];
      
      let totalCreditsReceived = 0;
      let totalPriceImpact = 0;
      const successfulSells: string[] = [];
      const failedSells: string[] = [];

      // Sell all bets in the position, tracking success/failure
      for (const betId of betIdsToSell) {
        try {
          const result = await sellPosition(betId);
          const credits = Number(result.creditsReceived) || 0;
          const impact = Number(result.priceImpact) || 0;
          totalCreditsReceived += credits;
          totalPriceImpact += impact;
          successfulSells.push(betId);
        } catch (error) {
          console.error(`Failed to sell bet ${betId}:`, error);
          failedSells.push(betId);
        }
      }

      // Show appropriate message based on results
      if (failedSells.length === 0) {
        const formattedCredits = Math.round(totalCreditsReceived).toLocaleString();
        toast.success(
          `Position sold! Received ${formattedCredits} credits`
        );
        
        // Immediately remove the sold position from the list (optimistic update)
        if (onPositionSold) {
          onPositionSold(position.id);
        }
      } else if (successfulSells.length > 0) {
        // Partial success
        const formattedCredits = Math.round(totalCreditsReceived).toLocaleString();
        toast.error(
          `Sold ${successfulSells.length} of ${betIdsToSell.length} positions. Received ${formattedCredits} credits.`,
          { duration: 5000 }
        );
        
        // Remove successfully sold positions immediately
        if (onPositionSold) {
          successfulSells.forEach(betId => onPositionSold(betId));
        }
      } else {
        // All failed
        toast.error('Failed to sell position. Please try again.');
      }
      
      // Close modal immediately
      onClose();
      
      // Refresh data after modal is closed (non-blocking, with delay to ensure modal is fully closed)
      setTimeout(() => {
        onUpdate();
      }, 150);
    } catch (error) {
      console.error('Failed to sell position:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to sell position';
      toast.error(errorMessage);
    } finally {
      setIsSelling(false);
      setActiveMode('buy');
    }
  };

  if (!isOpen) return null;

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(date);
  };

  const getTimeRemaining = () => {
    if (!market) return '';
    const now = new Date();
    const diff = market.expiryDate.getTime() - now.getTime();
    if (diff < 0) return 'Expired';
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    return `${days}d ${hours}h`;
  };

  return createPortal(
    (
      <div
        className="fixed inset-0 flex items-center justify-center z-[200] referral-modal-overlay"
        onClick={(e) => {
          // Only close if clicking the overlay itself, not children
          if (e.target === e.currentTarget) {
            const scrollY = window.scrollY;
            onClose();
            // Restore scroll position after modal closes
            requestAnimationFrame(() => {
              window.scrollTo(0, scrollY);
            });
          }
        }}
      >
        <div
          className="relative w-full max-w-2xl overflow-y-auto p-4 backdrop-blur-sm animate-slideDown referral-modal"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1 pr-3">
              <h2 className="text-lg font-semibold text-[#f5f5f5] mb-2">
                {market?.title || 'Loading...'}
              </h2>
              {market && (
                <div className="text-xs text-[#f5f5f5]/60">
                  <div className="mb-1">
                    Category:{' '}
                    <span className="text-[#f5f5f5]/70 capitalize">
                      {market.category}
                    </span>
                  </div>
                  <div>
                    Expires: {formatDate(market.expiryDate)} •{' '}
                    <span
                      style={{
                        background: 'linear-gradient(135deg, #4A90B8 0%, #3D6B8A 100%)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                      }}
                    >
                      {getTimeRemaining()}
                    </span>
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onClose();
              }}
              className="text-[#f5f5f5]/60 hover:text-[#f5f5f5] transition-colors flex-shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {loading ? (
            <div className="text-center py-8 text-sm text-[#f5f5f5]/60">Loading market details...</div>
          ) : (
            <>
              {/* Your Position */}
              <div className="mb-4 sm:mb-6">
                <h3 className="text-xs sm:text-sm font-semibold text-[#f5f5f5] mb-2">
                  Your Position
                  {!hasMarketData && (
                    <span className="ml-2 text-xs text-yellow-500/80 font-normal">
                      (estimated value)
                    </span>
                  )}
                </h3>
                <div className="grid grid-cols-2 gap-2 sm:gap-4 p-3 sm:p-4 position-detail-your-position-card">
                  <div>
                    <div className="text-xs text-[#f5f5f5]/50 mb-1">Side</div>
                    <div className={`text-xs sm:text-sm font-medium ${
                      position.side === 'this' 
                        ? 'positions-prediction-yes positions-prediction-this' 
                        : 'positions-prediction-no positions-prediction-that'
                    }`}>
                      {position.side.toUpperCase()}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-[#f5f5f5]/50 mb-1">Value</div>
                    <div className="text-xs sm:text-sm font-medium text-[#f5f5f5]">
                      {currentValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} credits
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-[#f5f5f5]/50 mb-1">Avg Price</div>
                    <div className="text-xs sm:text-sm font-medium text-[#f5f5f5]">
                      {((position.avgPrice || 0) * 100).toFixed(2)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-[#f5f5f5]/50 mb-1">PnL</div>
                    {(() => {
                      let displayedPnl = currentPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                      let displayedPnlPercent = currentPnlPercent.toFixed(2);
                      // If displayed values round to 0, show white and remove negative sign
                      const isDisplayedZero = displayedPnl === '0.00' || displayedPnl === '-0.00';
                      if (isDisplayedZero) {
                        displayedPnl = '0.00';
                        displayedPnlPercent = '0.00';
                      }
                      const pnlColor = isDisplayedZero ? '#f5f5f5' : currentPnl > 0 ? '#4ade80' : '#f87171';
                      const showPlus = !isDisplayedZero && currentPnl > 0;
                      return (
                        <div
                          className="text-xs sm:text-sm font-medium"
                          style={{ color: pnlColor }}
                        >
                          {showPlus ? '+' : ''}{displayedPnl} ({showPlus ? '+' : ''}{displayedPnlPercent}%)
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* Distribution Chart */}
              <div className="mb-4 sm:mb-6">
                <h3 className="text-xs sm:text-sm font-semibold text-[#f5f5f5] mb-2">
                  Current Odds
                </h3>
                <DistributionChart
                  thisHistory={thisHistory}
                  thatHistory={thatHistory}
                  thisOption={market?.thisOption || 'THIS'}
                  thatOption={market?.thatOption || 'THAT'}
                  currentThisPercent={thisOddsPercent}
                  currentThatPercent={thatOddsPercent}
                  loading={priceHistoryLoading}
                  timeFilter={timeFilter}
                  onTimeFilterChange={setTimeFilter}
                />
              </div>

              {/* Trading Section */}
              {position.status === 'open' && (
                <div className="p-3 sm:p-4 position-detail-your-position-card">
                  {/* P1: Polymarket service down warning */}
                  {tradingDisabled && (
                    <div className="mb-4 px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                      <div className="flex items-center gap-2">
                        <span className="text-yellow-500 text-xs">⚠️</span>
                        <span className="text-yellow-500/90 text-xs">Polymarket unavailable - trading disabled</span>
                      </div>
                    </div>
                  )}
                  {/* Action Buttons */}
                  <div className="flex gap-2 mb-4 sm:mb-6">
                    <button
                      onClick={() => setActiveMode('buy')}
                      className={`px-2.5 sm:px-3 py-1.5 text-xs transition-all rounded-lg ${
                        activeMode === 'buy'
                          ? 'position-detail-buy-more-button'
                          : 'position-detail-sell-button'
                      }`}
                    >
                      Buy More
                    </button>
                    <button
                      onClick={() => setActiveMode('sell')}
                      className={`px-2.5 sm:px-3 py-1.5 text-xs transition-all rounded-lg ${
                        activeMode === 'sell'
                          ? 'bg-red-600/30 border border-red-500/50 text-red-300'
                          : 'position-detail-sell-button'
                      }`}
                    >
                      Sell
                    </button>
                  </div>

                  {/* Buy Mode Content */}
                  {activeMode === 'buy' && (
                    <>
                      <h3 className="text-xs sm:text-sm font-semibold text-[#f5f5f5] mb-2">Select Side</h3>
                      
                      {/* Select Side */}
                      <div className="flex gap-2 sm:gap-3 mb-4 sm:mb-6">
                        <button
                          onClick={() => setSelectedSide('this')}
                          className={`flex-1 py-2.5 sm:py-3 font-medium text-xs transition-all ${
                            selectedSide === 'this'
                              ? 'position-detail-select-side-button-active-this'
                              : 'position-detail-select-side-button'
                          }`}
                        >
                          THIS ({(market?.thisOdds || 0).toFixed(2)}x)
                        </button>
                        <button
                          onClick={() => setSelectedSide('that')}
                          className={`flex-1 py-2.5 sm:py-3 font-medium text-xs transition-all ${
                            selectedSide === 'that'
                              ? 'position-detail-select-side-button-active-that'
                              : 'position-detail-select-side-button'
                          }`}
                        >
                          THAT ({(market?.thatOdds || 0).toFixed(2)}x)
                        </button>
                      </div>

                      {/* Amount Input */}
                      <div className="space-y-2">
                        <div className="text-xs sm:text-sm text-[#f5f5f5]/70">Amount (Credits)</div>
                        <div className="position-detail-amount-container p-2.5 sm:p-3">
                          <input
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck={false}
                            value={draftBuyAmount}
                            onChange={(e) => {
                              const next = e.target.value.replace(/,/g, '');
                              setDraftBuyAmount(formatWithCommas(next, true));
                            }}
                            onBlur={() => {
                              const value = parseDraftAmount(draftBuyAmount);
                              const clamped = Math.min(Math.max(value, 0), maxCredits);
                              setBuyAmount(clamped);
                              setDraftBuyAmount(clamped.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }));
                            }}
                            className="w-full text-sm sm:text-base font-semibold bg-transparent border-none outline-none text-[#f5f5f5] focus:outline-none"
                            placeholder="0"
                          />
                        </div>
                        <div className="text-xs text-[#f5f5f5]/50 text-right">
                          Available: {Math.floor(maxCredits).toLocaleString()} {isEndingSoon ? 'purchased' : 'free'} credits
                        </div>
                      </div>

                      {/* Buy Button */}
                      <button
                        type="button"
                        onClick={handleBuyMore}
                        disabled={isBuying || buyAmount === 0 || buyAmount > maxCredits || tradingDisabled}
                        className="w-full mt-2 py-2.5 sm:py-3 text-sm sm:text-base font-medium transition-all referral-share-button disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {tradingDisabled ? 'Trading Disabled' : isBuying ? 'Processing...' : `Buy ${selectedSide === 'this' ? 'THIS' : 'THAT'}`}
                      </button>
                    </>
                  )}

                  {/* Sell Mode Content */}
                  {activeMode === 'sell' && (
                    <>
                      <h3 className="text-xs sm:text-sm font-semibold text-[#f5f5f5] mb-2">Sell Your Position</h3>
                      
                      <div className="p-3 sm:p-4 position-detail-sell-warning-box mb-3">
                        <div className="flex justify-between mb-2">
                          <span className="text-xs sm:text-sm text-[#f5f5f5]/70">Position Value:</span>
                          <span className="text-xs sm:text-sm font-medium text-[#f5f5f5]">{currentValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} credits</span>
                        </div>
                        <div className="flex justify-between mb-2">
                          <span className="text-xs sm:text-sm text-[#f5f5f5]/70">Original Bet:</span>
                          <span className="text-xs sm:text-sm font-medium text-[#f5f5f5]">{(position.shares * position.avgPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} credits</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleSellPosition}
                        disabled={isSelling || tradingDisabled}
                        className="w-full py-2.5 sm:py-3 text-sm sm:text-base bg-red-600 border border-red-500 text-white font-medium hover:bg-red-700 transition-all disabled:opacity-50 rounded-lg"
                      >
                        {tradingDisabled ? 'Trading Disabled' : isSelling ? 'Selling...' : 'Sell Position'}
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Closed Position Message */}
              {position.status !== 'open' && (
                <div className="text-center py-6 sm:py-8 text-xs sm:text-sm text-[#f5f5f5]/60">
                  This position is closed and cannot be modified.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    ),
    document.body
  );
};

export default PositionDetailModal;

