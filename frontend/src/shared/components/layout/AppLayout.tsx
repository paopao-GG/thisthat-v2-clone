import React, { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import TopBar from './TopBar';
import NavigationTabs from '@shared/components/NavigationTabs';
import { CategoryFilterProvider } from '@shared/contexts/CategoryFilterContext';
import bannerBg from '@/assets/bg/banner.png';
import '@/styles/shared/style.css';

const AppLayout: React.FC = () => {
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const [isEntering, setIsEntering] = useState(true);
  const [bannerReady, setBannerReady] = useState(false);

  // Preload banner image before showing content (especially important after sign-in)
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      setBannerReady(true);
    };
    img.onerror = () => {
      // On error, still show content
      console.warn('[AppLayout] Failed to preload banner image');
      setBannerReady(true);
    };
    img.src = bannerBg;

    // If image is already cached
    if (img.complete) {
      setBannerReady(true);
    }
  }, []);

  // Reset scroll position when navigating to a new page
  useEffect(() => {
    window.scrollTo(0, 0);
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
  }, [location.pathname]);

  // Smooth entrance animation after sign-in (wait for banner to be ready)
  useEffect(() => {
    if (isEntering && bannerReady) {
      // Use requestAnimationFrame for smooth animation start
      requestAnimationFrame(() => {
        const timer = setTimeout(() => {
          setIsEntering(false);
        }, 500);
        return () => clearTimeout(timer);
      });
    }
  }, [isEntering, bannerReady]);

  const isHomePage = location.pathname === '/app' || location.pathname === '/app/';
  const isOnboardingPage = location.pathname === '/app/onboarding';
  const isBettingPage = location.pathname.startsWith('/app/play');
  const shouldShowTopBar = !isHomePage && !isOnboardingPage;
  const shouldShowBottomNav = !isHomePage && !isOnboardingPage;
  const shouldShowBannerBg = isHomePage;

  // For HomePage, wait for banner to be ready before rendering
  // For other pages, render immediately
  if (shouldShowBannerBg && !bannerReady) {
    return (
      <div className="flex flex-col min-h-screen w-full" style={{ background: '#0a1214' }} />
    );
  }

  return (
    <CategoryFilterProvider>
      <div
        className={`flex flex-col min-h-screen w-full text-[#f5f5f5] app-layout-container ${shouldShowBannerBg ? 'app-layout-with-banner' : ''} ${isEntering ? 'app-layout-entering' : ''}`}
        style={shouldShowBannerBg ? { '--banner-bg': `url(${bannerBg})` } as React.CSSProperties : undefined}
      >
        {shouldShowTopBar && <TopBar />}
        <main
          ref={mainRef}
          className={`flex-1 overflow-x-hidden ${isBettingPage ? 'overflow-y-hidden' : 'overflow-y-auto'} relative z-[1]`}
          style={{
            WebkitOverflowScrolling: 'touch',
            paddingTop: shouldShowTopBar ? '54px' : '0',
            paddingBottom: shouldShowBottomNav
              ? 'calc(100px + env(safe-area-inset-bottom))'
              : '0',
          }}
        >
          <Outlet />
        </main>

        {shouldShowBottomNav && (
          <div className="fixed bottom-0 left-0 right-0 px-3 py-4 z-50 app-layout-navigation">
            <NavigationTabs />
          </div>
        )}
      </div>
    </CategoryFilterProvider>
  );
};

export default AppLayout;


