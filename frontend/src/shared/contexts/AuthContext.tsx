/**
 * Auth Context Provider
 * Manages authentication state globally across the app
 */

import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import type { ReactNode } from 'react';
import { getCurrentUser, isLoggedIn, logout as logoutService, refreshToken } from '@shared/services/authService';
import type { UserProfile } from '@shared/services/authService';

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  isAuthenticated: boolean;
  error: string | null;
  logout: () => Promise<void>;
  refetch: () => Promise<void>;
  /** Silent refetch that updates user data without triggering loading states */
  refetchSilent: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

// Token refresh interval: 6 days (refresh before 7-day expiry)
const TOKEN_REFRESH_INTERVAL = 6 * 24 * 60 * 60 * 1000; // 6 days in milliseconds

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const refreshTimerRef = useRef<number | null>(null);

  /**
   * Refresh tokens proactively before expiry
   */
  const refreshTokensProactively = useCallback(async () => {
    try {
      console.log('[Auth] Proactively refreshing tokens...');
      const success = await refreshToken();
      if (success) {
        console.log('[Auth] Tokens refreshed successfully');
        // Restart the refresh timer
        startRefreshTimer();
      } else {
        console.warn('[Auth] Token refresh failed');
      }
    } catch (err) {
      console.error('[Auth] Error refreshing tokens:', err);
    }
  }, []);

  /**
   * Start the automatic token refresh timer
   */
  const startRefreshTimer = useCallback(() => {
    // Clear existing timer
    if (refreshTimerRef.current !== null) {
      clearTimeout(refreshTimerRef.current);
    }

    // Set new timer to refresh tokens before expiry
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTokensProactively();
    }, TOKEN_REFRESH_INTERVAL);

    console.log('[Auth] Token refresh timer set for 6 days');
  }, [refreshTokensProactively]);

  /**
   * Stop the automatic token refresh timer
   */
  const stopRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current !== null) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
      console.log('[Auth] Token refresh timer cleared');
    }
  }, []);

  const loadUser = async () => {
    try {
      console.log('[AuthContext] loadUser (refetch) called');
      setLoading(true);
      setError(null);

      if (!isLoggedIn()) {
        setUser(null);
        setIsAuthenticated(false);
        stopRefreshTimer();
        return;
      }

      // Call backend API - backend fetches from PostgreSQL
      const userData = await getCurrentUser();
      console.log('[AuthContext] loadUser received userData:', {
        creditBalance: userData.creditBalance,
        purchasedCreditsBalance: userData.purchasedCreditsBalance,
      });
      setUser(userData);
      console.log('[AuthContext] loadUser setUser called');
      setIsAuthenticated(true);

      // Start automatic token refresh timer
      startRefreshTimer();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load user';
      setError(errorMessage);
      setUser(null);
      setIsAuthenticated(false);
      stopRefreshTimer();
      console.error('Error loading user:', err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Silent refetch - updates user data without triggering loading states.
   * Use this after actions like placing bets to refresh credits without UI disruption.
   */
  const refetchSilent = async () => {
    if (!isLoggedIn()) return;
    try {
      console.log('[AuthContext] refetchSilent called');
      const userData = await getCurrentUser();
      console.log('[AuthContext] refetchSilent received userData:', {
        creditBalance: userData.creditBalance,
        purchasedCreditsBalance: userData.purchasedCreditsBalance,
      });
      setUser(userData);
      console.log('[AuthContext] setUser called with new data');
      // Don't change isAuthenticated or loading - keep UI stable
    } catch (err) {
      // Silently fail - don't update error state or auth state
      console.error('Silent refetch failed:', err);
    }
  };

  const handleLogout = async () => {
    try {
      // Stop refresh timer
      stopRefreshTimer();
      // Call backend API - backend deletes refresh token from database
      await logoutService();
      setUser(null);
      setIsAuthenticated(false);
    } catch (err) {
      console.error('Error during logout:', err);
      // Clear local state even if API call fails
      setUser(null);
      setIsAuthenticated(false);
    }
  };

  // Load user on mount
  useEffect(() => {
    loadUser();
  }, []);

  // Handle page visibility change - refresh tokens when user returns to tab
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isAuthenticated && isLoggedIn()) {
        console.log('[Auth] Tab became visible, checking token status...');
        // Optionally refresh tokens when user returns after long absence
        // This ensures tokens are always fresh when user is actively using the app
        refreshTokensProactively();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAuthenticated, refreshTokensProactively]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      stopRefreshTimer();
    };
  }, [stopRefreshTimer]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated,
        error,
        logout: handleLogout,
        refetch: loadUser,
        refetchSilent,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook to access auth context
 * Must be used within an AuthProvider
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
