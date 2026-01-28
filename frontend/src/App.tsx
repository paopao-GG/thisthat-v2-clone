import React, { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from '@shared/contexts/AuthContext';
import { SessionProvider } from '@shared/contexts/SessionContext';
import { useSession } from '@shared/hooks/useSession';
import { setSessionExpiredHandler } from '@shared/services/api';
import { isLoggedIn } from '@shared/services/authService';
import AppLayout from '@shared/components/layout/AppLayout';
import ComingSoonMessage from '@shared/components/ComingSoonMessage';
import AssetLoader from '@shared/components/AssetLoader';
import ProtectedRoute from '@shared/components/ProtectedRoute';
import { useIsMobile } from '@shared/hooks';
import PreLogin from '@app/pages/PreLogin';
import AuthCallback from '@app/pages/AuthCallback';
import HomePage from '@app/pages/HomePage';
import OnboardingPage from '@app/pages/OnboardingPage';
import BettingPage from '@app/pages/BettingPage';
import LeaderboardPage from '@app/pages/LeaderboardPage';
import ProfilePage from '@app/pages/ProfilePage';
import '@/styles/shared/toast.css';

function AppContent() {
  const isMobile = useIsMobile();
  const { showSessionExpired } = useSession();
  const { isAuthenticated } = useAuth();
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const [showLoader, setShowLoader] = useState(true);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Set up session expired handler for API service
  React.useEffect(() => {
    setSessionExpiredHandler(showSessionExpired);
  }, [showSessionExpired]);

  // Check if we accidentally landed on backend URL and redirect back
  React.useEffect(() => {
    if (window.location.href.includes('/api/v1/auth/x') && !window.location.href.includes('/callback')) {
      window.location.href = '/?error=oauth_failed&details=Authentication redirect failed. Please try again.';
    }
  }, []);

  const handleAssetsLoaded = () => {
    // Mark that the user just came from the loading page so PreLogin
    // can run its logo transition + content fade-in sequence.
    try {
      window.sessionStorage.setItem('cameFromLoadingPage', '1');
    } catch {
      // Ignore storage errors (private mode, etc.); app will still work,
      // just without the coordinated transition.
    }

    // Start crossfade transition - PreLogin renders while loading page logo travels
    setIsTransitioning(true);
    setAssetsLoaded(true);

    // Use requestAnimationFrame for smoother frame timing
    requestAnimationFrame(() => {
      // Keep loader visible until logo travel + exit completes
      // LoadingPage exit: 600ms travel + 150ms delay + 500ms fade = ~1250ms
      // PreLogin logo appears at 650ms and fades in over 300ms
      setTimeout(() => {
        requestAnimationFrame(() => {
          setShowLoader(false);
          setIsTransitioning(false);
        });
      }, 1300); // Longer to ensure smooth overlap
    });
  };

  // If user is authenticated, mark assets as loaded to skip loading page
  React.useEffect(() => {
    if (isAuthenticated) {
      setAssetsLoaded(true);
      setShowLoader(false);
    }
  }, [isAuthenticated]);

  // Determine if we're on the OAuth callback route.
  const isOnAuthCallbackRoute =
    typeof window !== 'undefined' && window.location.pathname.startsWith('/auth/callback');

  // Check if user has tokens (synchronous check to avoid flash of loading page after sign-in)
  const hasTokens = isLoggedIn();

  // Skip loading page after successful login or while completing OAuth callback
  // Also skip if tokens exist (user just signed in and page reloaded)
  const shouldShowLoader = isMobile && showLoader && !isAuthenticated && !isOnAuthCallbackRoute && !hasTokens;
  
  // During transition, show both loading page and content with crossfade
  if (shouldShowLoader && !assetsLoaded) {
    return <AssetLoader onComplete={handleAssetsLoaded} />;
  }

  // Show coming soon message for non-mobile devices
  if (!isMobile) {
    return <ComingSoonMessage />;
  }

  return (
    <>
      {/* Crossfade overlay during transition */}
      {shouldShowLoader && assetsLoaded && (
        <div className="loading-page loading-page-exiting" style={{ pointerEvents: 'none' }} />
      )}
      <div
        className={`app-content-wrapper ${isTransitioning ? 'app-content-entering' : ''}`}
        style={{ willChange: isTransitioning ? 'opacity' : 'auto' }}
      >
        <Routes>
          <Route path="/" element={<PreLogin />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route
            path="/app"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<HomePage />} />
            <Route path="onboarding" element={<OnboardingPage />} />
            <Route path="play" element={<BettingPage />} />
            <Route path="leaderboard" element={<LeaderboardPage />} />
            <Route path="profile" element={<ProfilePage />} />
          </Route>
        </Routes>
      </div>
      {/* Toaster at the end ensures its portal renders after modal portals in the DOM */}
      <Toaster
        position="top-center"
        theme="dark"
        richColors
        toastOptions={{
          duration: 2000,
        }}
        offset={16}
      />
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SessionProvider>
          <AppContent />
        </SessionProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
