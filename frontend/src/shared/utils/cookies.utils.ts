/**
 * Cookie utility functions for iOS Safari authentication fallback
 * iOS Safari blocks localStorage after OAuth redirects due to Intelligent Tracking Prevention
 * These utilities allow reading tokens from HttpOnly cookies set by the backend
 */

/**
 * Parse all cookies from document.cookie
 * Returns a Map of cookie name -> value
 */
function parseCookies(): Map<string, string> {
  const cookies = new Map<string, string>();
  
  if (typeof document === 'undefined' || !document.cookie) {
    return cookies;
  }

  const cookieStrings = document.cookie.split(';');
  
  for (const cookieString of cookieStrings) {
    const [name, ...valueParts] = cookieString.split('=');
    if (name && valueParts.length > 0) {
      const trimmedName = name.trim();
      const value = valueParts.join('=').trim(); // Handle values with '=' in them
      cookies.set(trimmedName, decodeURIComponent(value));
    }
  }
  
  return cookies;
}

/**
 * Get a cookie value by name
 * Note: HttpOnly cookies cannot be read by JavaScript
 * This only works for cookies without the HttpOnly flag
 */
export function getCookie(name: string): string | null {
  const cookies = parseCookies();
  return cookies.get(name) || null;
}

/**
 * Check if cookies are available and working
 * iOS Safari may block cookies in certain privacy modes
 */
export function areCookiesAvailable(): boolean {
  try {
    // Try to set and read a test cookie
    const testKey = '__cookie_test__';
    const testValue = '1';
    
    document.cookie = `${testKey}=${testValue}; path=/; max-age=1`;
    const hasAccess = document.cookie.includes(`${testKey}=${testValue}`);
    
    // Clean up
    document.cookie = `${testKey}=; path=/; max-age=0`;
    
    return hasAccess;
  } catch (error) {
    console.warn('[Cookies] Cookie access test failed:', error);
    return false;
  }
}

/**
 * Detect if running on iOS Safari
 * iOS Safari has unique localStorage blocking behavior after OAuth
 */
export function isIOSSafari(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }

  const userAgent = navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(userAgent);
  const isSafari = /safari/.test(userAgent) && !/chrome|crios|fxios/.test(userAgent);
  
  return isIOS && isSafari;
}

/**
 * Detect if running on iOS (any browser)
 */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }

  const userAgent = navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(userAgent);
}

/**
 * Delete a cookie by name
 * Sets expiration to the past
 */
export function deleteCookie(name: string): void {
  // Delete for all possible paths and domains
  document.cookie = `${name}=; path=/; max-age=0`;
  document.cookie = `${name}=; path=/; max-age=0; domain=${window.location.hostname}`;
  
  // Try with leading dot for domain
  const domainParts = window.location.hostname.split('.');
  if (domainParts.length > 1) {
    const rootDomain = domainParts.slice(-2).join('.');
    document.cookie = `${name}=; path=/; max-age=0; domain=.${rootDomain}`;
  }
}

/**
 * Clear all auth-related cookies
 */
export function clearAuthCookies(): void {
  deleteCookie('accessToken');
  deleteCookie('refreshToken');
  deleteCookie('userId');
}

