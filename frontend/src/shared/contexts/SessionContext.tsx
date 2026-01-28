import { useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import SessionExpiredModal from '@shared/components/SessionExpiredModal';
import { clearAuthTokens } from '@shared/services/api';
import { SessionContext } from './SessionContext.impl';
export type { SessionContextType } from './SessionContext.types';

interface SessionProviderProps {
  children: ReactNode;
}

const INACTIVITY_THRESHOLD = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
const LAST_ACTIVITY_KEY = 'lastActivityTimestamp';

export function SessionProvider({ children }: SessionProviderProps) {
  const [isSessionExpired, setIsSessionExpired] = useState(false);

  // Track user activity - debounced to avoid excessive localStorage writes
  const updateLastActivity = useCallback(() => {
    // Only update if user has a token (is logged in)
    const accessToken = localStorage.getItem('accessToken');
    if (accessToken) {
      localStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
    }
  }, []);

  // Check inactivity on mount and periodically
  useEffect(() => {
    const checkInactivity = () => {
      // Don't check if already on prelogin page
      if (window.location.pathname === '/') {
        return;
      }

      const lastActivity = localStorage.getItem(LAST_ACTIVITY_KEY);
      const accessToken = localStorage.getItem('accessToken');

      if (accessToken && !lastActivity) {
        // If token exists but no activity timestamp, set it now (fresh login)
        updateLastActivity();
        return; // Don't check for expiry on fresh login
      }

      if (accessToken && lastActivity) {
        const timeSinceLastActivity = Date.now() - parseInt(lastActivity, 10);

        if (timeSinceLastActivity > INACTIVITY_THRESHOLD) {
          // 7 days of inactivity - clear tokens and show modal
          clearAuthTokens();
          localStorage.removeItem(LAST_ACTIVITY_KEY);
          setIsSessionExpired(true);
        }
      }
    };

    // Check on mount (with small delay to let page settle)
    const initialCheck = setTimeout(checkInactivity, 500);

    // Check every hour
    const interval = setInterval(checkInactivity, 60 * 60 * 1000);

    // Also check when page becomes visible (user returns to tab)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkInactivity();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Track activity events (throttled - only on actual user interactions)
    let lastActivityUpdate = 0;
    const throttledUpdateActivity = () => {
      const now = Date.now();
      // Only update once per minute to avoid excessive writes
      if (now - lastActivityUpdate > 60000) {
        lastActivityUpdate = now;
        updateLastActivity();
      }
    };

    const events = ['mousedown', 'keypress', 'scroll', 'touchstart'];
    events.forEach(event => {
      document.addEventListener(event, throttledUpdateActivity, { passive: true });
    });

    return () => {
      clearTimeout(initialCheck);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      events.forEach(event => {
        document.removeEventListener(event, throttledUpdateActivity);
      });
    };
  }, [updateLastActivity]);

  const showSessionExpired = useCallback(() => {
    // Don't show if already on prelogin
    if (window.location.pathname !== '/') {
      setIsSessionExpired(true);
    }
  }, []);

  const handleModalClose = useCallback(() => {
    setIsSessionExpired(false);
  }, []);

  return (
    <SessionContext.Provider value={{ showSessionExpired }}>
      {children}
      <SessionExpiredModal 
        isOpen={isSessionExpired} 
        onClose={handleModalClose}
        title="Session Expired"
        message="Your session has expired due to inactivity. Please sign in again to continue."
      />
    </SessionContext.Provider>
  );
}

