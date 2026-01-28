import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AppTitle from '@shared/components/AppTitle';
import Logo from '@shared/components/Logo';
import { initiateXAuth } from '@shared/services';
import { useAuth } from '@shared/contexts/AuthContext';
import '@/styles/prelogin/style.css';
import bannerBg from '@/assets/bg/banner.png';

const PreLogin: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated, loading } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.sessionStorage.getItem('cameFromLoadingPage') === '1';
    } catch {
      return false;
    }
  });
  const [contentVisible, setContentVisible] = useState(false);
  const [pageReady, setPageReady] = useState(false);
  const [logoVisible, setLogoVisible] = useState<boolean>(() => {
    // Hide logo initially if coming from loading page (loading page logo is still visible)
    if (typeof window === 'undefined') return true;
    try {
      return window.sessionStorage.getItem('cameFromLoadingPage') !== '1';
    } catch {
      return true;
    }
  });

  // Redirect to /app if user is already authenticated
  useEffect(() => {
    if (!loading && isAuthenticated) {
      console.log('[PreLogin] User already authenticated, redirecting to /app');
      navigate('/app', { replace: true });
    }
  }, [isAuthenticated, loading, navigate]);

  // Capture referral code from URL and store in sessionStorage
  useEffect(() => {
    const refCode = searchParams.get('ref');
    if (refCode) {
      try {
        sessionStorage.setItem('pendingReferralCode', refCode.trim().toUpperCase());
        console.log('[PreLogin] Captured referral code:', refCode);
        // Clean up URL to remove the ref parameter
        window.history.replaceState({}, document.title, window.location.pathname);
      } catch (e) {
        console.warn('[PreLogin] Could not store referral code:', e);
      }
    }
  }, [searchParams]);

  useEffect(() => {
    // Small delay to ensure smooth mounting
    requestAnimationFrame(() => {
      setPageReady(true);
    });
  }, []);

  useEffect(() => {
    let contentTimer: ReturnType<typeof setTimeout> | null = null;
    let transitionTimer: ReturnType<typeof setTimeout> | null = null;
    let logoTimer: ReturnType<typeof setTimeout> | null = null;

    let cameFromLoading = false;
    try {
      cameFromLoading = window.sessionStorage.getItem('cameFromLoadingPage') === '1';
      if (cameFromLoading) {
        window.sessionStorage.removeItem('cameFromLoadingPage');
      }
    } catch {
      cameFromLoading = false;
    }

    if (cameFromLoading) {
      contentTimer = setTimeout(() => {
        setContentVisible(true);
      }, 100);

      // Show logo after loading page has started its exit animation
      // This creates overlap where both logos are visible briefly
      logoTimer = setTimeout(() => {
        setLogoVisible(true);
      }, 650); // Matches loading page exit timing (delay + duration start)

      // After the transition completes, snap to normal state
      transitionTimer = setTimeout(() => {
        setIsTransitioning(false);
      }, 900);
    } else {
      // Direct navigation or session expiry redirect - show logo immediately
      setLogoVisible(true);
      contentTimer = setTimeout(() => {
        setContentVisible(true);
      }, 150);
    }

    return () => {
      if (contentTimer) clearTimeout(contentTimer);
      if (transitionTimer) clearTimeout(transitionTimer);
      if (logoTimer) clearTimeout(logoTimer);
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('error') || params.get('details')) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const handleSignIn = () => {
    setError(null);

    if (window.location.href.includes('/api/v1/auth/x')) {
      setError('Authentication error. Please try again in a few moments.');
      window.location.href = '/';
      return;
    }
    initiateXAuth();
  };

  // Show nothing while checking authentication to prevent flash
  if (loading) {
    return null;
  }

  return (
    <div
      className={`flex flex-col items-center justify-center w-full prelogin-page ${pageReady ? 'prelogin-page-ready' : ''} ${isTransitioning ? 'prelogin-from-loading' : ''}`}
      style={{ '--banner-bg': `url(${bannerBg})` } as React.CSSProperties}
    >
      {/* Welcome To header */}
      {/* <div className={`absolute top-6 sm:top-7 md:top-8 left-0 right-0 flex justify-between items-center px-4 sm:px-5 md:px-6 z-10 prelogin-header prelogin-fade-target ${contentVisible ? 'prelogin-fade-in' : ''}`}>
        <span className="text-white/70 text-base sm:text-lg md:text-xl font-light">Welcome</span>
        <span className="text-white/70 text-base sm:text-lg md:text-xl font-light">To</span>
      </div> */}

      {/* Main content (title + logo + optional error), centered as one block */}
      <div className="relative z-10 flex flex-col items-center justify-center flex-1 px-6 prelogin-content">
        {/* Center group: App title + logo together as a single hero block */}
        <div className="prelogin-hero">
          {contentVisible && (
            <div className="prelogin-fade-target prelogin-fade-in">
              {/* Title + logo are centered as a single block via .prelogin-hero */}
              <AppTitle showTagline={false} />
            </div>
          )}

          {/* Logo - hidden when transitioning from loading page until loading logo fades */}
          <div className={`mt-6 transition-opacity duration-300 ${logoVisible ? 'opacity-100' : 'opacity-0'}`}>
            <Logo isTransitioning={false} />
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mt-6 sm:mt-7 md:mt-8 max-w-md w-full px-4 sm:px-5 md:px-6 py-3 sm:py-3.5 md:py-4 bg-red-500/10 border border-red-500/30 rounded-lg">
            <div className="flex items-start gap-2 sm:gap-3">
              <div className="text-red-400 text-base sm:text-lg md:text-xl">⚠️</div>
              <div className="flex-1">
                <h3 className="text-red-400 text-sm sm:text-base md:text-lg font-semibold mb-1">Authentication Failed</h3>
                <p className="text-red-300/80 text-xs sm:text-sm md:text-base">{error}</p>
              </div>
              <button
                onClick={() => setError(null)}
                className="text-red-400 hover:text-red-300 transition-colors text-base sm:text-lg md:text-xl"
                aria-label="Dismiss error"
              >
                ✕
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Sign in button pinned to the bottom, so it doesn't affect vertical centering */}
      <div className={`absolute bottom-8 sm:bottom-10 md:bottom-12 left-0 right-0 z-10 w-full px-4 sm:px-5 md:px-6 prelogin-button prelogin-fade-target ${contentVisible ? 'prelogin-fade-in' : ''}`}>
        <button
          onClick={handleSignIn}
          className="btn-premium w-full max-w-md mx-auto py-4 px-8 text-sm font-light text-white rounded-xl transition-all duration-300 hover:scale-[1.01] active:scale-[0.99] block tracking-wider"
        >
          <span className="relative z-10 font-bold">Sign in with X Account</span>
          <div className="btn-premium-glow" />
        </button>
      </div>
    </div>
  );
};

export default PreLogin;

