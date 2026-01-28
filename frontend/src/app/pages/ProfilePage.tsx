import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { LogOut, Bug } from 'lucide-react';
import type { UserStats } from '@shared/types';
import ProfileSummaryCard from '@features/profile/components/ProfileSummaryCard';
import PositionsTable from '@features/profile/components/PositionsTable';
import ActivityTable from '@features/profile/components/ActivityTable';
import PositionDetailModal from '@features/profile/components/PositionDetailModal';
import ReferralModal from '@features/profile/components/ReferralModal';
import { useAuth, usePnLHistory, usePositionsWithLiveOdds } from '@shared/hooks';
import { useSession } from '@shared/hooks/useSession';
import { fetchUserStats, fetchReferralStats, type UserPosition } from '@shared/services';
import { ApiError } from '@shared/services/api';

// Logout Loading Overlay Component
const LogoutOverlay: React.FC<{ isVisible: boolean }> = ({ isVisible }) => {
  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    if (isVisible) {
      requestAnimationFrame(() => setShowContent(true));
    }
  }, [isVisible]);

  if (!isVisible) return null;

  const overlayContent = (
    <div
      className="fixed flex items-center justify-center"
      style={{
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 99999,
        background: '#000000',
        opacity: showContent ? 1 : 0,
        transition: 'opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      {/* Background gradient - center left and right */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(ellipse 50% 80% at 0% 50%, rgba(74, 144, 184, 0.25) 0%, transparent 60%),
            radial-gradient(ellipse 50% 80% at 100% 50%, rgba(74, 144, 184, 0.25) 0%, transparent 60%)
          `,
        }}
      />

      {/* Gradient SVG for spinner */}
      <svg width="0" height="0" className="absolute">
        <defs>
          <linearGradient id="logout-spinner-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#4A90B8" />
            <stop offset="100%" stopColor="#3D6B8A" />
          </linearGradient>
        </defs>
      </svg>

      {/* Ambient glow */}
      <div
        className="absolute w-[300px] h-[300px] rounded-full opacity-20 blur-[100px] pointer-events-none"
        style={{ background: 'radial-gradient(circle, #4A90B8 0%, transparent 70%)' }}
      />

      {/* Content Card */}
      <div
        className="relative z-10 flex flex-col items-center text-center px-8 py-10 rounded-2xl"
        style={{
          background: 'rgba(15, 15, 20, 0.6)',
          backdropFilter: 'blur(40px) saturate(180%)',
          WebkitBackdropFilter: 'blur(40px) saturate(180%)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
          minWidth: '280px',
          transform: showContent ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(10px)',
          opacity: showContent ? 1 : 0,
          transition: 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.4s ease-out',
        }}
      >
        {/* Custom gradient spinner */}
        <div className="mb-6 relative">
          <div className="w-14 h-14 relative">
            <svg className="w-full h-full animate-spin" viewBox="0 0 50 50">
              <circle
                cx="25"
                cy="25"
                r="20"
                fill="none"
                stroke="rgba(255,255,255,0.1)"
                strokeWidth="4"
              />
              <circle
                cx="25"
                cy="25"
                r="20"
                fill="none"
                stroke="url(#logout-spinner-gradient)"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray="80, 200"
                strokeDashoffset="0"
              />
            </svg>
          </div>
          {/* Spinner glow */}
          <div
            className="absolute inset-0 blur-xl opacity-40 pointer-events-none"
            style={{ background: 'radial-gradient(circle, #4A90B8 0%, transparent 60%)' }}
          />
        </div>
        <h2 className="text-xl font-medium text-white mb-2 tracking-wide">Signing Out</h2>
        <p className="text-sm text-white/50 font-light">See you soon...</p>
      </div>
    </div>
  );

  return createPortal(overlayContent, document.body);
};

const ProfilePage: React.FC = () => {
  const { isAuthenticated, loading: authLoading, logout, refetch: refetchUser } = useAuth();
  const { showSessionExpired } = useSession();
  const navigate = useNavigate();
  
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [activeTab, setActiveTab] = useState<'positions' | 'activity'>('positions');
  const [timeFilter, setTimeFilter] = useState<'1D' | '1W' | '1M' | 'ALL'>('1D');
  const [searchQuery, setSearchQuery] = useState('');
  const [activitySearchQuery, setActivitySearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<UserPosition | null>(null);
  const [isPositionModalOpen, setIsPositionModalOpen] = useState(false);
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const [sliderStyle, setSliderStyle] = useState<React.CSSProperties>({
    left: '0px',
    width: '0px',
    opacity: 0,
  });
  
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [referralCode, setReferralCode] = useState('');
  const [loading, setLoading] = useState(true);

  // Centralized position fetching with live odds
  // Only fetch when authenticated and on positions tab for performance
  const shouldFetchPositions = isAuthenticated && !authLoading && activeTab === 'positions';
  const {
    positions: activePositions,
    refreshPositions: refreshActivePositions,
  } = usePositionsWithLiveOdds('active', shouldFetchPositions);

  const {
    positions: closedPositions,
    refreshPositions: refreshClosedPositions,
  } = usePositionsWithLiveOdds('closed', shouldFetchPositions);

  // Combine and deduplicate positions
  const positions = React.useMemo(() => {
    const allPositionsMap = new Map<string, UserPosition>();
    activePositions.forEach(pos => allPositionsMap.set(pos.id, pos));
    closedPositions.forEach(pos => allPositionsMap.set(pos.id, pos));
    return Array.from(allPositionsMap.values());
  }, [activePositions, closedPositions]);

  // Track refresh state for UI
  const [isRefreshingPositions, setIsRefreshingPositions] = useState(false);

  // Fetch PnL history based on time filter
  const { pnlHistory, loading: pnlLoading, refetch: refetchPnL } = usePnLHistory(timeFilter);

  // Get biggest win (profit) from backend stats
  const biggestWin = userStats?.biggestWin || 0;
  
  const referralLink = referralCode ? `https://thisthat.xyz/?ref=${referralCode}` : '';

  // Load user data function
  const loadUserData = useCallback(async () => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      
      const stats = await fetchUserStats();
      setUserStats(stats);

      // Get referral code from user stats
      try {
        const referralData = await fetchReferralStats();
        if (referralData && referralData.referralCode) {
          setReferralCode(referralData.referralCode);
        }
      } catch {
        // Referral endpoint not available, code will be empty
        setReferralCode('');
      }
    } catch (error) {
      // console.error('Error loading user data:', error);
      
      // If it's an authentication error (401)
      if (error instanceof ApiError && error.statusCode === 401) {
        // Session expired - show modal and redirect
        showSessionExpired();
        // Clear tokens and redirect to login
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('lastActivityTimestamp');
        setTimeout(() => {
          navigate('/');
        }, 1000);
        return;
      }
      
      // For other errors, show "No user data available"
      setUserStats(null);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, showSessionExpired, navigate]);

  // Track if this is initial mount to prevent unnecessary reloads
  const isInitialMount = useRef(true);
  
  // Fetch user data when authenticated
  useEffect(() => {
    if (!authLoading) {
      if (isInitialMount.current || !isAuthenticated) {
        loadUserData();
        isInitialMount.current = false;
      }
    }
  }, [isAuthenticated, authLoading, loadUserData]);

  // Auto-refresh positions with live odds every 10 seconds when on positions tab
  useEffect(() => {
    if (!isAuthenticated || activeTab !== 'positions') {
      return;
    }

    // Initial fetch is handled by the hook, just set up polling
    const interval = setInterval(() => {
      // Silently refresh in background
      void Promise.all([
        refreshActivePositions(),
        refreshClosedPositions(),
      ]);
    }, 10000); // 10 seconds to match live odds polling interval

    return () => clearInterval(interval);
  }, [isAuthenticated, activeTab, refreshActivePositions, refreshClosedPositions]);

  // Manual refresh handler
  const handleRefreshPositions = React.useCallback(async () => {
    if (isRefreshingPositions) return;

    setIsRefreshingPositions(true);
    try {
      await Promise.all([
        refreshActivePositions(),
        refreshClosedPositions(),
      ]);
    } finally {
      setIsRefreshingPositions(false);
    }
  }, [isRefreshingPositions, refreshActivePositions, refreshClosedPositions]);

  // Handle position click
  const handlePositionClick = (position: UserPosition) => {
    setSelectedPosition(position);
    setIsPositionModalOpen(true);
  };


  // Handle position update (refresh data without scroll jump)
  const handlePositionUpdate = useCallback(() => {
    // Preserve scroll position
    const scrollY = window.scrollY;
    const scrollElement = document.documentElement.scrollTop || document.body.scrollTop;
    const savedScroll = scrollY || scrollElement;

    // Update data without showing loading state
    const updateData = async () => {
      try {
        // Immediately fetch user credits and stats in parallel
        const [statsResult] = await Promise.all([
          fetchUserStats(),
          refetchUser(),
          refetchPnL(), // Refresh PnL chart data immediately
        ]);

        // Update stats immediately so PnL chart updates
        setUserStats(statsResult);

        // Small delay for backend to process, then fetch positions
        await new Promise(resolve => setTimeout(resolve, 200));

        // Refresh positions using centralized hooks
        await Promise.all([
          refreshActivePositions(),
          refreshClosedPositions(),
        ]);

        // Wait for next render cycle so memoized positions updates
        await new Promise(resolve => setTimeout(resolve, 0));

        if (selectedPosition) {
          // Try to find the position by ID first
          let updatedPosition = positions.find(p => p.id === selectedPosition.id);

          // If not found by ID, try to find by marketId and side (in case position was recreated)
          if (!updatedPosition && selectedPosition.marketId) {
            updatedPosition = positions.find(p =>
              p.marketId === selectedPosition.marketId &&
              p.side === selectedPosition.side &&
              p.status === selectedPosition.status
            );
          }

          if (updatedPosition) {
            setSelectedPosition(updatedPosition);
          } else {
            // Position was sold or no longer exists, clear selection
            setSelectedPosition(null);
            setIsPositionModalOpen(false);
          }
        }

        // Fetch updated stats again after positions are refreshed (in case PnL changed)
        const finalStats = await fetchUserStats();
        setUserStats(finalStats);

        // Refresh PnL history one more time to ensure chart is accurate
        await refetchPnL();

        // Restore scroll position multiple times to ensure it sticks
        const restoreScroll = () => {
          window.scrollTo({ top: savedScroll, behavior: 'instant' });
          document.documentElement.scrollTop = savedScroll;
          document.body.scrollTop = savedScroll;
        };

        // Restore immediately and after DOM updates
        restoreScroll();
        requestAnimationFrame(restoreScroll);
        setTimeout(restoreScroll, 0);
        setTimeout(restoreScroll, 50);
        setTimeout(restoreScroll, 100);
      } catch (error) {
        // Silently handle errors - don't disrupt user experience
        console.error('Error updating position data:', error);
      }
    };

    // Start update immediately (no delay needed - modal handles its own close timing)
    updateData();
  }, [refetchUser, refetchPnL, selectedPosition, refreshActivePositions, refreshClosedPositions, positions]);

  // Redirect to pre-login page if not authenticated (without showing modal)
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/');
    }
  }, [authLoading, isAuthenticated, navigate]);

  // Initialize slider on component mount
  useEffect(() => {
    const initializeSlider = () => {
      if (!tabsContainerRef.current) return;

      const container = tabsContainerRef.current;
      const buttons = container.querySelectorAll('button');
      const activeButton = buttons[0] as HTMLElement; 
      
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

    // Multiple attempts to ensure DOM is ready
    const timeouts = [0, 50, 100, 200];
    timeouts.forEach(delay => {
      setTimeout(initializeSlider, delay);
    });
  }, []); // Run only once on mount

  // Update slider position when activeTab changes
  useEffect(() => {
    const updateSliderPosition = () => {
      if (!tabsContainerRef.current) return;

      const activeIndex = activeTab === 'positions' ? 0 : 1;
      const container = tabsContainerRef.current;
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

    const rafId = requestAnimationFrame(() => {
      updateSliderPosition();
      requestAnimationFrame(() => {
        updateSliderPosition();
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
  }, [activeTab]);

  const [isSharing, setIsSharing] = useState(false);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(referralLink);
  };

  const handleShareLink = async () => {
    if (isSharing) return;

    if (navigator.share) {
      try {
        setIsSharing(true);
        await navigator.share({
          title: 'Join ThisThat',
          text: 'Swipe the future with ThisThat.\nJoin the beta now and earn 500 free credits!',
          url: referralLink,
        });
      } catch {
        // User cancelled or share failed
      } finally {
        setIsSharing(false);
      }
    } else {
      handleCopyLink();
    }
  };

  // Redirect to pre-login page if not authenticated (without showing modal)
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/');
    }
  }, [authLoading, isAuthenticated, navigate]);

  // Show login screen if not authenticated - return null while redirecting
  if (!authLoading && !isAuthenticated) {
    return null; // Don't render anything while redirecting
  }

  // Show loading state
  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-[#f5f5f5]/60 text-sm font-normal" style={{ fontFamily: 'Aeonik, -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif' }}>
          Loading profile...
        </div>
      </div>
    );
  }

  // Show empty state if no stats loaded
  if (!userStats) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="text-[#f5f5f5]/60 text-sm">No user data available</div>
          <button
            onClick={() => window.location.reload()}
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

  const displayStats = userStats;

  return (
    <>
      {/* Logout Loading Overlay */}
      <LogoutOverlay isVisible={isLoggingOut} />

      <div className="px-2 py-4 max-w-6xl mx-auto">
        {/* Report Bug and Logout Buttons */}
        <div className="flex justify-between items-center mb-3">
        <svg width="0" height="0" style={{ position: 'absolute' }}>
          <defs>
            <linearGradient id="logout-button-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#4A90B8" />
              <stop offset="100%" stopColor="#3D6B8A" />
            </linearGradient>
            <linearGradient id="bug-button-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#4A90B8" />
              <stop offset="100%" stopColor="#3D6B8A" />
            </linearGradient>
          </defs>
        </svg>
        
        {/* Report Bug Button */}
        <div 
          className="rounded-lg p-[1px]"
          style={{
            background: 'linear-gradient(90deg, #4A90B8 0%, #3D6B8A 100%)'
          }}
        >
          <button
            onClick={() => {
              window.open('https://bugs.thisthat.xyz/', '_blank');
            }}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold transition-all rounded-lg page-bg"
            style={{ color: '#ffffff' }}
          >
            <Bug className="w-3 h-3" style={{ stroke: 'url(#bug-button-gradient)' }} />
            <span>Report Bug</span>
          </button>
        </div>

        {/* Logout Button */}
        <div 
          className="rounded-lg p-[1px]"
          style={{
            background: 'linear-gradient(90deg, #4A90B8 0%, #3D6B8A 100%)'
          }}
        >
          <button
            onClick={async () => {
              // Show loading overlay
              setIsLoggingOut(true);
              
              try {
                // Small delay to show the loading animation
                await new Promise(resolve => setTimeout(resolve, 800));
                
                // Clear access token and refresh token
                localStorage.removeItem('accessToken');
                localStorage.removeItem('refreshToken');
                localStorage.removeItem('lastActivityTimestamp');
                
                await logout();
                
                // Wait a bit more for smooth transition
                await new Promise(resolve => setTimeout(resolve, 400));
                
                // Redirect to pre-login page
                navigate('/');
              } catch {
                // If logout fails, still clear tokens and redirect
                localStorage.removeItem('accessToken');
                localStorage.removeItem('refreshToken');
                localStorage.removeItem('lastActivityTimestamp');
                
                await new Promise(resolve => setTimeout(resolve, 400));
                navigate('/');
              }
            }}
            disabled={isLoggingOut}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold transition-all rounded-lg page-bg"
            style={{ color: '#ffffff', opacity: isLoggingOut ? 0.5 : 1 }}
          >
            <LogOut className="w-3 h-3" style={{ stroke: 'url(#logout-button-gradient)' }} />
            <span>{isLoggingOut ? 'Signing out...' : 'Logout'}</span>
          </button>
        </div>
      </div>

      {/* Summary Card */}
      <ProfileSummaryCard
        userStats={displayStats}
        positions={positions}
        biggestWin={biggestWin}
        timeFilter={timeFilter}
        onTimeFilterChange={setTimeFilter}
        onReferralClick={() => setIsModalOpen(true)}
        pnlHistory={pnlHistory}
        pnlLoading={pnlLoading}
      />

      {/* Tabs */}
      <div 
        ref={tabsContainerRef}
        className="flex items-center gap-2 mb-3 relative" 
        style={{ borderBottom: '1px solid rgba(245, 245, 245, 0.08)' }}
      >
        {/* Sliding gradient underline */}
        <div
          className="absolute bottom-0 h-0.5 pointer-events-none z-0"
          style={{
            ...sliderStyle,
            background: 'linear-gradient(90deg, #4A90B8 0%, #3D6B8A 100%)',
            transition: 'left 250ms cubic-bezier(0.4, 0, 0.2, 1), width 250ms cubic-bezier(0.4, 0, 0.2, 1), opacity 150ms ease-in-out',
            willChange: 'left, width, opacity',
          }}
        />
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setActiveTab('positions');
          }}
          className={`pb-2.5 px-1 text-xs font-semibold transition-all relative border-none z-10 ${
            activeTab === 'positions' ? 'text-[#f5f5f5]' : 'text-[#f5f5f5]/60 hover:text-[#f5f5f5]/80'
          }`}
        >
          Positions
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setActiveTab('activity');
          }}
          className={`pb-2.5 px-1 text-xs font-semibold transition-all relative border-none z-10 ${
            activeTab === 'activity' ? 'text-[#f5f5f5]' : 'text-[#f5f5f5]/60 hover:text-[#f5f5f5]/80'
          }`}
        >
          Previous Activity
        </button>
      </div>

      {activeTab === 'positions' && (
        <PositionsTable
          positions={positions}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onPositionClick={handlePositionClick}
          onRefresh={handleRefreshPositions}
          isRefreshing={isRefreshingPositions}
        />
      )}

      {activeTab === 'activity' && (
        <ActivityTable
          positions={positions}
          searchQuery={activitySearchQuery}
          onSearchChange={setActivitySearchQuery}
          onPositionClick={handlePositionClick}
        />
      )}

        {/* Position Detail Modal */}
        {selectedPosition && (
          <PositionDetailModal
            position={selectedPosition}
            isOpen={isPositionModalOpen}
            onClose={() => {
              setIsPositionModalOpen(false);
              setSelectedPosition(null);
            }}
            onUpdate={handlePositionUpdate}
          />
        )}

        {/* Invite Friends Modal */}
        <ReferralModal
          isOpen={isModalOpen}
          referralCode={referralCode}
          referralLink={referralLink}
          onClose={() => setIsModalOpen(false)}
          onShareLink={handleShareLink}
        />
      </div>
    </>
  );
};

export default ProfilePage;
