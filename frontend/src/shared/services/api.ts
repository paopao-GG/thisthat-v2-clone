/**
 * API Client for connecting frontend to backend
 * Handles all HTTP requests and authentication
 */

import { getCookie, isIOS } from '@shared/utils/cookies.utils';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

// Global session expired handler
let sessionExpiredHandler: (() => void) | null = null;

export function setSessionExpiredHandler(handler: () => void): void {
  sessionExpiredHandler = handler;
}

/**
 * Base API response wrapper
 */
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  count?: number;
  details?: unknown[];
}

/**
 * Request options
 */
interface RequestOptions extends RequestInit {
  requiresAuth?: boolean;
}

/**
 * Custom API Error
 */
export class ApiError extends Error {
  public statusCode?: number;
  public details?: unknown[];

  constructor(message: string, statusCode?: number, details?: unknown[]) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

/**
 * Get stored access token
 * On iOS (all browsers): Priority cookies > localStorage > sessionStorage (cookies have fresh OAuth tokens)
 * On other platforms: Priority localStorage > sessionStorage > cookies
 * 
 * Note: ALL iOS browsers use WebKit engine (Safari's engine) and have the same ITP restrictions
 */
function getAccessToken(): string | null {
  // On iOS (any browser), prioritize cookies because localStorage might have stale tokens
  // that we couldn't clear due to ITP blocking storage writes after cross-site redirect
  if (isIOS()) {
    const cookieToken = getCookie('accessToken');
    if (cookieToken) {
      console.log('[API] Using cookie-based authentication (iOS mode)');
      return cookieToken;
    }
  }
  
  // Try localStorage first (most browsers)
  const localToken = localStorage.getItem('accessToken');
  if (localToken) return localToken;
  
  // Try sessionStorage (fallback for blocked localStorage)
  const sessionToken = sessionStorage.getItem('accessToken');
  if (sessionToken) return sessionToken;
  
  // Try cookies as final fallback (non-iOS browsers)
  const cookieToken = getCookie('accessToken');
  if (cookieToken) {
    console.log('[API] Using cookie-based authentication');
    return cookieToken;
  }
  
  return null;
}

/**
 * Get stored refresh token
 * On iOS (all browsers): Priority cookies > localStorage > sessionStorage
 * On other platforms: Priority localStorage > sessionStorage > cookies
 */
function getRefreshToken(): string | null {
  // On iOS (any browser), prioritize cookies (fresh tokens from OAuth)
  if (isIOS()) {
    const cookieToken = getCookie('refreshToken');
    if (cookieToken) return cookieToken;
  }

  // Try localStorage first (most browsers)
  const localToken = localStorage.getItem('refreshToken');
  if (localToken) return localToken;
  
  // Try sessionStorage (fallback for blocked localStorage)
  const sessionToken = sessionStorage.getItem('refreshToken');
  if (sessionToken) return sessionToken;
  
  // Try cookies as final fallback (iOS Safari after OAuth)
  const cookieToken = getCookie('refreshToken');
  if (cookieToken) {
    console.log('[API] Using cookie-based refresh token (iOS Safari mode)');
    return cookieToken;
  }
  
  return null;
}

/**
 * Store auth tokens
 */
export function setAuthTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem('accessToken', accessToken);
  localStorage.setItem('refreshToken', refreshToken);
  // Set last activity timestamp when tokens are set
  localStorage.setItem('lastActivityTimestamp', Date.now().toString());
}

/**
 * Store auth tokens with optional userId (used by AuthCallback)
 */
export function setTokens(accessToken: string, refreshToken: string, userId?: string): void {
  localStorage.setItem('accessToken', accessToken);
  localStorage.setItem('refreshToken', refreshToken);
  // Set last activity timestamp when tokens are set
  localStorage.setItem('lastActivityTimestamp', Date.now().toString());
  if (userId) {
    localStorage.setItem('userId', userId);
  }
}

/**
 * Clear auth tokens
 * Clears from localStorage, sessionStorage, and cookies
 */
export function clearAuthTokens(): void {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('userId');
  sessionStorage.removeItem('accessToken');
  sessionStorage.removeItem('refreshToken');
  sessionStorage.removeItem('userId');
  
  // Also clear cookies (iOS Safari) - dynamic import to avoid circular deps
  import('@shared/utils/cookies.utils').then(({ clearAuthCookies }) => {
    clearAuthCookies();
  }).catch((err) => {
    console.warn('[API] Failed to clear cookies:', err);
  });
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  return !!getAccessToken();
}

/**
 * Refresh the access token
 */
async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    return null;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      clearAuthTokens();
      return null;
    }

    const data = await response.json();
    if (data.success && data.accessToken) {
      localStorage.setItem('accessToken', data.accessToken);
      return data.accessToken;
    }

    return null;
  } catch (error) {
    console.error('Error refreshing token:', error);
    clearAuthTokens();
    return null;
  }
}

/**
 * Make an API request
 */
export async function apiRequest<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { requiresAuth = false, headers = {}, ...fetchOptions } = options;

  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers as Record<string, string>,
  };

  // Add auth token if required
  if (requiresAuth) {
    const token = getAccessToken();
    if (token) {
      requestHeaders['Authorization'] = `Bearer ${token}`;
    }
  }

  try {
    let response = await fetch(url, {
      ...fetchOptions,
      headers: requestHeaders,
      credentials: 'include', // Include cookies in requests (required for iOS Safari cookie auth)
    });

    // If unauthorized and we have a refresh token, try to refresh
    if (response.status === 401 && requiresAuth) {
      const newToken = await refreshAccessToken();
      if (newToken) {
        requestHeaders['Authorization'] = `Bearer ${newToken}`;
        response = await fetch(url, {
          ...fetchOptions,
          headers: requestHeaders as HeadersInit,
          credentials: 'include', // Include cookies in requests
        });
      } else {
        // Session expired - show modal
        if (sessionExpiredHandler) {
          sessionExpiredHandler();
        }
        throw new ApiError('Session expired', 401);
      }
    }

    // Check if response is still unauthorized after refresh attempt
    if (response.status === 401 && requiresAuth) {
      // Session expired - show modal
      if (sessionExpiredHandler) {
        sessionExpiredHandler();
      }
      throw new ApiError('Session expired', 401);
    }

    const data: ApiResponse<T> = await response.json();

    if (!response.ok) {
      throw new ApiError(
        data.error || 'An error occurred',
        response.status,
        data.details
      );
    }

    // Return the data directly if it's a successful response
    if (data.success && data.data !== undefined) {
      return data.data;
    }

    // Some endpoints return the data directly in success field
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    
    // Network or other errors
    console.error('API request failed:', error);
    throw new ApiError(
      error instanceof Error ? error.message : 'Network error occurred'
    );
  }
}

/**
 * GET request
 */
export async function get<T>(endpoint: string, requiresAuth = false): Promise<T> {
  return apiRequest<T>(endpoint, {
    method: 'GET',
    requiresAuth,
  });
}

/**
 * POST request
 */
export async function post<T>(
  endpoint: string,
  body?: unknown,
  requiresAuth = false
): Promise<T> {
  return apiRequest<T>(endpoint, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
    requiresAuth,
  });
}

/**
 * PUT request
 */
export async function put<T>(
  endpoint: string,
  body?: unknown,
  requiresAuth = false
): Promise<T> {
  return apiRequest<T>(endpoint, {
    method: 'PUT',
    body: body ? JSON.stringify(body) : undefined,
    requiresAuth,
  });
}

/**
 * PATCH request
 */
export async function patch<T>(
  endpoint: string,
  body?: unknown,
  requiresAuth = false
): Promise<T> {
  return apiRequest<T>(endpoint, {
    method: 'PATCH',
    body: body ? JSON.stringify(body) : undefined,
    requiresAuth,
  });
}

/**
 * DELETE request
 */
export async function del<T>(endpoint: string, requiresAuth = false): Promise<T> {
  return apiRequest<T>(endpoint, {
    method: 'DELETE',
    requiresAuth,
  });
}

/**
 * Health check
 */
export async function healthCheck(): Promise<{ status: string; timestamp: string }> {
  return get('/health');
}

