/**
 * Authentication Service
 * Handles user authentication and profile management
 */

import { get, post, patch, setAuthTokens, clearAuthTokens } from './api';

/**
 * User profile from backend (/api/v1/auth/me)
 */
export interface UserProfile {
  id: string;
  email: string;
  username: string;
  name: string | null;
  profileImageUrl?: string | null;
  creditBalance: number;
  availableCredits: number;
  expendedCredits: number;
  // Separated credit balances
  freeCreditsBalance: number;
  purchasedCreditsBalance: number;
  consecutiveDaysOnline: number;
  referralCode: string;
  referralCount: number;
  referralCreditsEarned: number;
  totalVolume: number;
  overallPnL: number;
  lastDailyRewardAt: Date | null;
  rankByPnL: number | null;
  rankByVolume: number | null;
  totalBets: number;
  winRate: number;
  dailyStreak: number;
  tokenAllocation: number;
  lockedTokens: number;
  createdAt?: string;
  displayName?: string;
  avatar?: string;
  xHandle?: string;
  credits?: number; // Alias for creditBalance
}

/**
 * OAuth callback params
 */
export interface OAuthCallbackParams {
  accessToken: string;
  refreshToken: string;
  userId: string;
}

/**
 * Initiate X (Twitter) OAuth flow
 * Clears any existing auth cookies/tokens to prevent cache issues on iOS Safari
 */
export function initiateXAuth(): void {
  // Clear any existing auth data before starting new OAuth flow
  // This prevents iOS Safari from caching old/failed login attempts
  
  console.log('[Auth] Clearing all auth data before OAuth...');
  
  // Clear cookies first (iOS Safari fix) - use expires instead of max-age for better compatibility
  const cookiesToClear = ['accessToken', 'refreshToken', 'userId'];
  const pastDate = 'Thu, 01 Jan 1970 00:00:00 GMT';
  
  cookiesToClear.forEach(name => {
    // Clear for all possible paths and domains
    document.cookie = `${name}=; path=/; expires=${pastDate}`;
    document.cookie = `${name}=; path=/; expires=${pastDate}; domain=${window.location.hostname}`;
    
    // Try with leading dot for domain (for subdomains)
    const domainParts = window.location.hostname.split('.');
    if (domainParts.length > 1) {
      const rootDomain = domainParts.slice(-2).join('.');
      document.cookie = `${name}=; path=/; expires=${pastDate}; domain=.${rootDomain}`;
    }
  });
  
  // Clear localStorage/sessionStorage as well
  try {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('userId');
    localStorage.removeItem('lastActivityTimestamp');
    sessionStorage.removeItem('accessToken');
    sessionStorage.removeItem('refreshToken');
    sessionStorage.removeItem('userId');
    sessionStorage.removeItem('lastActivityTimestamp');
  } catch (e) {
    // Ignore if storage is blocked
    console.warn('[Auth] Storage blocked, cookies will be used:', e);
  }
  
  // Add small delay to ensure cookies are cleared before redirect (iOS Safari needs this)
  setTimeout(() => {
    console.log('[Auth] Starting OAuth flow...');
    const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

    // Check for pending referral code and include in OAuth request
    let referralCode = '';
    try {
      referralCode = sessionStorage.getItem('pendingReferralCode') || '';
      if (referralCode) {
        console.log('[Auth] Including referral code in OAuth flow:', referralCode);
      }
    } catch (e) {
      // Ignore storage errors
    }

    // Build OAuth URL with optional referral code
    const oauthUrl = referralCode
      ? `${apiUrl}/api/v1/auth/x?ref=${encodeURIComponent(referralCode)}`
      : `${apiUrl}/api/v1/auth/x`;

    window.location.href = oauthUrl;
  }, 100); // 100ms delay for iOS Safari to process cookie deletion
}

/**
 * Handle OAuth callback
 * Parse tokens from URL and store them
 */
export function handleOAuthCallback(): OAuthCallbackParams | null {
  const params = new URLSearchParams(window.location.search);
  const accessToken = params.get('accessToken');
  const refreshToken = params.get('refreshToken');
  const userId = params.get('userId');

  if (accessToken && refreshToken && userId) {
    setAuthTokens(accessToken, refreshToken);
    localStorage.setItem('userId', userId);
    
    // Clean up URL
    window.history.replaceState({}, document.title, window.location.pathname);
    
    return { accessToken, refreshToken, userId };
  }

  return null;
}

/**
 * Get current user profile
 * Backend queries PostgreSQL database
 */
export async function getCurrentUser(): Promise<UserProfile> {
  const response = await get<{ success: boolean; user: UserProfile } | UserProfile>(
    '/api/v1/auth/me', 
    true
  );
  
  // Handle both wrapped and direct response formats
  const userData = 'user' in response ? response.user : response;
  
  // Add credits alias for backward compatibility
  if (userData.creditBalance && !userData.credits) {
    (userData as UserProfile & { credits: number }).credits = userData.creditBalance;
  }

  // Add avatar alias if profileImageUrl exists
  if (userData.profileImageUrl && !userData.avatar) {
    (userData as UserProfile).avatar = userData.profileImageUrl;
  }

  return userData;
}

/**
 * Update user profile
 * Backend updates PostgreSQL database
 */
export async function updateUserProfile(updates: {
  displayName?: string;
  username?: string;
  avatar?: string;
}): Promise<UserProfile> {
  return patch('/api/v1/users/me', updates, true);
}

/**
 * Get user by ID (public)
 * Backend queries PostgreSQL database
 */
export async function getUserById(userId: string): Promise<UserProfile> {
  return get(`/api/v1/users/${userId}`);
}

/**
 * Logout
 * Backend deletes refresh token from database
 */
export async function logout(): Promise<void> {
  const refreshToken = localStorage.getItem('refreshToken');
  
  if (refreshToken) {
    try {
      await post('/api/v1/auth/logout', { refreshToken });
    } catch (error) {
      console.error('Logout error:', error);
    }
  }
  
  clearAuthTokens();
}

/**
 * Check if user is authenticated
 */
export function isLoggedIn(): boolean {
  // Check localStorage first (most browsers)
  if (localStorage.getItem('accessToken')) return true;
  
  // Check sessionStorage (fallback)
  if (sessionStorage.getItem('accessToken')) return true;
  
  // Check cookies (iOS - all browsers use WebKit with ITP restrictions)
  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const [name] = cookie.split('=');
    if (name.trim() === 'accessToken') return true;
  }
  
  return false;
}

/**
 * Get current user ID from storage
 */
export function getCurrentUserId(): string | null {
  // Check localStorage first
  const localUserId = localStorage.getItem('userId');
  if (localUserId) return localUserId;

  // Check sessionStorage
  const sessionUserId = sessionStorage.getItem('userId');
  if (sessionUserId) return sessionUserId;

  // Check cookies (iOS)
  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const [name, ...valueParts] = cookie.split('=');
    if (name.trim() === 'userId') {
      return decodeURIComponent(valueParts.join('=').trim());
    }
  }

  return null;
}

/**
 * Refresh access token using refresh token
 * Returns true if successful, false otherwise
 */
export async function refreshToken(): Promise<boolean> {
  const currentRefreshToken = localStorage.getItem('refreshToken')
    || sessionStorage.getItem('refreshToken');

  if (!currentRefreshToken) {
    console.warn('[Auth] No refresh token available');
    return false;
  }

  try {
    const response = await post<{ success: boolean; accessToken: string }>(
      '/api/v1/auth/refresh',
      { refreshToken: currentRefreshToken }
    );

    if (response.success && response.accessToken) {
      // Update access token in storage
      try {
        localStorage.setItem('accessToken', response.accessToken);
      } catch {
        // Fallback to sessionStorage if localStorage is blocked
        sessionStorage.setItem('accessToken', response.accessToken);
      }
      console.log('[Auth] Access token refreshed successfully');
      return true;
    }

    return false;
  } catch (error) {
    console.error('[Auth] Failed to refresh token:', error);
    // Don't clear tokens here - let the API layer handle 401s
    return false;
  }
}
