import React, { useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowLeft, TrendingUp, ChevronDown } from 'lucide-react';
import SwipeableCard from '@features/betting/components/SwipeableCard';
import type { Market } from '@shared/types';
import '@/styles/betting/style.css';
import '@/styles/shared/style.css';

// CSS-animated dual chart - two separate charts stacked vertically (like PnL chart style)
// Using unique IDs to avoid conflicts when multiple instances are rendered
let dualChartInstanceId = 0;

const AnimatedDualLineChart: React.FC<{ isActive: boolean }> = ({ isActive }) => {
  const [instanceId] = useState(() => ++dualChartInstanceId);
  const greenGradId = `onb-green-grad-${instanceId}`;
  const redGradId = `onb-red-grad-${instanceId}`;
  const greenLineClass = `green-line-${instanceId}`;
  const greenAreaClass = `green-area-${instanceId}`;
  const redLineClass = `red-line-${instanceId}`;
  const redAreaClass = `red-area-${instanceId}`;

  return (
    <div className="w-full h-full flex flex-col gap-1">
      {/* Top chart - Green (THIS) going up */}
      <div className="flex-1">
        <svg className="w-full h-full" viewBox="0 0 200 40" preserveAspectRatio="none">
          <defs>
            <linearGradient id={greenGradId} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#4ade80" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#4ade80" stopOpacity="0" />
            </linearGradient>
          </defs>
          <style>{`
            @keyframes drawGreenLine${instanceId} {
              from { stroke-dashoffset: 250; }
              to { stroke-dashoffset: 0; }
            }
            @keyframes fadeInGreenArea${instanceId} {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            .${greenLineClass} {
              stroke-dasharray: 250;
              stroke-dashoffset: 250;
            }
            .${greenLineClass}.animating {
              animation: drawGreenLine${instanceId} 1.2s ease-out forwards;
            }
            .${greenAreaClass} {
              opacity: 0;
            }
            .${greenAreaClass}.animating {
              animation: fadeInGreenArea${instanceId} 0.8s ease-out forwards;
            }
          `}</style>
          {/* Green gradient area */}
          <path
            className={`${greenAreaClass} ${isActive ? 'animating' : ''}`}
            d="M0,35 C40,32 60,28 100,20 C140,12 170,8 200,5 L200,40 L0,40 Z"
            fill={`url(#${greenGradId})`}
          />
          {/* Green line */}
          <path
            className={`${greenLineClass} ${isActive ? 'animating' : ''}`}
            d="M0,35 C40,32 60,28 100,20 C140,12 170,8 200,5"
            fill="none"
            stroke="#4ade80"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </div>
      {/* Bottom chart - Red (THAT) going down */}
      <div className="flex-1">
        <svg className="w-full h-full" viewBox="0 0 200 40" preserveAspectRatio="none">
          <defs>
            <linearGradient id={redGradId} x1="0%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="#f87171" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#f87171" stopOpacity="0" />
            </linearGradient>
          </defs>
          <style>{`
            @keyframes drawRedLine${instanceId} {
              from { stroke-dashoffset: 250; }
              to { stroke-dashoffset: 0; }
            }
            @keyframes fadeInRedArea${instanceId} {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            .${redLineClass} {
              stroke-dasharray: 250;
              stroke-dashoffset: 250;
            }
            .${redLineClass}.animating {
              animation: drawRedLine${instanceId} 1.2s ease-out forwards;
            }
            .${redAreaClass} {
              opacity: 0;
            }
            .${redAreaClass}.animating {
              animation: fadeInRedArea${instanceId} 0.8s ease-out forwards;
            }
          `}</style>
          {/* Red gradient area */}
          <path
            className={`${redAreaClass} ${isActive ? 'animating' : ''}`}
            d="M0,5 C40,8 60,12 100,20 C140,28 170,32 200,35 L200,0 L0,0 Z"
            fill={`url(#${redGradId})`}
          />
          {/* Red line */}
          <path
            className={`${redLineClass} ${isActive ? 'animating' : ''}`}
            d="M0,5 C40,8 60,12 100,20 C140,28 170,32 200,35"
            fill="none"
            stroke="#f87171"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </div>
    </div>
  );
};

// CSS-animated PnL chart for profile
const AnimatedPnLChart: React.FC<{ isActive: boolean }> = ({ isActive }) => {
  return (
    <svg className="w-full h-full" viewBox="0 0 200 40" preserveAspectRatio="none">
      <defs>
        <linearGradient id="onb-pnl-grad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#4ade80" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#4ade80" stopOpacity="0" />
        </linearGradient>
      </defs>
      <style>{`
        @keyframes drawPnlLine {
          from { stroke-dashoffset: 250; }
          to { stroke-dashoffset: 0; }
        }
        @keyframes fadeInPnlArea {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .pnl-line {
          stroke-dasharray: 250;
          stroke-dashoffset: 250;
        }
        .pnl-line.animating {
          animation: drawPnlLine 1.2s ease-out forwards;
        }
        .pnl-area {
          opacity: 0;
        }
        .pnl-area.animating {
          animation: fadeInPnlArea 0.8s ease-out forwards;
        }
      `}</style>
      {/* Gradient area */}
      <path
        className={`pnl-area ${isActive ? 'animating' : ''}`}
        d="M0,35 C40,32 60,28 100,20 C140,12 170,8 200,5 L200,40 L0,40 Z"
        fill="url(#onb-pnl-grad)"
      />
      {/* Line */}
      <path
        className={`pnl-line ${isActive ? 'animating' : ''}`}
        d="M0,35 C40,32 60,28 100,20 C140,12 170,8 200,5"
        fill="none"
        stroke="#4ade80"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
};

// CSS-animated podium bars for leaderboard
const AnimatedPodium: React.FC<{ isActive: boolean }> = ({ isActive }) => {
  return (
    <>
      <style>{`
        @keyframes growPodiumBar1 {
          0% { transform: scaleY(0); }
          100% { transform: scaleY(1); }
        }
        @keyframes growPodiumBar2 {
          0% { transform: scaleY(0); }
          100% { transform: scaleY(1); }
        }
        @keyframes growPodiumBar3 {
          0% { transform: scaleY(0); }
          100% { transform: scaleY(1); }
        }
        @keyframes slideUpUser1 {
          0% { opacity: 0; transform: translateY(30px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideUpUser2 {
          0% { opacity: 0; transform: translateY(30px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideUpUser3 {
          0% { opacity: 0; transform: translateY(30px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .podium-bar {
          transform-origin: bottom;
          transform: scaleY(0);
        }
        .podium-bar-1.animating {
          animation: growPodiumBar1 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
          animation-delay: 0s;
        }
        .podium-bar-2.animating {
          animation: growPodiumBar2 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
          animation-delay: 0.15s;
        }
        .podium-bar-3.animating {
          animation: growPodiumBar3 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
          animation-delay: 0.3s;
        }
        .podium-user {
          opacity: 0;
          transform: translateY(30px);
        }
        .podium-user-1.animating {
          animation: slideUpUser1 0.5s ease-out forwards;
          animation-delay: 0.2s;
        }
        .podium-user-2.animating {
          animation: slideUpUser2 0.5s ease-out forwards;
          animation-delay: 0.35s;
        }
        .podium-user-3.animating {
          animation: slideUpUser3 0.5s ease-out forwards;
          animation-delay: 0.5s;
        }
      `}</style>
      <div className="flex items-end gap-3 justify-center mb-4">
        {/* 2nd Place */}
        <div className="flex flex-col items-center flex-1">
          <div className={`podium-user podium-user-2 flex flex-col items-center ${isActive ? 'animating' : ''}`}>
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-gray-300 to-gray-400 flex items-center justify-center text-white font-bold text-[8px] mb-1 shadow-lg">
              2
            </div>
            <div className="text-[9px] text-[#f5f5f5] mb-0.5 font-medium">trader_pro</div>
          </div>
          <div
            className={`podium-bar podium-bar-2 w-full rounded-t-lg ${isActive ? 'animating' : ''}`}
            style={{
              height: '64px',
              background: 'linear-gradient(to top, rgba(192,192,192,0.2) 0%, rgba(192,192,192,0.5) 100%)',
            }}
          >
            <div className="text-center pt-2">
              <div className="text-[7px] text-[#f5f5f5]/50">Volume</div>
              <div className="text-[9px] text-[#f5f5f5] font-semibold">$24.5K</div>
            </div>
          </div>
        </div>

        {/* 1st Place */}
        <div className="flex flex-col items-center flex-1">
          <div className={`podium-user podium-user-1 flex flex-col items-center ${isActive ? 'animating' : ''}`}>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-yellow-300 to-yellow-500 flex items-center justify-center text-white font-bold text-[9px] mb-1 shadow-lg">
              1
            </div>
            <div className="text-[10px] text-[#f5f5f5] mb-0.5 font-medium">crypto_king</div>
          </div>
          <div
            className={`podium-bar podium-bar-1 w-full rounded-t-lg ${isActive ? 'animating' : ''}`}
            style={{
              height: '96px',
              background: 'linear-gradient(to top, rgba(255,215,0,0.2) 0%, rgba(255,215,0,0.6) 100%)',
            }}
          >
            <div className="text-center pt-3">
              <div className="text-[7px] text-[#f5f5f5]/50">Volume</div>
              <div className="text-[10px] text-[#f5f5f5] font-semibold">$45.2K</div>
            </div>
          </div>
        </div>

        {/* 3rd Place */}
        <div className="flex flex-col items-center flex-1">
          <div className={`podium-user podium-user-3 flex flex-col items-center ${isActive ? 'animating' : ''}`}>
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white font-bold text-[8px] mb-1 shadow-lg">
              3
            </div>
            <div className="text-[9px] text-[#f5f5f5] mb-0.5 font-medium">whale_watcher</div>
          </div>
          <div
            className={`podium-bar podium-bar-3 w-full rounded-t-lg ${isActive ? 'animating' : ''}`}
            style={{
              height: '48px',
              background: 'linear-gradient(to top, rgba(205,127,50,0.2) 0%, rgba(205,127,50,0.5) 100%)',
            }}
          >
            <div className="text-center pt-1.5">
              <div className="text-[7px] text-[#f5f5f5]/50">Volume</div>
              <div className="text-[9px] text-[#f5f5f5] font-semibold">$18.7K</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

// CSS-animated counter for numbers
const AnimatedNumber: React.FC<{ value: number; isActive: boolean; prefix?: string; suffix?: string; decimals?: number }> = ({
  value, isActive, prefix = '', suffix = '', decimals = 0
}) => {
  const formattedValue = value.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  return (
    <span
      style={{
        display: 'inline-block',
        opacity: isActive ? 1 : 0,
        transform: isActive ? 'translateY(0)' : 'translateY(10px)',
        transition: 'opacity 0.5s ease-out, transform 0.5s ease-out',
      }}
    >
      {prefix}{formattedValue}{suffix}
    </span>
  );
};

const OnboardingPage: React.FC = () => {
  const navigate = useNavigate();
  const [, setCurrentStep] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionDirection, setTransitionDirection] = useState<'forward' | 'backward'>('forward');
  const [displayStep, setDisplayStep] = useState(0);
  const cardStackRef = useRef<HTMLDivElement>(null);

  const mockMarket: Market = useMemo(() => {
    const fixedExpiryDate = new Date('2025-02-15T23:59:59Z');
    return {
      id: 'onboarding-1',
      title: 'Will Bitcoin close above $100k by Friday?',
      description: '',
      thisOption: 'Yes',
      thatOption: 'No',
      thisOdds: 1.22,
      thatOdds: 5.50,
      expiryDate: fixedExpiryDate,
      category: 'Crypto',
      liquidity: 100000,
      imageUrl: undefined,
      marketType: 'binary' as const,
    };
  }, []);

  const visibleCards = [
    { index: 0, market: mockMarket },
    { index: 1, market: mockMarket },
    { index: 2, market: mockMarket },
  ];

  const handleSwipeLeft = async (amount: number): Promise<boolean> => {
    void amount;
    return new Promise((resolve) => {
      setTimeout(() => resolve(true), 400);
    });
  };

  const handleSwipeRight = async (amount: number): Promise<boolean> => {
    void amount;
    return new Promise((resolve) => {
      setTimeout(() => resolve(true), 400);
    });
  };

  const handleSwipeUp = () => {};
  const handleSwipeDown = () => {};

  const steps = [
    // Page 1: Swipe to Predict
    {
      title: 'Swipe to Predict',
      description: (
        <>
          Swipe left for <span className="text-green-400 font-semibold">THIS</span>, right for <span className="text-red-400 font-semibold">THAT</span>. Make predictions in seconds. Not confident with your decision? Swipe up to skip, down to check previously skipped markets.
        </>
      ),
      content: (
        <div className="flex items-center justify-center w-full" style={{ minHeight: '320px' }}>
          <div
            ref={cardStackRef}
            className="relative w-full max-w-lg mx-auto betting-card-stack"
            style={{
              height: '280px',
              maxHeight: '280px',
              overflow: 'visible',
            }}
          >
            {visibleCards.map(({ index, market }) => (
              <SwipeableCard
                key={`${market.id}-${index}`}
                market={market}
                index={index}
                totalCards={visibleCards.length}
                onSwipeLeft={handleSwipeLeft}
                onSwipeRight={handleSwipeRight}
                onSwipeUp={handleSwipeUp}
                onSwipeDown={handleSwipeDown}
                isActive={false}
                canSwipeDown={false}
                disableBackend={true}
              />
            ))}
          </div>
        </div>
      ),
    },
    // Page 2: Current Odds & Amount Modal
    {
      title: 'View Odds & Set Amount',
      description: 'Tap the chart area to see price history. Adjust your bet amount before swiping.',
      content: (
        <div className="relative w-full max-w-sm mx-auto space-y-2.5 pointer-events-none select-none">
          {/* Current Odds Modal - compact height */}
          <div
            className="relative rounded-2xl overflow-hidden shadow-2xl"
            style={{
              background: 'linear-gradient(135deg, rgba(15, 15, 20, 0.5) 0%, rgba(20, 20, 25, 0.55) 100%)',
              backdropFilter: 'blur(40px) saturate(180%)',
              WebkitBackdropFilter: 'blur(40px) saturate(180%)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 40px rgba(74, 144, 184, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
            }}
          >
            <div className="p-3">
              {/* Header */}
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-[#f5f5f5]">Current Odds</h3>
                  <div className="flex items-center gap-1 text-[8px] text-[#f5f5f5]/40">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80]"></span>
                    <span>Yes</span>
                    <span className="mx-0.5">•</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-[#f87171]"></span>
                    <span>No</span>
                  </div>
                </div>
              </div>

              {/* Live prices display */}
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-baseline gap-1">
                  <span className="text-lg font-normal text-[#4ade80]">
                    <AnimatedNumber value={82.1} isActive={displayStep === 1} decimals={1} suffix="%" />
                  </span>
                  <span className="text-[10px] text-[#f5f5f5]/30">Yes</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-[10px] text-[#f5f5f5]/30">No</span>
                  <span className="text-lg font-normal text-[#f87171]">
                    <AnimatedNumber value={17.9} isActive={displayStep === 1} decimals={1} suffix="%" />
                  </span>
                </div>
              </div>

              {/* Chart container */}
              <div
                className="rounded-lg overflow-hidden"
                style={{
                  background: 'linear-gradient(180deg, rgba(0, 0, 0, 0.3) 0%, rgba(0, 0, 0, 0.5) 100%)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                }}
              >
                {/* Time filter tabs - static display only */}
                <div className="flex items-center px-2 py-1 border-b border-[#f5f5f5]/5">
                  <div className="flex gap-0.5 relative">
                    {/* Sliding pill background on ALL */}
                    <div
                      className="absolute top-0 bottom-0 rounded pointer-events-none z-0"
                      style={{
                        right: '0px',
                        width: '24px',
                        background: 'rgba(74, 144, 184, 0.15)',
                        border: '1px solid rgba(74, 144, 184, 0.4)',
                        backdropFilter: 'blur(8px)',
                      }}
                    />
                    {(['1H', '6H', '1D', 'ALL'] as const).map((filter, i) => (
                      <span
                        key={filter}
                        className={`py-0.5 px-1.5 text-[8px] font-medium rounded relative z-10 ${
                          i === 3
                            ? 'text-[#f5f5f5]'
                            : 'text-[#f5f5f5]/40'
                        }`}
                      >
                        {filter}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Chart - shorter height */}
                <div className="p-2" style={{ background: '#0d1117' }}>
                  <div className="h-24 w-full relative">
                    <AnimatedDualLineChart isActive={displayStep === 1} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Amount section - compact */}
          <div
            className="relative rounded-xl overflow-hidden shadow-xl"
            style={{
              background: 'linear-gradient(135deg, rgba(15, 15, 20, 0.45) 0%, rgba(20, 20, 25, 0.5) 100%)',
              backdropFilter: 'blur(40px) saturate(180%)',
              WebkitBackdropFilter: 'blur(40px) saturate(180%)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              boxShadow: '0 20px 40px -12px rgba(0, 0, 0, 0.4), 0 0 30px rgba(74, 144, 184, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
            }}
          >
            <div className="p-3">
              <div className="text-[9px] text-[#f5f5f5]/50 mb-1 uppercase tracking-wider">Bet Amount</div>
              <div className="text-lg font-semibold text-[#f5f5f5] mb-2.5">
                <AnimatedNumber value={500} isActive={displayStep === 1} />
                <span className="text-xs font-normal text-[#f5f5f5]/40 ml-1">credits</span>
              </div>
              <div className="flex gap-1.5 relative">
                {[100, 250, 500, 1000].map((amt) => (
                  <span
                    key={amt}
                    className={`flex-1 py-1.5 text-[10px] rounded-lg font-medium text-center ${
                      amt === 500
                        ? 'text-[#f5f5f5]'
                        : 'bg-white/5 text-[#f5f5f5]/60 border border-white/5'
                    }`}
                    style={amt === 500 ? {
                      background: 'rgba(74, 144, 184, 0.15)',
                      border: '1px solid rgba(74, 144, 184, 0.4)',
                    } : {}}
                  >
                    {amt}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      ),
    },
    // Page 3: Leaderboard
    {
      title: 'Climb the Leaderboard',
      description: 'Compete with traders worldwide. Top performers earn recognition based on trading volume and profits made.',
      content: (
        <div className="relative w-full max-w-sm mx-auto pointer-events-none select-none">
          <div
            className="relative rounded-2xl overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, rgba(20, 20, 28, 0.4) 0%, rgba(15, 15, 22, 0.45) 100%)',
              backdropFilter: 'blur(40px) saturate(180%)',
              WebkitBackdropFilter: 'blur(40px) saturate(180%)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 8px 24px rgba(0, 0, 0, 0.3), 0 0 40px rgba(74, 144, 184, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
            }}
          >
            <div className="p-3">
              {/* Header */}
              <div className="flex items-center justify-between mb-2.5">
                <h3 className="text-sm font-extralight text-[#f5f5f5] tracking-tight">Leaderboard</h3>
                {/* Time Filter Dropdown - matching LeaderboardTable */}
                <span
                  className="flex items-center gap-1 px-2.5 py-1 text-[9px] font-normal rounded-full text-[#f5f5f5]/70"
                  style={{
                    background: 'transparent',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                  }}
                >
                  All Time
                  <ChevronDown className="w-2.5 h-2.5" />
                </span>
              </div>

              {/* Category pills - matching LeaderboardTable with sliding background */}
              <div className="flex gap-1.5 mb-3 relative">
                {/* Sliding gradient background on "All" */}
                <div
                  className="absolute top-0 bottom-0 rounded-full pointer-events-none z-0"
                  style={{
                    left: '0px',
                    width: '28px',
                    background: 'linear-gradient(90deg, rgba(74, 144, 184, 0.25) 0%, rgba(61, 107, 138, 0.2) 100%)',
                    border: '1px solid rgba(74, 144, 184, 0.3)',
                    boxShadow: '0 0 12px rgba(74, 144, 184, 0.15)',
                  }}
                />
                {['All', 'Crypto', 'Sports', 'Politics'].map((cat, i) => (
                  <span
                    key={cat}
                    className={`px-2 py-1 rounded-full text-[9px] font-normal relative z-10 ${
                      i === 0
                        ? 'text-[#f5f5f5]'
                        : 'text-[#f5f5f5]/50'
                    }`}
                    style={i !== 0 ? {
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                    } : {}}
                  >
                    {cat}
                  </span>
                ))}
              </div>

              {/* Animated Podium */}
              <AnimatedPodium isActive={displayStep === 2} />

              {/* Other rankings */}
              <div className="space-y-1.5">
                {[
                  { rank: 4, name: 'diamond_hands', volume: '$12.3K' },
                  { rank: 5, name: 'market_maker', volume: '$9.8K' },
                ].map((u) => (
                  <div
                    key={u.rank}
                    className="flex items-center gap-2 px-2.5 py-2 rounded-lg"
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.05)',
                    }}
                  >
                    <span className="text-[10px] font-bold text-[#f5f5f5]/30 w-4">{u.rank}</span>
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-gray-500 to-gray-600"></div>
                    <span className="text-[10px] text-[#f5f5f5] flex-1 font-medium">{u.name}</span>
                    <span className="text-[10px] text-[#f5f5f5]/50 font-medium">{u.volume}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ),
    },
    // Page 4: Track Performance (Profile)
    {
      title: 'Track Your Performance',
      description: 'Monitor your PnL, view active positions, and track your prediction accuracy over time.',
      content: (
        <div className="relative w-full max-w-sm mx-auto pointer-events-none select-none">
          <div
            className="relative rounded-2xl overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, rgba(20, 20, 28, 0.4) 0%, rgba(15, 15, 22, 0.45) 100%)',
              backdropFilter: 'blur(40px) saturate(180%)',
              WebkitBackdropFilter: 'blur(40px) saturate(180%)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 8px 24px rgba(0, 0, 0, 0.3), 0 0 40px rgba(74, 144, 184, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
            }}
          >
            <div className="p-3">
              {/* Profile header */}
              <div className="flex items-center gap-2.5 mb-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm"
                  style={{
                    background: 'linear-gradient(135deg, #4A90B8 0%, #3D6B8A 100%)',
                    boxShadow: '0 4px 12px rgba(74, 144, 184, 0.3)',
                  }}
                >
                  Y
                </div>
                <div className="flex-1">
                  <div className="text-xs font-semibold text-[#f5f5f5]">YourUsername</div>
                  <div className="text-[8px] text-[#f5f5f5]/50">Joined 3 days ago</div>
                </div>
              </div>

              {/* Stats list - vertical format like image 2 */}
              <div className="space-y-2 mb-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-[#f5f5f5]/50 uppercase tracking-wider">Positions Value</span>
                  <span className="text-[11px] text-[#f5f5f5]">
                    <AnimatedNumber value={126775.32} isActive={displayStep === 3} decimals={2} /> <span className="text-[#f5f5f5]/50">credits</span>
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-[#f5f5f5]/50 uppercase tracking-wider">Biggest Win</span>
                  <span className="text-[11px] text-[#f5f5f5]">
                    <AnimatedNumber value={6150.00} isActive={displayStep === 3} decimals={2} /> <span className="text-[#f5f5f5]/50">credits</span>
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-[#f5f5f5]/50 uppercase tracking-wider">Predictions</span>
                  <span className="text-[11px] text-[#f5f5f5]">
                    <AnimatedNumber value={36} isActive={displayStep === 3} />
                  </span>
                </div>
              </div>

              {/* PnL Chart */}
              <div
                className="p-2.5 rounded-lg"
                style={{
                  background: 'linear-gradient(135deg, rgba(74, 144, 184, 0.08) 0%, rgba(74, 144, 184, 0.04) 100%)',
                  border: '1px solid rgba(74, 144, 184, 0.15)',
                  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.03)',
                }}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div>
                    <div className="text-[7px] text-[#f5f5f5]/40 uppercase tracking-wider">Total PnL</div>
                    <div className="text-base font-bold text-green-400">
                      +<AnimatedNumber value={8240} isActive={displayStep === 3} />
                    </div>
                  </div>
                  <div className="flex gap-0.5 relative">
                    {/* Sliding pill background on ALL */}
                    <div
                      className="absolute top-0 bottom-0 rounded pointer-events-none z-0"
                      style={{
                        right: '0px',
                        width: '22px',
                        background: 'rgba(74, 144, 184, 0.15)',
                        border: '1px solid rgba(74, 144, 184, 0.4)',
                      }}
                    />
                    {['1D', '1W', '1M', 'ALL'].map((t, i) => (
                      <span
                        key={t}
                        className={`px-1.5 py-0.5 text-[7px] rounded font-medium relative z-10 ${
                          i === 3 ? 'text-[#f5f5f5]' : 'text-[#f5f5f5]/40'
                        }`}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="h-14 w-full">
                  <AnimatedPnLChart isActive={displayStep === 3} />
                </div>
              </div>
            </div>
          </div>
        </div>
      ),
    },
    // Page 5: Position Details Modal
    {
      title: 'Manage Your Positions',
      description: 'Tap any position to view details, track price changes, or sell your shares before resolution.',
      content: (
        <div className="relative w-full max-w-sm mx-auto pointer-events-none select-none">
          <div
            className="relative rounded-2xl overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, rgba(20, 20, 28, 0.4) 0%, rgba(15, 15, 22, 0.45) 100%)',
              backdropFilter: 'blur(40px) saturate(180%)',
              WebkitBackdropFilter: 'blur(40px) saturate(180%)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 8px 24px rgba(0, 0, 0, 0.3), 0 0 40px rgba(74, 144, 184, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
            }}
          >
            <div className="p-3">
              {/* Header */}
              <div className="text-sm font-semibold text-[#f5f5f5] mb-3">Position Details</div>

              {/* Market title */}
              <div
                className="mb-3 p-2.5 rounded-lg"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.04)',
                }}
              >
                <div className="text-xs text-[#f5f5f5] mb-1.5 font-medium">Will Bitcoin close above $100k?</div>
                <div className="flex items-center gap-2">
                  <span
                    className="px-2 py-1 text-[8px] rounded text-green-400 font-semibold"
                    style={{
                      background: 'rgba(34, 197, 94, 0.15)',
                      border: '1px solid rgba(34, 197, 94, 0.25)',
                    }}
                  >
                    YES
                  </span>
                  <span className="text-[10px] text-[#f5f5f5]/50">125 shares @ $0.82</span>
                </div>
              </div>

              {/* Value cards */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div
                  className="p-2.5 rounded-lg"
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.04)',
                  }}
                >
                  <div className="text-[8px] text-[#f5f5f5]/40 uppercase mb-1 tracking-wider">Current Value</div>
                  <div className="text-base font-semibold text-[#f5f5f5]">
                    $<AnimatedNumber value={106.25} isActive={displayStep === 4} decimals={2} />
                  </div>
                </div>
                <div
                  className="p-2.5 rounded-lg"
                  style={{
                    background: 'linear-gradient(135deg, rgba(74, 144, 184, 0.1) 0%, rgba(74, 144, 184, 0.05) 100%)',
                    border: '1px solid rgba(74, 144, 184, 0.2)',
                  }}
                >
                  <div className="text-[8px] text-[#f5f5f5]/40 uppercase mb-1 tracking-wider">Profit/Loss</div>
                  <div className="text-base font-semibold text-green-400 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" />
                    +<AnimatedNumber value={3.75} isActive={displayStep === 4} decimals={2} />
                  </div>
                </div>
              </div>

              {/* Mini chart */}
              <div
                className="rounded-lg overflow-hidden mb-3"
                style={{
                  background: '#0d1117',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                }}
              >
                <div className="p-2">
                  <div className="h-24 w-full">
                    <AnimatedDualLineChart isActive={displayStep === 4} />
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                <span
                  className="flex-1 py-2 text-[10px] font-semibold rounded-lg text-green-400 text-center"
                  style={{
                    background: 'rgba(34, 197, 94, 0.12)',
                    border: '1px solid rgba(34, 197, 94, 0.25)',
                  }}
                >
                  Buy More
                </span>
                <span
                  className="flex-1 py-2 text-[10px] font-semibold rounded-lg text-red-400 text-center"
                  style={{
                    background: 'rgba(239, 68, 68, 0.12)',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                  }}
                >
                  Sell Position
                </span>
              </div>
            </div>
          </div>
        </div>
      ),
    },
    // Page 6: Buy Credits - matching BuyCreditsPage styling
    {
      title: 'Buy Credits',
      description: (
        <>
          Purchase credits with USDC. Purchased credits are mainly used for "Ending Soon" markets. Buy a package to get a 2x multiplier on rewards when markets conclude.
        </>
      ),
      content: (
        <div className="relative w-full max-w-sm mx-auto pointer-events-none select-none">
          <div
            className="relative rounded-2xl overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, rgba(20, 20, 28, 0.4) 0%, rgba(15, 15, 22, 0.45) 100%)',
              backdropFilter: 'blur(40px) saturate(180%)',
              WebkitBackdropFilter: 'blur(40px) saturate(180%)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 8px 24px rgba(0, 0, 0, 0.3), 0 0 40px rgba(74, 144, 184, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
            }}
          >
            <div className="p-4">
              <div className="mb-4 text-center">
                <h3 className="text-base font-semibold text-[#f5f5f5] mb-1.5">Buy Credits</h3>
                <div className="text-xs text-[#f5f5f5]/60">
                  Total Balance: <span className="text-[#f5f5f5]/80 font-medium">1,500</span> credits
                </div>
                <div className="text-[10px] text-[#f5f5f5]/40">
                  Free: 1,500 | Purchased: 0
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[
                  { credits: 6250, bonus: 1562, total: 7812, price: '99.99', label: 'WHALE', popular: true, bonusPercent: 25 },
                  { credits: 550, bonus: 55, total: 605, price: '9.99', label: 'REGULAR', popular: false, bonusPercent: 10 },
                ].map((pkg, idx) => (
                  <div
                    key={idx}
                    className="relative rounded-xl overflow-hidden"
                    style={{
                      background: pkg.popular
                        ? 'linear-gradient(135deg, rgba(74, 144, 184, 0.08) 0%, rgba(74, 144, 184, 0.04) 100%)'
                        : 'rgba(255, 255, 255, 0.03)',
                      border: pkg.popular
                        ? '1px solid rgba(74, 144, 184, 0.2)'
                        : '1px solid rgba(255, 255, 255, 0.06)',
                    }}
                  >
                    <div className="flex items-center justify-between px-2.5 pt-2.5">
                      {pkg.bonusPercent > 0 && (
                        <div
                          className="px-1.5 py-0.5 rounded text-[7px] font-medium text-[#4A90B8] uppercase"
                          style={{
                            background: 'rgba(74, 144, 184, 0.15)',
                            border: '1px solid rgba(74, 144, 184, 0.2)',
                          }}
                        >
                          +{pkg.bonusPercent}% BONUS
                        </div>
                      )}
                      {pkg.popular && (
                        <div
                          className="px-1.5 py-0.5 rounded text-[7px] font-medium text-white uppercase"
                          style={{
                            background: 'linear-gradient(90deg, rgba(74, 144, 184, 0.3) 0%, rgba(61, 107, 138, 0.25) 100%)',
                            border: '1px solid rgba(74, 144, 184, 0.3)',
                          }}
                        >
                          POPULAR
                        </div>
                      )}
                    </div>

                    <div className="p-2.5 pt-1.5">
                      <div className="mb-0.5">
                        <div className="text-xl font-semibold text-[#f5f5f5]">
                          {pkg.total.toLocaleString()}
                        </div>
                        <div className="text-[8px] text-[#f5f5f5]/40 uppercase">
                          CREDITS {pkg.bonus > 0 && `(${pkg.credits.toLocaleString()} + ${pkg.bonus.toLocaleString()} BONUS)`}
                        </div>
                      </div>

                      <div className="mb-1.5 flex items-center">
                        <div
                          className="px-1.5 py-0.5 rounded text-[7px] font-medium text-yellow-300 uppercase"
                          style={{
                            background: 'rgba(234, 179, 8, 0.15)',
                            border: '1px solid rgba(234, 179, 8, 0.3)',
                          }}
                        >
                          2X FOR 1 DAY
                        </div>
                      </div>

                      <div className="mb-2">
                        <div className="text-base font-semibold text-[#f5f5f5]">
                          {pkg.price} USDC
                        </div>
                        <div className="text-[8px] text-[#f5f5f5]/40 uppercase">
                          {pkg.label}
                        </div>
                      </div>

                      <div
                        className="w-full py-2 rounded-lg font-medium text-[10px] text-[#f5f5f5] text-center"
                        style={{
                          background: 'rgba(255, 255, 255, 0.06)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                        }}
                      >
                        Purchase
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ),
    },
  ];

  const handleNext = () => {
    if (displayStep < steps.length - 1) {
      setTransitionDirection('forward');
      setIsTransitioning(true);
      setTimeout(() => {
        const nextStep = displayStep + 1;
        setCurrentStep(nextStep);
        setDisplayStep(nextStep);
        setTimeout(() => {
          setIsTransitioning(false);
        }, 0);
      }, 200);
    } else {
      navigate('/app/play');
    }
  };

  const handleBack = () => {
    if (displayStep > 0) {
      setTransitionDirection('backward');
      setIsTransitioning(true);
      setTimeout(() => {
        const prevStep = displayStep - 1;
        setCurrentStep(prevStep);
        setDisplayStep(prevStep);
        setTimeout(() => {
          setIsTransitioning(false);
        }, 0);
      }, 200);
    } else {
      navigate('/app');
    }
  };

  const handleSkip = () => {
    navigate('/app');
  };

  const currentStepData = steps[displayStep];
  const isLastStep = displayStep === steps.length - 1;
  const isFirstStep = displayStep === 0;

  return (
    <div className="onboarding-page onboarding-page-enter fixed-fullscreen-page relative flex flex-col items-center justify-between">
      {/* Skip button */}
      <div
        className="onboarding-header-enter flex items-center justify-end w-full px-4 pt-3 pb-2 absolute top-0 left-0 right-0 z-10"
      >
        <button
          onClick={handleSkip}
          className="text-[#f5f5f5]/50 hover:text-[#f5f5f5]/70 transition-all duration-200 text-[10px] font-medium px-2.5 py-1 rounded-md"
          style={{
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          Skip
        </button>
      </div>

      {/* Content area */}
      <div className={`flex flex-col items-center flex-1 w-full px-4 ${displayStep === 0 ? 'justify-end pt-0 pb-0' : 'justify-center pt-14 pb-4'}`}>
        <div
          className={`onboarding-content-enter w-full flex justify-center ${displayStep === 0 ? 'items-end' : 'items-center'}`}
          style={{ minHeight: 0, flex: displayStep === 0 ? '0 0 auto' : '1 1 auto' }}
        >
          <div
            key={displayStep}
            className={`w-full max-w-lg onboarding-step-content ${isTransitioning ? `onboarding-step-${transitionDirection}` : `onboarding-step-enter ${transitionDirection === 'backward' ? 'onboarding-step-enter-backward' : ''}`}`}
          >
            {currentStepData.content}
          </div>
        </div>
      </div>

      {/* Bottom section with title, description, dots, and buttons */}
      <div
        className="onboarding-bottom-enter w-full max-w-lg px-5 py-5 rounded-t-3xl"
        style={{
          background: 'linear-gradient(135deg, rgba(12, 14, 20, 0.55) 0%, rgba(18, 20, 28, 0.6) 100%)',
          backdropFilter: 'blur(60px) saturate(200%)',
          WebkitBackdropFilter: 'blur(60px) saturate(200%)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderBottom: 'none',
          boxShadow: '0 -12px 50px rgba(0, 0, 0, 0.4), 0 0 40px rgba(74, 144, 184, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
        }}
      >
        {/* Title and description */}
        <div className="space-y-2 mb-5 overflow-hidden">
          <h2
            key={`title-${displayStep}`}
            className={`text-lg font-semibold text-[#f5f5f5] text-center ${isTransitioning ? `onboarding-text-${transitionDirection}` : 'onboarding-text-enter'}`}
          >
            {currentStepData.title}
          </h2>
          <div
            key={`desc-${displayStep}`}
            className={`text-[#f5f5f5]/60 text-[13px] text-center leading-relaxed max-w-sm mx-auto ${isTransitioning ? `onboarding-text-${transitionDirection}` : 'onboarding-text-enter'}`}
          >
            {currentStepData.description}
          </div>
        </div>

        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-5">
          {steps.map((_, index) => (
            <button
              key={index}
              onClick={() => {
                if (index === displayStep) return;
                const direction = index > displayStep ? 'forward' : 'backward';
                setTransitionDirection(direction);
                setIsTransitioning(true);
                setTimeout(() => {
                  setCurrentStep(index);
                  setDisplayStep(index);
                  setTimeout(() => {
                    setIsTransitioning(false);
                  }, 0);
                }, 200);
              }}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                index === displayStep ? 'w-6' : 'w-1.5 hover:bg-[#f5f5f5]/30'
              }`}
              style={{
                background: index === displayStep
                  ? 'linear-gradient(90deg, #4A90B8 0%, #3D6B8A 100%)'
                  : 'rgba(245, 245, 245, 0.2)',
              }}
            />
          ))}
        </div>

        {/* Navigation buttons */}
        <div className="flex transition-all duration-300 ease-out" style={{ gap: isFirstStep ? 0 : 8 }}>
          <div
            className="transition-all duration-300 ease-out overflow-hidden"
            style={{
              width: isFirstStep ? 0 : isLastStep ? 'auto' : '50%',
              opacity: isFirstStep ? 0 : 1,
              flexShrink: isLastStep ? 0 : 1,
            }}
          >
            <button
              onClick={handleBack}
              disabled={isFirstStep}
              className="w-full h-full py-2 px-3 rounded-lg font-medium text-[11px] text-[#f5f5f5]/60 transition-colors duration-200 hover:text-[#f5f5f5]/80"
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                minWidth: isFirstStep ? 0 : 'max-content',
              }}
            >
              <div className="flex items-center justify-center gap-1 whitespace-nowrap">
                <ArrowLeft className="w-2.5 h-2.5" />
                <span>Back</span>
              </div>
            </button>
          </div>
          <button
            onClick={handleNext}
            className="py-2.5 px-3 rounded-lg font-semibold text-xs text-white transition-all duration-300 ease-out hover:scale-[1.02]"
            style={{
              flex: isFirstStep ? '1 1 100%' : '1 1 auto',
              background: isLastStep
                ? 'linear-gradient(135deg, rgba(74, 144, 184, 0.25) 0%, rgba(61, 107, 138, 0.2) 100%)'
                : 'rgba(255, 255, 255, 0.06)',
              border: isLastStep
                ? '1px solid rgba(74, 144, 184, 0.4)'
                : '1px solid rgba(255, 255, 255, 0.08)',
              boxShadow: isLastStep
                ? '0 0 20px rgba(74, 144, 184, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.08)'
                : 'none',
            }}
          >
            <div className="flex items-center justify-center gap-1">
              <span>{isLastStep ? 'Start Predicting' : 'Next'}</span>
              <ArrowRight className="w-3 h-3" />
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

export default OnboardingPage;
