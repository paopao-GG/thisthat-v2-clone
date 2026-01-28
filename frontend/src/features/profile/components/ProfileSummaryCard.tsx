import React, { useRef, useEffect, useState, useMemo } from 'react';
import type { UserStats } from '@shared/types';
import type { PnLDataPoint } from '@shared/services/userService';
import '@/styles/profile/style.css';

interface Position {
  value: number;
}

interface ProfileSummaryCardProps {
  userStats: UserStats;
  positions: Position[];
  biggestWin: number;
  timeFilter: '1D' | '1W' | '1M' | 'ALL';
  onTimeFilterChange: (filter: '1D' | '1W' | '1M' | 'ALL') => void;
  onConnectWallet?: () => void;
  onReferralClick?: () => void;
  pnlHistory?: PnLDataPoint[];
  pnlLoading?: boolean;
}

const ProfileSummaryCard: React.FC<ProfileSummaryCardProps> = ({
  userStats,
  positions,
  biggestWin,
  timeFilter,
  onTimeFilterChange,
  onConnectWallet,
  onReferralClick,
  pnlHistory = [],
  pnlLoading = false
}) => {
  const timeFilterContainerRef = useRef<HTMLDivElement>(null);
  const [sliderStyle, setSliderStyle] = useState<React.CSSProperties>({});
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Calculate total positions value from all positions
  const positionsValue = positions.reduce((sum, pos) => sum + (pos.value || 0), 0);
  const totalPnL = userStats?.totalPnL || 0;
  const totalBets = userStats?.totalBets || 0;

  // Calculate PnL for the selected time period from history
  const periodPnL = useMemo(() => {
    if (pnlHistory.length === 0) return totalPnL;
    // Sum up all PnL values in the history for the selected period
    return pnlHistory.reduce((sum, point) => sum + point.pnl, 0);
  }, [pnlHistory, totalPnL]);

  // Generate chart path from real PnL history data
  const { pathD, areaD, markers, chartPnL } = useMemo(() => {
    const width = 200;
    const height = 60;
    const padding = 5;

    // Use period PnL for chart coloring
    const displayPnL = pnlHistory.length > 0 ? periodPnL : totalPnL;

    // If no history data, generate mock chart based on total PnL
    if (pnlHistory.length === 0) {
      const dataPoints = 20;

      // If no PnL, show flat line
      if (displayPnL === 0) {
        const y = height - padding;
        const points = Array.from({ length: dataPoints }, (_, i) => {
          const x = (i / (dataPoints - 1)) * width;
          return `${x},${y}`;
        });
        const pathD = `M ${points.join(' L ')}`;
        return {
          pathD,
          areaD: `${pathD} L ${width},${height} L 0,${height} Z`,
          markers: [] as Array<{ x: number; y: number }>,
          chartPnL: displayPnL
        };
      }

      // Generate growth curve based on PnL
      const points: Array<{ x: number; y: number }> = [];
      const startY = height - padding;
      const endY = displayPnL > 0 ? padding : height - padding;
      const growthStart = 0.6;

      for (let i = 0; i < dataPoints; i++) {
        const x = (i / (dataPoints - 1)) * width;
        const progress = i / (dataPoints - 1);

        let y: number;
        if (progress < growthStart) {
          y = startY;
        } else {
          const growthProgress = (progress - growthStart) / (1 - growthStart);
          const easedProgress = 1 - Math.pow(1 - growthProgress, 3);
          y = startY + (endY - startY) * easedProgress;
        }

        points.push({ x, y });
      }

      const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ');
      const areaD = `${pathD} L ${width},${height} L 0,${height} Z`;
      const markers = points.slice(0, Math.floor(dataPoints * growthStart));

      return { pathD, areaD, markers, chartPnL: displayPnL };
    }

    // Use real PnL history data
    const values = pnlHistory.map(p => p.cumulativePnL);
    const minValue = Math.min(0, ...values);
    const maxValue = Math.max(0, ...values);
    const range = maxValue - minValue || 1;

    // Calculate points from real data
    const points: Array<{ x: number; y: number }> = pnlHistory.map((point, i) => {
      const x = pnlHistory.length === 1
        ? width / 2
        : (i / (pnlHistory.length - 1)) * width;
      // Normalize value to chart height (inverted Y - higher values at top)
      const normalizedValue = (point.cumulativePnL - minValue) / range;
      const y = height - padding - (normalizedValue * (height - 2 * padding));
      return { x, y };
    });

    // If only one point, create a horizontal line
    if (points.length === 1) {
      const y = points[0].y;
      const pathD = `M 0,${y} L ${width},${y}`;
      return {
        pathD,
        areaD: `${pathD} L ${width},${height} L 0,${height} Z`,
        markers: points,
        chartPnL: displayPnL
      };
    }

    // Create smooth path using line segments
    const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ');
    const areaD = `${pathD} L ${width},${height} L 0,${height} Z`;

    return { pathD, areaD, markers: points, chartPnL: displayPnL };
  }, [pnlHistory, totalPnL, periodPnL]);

  // Update slider position when timeFilter changes
  useEffect(() => {
    const updateSliderPosition = () => {
      if (!timeFilterContainerRef.current) return;

      // Calculate active index based on timeFilter
      const filterOrder: ('1D' | '1W' | '1M' | 'ALL')[] = ['1D', '1W', '1M', 'ALL'];
      const activeIndex = filterOrder.indexOf(timeFilter);

      if (activeIndex === -1) return;

      const container = timeFilterContainerRef.current;
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
      });
    };

    // Use requestAnimationFrame for smoother updates
    const rafId = requestAnimationFrame(() => {
      updateSliderPosition();
      // Double RAF to ensure layout is complete
      requestAnimationFrame(updateSliderPosition);
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
  }, [timeFilter]);

  const username = userStats?.username || 'User';
  const userInitial = username.charAt(0).toUpperCase();
  const profileImageUrl = userStats?.profileImageUrl || userStats?.avatar;

  // Handle tooltip show/hide with auto-close after 3 seconds
  const handleTooltipShow = () => {
    setShowTooltip(true);
    // Clear any existing timeout
    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current);
    }
    // Auto-close after 3 seconds
    tooltipTimeoutRef.current = setTimeout(() => {
      setShowTooltip(false);
    }, 3000);
  };

  const handleTooltipHide = () => {
    setShowTooltip(false);
    // Clear timeout if user hovers away
    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current);
    }
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (tooltipTimeoutRef.current) {
        clearTimeout(tooltipTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="px-3 sm:px-4 md:px-5 py-4 sm:py-5 md:py-6 mb-4 sm:mb-5 md:mb-6 rounded-lg profile-summary-card">
      <div className="flex flex-col gap-3 sm:gap-4 md:gap-6">
        {/* User Info with Connect Wallet Button */}
        <div className="profile-user-info-container">
          <div className="profile-user-info-inner">
            <div
              className="rounded-full flex items-center justify-center font-bold text-[#0a0a0a] flex-shrink-0 profile-avatar overflow-hidden"
              style={profileImageUrl ? { background: 'transparent' } : {}}
            >
              {profileImageUrl ? (
                <img
                  src={profileImageUrl}
                  alt={username}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    // Fallback to initial if image fails to load
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    if (target.parentElement) {
                      target.parentElement.style.background = '';
                      target.parentElement.innerHTML = userInitial;
                    }
                  }}
                />
              ) : (
                userInitial
              )}
            </div>
            <div className="profile-user-details">
              <h1 className="text-base sm:text-lg md:text-xl lg:text-2xl font-semibold m-0 text-[#f5f5f5]">{username}</h1>
            </div>
          </div>
          <div className="profile-actions-container">
            {/* Connect Wallet Button - disabled sleek style (left) */}
            <div
              className="relative group flex-shrink-0"
              onMouseEnter={handleTooltipShow}
              onMouseLeave={handleTooltipHide}
            >
              <button
                onClick={onConnectWallet}
                disabled
                className="px-3 sm:px-4 md:px-5 py-1.5 sm:py-2 md:py-2.5 text-xs sm:text-sm md:text-base font-medium transition-all rounded-lg cursor-not-allowed opacity-40"
                style={{
                  background: 'rgba(74, 144, 184, 0.15)',
                  border: '1px solid rgba(74, 144, 184, 0.4)',
                  color: '#ffffff',
                  backdropFilter: 'blur(8px)'
                }}
              >
                Connect Wallet
              </button>
              {/* Tooltip */}
              <div className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 sm:px-3 md:px-4 py-1 sm:py-1.5 md:py-2 text-xs sm:text-sm text-[#f5f5f5] bg-[#0a0a0a] border border-[#f5f5f5]/20 rounded-lg transition-all duration-200 pointer-events-none whitespace-nowrap z-[100] shadow-lg ${
                showTooltip ? 'opacity-100 visible' : 'opacity-0 invisible'
              }`}>
                Coming Soon
                {/* Arrow */}
                <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-[5px]">
                  <div className="w-2.5 h-2.5 bg-[#0a0a0a] border-r border-b border-[#f5f5f5]/20 rotate-45"></div>
                </div>
              </div>
            </div>
            {/* Referral Link Button - sleek glass style (right) */}
            <button
              onClick={onReferralClick}
              className="px-3 sm:px-4 md:px-5 py-1.5 sm:py-2 md:py-2.5 text-xs sm:text-sm md:text-base font-medium transition-all rounded-lg hover:bg-[rgba(74,144,184,0.25)] hover:border-[rgba(74,144,184,0.6)]"
              style={{
                background: 'rgba(74, 144, 184, 0.15)',
                border: '1px solid rgba(74, 144, 184, 0.4)',
                color: '#ffffff',
                backdropFilter: 'blur(8px)'
              }}
            >
              Referral Link
            </button>
          </div>
        </div>

        {/* Key Stats */}
        <div className="profile-stats-container">
          <div className="profile-stats-wrapper">
            <div className="profile-stat-item">
              <span className="profile-stat-label">POSITIONS VALUE</span>
              <span className="profile-stat-value">
                {positionsValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} credits
              </span>
            </div>
            <div className="profile-stat-item">
              <span className="profile-stat-label">BIGGEST WIN</span>
              <span className="profile-stat-value">
                {biggestWin.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} credits
              </span>
            </div>
            <div className="profile-stat-item">
              <span className="profile-stat-label">PREDICTIONS</span>
              <span className="profile-stat-value">
                {totalBets}
              </span>
            </div>
          </div>
        </div>

        {/* Profit/Loss Chart */}
        <div className="flex flex-col gap-2 sm:gap-3">
          <div className="flex flex-col gap-2 sm:gap-3 p-3 sm:p-4 md:p-5 rounded profile-pnl-container">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs sm:text-sm md:text-base text-[#f5f5f5]/50">PnL</span>
              <div ref={timeFilterContainerRef} className="flex gap-1 relative">
                {/* Sliding gradient background */}
                <div
                  className="absolute top-0 bottom-0 rounded pointer-events-none z-0 profile-time-filter-slider"
                  style={sliderStyle}
                />
                {(['1D', '1W', '1M', 'ALL'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => onTimeFilterChange(filter)}
                    className={`px-2 sm:px-2.5 md:px-3 py-1 sm:py-1.5 md:py-2 text-xs sm:text-sm md:text-base font-light transition-all rounded relative z-10 profile-time-filter-button ${
                      timeFilter === filter
                        ? 'text-white'
                        : 'text-[#f5f5f5]/60 hover:text-[#f5f5f5]/80'
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </div>
            <div
              className="text-base sm:text-lg md:text-xl lg:text-2xl xl:text-3xl font-bold"
              style={{
                color: pnlLoading
                  ? '#f5f5f5'
                  : Number(chartPnL) > 0 ? '#4ade80' : Number(chartPnL) < 0 ? '#f87171' : '#f5f5f5'
              }}
            >
              {pnlLoading ? (
                <span className="text-[#f5f5f5]/50">&nbsp;</span>
              ) : (
                <>
                  {Number(chartPnL) > 0 ? '+' : Number(chartPnL) < 0 ? '' : ''}{chartPnL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} credits
                </>
              )}
            </div>
            {/* Dynamic Chart based on user's PnL */}
            <div className="h-14 sm:h-16 md:h-20 lg:h-24 xl:h-28 w-full mt-3 sm:mt-4 relative overflow-hidden">
              {pnlLoading ? (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-[#f5f5f5]/30 text-xs">Loading chart...</span>
                </div>
              ) : (
                <svg className="w-full h-full" viewBox="0 0 200 60" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="chartGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor={chartPnL >= 0 ? "#4A90B8" : "#ef4444"} />
                      <stop offset="100%" stopColor={chartPnL >= 0 ? "#3D6B8A" : "#dc2626"} />
                    </linearGradient>
                    <linearGradient id="chartAreaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor={chartPnL >= 0 ? "#4A90B8" : "#ef4444"} stopOpacity="0.2" />
                      <stop offset="50%" stopColor={chartPnL >= 0 ? "#3D6B8A" : "#dc2626"} stopOpacity="0.1" />
                      <stop offset="100%" stopColor={chartPnL >= 0 ? "#3D6B8A" : "#dc2626"} stopOpacity="0" />
                    </linearGradient>
                    <clipPath id="chartClip">
                      <rect x="0" y="0" width="200" height="60" className="profile-chart-clip-rect" />
                    </clipPath>
                  </defs>
                  {/* Area fill with clip animation */}
                  <g clipPath="url(#chartClip)">
                    <path
                      d={areaD}
                      fill="url(#chartAreaGradient)"
                    />
                  </g>
                  {/* Line path with draw animation */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke="url(#chartGradient)"
                    strokeWidth="0.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="profile-chart-line"
                  />
                  {/* Data point markers - only show for real data with limited points */}
                  {pnlHistory.length > 0 && pnlHistory.length <= 20 && (
                    <g className="profile-chart-markers">
                      {markers.map((point, i) => (
                        <circle
                          key={i}
                          cx={point.x}
                          cy={point.y}
                          r="1.5"
                          fill={chartPnL >= 0 ? "#4A90B8" : "#ef4444"}
                          opacity="0.8"
                        />
                      ))}
                    </g>
                  )}
                </svg>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileSummaryCard;

