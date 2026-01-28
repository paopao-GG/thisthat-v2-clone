import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { setTokens, clearAuthTokens } from '@shared/services/api';
import { getCurrentUser } from '@shared/services/authService';
import { useAuth } from '@shared/contexts/AuthContext';
import SessionExpiredModal from '@shared/components/SessionExpiredModal';
import { getCookie, isIOS } from '@shared/utils/cookies.utils';

/**
 * Map backend auth error + details into a user‑friendly message.
 * This prevents raw provider JSON (like X "Too Many Requests") from
 * being shown directly to the user.
 */
function formatAuthErrorMessage(errorCode: string, backendDetails: string | null): string {
  const details = backendDetails || '';
  const lowerDetails = details.toLowerCase();

  // Handle rate limiting from X (Twitter)
  if (
    errorCode === 'user_info_failed' &&
    (lowerDetails.includes('too many requests') || lowerDetails.includes('status:429') || lowerDetails.includes('status 429'))
  ) {
    return 'X is temporarily limiting sign‑in requests from this app. Please wait a few minutes and try again.';
  }

  // Handle generic failure to fetch user info
  if (errorCode === 'user_info_failed') {
    return 'We could not fetch your X profile. Please try again in a moment or use a different X account.';
  }

  if (errorCode === 'oauth_denied') {
    return 'Login was cancelled. Please try again if you want to continue.';
  }

  if (errorCode === 'oauth_expired' || errorCode === 'state_expired' || errorCode === 'missing_state') {
    return 'Your login link has expired. Please start the sign‑in process again.';
  }

  if (errorCode === 'missing_code') {
    return 'We did not receive the required code from X. Please try signing in again.';
  }

  if (errorCode === 'token_exchange_failed') {
    return 'We had trouble talking to X while completing your login. Please try again in a few moments.';
  }

  if (errorCode === 'database_error') {
    return 'We ran into a temporary problem on our side while logging you in. Please try again shortly.';
  }

  // Fallback: avoid exposing raw JSON / internal messages
  return 'Authentication failed. Please try again.';
}

const AuthCallback: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { refetch } = useAuth();
  const hasProcessedRef = useRef(false);
  const redirectTimeoutRef = useRef<number | null>(null);
  const isSuccessRef = useRef(false); // Track success state for cleanup function

  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [error, setError] = useState<string | null>(null);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  // Show a login failed modal for a few seconds, then smoothly return to PreLogin.
  const showErrorAndRedirect = useCallback((details: string) => {
    setStatus('error');
    setError(details);
    setShowErrorModal(true);

    // Show the error modal briefly, then smoothly redirect
    if (redirectTimeoutRef.current) {
      window.clearTimeout(redirectTimeoutRef.current);
    }
    redirectTimeoutRef.current = window.setTimeout(() => {
      navigate('/', { replace: true });
    }, 3000);
  }, [navigate]);
  useEffect(() => {
    // Prevent repeated processing (can happen due to rerenders, strict mode, or searchParams identity changes).
    if (hasProcessedRef.current) return;
    hasProcessedRef.current = true;

    const processCallback = async () => {
      try {
        // Try URL parameters first (standard flow)
        let accessToken = searchParams.get('accessToken');
        let refreshToken = searchParams.get('refreshToken');
        let userId = searchParams.get('userId');
        const errorParam = searchParams.get('error');

        // Error sent from backend - show modal then redirect back to pre-login
        if (errorParam) {
          const backendDetails = searchParams.get('details');

          const friendlyMessage = formatAuthErrorMessage(errorParam, backendDetails);

          showErrorAndRedirect(friendlyMessage);
          return;
        }

        // If tokens not in URL, try reading from cookies (iOS Safari fallback)
        if (!accessToken || !refreshToken) {
          console.log('[AuthCallback] Tokens not in URL, trying cookies (iOS Safari mode)');
          accessToken = getCookie('accessToken');
          refreshToken = getCookie('refreshToken');
          userId = getCookie('userId');
          
          if (accessToken && refreshToken) {
            console.log('[AuthCallback] ✅ Successfully retrieved tokens from cookies');
          }
        }

        // Missing tokens - treat as a generic OAuth failure
        if (!accessToken || !refreshToken) {
          const iosInfo = isIOS() ? ' (iOS detected - cookies may be blocked)' : '';
          showErrorAndRedirect(`Missing authentication tokens${iosInfo}. Please try again.`);
          return;
        }

        // Store tokens with iOS Safari fallback handling
        try {
          setTokens(accessToken, refreshToken, userId || undefined);

          // Verify localStorage write succeeded (iOS Safari might block it)
          const storedToken = localStorage.getItem('accessToken');
          if (!storedToken || storedToken !== accessToken) {
            console.warn('[AuthCallback] localStorage blocked, using sessionStorage fallback');
            // Try sessionStorage as fallback
            sessionStorage.setItem('accessToken', accessToken);
            sessionStorage.setItem('refreshToken', refreshToken);
            if (userId) sessionStorage.setItem('userId', userId);
          }
        } catch (error) {
          console.error('[AuthCallback] Failed to store tokens in localStorage:', error);
          // Try sessionStorage as fallback
          try {
            sessionStorage.setItem('accessToken', accessToken);
            sessionStorage.setItem('refreshToken', refreshToken);
            if (userId) sessionStorage.setItem('userId', userId);
          } catch (sessionError) {
            console.error('[AuthCallback] sessionStorage also blocked:', sessionError);
            // On iOS Safari, tokens are still available in cookies (HttpOnly)
            // API service will read from cookies automatically
            if (isIOS()) {
              console.log('[AuthCallback] Relying on cookie-based authentication (iOS Safari)');
            }
          }
        }

        // Clean tokens from URL so refreshes/back nav don't re-trigger auth processing.
        try {
          window.history.replaceState({}, document.title, window.location.pathname);
        } catch {
          // ignore
        }

        // Verify authentication by fetching user data
        try {
          await getCurrentUser();

          // Update AuthContext state to reflect authentication
          await refetch();

          setStatus('success');
          isSuccessRef.current = true;

          try {
            sessionStorage.setItem('skipLoadingPage', '1');
            // Clean up pending referral code after successful auth
            sessionStorage.removeItem('pendingReferralCode');
          } catch {
            // ignore
          }

          if (isIOS()) {
            console.log('[AuthCallback] iOS detected - performing immediate redirect to /app');
            window.location.href = '/app';
          } else {
            console.log('[AuthCallback] Auth successful - scheduling smooth transition to /app');

            if (redirectTimeoutRef.current) {
              window.clearTimeout(redirectTimeoutRef.current);
            }

            // Start exit animation before redirect
            redirectTimeoutRef.current = window.setTimeout(() => {
              setIsExiting(true);
              // Wait for exit animation to complete before redirecting
              setTimeout(() => {
                console.log('[AuthCallback] Performing redirect to /app');
                window.location.href = '/app';
              }, 300);
            }, 400);
          }
        } catch (verifyError) {
          console.error("Authentication verification failed:", verifyError);

          // Clear invalid tokens
          clearAuthTokens();

          const errorMessage = verifyError instanceof Error
            ? verifyError.message
            : 'Failed to verify authentication. Please try again.';

          // Show error modal then redirect
          showErrorAndRedirect(errorMessage);
        }

      } catch (err) {
        console.error("OAuth callback error:", err);

        // Clear any tokens that might have been stored
        clearAuthTokens();

        const message =
          err instanceof Error ? err.message : 'Authentication failed';

        // Show error modal then redirect
        showErrorAndRedirect(message);
      }
    };

    processCallback();
    return () => {
      // If component unmounts while redirect is pending, trigger redirect immediately
      // This catches edge cases where iOS Safari unmounts before timeout fires
      if (redirectTimeoutRef.current && isSuccessRef.current) {
        console.log('[AuthCallback] Component unmounting with pending redirect - triggering immediately');
        window.clearTimeout(redirectTimeoutRef.current);
        window.location.href = '/app';
      } else if (redirectTimeoutRef.current) {
        window.clearTimeout(redirectTimeoutRef.current);
        redirectTimeoutRef.current = null;
      }
    };
    // Intentionally avoid depending on `searchParams` identity; we only want to process once per mount.
  }, [navigate, refetch, showErrorAndRedirect, searchParams]);

  return (
    <div
      className={`relative flex flex-col items-center justify-center min-h-screen w-full overflow-hidden auth-callback-container ${isExiting ? 'auth-callback-exiting' : ''}`}
      style={{ background: '#000000' }}
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
          <linearGradient id="spinner-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
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
        }}
      >
        {status === 'processing' && (
          <>
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
                    stroke="url(#spinner-gradient)"
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
            <h2 className="text-xl font-medium text-white mb-2 tracking-wide">Signing In</h2>
            <p className="text-sm text-white/50 font-light">Verifying your credentials...</p>
          </>
        )}

        {status === 'success' && !showErrorModal && (
          <>
            {/* Success checkmark with gradient */}
            <div className="mb-6 relative">
              <div 
                className="w-14 h-14 rounded-full flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, rgba(74, 144, 184, 0.2) 0%, rgba(61, 107, 138, 0.2) 100%)',
                  border: '1px solid rgba(74, 144, 184, 0.3)',
                  boxShadow: '0 0 20px rgba(74, 144, 184, 0.2)',
                }}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                  <path 
                    d="M5 13l4 4L19 7" 
                    stroke="url(#spinner-gradient)" 
                    strokeWidth="2.5" 
                    strokeLinecap="round" 
                    strokeLinejoin="round"
                    className="auth-checkmark"
                  />
                </svg>
              </div>
              {/* Success glow */}
              <div 
                className="absolute inset-0 blur-xl opacity-50 pointer-events-none animate-pulse"
                style={{ background: 'radial-gradient(circle, #4A90B8 0%, transparent 60%)' }}
              />
            </div>
            <h2 className="text-xl font-medium text-white mb-2 tracking-wide">Welcome Back</h2>
            <p className="text-sm text-white/50 font-light">Redirecting you now...</p>
            
            {/* Progress indicator */}
            <div className="mt-5 w-full h-[2px] bg-white/10 rounded-full overflow-hidden">
              <div 
                className="h-full rounded-full auth-progress-bar"
                style={{ background: 'linear-gradient(90deg, #4A90B8 0%, #3D6B8A 100%)' }}
              />
            </div>
          </>
        )}
      </div>

      {/* Login failed modal (reused session modal with error styling) */}
      <SessionExpiredModal
        isOpen={showErrorModal}
        title="Login Failed"
        errorMessage={error || 'Authentication failed. Please try again.'}
        showErrorStyle={true}
        onClose={() => setShowErrorModal(false)}
      />

      <style>{`
        @keyframes checkmark-draw {
          0% {
            stroke-dasharray: 0, 100;
          }
          100% {
            stroke-dasharray: 100, 0;
          }
        }
        
        .auth-checkmark {
          stroke-dasharray: 0, 100;
          animation: checkmark-draw 0.5s cubic-bezier(0.4, 0, 0.2, 1) forwards;
          animation-delay: 0.1s;
        }
        
        @keyframes progress-fill {
          0% {
            width: 0%;
          }
          100% {
            width: 100%;
          }
        }

        .auth-progress-bar {
          animation: progress-fill 0.45s cubic-bezier(0.33, 1, 0.68, 1) forwards;
        }

        .auth-callback-container {
          transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .auth-callback-exiting {
          opacity: 0;
          transform: scale(0.98);
        }
      `}</style>
    </div>
  );
};

export default AuthCallback;
