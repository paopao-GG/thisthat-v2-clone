import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Market } from '@shared/types';
import BettingControls from './BettingControls';
import { useAuth, useLiveOdds, usePriceHistory, timeFilterToInterval } from '@shared/hooks';
import type { PriceInterval } from '@shared/services/marketService';
import { X } from 'lucide-react';
import '@/styles/betting/style.css';

interface SwipeableCardProps {
  market: Market;
  index: number;
  totalCards: number;
  onSwipeLeft: (amount: number) => Promise<boolean>;
  onSwipeRight: (amount: number) => Promise<boolean>;
  onSwipeUp: () => void;
  onSwipeDown: () => void;
  isActive: boolean;
  canSwipeDown: boolean;
  disableBackend?: boolean; // When true, prevents backend API calls (for mock/onboarding)
}

// Skeleton components
const SkeletonLine = ({ width = '100%', height = '1rem', className = '' }: { width?: string; height?: string; className?: string }) => (
  <div
    className={`bg-[#f5f5f5]/10 rounded animate-pulse ${className}`}
    style={{ width, height }}
  />
);

const SkeletonContent: React.FC = () => {
  return (
    <>
      <div className="mb-1.5 sm:mb-2 p-2 sm:p-2.5 market-question-container">
        <SkeletonLine width="85%" height="1.25rem" className="mb-2 sm:mb-3" />
        <SkeletonLine width="60%" height="0.75rem" className="mb-1" />
        <SkeletonLine width="80%" height="0.75rem" />
      </div>

      <div className="mb-1.5 sm:mb-2 px-2 sm:px-3 py-1.5 sm:py-2 bg-gradient-to-br from-[rgba(5,5,8,0.35)] via-[rgba(8,8,12,0.45)] to-[rgba(12,12,16,0.4)] backdrop-blur-[70px] backdrop-saturate-[180%] backdrop-brightness-[0.95] backdrop-contrast-[1.05] rounded-xl border border-white/10 shadow-[0_4px_16px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.04),inset_0_2px_4px_rgba(255,255,255,0.08),inset_0_-2px_4px_rgba(255,255,255,0.04),inset_0_0_30px_rgba(255,255,255,0.015)] relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/18 to-transparent pointer-events-none" />
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <SkeletonLine width="30%" height="0.875rem" />
          </div>
          <div className="odds-graph-container w-full mt-1.5 relative overflow-hidden">
            <div className="absolute inset-0 bg-[#f5f5f5]/5 rounded" />
          </div>
          <div className="flex items-center justify-between text-xs">
            <SkeletonLine width="35%" height="0.75rem" />
            <SkeletonLine width="35%" height="0.75rem" />
          </div>
        </div>
      </div>

      <div className="flex gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
        <div className="flex-1 px-2 sm:px-3 py-2 sm:py-2.5 this-control">
          <SkeletonLine width="70%" height="0.875rem" className="mx-auto" />
        </div>
        <div className="flex-1 px-2 sm:px-3 py-2 sm:py-2.5 that-control">
          <SkeletonLine width="70%" height="0.875rem" className="mx-auto" />
        </div>
      </div>

      <div className="p-2 sm:p-2.5 amount-display">
        <div className="flex items-center justify-between">
          <SkeletonLine width="30%" height="0.875rem" />
          <SkeletonLine width="40%" height="1rem" />
        </div>
      </div>
    </>
  );
};

const SwipeableCard: React.FC<SwipeableCardProps> = ({
  market,
  index,
  totalCards,
  onSwipeLeft,
  onSwipeRight,
  onSwipeUp,
  onSwipeDown,
  isActive,
  canSwipeDown,
  disableBackend = false,
}) => {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isOddsModalOpen, setIsOddsModalOpen] = useState(false);
  const [screenHeight, setScreenHeight] = useState(window.innerHeight);
  const [betAmount, setBetAmount] = useState(100);
  const [wasDragging, setWasDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const [oddsTimeFilter, setOddsTimeFilter] = useState<'1H' | '6H' | '1D' | 'ALL'>('ALL');
  const cardRef = useRef<HTMLDivElement>(null);
  const amountDisplayRef = useRef<HTMLDivElement>(null);
  const inlineTimeFilterRef = useRef<HTMLDivElement>(null);
  const modalTimeFilterRef = useRef<HTMLDivElement>(null);
  const touchStartedOnAmount = useRef(false);
  const amountDisplayTouchStartPos = useRef<{ x: number; y: number } | null>(null);
  const startPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const positionRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const isActiveRef = useRef(false);
  const lockedAxisRef = useRef<'x' | 'y' | null>(null);
  const [inlineSliderStyle, setInlineSliderStyle] = useState<React.CSSProperties>({ opacity: 0 });
  const [modalSliderStyle, setModalSliderStyle] = useState<React.CSSProperties>({ opacity: 0 });

  // Always call hooks (React rules), but prevent API calls when disableBackend is true
  const { user } = useAuth();
  // P5: For ending-soon markets, only purchased credits can be used
  // For normal markets, only free credits can be used (no fallback to purchased)
  const maxCredits = disableBackend
    ? 0
    : (market.isEndingSoon
        ? (user?.purchasedCreditsBalance || 0)
        : (user?.freeCreditsBalance || 0));

  // Fetch live odds only when this card is active and backend is not disabled
  // Pass isActive=false when disableBackend is true to prevent API calls
  // P1: Now fetches live prices from Polymarket CLOB API
  const { liveOdds, isServiceDown } = useLiveOdds(disableBackend ? null : market.id, disableBackend ? false : isActive);

  // Use live odds and liquidity if available, otherwise fall back to database values
  const displayOdds = {
    thisOdds: liveOdds?.thisOdds ?? market.thisOdds,
    thatOdds: liveOdds?.thatOdds ?? market.thatOdds,
  };

  // Use live liquidity if available, otherwise fall back to database liquidity
  const displayLiquidity = liveOdds?.liquidity ?? market.liquidity ?? 0;

  // P1: Show warning when Polymarket is down
  const showServiceDownWarning = isServiceDown && !disableBackend;

  // Debug: Log liquidity values
  useEffect(() => {
    console.log('[Volume Debug]', {
      liveOddsLiquidity: liveOdds?.liquidity,
      marketLiquidity: market.liquidity,
      displayLiquidity: displayLiquidity,
      hasLiveOdds: !!liveOdds,
    });
  }, [liveOdds?.liquidity, market.liquidity, displayLiquidity, liveOdds]);

  // ==========================================
  // CHART IMPLEMENTATION - POLYMARKET PRICE HISTORY (P1)
  // ==========================================

  // Convert UI time filter to API interval
  const chartInterval = timeFilterToInterval[oddsTimeFilter] || '1d';

  // Fetch price history from Polymarket CLOB API
  const { history: polymarketHistory, loading: priceHistoryLoading } = usePriceHistory(
    disableBackend ? null : market.id,
    chartInterval as PriceInterval,
    'this', // Fetch THIS side prices
    disableBackend ? false : isActive
  );

  // Convert Polymarket history to chart format
  // Polymarket returns price (0-1) for THIS side, we calculate THAT as 1-price
  const priceHistory = React.useMemo(() => {
    if (polymarketHistory.length === 0) {
      // No history available - use current odds as single point
      return [{
        thisOdds: displayOdds.thisOdds,
        thatOdds: displayOdds.thatOdds,
        recordedAt: new Date(),
      }];
    }

    return polymarketHistory.map((point) => ({
      thisOdds: point.price,
      thatOdds: 1 - point.price, // THAT is complement of THIS
      recordedAt: new Date(point.timestamp * 1000), // Convert Unix timestamp to Date
    }));
  }, [polymarketHistory, displayOdds.thisOdds, displayOdds.thatOdds]);

  // Use Polymarket history for chart
  const mockHistory = priceHistory;

  // Format expiry date like in position modal
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

  // Get time remaining like in position modal
  const getTimeRemaining = (expiryDate: Date): string => {
    const now = new Date();
    const diff = expiryDate.getTime() - now.getTime();
    if (diff < 0) return 'Expired';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    return `${days}d ${hours}h`;
  };

  // Backend stores probabilities (0-1), not decimal odds
  // THIS = YES probability, THAT = NO probability
  const thisImpliedProb = displayOdds.thisOdds; // Already a probability (0-1)
  const thatImpliedProb = displayOdds.thatOdds; // Already a probability (0-1)
  const totalProb = thisImpliedProb + thatImpliedProb;

  // Validate odds sum (should be close to 1.0)
  if (Math.abs(totalProb - 1.0) > 0.1) {
    console.warn('[SwipeableCard] Invalid odds detected:', {
      marketId: market.id.substring(0, 8),
      marketTitle: market.title.substring(0, 50),
      thisOdds: thisImpliedProb,
      thatOdds: thatImpliedProb,
      sum: totalProb,
      expected: 1.0,
    });
  }

  const thisOddsPercent = totalProb > 0 ? (thisImpliedProb / totalProb) * 100 : 50;
  const thatOddsPercent = totalProb > 0 ? (thatImpliedProb / totalProb) * 100 : 50;

  // ==========================================
  // DATA UPDATE LOGIC - CHART RENDERING
  // ==========================================

  // (legacy odds graph generator removed because it was unused)
  const renderOddsGraph = (height: string = 'h-12 sm:h-14 md:h-16') => (
    <div className={`${height} w-full min-w-full mt-1.5 relative overflow-hidden odds-graph-container`}>
      {priceHistoryLoading ? (
        <div className="w-full h-full flex items-center justify-center">
          <span className="text-xs text-[#f5f5f5]/50">Loading chart...</span>
        </div>
      ) : (
        <svg className="w-full h-full min-w-full" viewBox="0 0 200 60" preserveAspectRatio="none">
          {/* Line chart - THIS (green) on top, THAT (gray) on bottom */}
          {(() => {
            const width = 200;
            const height = 60;
            const padding = 3;
            const chartHeight = height - padding * 2;

            // Find min/max for THIS to normalize its display in top half
            let thisMin = 1, thisMax = 0;
            mockHistory.forEach((h) => {
              thisMin = Math.min(thisMin, h.thisOdds);
              thisMax = Math.max(thisMax, h.thisOdds);
            });
            const thisRange = thisMax - thisMin || 0.01;

            // Find min/max for THAT to normalize its display in bottom half
            let thatMin = 1, thatMax = 0;
            mockHistory.forEach((h) => {
              thatMin = Math.min(thatMin, h.thatOdds);
              thatMax = Math.max(thatMax, h.thatOdds);
            });
            const thatRange = thatMax - thatMin || 0.01;

            // Generate points for THIS line (top half: y from padding to height/2)
            const thisPoints: Array<{x: number, y: number}> = [];
            // Generate points for THAT line (bottom half: y from height/2 to height-padding)
            const thatPoints: Array<{x: number, y: number}> = [];

            const topHalfHeight = chartHeight / 2 - 2;
            const bottomHalfStart = height / 2 + 2;

            mockHistory.forEach((point, idx) => {
              const x = (idx / (mockHistory.length - 1 || 1)) * width;

              // THIS in top half (normalized within its own range)
              const thisNorm = (point.thisOdds - thisMin) / thisRange;
              const thisY = padding + topHalfHeight - (thisNorm * topHalfHeight);
              thisPoints.push({ x, y: thisY });

              // THAT in bottom half (normalized within its own range)
              const thatNorm = (point.thatOdds - thatMin) / thatRange;
              const thatY = bottomHalfStart + topHalfHeight - (thatNorm * topHalfHeight);
              thatPoints.push({ x, y: thatY });
            });

            // Create smooth path using Catmull-Rom splines
            const createSmoothPath = (pts: Array<{x: number, y: number}>) => {
              if (pts.length < 2) return '';
              let path = `M ${pts[0].x},${pts[0].y}`;
              for (let i = 0; i < pts.length - 1; i++) {
                const p0 = pts[Math.max(0, i - 1)];
                const p1 = pts[i];
                const p2 = pts[i + 1];
                const p3 = pts[Math.min(pts.length - 1, i + 2)];
                const tension = 0.3;
                const cp1x = p1.x + (p2.x - p0.x) * tension;
                const cp1y = p1.y + (p2.y - p0.y) * tension;
                const cp2x = p2.x - (p3.x - p1.x) * tension;
                const cp2y = p2.y - (p3.y - p1.y) * tension;
                path += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
              }
              return path;
            };

            const thisPathD = createSmoothPath(thisPoints);
            const thatPathD = createSmoothPath(thatPoints);

            return (
              <>
                {/* THIS line (green) - top half */}
                <path
                  d={thisPathD}
                  fill="none"
                  stroke="#4ade80"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
                {/* THAT line (red) - bottom half */}
                <path
                  d={thatPathD}
                  fill="none"
                  stroke="#f87171"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
              </>
            );
          })()}
        </svg>
      )}
    </div>
  );

  // On shorter screens, hide the graph and show "View Current Odds" button instead
  // This gives more room for the image and other content
  const showOddsInModal = screenHeight <= 800;

  const SWIPE_THRESHOLD = 10; // Lowered for better mobile responsiveness
  const ROTATION_FACTOR = 0.08;
  const AXIS_LOCK_THRESHOLD = 4; // Slightly lower for quicker axis detection

  /**
   * Prevent browser default gestures (pull-to-refresh / scroll chaining)
   * while the user is actively dragging the top card.
   *
   * React's touch events can be passive in some setups, so we add a native
   * listener with `{ passive: false }` to ensure `preventDefault()` works.
   */
  useEffect(() => {
    isDraggingRef.current = isDragging;
  }, [isDragging]);

  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    const onNativeTouchMove = (e: TouchEvent) => {
      if (!isActiveRef.current) return;
      if (!isDraggingRef.current) return;
      if (touchStartedOnAmount.current) return;
      e.preventDefault();
    };

    // Capture phase makes this run before the browser decides to scroll/refresh.
    el.addEventListener('touchmove', onNativeTouchMove, { passive: false, capture: true });
    return () => {
      el.removeEventListener('touchmove', onNativeTouchMove, true);
    };
  }, []);

  useEffect(() => {
    const updateScreenHeight = () => {
      setScreenHeight(window.innerHeight);
    };
    updateScreenHeight();
    window.addEventListener('resize', updateScreenHeight);
    return () => window.removeEventListener('resize', updateScreenHeight);
  }, []);

  // Helper function to calculate slider position for a given container
  const calculateSliderStyle = (container: HTMLDivElement | null) => {
    if (!container) return null;

    const filterOrder: ('1H' | '6H' | '1D' | 'ALL')[] = ['1H', '6H', '1D', 'ALL'];
    const activeIndex = filterOrder.indexOf(oddsTimeFilter);

    if (activeIndex === -1) return null;

    const buttons = container.querySelectorAll('button');
    const activeButton = buttons[activeIndex] as HTMLElement;

    if (!activeButton) return null;

    const containerRect = container.getBoundingClientRect();
    const buttonRect = activeButton.getBoundingClientRect();

    const left = buttonRect.left - containerRect.left;
    const width = buttonRect.width;

    return {
      left: `${left}px`,
      width: `${width}px`,
      opacity: 1,
    };
  };

  // Update inline slider position when filter changes
  useEffect(() => {
    const updateInlineSlider = () => {
      const style = calculateSliderStyle(inlineTimeFilterRef.current);
      if (style) setInlineSliderStyle(style);
    };

    const rafId = requestAnimationFrame(() => {
      updateInlineSlider();
      requestAnimationFrame(updateInlineSlider);
    });

    const handleResize = () => {
      requestAnimationFrame(updateInlineSlider);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
    };
  }, [oddsTimeFilter]);

  // Initialize inline slider position on mount
  useEffect(() => {
    const initializeInlineSlider = () => {
      const style = calculateSliderStyle(inlineTimeFilterRef.current);
      if (style) setInlineSliderStyle(style);
    };

    // Multiple attempts to ensure DOM is ready
    const timeouts = [0, 50, 100, 200];
    timeouts.forEach(delay => {
      setTimeout(initializeInlineSlider, delay);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on mount to initialize slider position

  // Initialize modal slider when modal opens
  useEffect(() => {
    if (!isOddsModalOpen) return;

    const initializeModalSlider = () => {
      const style = calculateSliderStyle(modalTimeFilterRef.current);
      if (style) setModalSliderStyle(style);
    };

    // Delay to ensure modal is rendered
    const timeouts = [0, 50, 100, 200];
    timeouts.forEach(delay => {
      setTimeout(initializeModalSlider, delay);
    });
  }, [isOddsModalOpen, oddsTimeFilter]);

  useEffect(() => {
    if (!isActive) return;
    const frameId = requestAnimationFrame(() => {
      setPosition({ x: 0, y: 0 });
      setRotation(0);
      setIsDragging(false);
      positionRef.current = { x: 0, y: 0 };
      isDraggingRef.current = false;
      lockedAxisRef.current = null;
    });
    return () => cancelAnimationFrame(frameId);
  }, [isActive]);

  const handleStart = (clientX: number, clientY: number) => {
    if (!isActive || isModalOpen) return;
    isDraggingRef.current = true;
    lockedAxisRef.current = null;
    startPosRef.current = { x: clientX, y: clientY };
    setIsDragging(true);
  };

  const handleMove = (clientX: number, clientY: number) => {
    if (!isActive || isModalOpen) return;
    if (!isDraggingRef.current) return;
    const deltaX = clientX - startPosRef.current.x;
    const deltaY = clientY - startPosRef.current.y;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    if (!lockedAxisRef.current && (absX > AXIS_LOCK_THRESHOLD || absY > AXIS_LOCK_THRESHOLD)) {
      lockedAxisRef.current = absX > absY ? 'x' : 'y';
    }
    let nextPos: { x: number; y: number };
    if (lockedAxisRef.current === 'x') {
      nextPos = { x: deltaX, y: 0 };
    } else if (lockedAxisRef.current === 'y') {
      nextPos = { x: 0, y: deltaY };
    } else {
      nextPos = { x: 0, y: 0 };
    }
    positionRef.current = nextPos;
    setPosition(nextPos);
    setRotation(nextPos.x * ROTATION_FACTOR);
  };

  const handleEnd = () => {
    if (!isActive || !isDraggingRef.current || isProcessing) {
      setWasDragging(false);
      return;
    }

    const currentPos = positionRef.current;
    const absX = Math.abs(currentPos.x);
    const absY = Math.abs(currentPos.y);
    const moved = absX > 5 || absY > 5;
    setWasDragging(moved);
    setIsDragging(false);
    isDraggingRef.current = false;

    // Animation duration matches the CSS transition (0.4s = 400ms)
    const SWIPE_ANIMATION_DURATION = 400;

    if (lockedAxisRef.current === 'y') {
      if (currentPos.y < -SWIPE_THRESHOLD) {
        const nextPos = { x: 0, y: -1000 };
        positionRef.current = nextPos;
        setPosition(nextPos);
        lockedAxisRef.current = null;
        setTimeout(() => onSwipeUp(), SWIPE_ANIMATION_DURATION);
        return;
      }
      if (currentPos.y > SWIPE_THRESHOLD && canSwipeDown) {
        const nextPos = { x: 0, y: 1000 };
        positionRef.current = nextPos;
        setPosition(nextPos);
        lockedAxisRef.current = null;
        setTimeout(() => onSwipeDown(), SWIPE_ANIMATION_DURATION);
        return;
      }
    }

    if (lockedAxisRef.current === 'x') {
      if (currentPos.x < -SWIPE_THRESHOLD) {
        // Set processing state to prevent further swipes
        setIsProcessing(true);
        lockedAxisRef.current = null;

        // OPTIMISTIC: Animate card off-screen IMMEDIATELY for responsive UX
        const nextPos = { x: -1000, y: 0 };
        positionRef.current = nextPos;
        setPosition(nextPos);

        // Place bet and handle success/failure
        onSwipeLeft(betAmount)
          .then((success) => {
            if (!success) {
              // Bet failed - return card to center with shake animation
              setPosition({ x: 0, y: 0 });
              setRotation(0);
              positionRef.current = { x: 0, y: 0 };
              setIsShaking(true);
              // Remove shake class after animation completes
              setTimeout(() => setIsShaking(false), 500);
            }
          })
          .catch(() => {
            // Error - return card to center with shake animation
            setPosition({ x: 0, y: 0 });
            setRotation(0);
            positionRef.current = { x: 0, y: 0 };
            setIsShaking(true);
            setTimeout(() => setIsShaking(false), 500);
          })
          .finally(() => {
            setIsProcessing(false);
          });
        return;
      }
      if (currentPos.x > SWIPE_THRESHOLD) {
        // Set processing state to prevent further swipes
        setIsProcessing(true);
        lockedAxisRef.current = null;

        // OPTIMISTIC: Animate card off-screen IMMEDIATELY for responsive UX
        const nextPos = { x: 1000, y: 0 };
        positionRef.current = nextPos;
        setPosition(nextPos);

        // Place bet and handle success/failure
        onSwipeRight(betAmount)
          .then((success) => {
            if (!success) {
              // Bet failed - return card to center with shake animation
              setPosition({ x: 0, y: 0 });
              setRotation(0);
              positionRef.current = { x: 0, y: 0 };
              setIsShaking(true);
              // Remove shake class after animation completes
              setTimeout(() => setIsShaking(false), 500);
            }
          })
          .catch(() => {
            // Error - return card to center with shake animation
            setPosition({ x: 0, y: 0 });
            setRotation(0);
            positionRef.current = { x: 0, y: 0 };
            setIsShaking(true);
            setTimeout(() => setIsShaking(false), 500);
          })
          .finally(() => {
            setIsProcessing(false);
          });
        return;
      }
    }

    setPosition({ x: 0, y: 0 });
    setRotation(0);
    positionRef.current = { x: 0, y: 0 };
    lockedAxisRef.current = null;
  };

  // Mouse events
  const handleMouseDown = (e: React.MouseEvent) => {
    // Avoid selecting text / triggering browser drag behaviors during swipe.
    e.preventDefault();
    handleStart(e.clientX, e.clientY);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    handleMove(e.clientX, e.clientY);
  };

  const handleMouseUp = () => {
    handleEnd();
  };

  // Touch events
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!isActive) return;
    const target = e.target as HTMLElement;
    const touch = e.touches[0];
    if (amountDisplayRef.current && amountDisplayRef.current.contains(target)) {
      touchStartedOnAmount.current = true;
      amountDisplayTouchStartPos.current = { x: touch.clientX, y: touch.clientY };
      return;
    }
    touchStartedOnAmount.current = false;
    amountDisplayTouchStartPos.current = null;
    handleStart(touch.clientX, touch.clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isActive || isModalOpen) return;
    if (!isDraggingRef.current) return;
    const touch = e.touches[0];
    handleMove(touch.clientX, touch.clientY);
  };

  const handleTouchEnd = () => {
    if (touchStartedOnAmount.current) {
      touchStartedOnAmount.current = false;
      return;
    }
    handleEnd();
  };

  // Card styling
  const scale = 1 - (index * 0.04);
  const zIndex = totalCards - index;
  const yOffset = -index * 12; // Reduced from 20 to make 4 cards stack closer together
  const xOffset = index * 3;

  const cardStyle: React.CSSProperties = {
    transform: `translate(calc(-50% + ${position.x + xOffset}px), ${position.y + yOffset}px) rotate(${rotation}deg) scale(${scale})`,
    zIndex,
    opacity: 1,
    transition: isDragging ? 'none' : 'transform 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)',
    cursor: isActive ? (isProcessing ? 'wait' : isDragging ? 'grabbing' : 'grab') : 'default',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    pointerEvents: index === 0 && !isProcessing ? 'auto' : 'none',
  };

  const showLeftHint = position.x < -20 && isDragging;
  const showRightHint = position.x > 20 && isDragging;
  const showUpHint = position.y < -20 && isDragging;
  const showDownHint = canSwipeDown && position.y > 20 && isDragging;

  return (
    <div
      ref={cardRef}
      className={`absolute w-full max-w-full sm:px-0 swipeable-card-container ${isShaking ? 'card-shake' : ''}`}
      style={{ ...cardStyle, pointerEvents: isModalOpen || isProcessing ? 'none' : index === 0 ? 'auto' : 'none' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className={`w-full overflow-hidden relative transition-all swipeable-card ${
          showLeftHint ? 'swipeable-card-hint-left' :
          showRightHint ? 'swipeable-card-hint-right' :
          showUpHint ? 'swipeable-card-hint-up' :
          showDownHint ? 'swipeable-card-hint-down' : ''
        } ${
          index === 0
            ? showLeftHint ? 'swipeable-card-shadow-0-left' :
              showRightHint ? 'swipeable-card-shadow-0-right' :
              showUpHint ? 'swipeable-card-shadow-0-up' :
              showDownHint ? 'swipeable-card-shadow-0-down' :
              'swipeable-card-shadow-0-default'
            : index === 1 ? 'swipeable-card-shadow-1' : 'swipeable-card-shadow-2'
        }`}
      >
        {/* Swipe hints */}
        {showLeftHint && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none swipe-hint-left">
            <div className="text-2xl sm:text-3xl md:text-4xl font-bold swipe-hint-left-text">THIS</div>
          </div>
        )}
        {showRightHint && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none swipe-hint-right">
            <div className="text-2xl sm:text-3xl md:text-4xl font-bold swipe-hint-right-text">THAT</div>
          </div>
        )}
        {showUpHint && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none swipe-hint-up">
            <div className="text-xl sm:text-2xl md:text-3xl font-bold text-[#f5f5f5]">NEXT MARKET</div>
          </div>
        )}
        {showDownHint && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none swipe-hint-down">
            <div className="text-xl sm:text-2xl md:text-3xl font-bold text-[#f5f5f5]">PREVIOUS MARKET</div>
          </div>
        )}

        {/* Card content */}
        <div className="flex flex-col overflow-hidden swipeable-card-content">
          {!isActive ? (
            <SkeletonContent />
          ) : (
            <>
              {/* P1: Polymarket service down warning */}
              {showServiceDownWarning && (
                <div className="mb-1.5 sm:mb-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                  <div className="flex items-center gap-2">
                    <span className="text-yellow-500 text-xs">⚠️</span>
                    <span className="text-yellow-500/90 text-xs">Polymarket unavailable - betting disabled</span>
                  </div>
                </div>
              )}

              <div className="mb-1.5 sm:mb-2 p-2 sm:p-2.5 market-question-container">
                <h2 className="text-xl font-semibold mb-1.5 leading-tight text-[#f5f5f5] tracking-tight market-question-title">
                  {market.title}
                </h2>
                <div className="mt-1.5 space-y-0.5">
                  {/* <div className="flex items-center gap-1.5">
                    <span className="text-xs sm:text-sm text-[#f5f5f5]/50 market-detail-text">Volume:</span>
                    <span className="text-xs sm:text-sm text-[#f5f5f5] market-detail-text">{formatVolume(displayLiquidity)}</span>
                  </div> */}
                  <div className="text-xs sm:text-sm text-[#f5f5f5]/60 market-detail-text">
                    Expires: {formatDate(market.expiryDate)} •{' '}
                    <span
                      style={{
                        background: 'linear-gradient(135deg, #4A90B8 0%, #3D6B8A 100%)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                      }}
                    >
                      {getTimeRemaining(market.expiryDate)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Images Section */}
              {market.marketType === 'two-image' && market.thisImageUrl && market.thatImageUrl ? (
                <div className="flex gap-1.5 sm:gap-2 mb-1.5 sm:mb-2 two-image-container relative">
                  <div className="flex-1 relative overflow-hidden flex items-center justify-center image-container">
                    {market.thisImageUrl && (
                      <>
                        <img src={market.thisImageUrl} alt={market.thisOption} className="w-full h-full object-cover image-brightness" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                        <div className="absolute inset-0 image-overlay" />
                      </>
                    )}
                  </div>
                  <div className="flex-1 relative overflow-hidden flex items-center justify-center image-container">
                    {market.thatImageUrl && (
                      <>
                        <img src={market.thatImageUrl} alt={market.thatOption} className="w-full h-full object-cover image-brightness" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                        <div className="absolute inset-0 image-overlay" />
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div className="relative overflow-hidden mb-1.5 sm:mb-2 flex items-center justify-center image-aspect-ratio">
                  {market.imageUrl && !market.imageUrl.includes('placeholder') ? (
                    <>
                      <img src={market.imageUrl} alt={market.title} className="w-full h-full object-cover image-brightness" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                      <div className="absolute inset-0 image-overlay" />
                    </>
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center">
                        <div className="text-4xl sm:text-5xl mb-2 sm:mb-3 text-[#f5f5f5]/20 image-placeholder-icon">📷</div>
                        <div className="text-xs sm:text-sm text-[#f5f5f5]/40 max-w-xs px-3 sm:px-4 image-placeholder-text">{market.title}</div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Stats Section - Current Odds */}
              {showOddsInModal ? (
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsOddsModalOpen(true);
                  }}
                  className="p-2 sm:p-2.5 mb-1.5 sm:mb-2 cursor-pointer transition-all amount-display"
                >
                  <div className="flex items-center justify-center">
                    <span className="text-xs sm:text-sm md:text-base text-[#f5f5f5]/50 amount-label-text">View Current Odds</span>
                  </div>
                </div>
              ) : (
                <div className="mb-1.5 sm:mb-2 px-2 sm:px-3 py-1.5 sm:py-2 bg-gradient-to-br from-[rgba(5,5,8,0.35)] via-[rgba(8,8,12,0.45)] to-[rgba(12,12,16,0.4)] backdrop-blur-[70px] backdrop-saturate-[180%] backdrop-brightness-[0.95] backdrop-contrast-[1.05] rounded-xl border border-white/10 shadow-[0_4px_16px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.04),inset_0_2px_4px_rgba(255,255,255,0.08),inset_0_-2px_4px_rgba(255,255,255,0.04),inset_0_0_30px_rgba(255,255,255,0.015)] relative overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/18 to-transparent pointer-events-none" />
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs sm:text-sm md:text-base text-[#f5f5f5]/50 odds-label-text">Current Odds</span>
                      {/* Time filter for larger screens */}
                      <div ref={inlineTimeFilterRef} className="flex gap-0.5 relative">
                        {/* Sliding pill background */}
                        <div
                          className="absolute top-0 bottom-0 rounded pointer-events-none z-0"
                          style={{
                            ...inlineSliderStyle,
                            background: 'rgba(74, 144, 184, 0.15)',
                            border: '1px solid rgba(74, 144, 184, 0.4)',
                            backdropFilter: 'blur(8px)',
                            transition: 'left 200ms cubic-bezier(0.4, 0, 0.2, 1), width 200ms cubic-bezier(0.4, 0, 0.2, 1)',
                          }}
                        />
                        {(['1H', '6H', '1D', 'ALL'] as const).map((filter) => (
                          <button
                            key={filter}
                            onClick={(e) => {
                              e.stopPropagation();
                              setOddsTimeFilter(filter);
                            }}
                            className={`py-1 px-2 text-[9px] font-medium transition-colors rounded relative z-10 ${
                              oddsTimeFilter === filter
                                ? 'text-[#f5f5f5]'
                                : 'text-[#f5f5f5]/40 hover:text-[#f5f5f5]/60'
                            }`}
                          >
                            {filter}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Clickable graph area to open modal */}
                    <div
                      className="cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsOddsModalOpen(true);
                      }}
                    >
                      {renderOddsGraph()}
                    </div>
                    <div className="flex items-center justify-between text-xs odds-percentage-text">
                      <span className="text-[#f5f5f5]/30">{market.thisOption}</span>
                      <span className="text-[#f5f5f5]/30">{market.thatOption}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* THIS/THAT Controls */}
              <div className="flex gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
                <div className={`flex-1 px-2 sm:px-3 py-2 sm:py-2.5 relative flex flex-col items-center justify-center transition-all this-control ${showLeftHint ? 'this-control-active' : ''}`}>
                  <div className="text-center">
                    <div className="text-xs sm:text-sm md:text-base font-medium this-control-text control-button-text">
                      ← THIS <span className="text-[#4ade80] font-semibold text-[10px] sm:text-[10px]">({thisOddsPercent.toFixed(1)}%)</span>
                    </div>
                  </div>
                </div>
                <div className={`flex-1 px-2 sm:px-3 py-2 sm:py-2.5 relative flex flex-col items-center justify-center transition-all that-control ${showRightHint ? 'that-control-active' : ''}`}>
                  <div className="text-center">
                    <div className="text-xs sm:text-sm md:text-base font-medium that-control-text control-button-text">
                      <span className="text-[#f87171] font-semibold text-[10px] sm:text-[10px]">({thatOddsPercent.toFixed(1)}%) </span>THAT →
                    </div>
                  </div>
                </div>
              </div>

              {/* Amount display */}
              <div
                ref={amountDisplayRef}
                className="p-2 sm:p-2.5 cursor-pointer transition-all amount-display"
                onClick={(e) => {
                  e.stopPropagation();
                  if (isActive && !wasDragging && !isModalOpen) {
                    setIsModalOpen(true);
                  }
                  setWasDragging(false);
                }}
                onTouchStart={(e) => {
                  e.stopPropagation();
                  const touch = e.touches[0];
                  touchStartedOnAmount.current = true;
                  amountDisplayTouchStartPos.current = { x: touch.clientX, y: touch.clientY };
                }}
                onTouchMove={(e) => e.stopPropagation()}
                onTouchEnd={(e) => {
                  e.stopPropagation();
                  if (isActive && !isModalOpen && touchStartedOnAmount.current && amountDisplayTouchStartPos.current) {
                    const touch = e.changedTouches[0];
                    const deltaX = Math.abs(touch.clientX - amountDisplayTouchStartPos.current.x);
                    const deltaY = Math.abs(touch.clientY - amountDisplayTouchStartPos.current.y);
                    if (deltaX < 15 && deltaY < 15) {
                      setTimeout(() => setIsModalOpen(true), 10);
                    }
                  }
                  touchStartedOnAmount.current = false;
                  amountDisplayTouchStartPos.current = null;
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs sm:text-sm md:text-base text-[#f5f5f5]/50 amount-label-text">Amount:</span>
                  <span className="text-base sm:text-lg md:text-xl font-semibold text-[#f5f5f5] leading-snug amount-value-text">{betAmount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} credits</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Betting Controls Modal */}
      {isModalOpen && isActive && (
        <BettingControls
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          betAmount={betAmount}
          setBetAmount={setBetAmount}
          maxCredits={maxCredits}
          onConfirm={() => setIsModalOpen(false)}
          market={market}
        />
      )}

      {isOddsModalOpen && isActive && createPortal(
        <div
          className="fixed inset-0 flex items-center justify-center z-[9999] p-4 betting-controls-modal-overlay"
          onClick={() => setIsOddsModalOpen(false)}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          style={{ pointerEvents: 'auto', touchAction: 'auto' }}
        >
          <div
            className="relative w-full max-w-md p-4 sm:p-5 md:p-6 backdrop-blur-sm animate-slideDown betting-controls-modal"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
            style={{ touchAction: 'auto' }}
          >
            {/* Header with close button */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <h3 className="text-lg sm:text-xl font-semibold text-[#f5f5f5]">Current Odds</h3>
                <div className="flex items-center gap-1.5 text-[10px] text-[#f5f5f5]/40">
                  <span className="w-2 h-2 rounded-full bg-[#4ade80]"></span>
                  <span>{market.thisOption}</span>
                  <span className="mx-1">•</span>
                  <span className="w-2 h-2 rounded-full bg-[#f87171]"></span>
                  <span>{market.thatOption}</span>
                </div>
              </div>
              <button
                onClick={() => setIsOddsModalOpen(false)}
                className="text-[#f5f5f5]/40 hover:text-[#f5f5f5] transition-colors p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Live prices display */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-normal text-[#4ade80]">{thisOddsPercent.toFixed(1)}%</span>
                <span className="text-xs text-[#f5f5f5]/30">{market.thisOption}</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-xs text-[#f5f5f5]/30">{market.thatOption}</span>
                <span className="text-2xl sm:text-3xl font-normal text-[#f87171]">{thatOddsPercent.toFixed(1)}%</span>
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
                <div ref={modalTimeFilterRef} className="flex gap-0.5 relative">
                  {/* Sliding pill background */}
                  <div
                    className="absolute top-0 bottom-0 rounded pointer-events-none z-0"
                    style={{
                      ...modalSliderStyle,
                      background: 'rgba(74, 144, 184, 0.15)',
                      border: '1px solid rgba(74, 144, 184, 0.4)',
                      backdropFilter: 'blur(8px)',
                      transition: 'left 200ms cubic-bezier(0.4, 0, 0.2, 1), width 200ms cubic-bezier(0.4, 0, 0.2, 1)',
                    }}
                  />
                  {(['1H', '6H', '1D', 'ALL'] as const).map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setOddsTimeFilter(filter)}
                      className={`py-1.5 px-2.5 text-[10px] font-medium transition-colors rounded relative z-10 ${
                        oddsTimeFilter === filter
                          ? 'text-[#f5f5f5]'
                          : 'text-[#f5f5f5]/40 hover:text-[#f5f5f5]/60'
                      }`}
                    >
                      {filter}
                    </button>
                  ))}
                </div>
              </div>

              {/* Chart - Stacked Area Graph */}
              <div className="p-3" style={{ background: '#0d1117' }}>
                <div className="h-32 sm:h-36 w-full relative">
                  {priceHistoryLoading ? (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-xs text-[#f5f5f5]/50">Loading chart...</span>
                    </div>
                  ) : (
                  <svg className="w-full h-full" viewBox="0 0 200 100" preserveAspectRatio="none">
                    {/* Line chart - THIS (green) on top, THAT (gray) on bottom */}
                    {(() => {
                      const width = 200;
                      const height = 100;
                      const padding = 5;
                      const chartHeight = height - padding * 2;

                      // Find min/max for THIS to normalize its display in top half
                      let thisMin = 1, thisMax = 0;
                      mockHistory.forEach((h) => {
                        thisMin = Math.min(thisMin, h.thisOdds);
                        thisMax = Math.max(thisMax, h.thisOdds);
                      });
                      const thisRange = thisMax - thisMin || 0.01;

                      // Find min/max for THAT to normalize its display in bottom half
                      let thatMin = 1, thatMax = 0;
                      mockHistory.forEach((h) => {
                        thatMin = Math.min(thatMin, h.thatOdds);
                        thatMax = Math.max(thatMax, h.thatOdds);
                      });
                      const thatRange = thatMax - thatMin || 0.01;

                      // Generate points for THIS line (top half)
                      const thisPoints: Array<{x: number, y: number}> = [];
                      // Generate points for THAT line (bottom half)
                      const thatPoints: Array<{x: number, y: number}> = [];

                      const topHalfHeight = chartHeight / 2 - 3;
                      const bottomHalfStart = height / 2 + 3;

                      mockHistory.forEach((point, idx) => {
                        const x = (idx / (mockHistory.length - 1 || 1)) * width;

                        // THIS in top half (normalized within its own range)
                        const thisNorm = (point.thisOdds - thisMin) / thisRange;
                        const thisY = padding + topHalfHeight - (thisNorm * topHalfHeight);
                        thisPoints.push({ x, y: thisY });

                        // THAT in bottom half (normalized within its own range)
                        const thatNorm = (point.thatOdds - thatMin) / thatRange;
                        const thatY = bottomHalfStart + topHalfHeight - (thatNorm * topHalfHeight);
                        thatPoints.push({ x, y: thatY });
                      });

                      // Create smooth path using Catmull-Rom splines
                      const createSmoothPath = (pts: Array<{x: number, y: number}>) => {
                        if (pts.length < 2) return '';
                        let path = `M ${pts[0].x},${pts[0].y}`;
                        for (let i = 0; i < pts.length - 1; i++) {
                          const p0 = pts[Math.max(0, i - 1)];
                          const p1 = pts[i];
                          const p2 = pts[i + 1];
                          const p3 = pts[Math.min(pts.length - 1, i + 2)];
                          const tension = 0.3;
                          const cp1x = p1.x + (p2.x - p0.x) * tension;
                          const cp1y = p1.y + (p2.y - p0.y) * tension;
                          const cp2x = p2.x - (p3.x - p1.x) * tension;
                          const cp2y = p2.y - (p3.y - p1.y) * tension;
                          path += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
                        }
                        return path;
                      };

                      const thisPathD = createSmoothPath(thisPoints);
                      const thatPathD = createSmoothPath(thatPoints);

                      return (
                        <>
                          {/* THIS line (green) - top half */}
                          <path
                            d={thisPathD}
                            fill="none"
                            stroke="#4ade80"
                            strokeWidth="1.5"
                            vectorEffect="non-scaling-stroke"
                          />
                          {/* THAT line (red) - bottom half */}
                          <path
                            d={thatPathD}
                            fill="none"
                            stroke="#f87171"
                            strokeWidth="1.5"
                            vectorEffect="non-scaling-stroke"
                          />
                        </>
                      );
                    })()}
                  </svg>
                  )}
                </div>
              </div>
            </div>

            {/* Expires info */}
            <div className="flex items-center justify-start mt-4 pt-3 border-t border-[#f5f5f5]/5">
              <div className="text-[10px] text-[#f5f5f5]/30">
                Expires:{' '}
                <span
                  style={{
                    background: 'linear-gradient(135deg, #4A90B8 0%, #3D6B8A 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  {getTimeRemaining(market.expiryDate)}
                </span>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default SwipeableCard;
