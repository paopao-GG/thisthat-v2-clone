import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Play, Trophy, User, HelpCircle } from 'lucide-react';
import AppTitle from '@shared/components/AppTitle';
import DailyCreditsSection from '@features/profile/components/DailyCreditsSection';
import { useAuth } from '@shared/hooks';
import '@/styles/shared/style.css';

const HomePage: React.FC = () => {
  const { user, refetchSilent } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Only show tooltip on first visit to home page in this session (not when navigating back from other pages)
  const [showTooltip, setShowTooltip] = React.useState(() => {
    try {
      // Check if tooltip was already shown this session
      const tooltipShown = sessionStorage.getItem('homeTooltipShown');
      if (tooltipShown) return false;

      // Check if user navigated from another page within the app (has location state or history length > 1)
      // If location.key is 'default', it's a fresh navigation (direct URL or refresh)
      const isFreshNavigation = location.key === 'default';
      return isFreshNavigation;
    } catch {
      return false;
    }
  });

  // Auto-hide tooltip after 3 seconds and mark as shown
  React.useEffect(() => {
    if (!showTooltip) return;

    // Mark tooltip as shown for this session
    try {
      sessionStorage.setItem('homeTooltipShown', '1');
    } catch {
      // Ignore storage errors
    }

    const timer = setTimeout(() => {
      setShowTooltip(false);
    }, 3000);
    return () => clearTimeout(timer);
  }, [showTooltip]);

  const handleClaim = async () => {
    await refetchSilent();
  };

  return (
    <div className="fixed-fullscreen-page relative flex flex-col items-center justify-center">
      {/* Question Mark Icon */}
      <div className="absolute top-4 left-4 z-10">
        <svg width="0" height="0" style={{ position: 'absolute' }}>
          <defs>
            <linearGradient id="help-icon-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#4A90B8" />
              <stop offset="100%" stopColor="#3D6B8A" />
            </linearGradient>
          </defs>
        </svg>
        <div className="relative group">
          <button
            onClick={() => navigate('/app/onboarding')}
            className="flex items-center justify-center p-2 rounded-xl transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer focus:outline-none"
            style={{
              background: 'rgba(15, 15, 20, 0.5)',
              backdropFilter: 'blur(40px) saturate(180%)',
              WebkitBackdropFilter: 'blur(40px) saturate(180%)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
            }}
            aria-label="Show onboarding"
          >
            <HelpCircle className="w-4 h-4" style={{ stroke: '#4A90B8', fill: 'none' }} />
          </button>
          <div className={`absolute left-full top-1/2 transform -translate-y-1/2 ml-2 px-3 py-1.5 text-xs text-[#f5f5f5] bg-[#0a0a0a] border border-[#f5f5f5]/20 rounded-lg transition-all duration-200 pointer-events-none whitespace-nowrap z-50 shadow-lg ${showTooltip ? 'opacity-100 visible' : 'opacity-0 invisible'}`}>
            How to Use
            <div className="absolute right-full top-1/2 transform -translate-y-1/2 -mr-px">
              <div className="w-2 h-2 bg-[#0a0a0a] border-l border-b border-[#f5f5f5]/20 transform rotate-45"></div>
            </div>
          </div>
        </div>
      </div>

      {/* User Icon */}
      <div className="absolute top-4 right-4 z-10">
        <svg width="0" height="0" style={{ position: 'absolute' }}>
          <defs>
            <linearGradient id="user-icon-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#4A90B8" />
              <stop offset="100%" stopColor="#3D6B8A" />
            </linearGradient>
          </defs>
        </svg>
        <Link
          to="/app/profile"
          className="flex items-center justify-center p-2 rounded-xl transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer"
          style={{
            background: 'rgba(15, 15, 20, 0.5)',
            backdropFilter: 'blur(40px) saturate(180%)',
            WebkitBackdropFilter: 'blur(40px) saturate(180%)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
          }}
          aria-label="Go to Profile"
        >
          <User className="w-4 h-4" style={{ stroke: 'url(#user-icon-gradient)' }} />
        </Link>
      </div>

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center justify-center flex-1 px-4 pb-32">
        {/* Title Section */}
        <AppTitle className="mb-8" />

        {/* Play and Leaderboard Buttons */}
        <div className="flex gap-3 justify-center">
          <svg width="0" height="0" style={{ position: 'absolute' }}>
            <defs>
              <linearGradient id="button-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#4A90B8" />
                <stop offset="100%" stopColor="#3D6B8A" />
              </linearGradient>
            </defs>
          </svg>
          <Link
            to="/app/play"
            className="flex items-center gap-1.5 py-2.5 px-4 rounded-xl font-medium text-sm text-white transition-all duration-300 hover:scale-[1.01] active:scale-[0.99]"
            style={{
              background: 'rgba(15, 15, 20, 0.6)',
              backdropFilter: 'blur(40px) saturate(180%)',
              WebkitBackdropFilter: 'blur(40px) saturate(180%)',
              border: '1px solid rgba(74, 144, 184, 0.3)',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(74, 144, 184, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 0 40px rgba(74, 144, 184, 0.15)',
              color: '#ffffff'
            }}
          >
            <Play className="w-4 h-4" style={{ fill: '#4A90B8', stroke: 'none' }} />
            <span>Play</span>
          </Link>

          <Link
            to="/app/leaderboard"
            className="flex items-center gap-1.5 py-2.5 px-4 rounded-xl font-medium text-sm text-white transition-all duration-300 hover:scale-[1.01] active:scale-[0.99]"
            style={{
              background: 'rgba(15, 15, 20, 0.6)',
              backdropFilter: 'blur(40px) saturate(180%)',
              WebkitBackdropFilter: 'blur(40px) saturate(180%)',
              border: '1px solid rgba(74, 144, 184, 0.3)',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(74, 144, 184, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 0 40px rgba(74, 144, 184, 0.15)',
              color: '#ffffff'
            }}
          >
            <Trophy className="w-4 h-4" style={{ stroke: '#4A90B8', fill: 'none', strokeWidth: 2 }} />
            <span>Leaderboard</span>
          </Link>
        </div>
      </div>

      {/* Claim Credits Section at bottom */}
      {user && (
        <div className="absolute bottom-8 left-0 right-0 z-10 w-full px-4">
          <DailyCreditsSection
            dailyStreak={user.consecutiveDaysOnline || 0}
            lastClaimDate={user.lastDailyRewardAt ? new Date(user.lastDailyRewardAt) : null}
            onClaim={handleClaim}
          />
        </div>
      )}
    </div>
  );
};

export default HomePage;

