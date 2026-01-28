import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { clearAuthTokens } from '@shared/services/api';
import '@/styles/shared/style.css';

interface SessionExpiredModalProps {
  isOpen: boolean;
  onClose?: () => void;
  title?: string;
  message?: string;
  errorMessage?: string;
  showErrorStyle?: boolean;
  /**
   * When true, disables the auto-close + redirect behavior.
   * Useful for design/debug previews where we don't want side effects.
   */
  disableAutoRedirect?: boolean;
}

const SessionExpiredModal: React.FC<SessionExpiredModalProps> = ({ 
  isOpen, 
  onClose,
  title = 'Session Expired',
  message = 'Your session has expired due to inactivity. Please sign in again.',
  errorMessage,
  showErrorStyle = false,
  disableAutoRedirect = false
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isClosing, setIsClosing] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);

  // Don't show modal if already on prelogin page
  const isOnPrelogin = location.pathname === '/';

  useEffect(() => {
    if (isOpen && !isOnPrelogin) {
      // Trigger entrance animation
      requestAnimationFrame(() => setIsVisible(true));
    } else {
      // Defer state update to avoid synchronous setState in effect
      requestAnimationFrame(() => setIsVisible(false));
    }
  }, [isOpen, isOnPrelogin]);

  useEffect(() => {
    if (isOpen && !isClosing && !disableAutoRedirect && !isOnPrelogin) {
      // Clear tokens immediately
      clearAuthTokens();
      localStorage.removeItem('lastActivityTimestamp');
      
      // Start fade out after 2.5 seconds
      const fadeTimer = setTimeout(() => {
        setIsFadingOut(true);
      }, 2500);

      // Navigate after fade starts (modal fades while PreLogin loads)
      const navTimer = setTimeout(() => {
        navigate('/', { replace: true });
      }, 2700);
      
      // Close modal after PreLogin has time to render
      const closeTimer = setTimeout(() => {
        setIsClosing(true);
        if (onClose) {
          onClose();
        }
      }, 3200);

      return () => {
        clearTimeout(fadeTimer);
        clearTimeout(navTimer);
        clearTimeout(closeTimer);
      };
    }
  }, [isOpen, isClosing, navigate, onClose, disableAutoRedirect, isOnPrelogin]);

  // Reset states when modal closes
  useEffect(() => {
    if (!isOpen) {
      requestAnimationFrame(() => {
        setIsClosing(false);
        setIsFadingOut(false);
        setIsVisible(false);
      });
    }
  }, [isOpen]);

  if (!isOpen || isClosing || isOnPrelogin) return null;

  // Use error colors (warm red/orange) for error style, blue gradient for normal
  const accentColor = showErrorStyle ? '#ef4444' : '#4A90B8';
  const accentColorSecondary = showErrorStyle ? '#dc2626' : '#3D6B8A';

  return createPortal(
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{
        background: isFadingOut ? 'rgba(0, 0, 0, 0)' : 'rgba(0, 0, 0, 0.85)',
        backdropFilter: isFadingOut ? 'blur(0px)' : 'blur(12px) saturate(180%)',
        WebkitBackdropFilter: isFadingOut ? 'blur(0px)' : 'blur(12px) saturate(180%)',
        opacity: isVisible ? 1 : 0,
        transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      {/* Gradient SVG definitions */}
      <svg width="0" height="0" className="absolute">
        <defs>
          <linearGradient id="modal-icon-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={accentColor} />
            <stop offset="100%" stopColor={accentColorSecondary} />
          </linearGradient>
        </defs>
      </svg>

      {/* Ambient glow */}
      <div 
        className="absolute w-[250px] h-[250px] rounded-full opacity-30 blur-[80px] pointer-events-none"
        style={{ 
          background: `radial-gradient(circle, ${accentColor} 0%, transparent 70%)`,
          transition: 'background 0.3s ease',
        }}
      />

      <div 
        className="relative w-full max-w-sm rounded-2xl px-6 py-8"
        style={{
          background: 'rgba(15, 15, 20, 0.9)',
          backdropFilter: 'blur(40px) saturate(180%)',
          WebkitBackdropFilter: 'blur(40px) saturate(180%)',
          border: `1px solid ${showErrorStyle ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.08)'}`,
          boxShadow: `0 24px 80px rgba(0, 0, 0, 0.6), 0 0 40px ${showErrorStyle ? 'rgba(239, 68, 68, 0.1)' : 'rgba(74, 144, 184, 0.1)'}, inset 0 1px 0 rgba(255, 255, 255, 0.05)`,
          transform: isFadingOut 
            ? 'scale(0.95) translateY(-20px)' 
            : isVisible 
              ? 'scale(1) translateY(0)' 
              : 'scale(0.95) translateY(10px)',
          opacity: isFadingOut ? 0 : isVisible ? 1 : 0,
          transition: 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.5s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center text-center">
          {/* Icon */}
          <div 
            className="mb-5 w-14 h-14 rounded-full flex items-center justify-center"
            style={{
              background: `linear-gradient(135deg, ${showErrorStyle ? 'rgba(239, 68, 68, 0.15)' : 'rgba(74, 144, 184, 0.15)'} 0%, ${showErrorStyle ? 'rgba(220, 38, 38, 0.15)' : 'rgba(61, 107, 138, 0.15)'} 100%)`,
              border: `1px solid ${showErrorStyle ? 'rgba(239, 68, 68, 0.25)' : 'rgba(74, 144, 184, 0.25)'}`,
              boxShadow: `0 0 24px ${showErrorStyle ? 'rgba(239, 68, 68, 0.15)' : 'rgba(74, 144, 184, 0.15)'}`,
            }}
          >
            {showErrorStyle ? (
              // X icon for error
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                <path 
                  d="M18 6L6 18M6 6l12 12" 
                  stroke="url(#modal-icon-gradient)" 
                  strokeWidth="2.5" 
                  strokeLinecap="round" 
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              // Clock icon for session expired
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                <circle 
                  cx="12" 
                  cy="12" 
                  r="9" 
                  stroke="url(#modal-icon-gradient)" 
                  strokeWidth="2"
                />
                <path 
                  d="M12 7v5l3 3" 
                  stroke="url(#modal-icon-gradient)" 
                  strokeWidth="2" 
                  strokeLinecap="round" 
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </div>

          {/* Title */}
          <h2 className="mb-2 text-xl font-medium tracking-wide text-white">
            {title}
          </h2>

          {/* Message */}
          <p 
            className="mb-5 text-sm leading-relaxed font-light"
            style={{ color: showErrorStyle ? 'rgba(252, 165, 165, 0.9)' : 'rgba(255, 255, 255, 0.6)' }}
          >
            {errorMessage || message}
          </p>

          {/* Progress bar */}
          <div className="w-full h-[2px] bg-white/10 rounded-full overflow-hidden mb-3">
            <div 
              className="h-full rounded-full session-modal-progress"
              style={{ 
                background: `linear-gradient(90deg, ${accentColor} 0%, ${accentColorSecondary} 100%)`,
              }}
            />
          </div>

          {/* Redirect notice */}
          <p className="text-[0.7rem] uppercase tracking-[0.15em] text-white/40 font-light">
            Redirecting...
          </p>
        </div>
      </div>

      <style>{`
        @keyframes session-progress-fill {
          0% {
            width: 0%;
          }
          100% {
            width: 100%;
          }
        }
        
        .session-modal-progress {
          animation: session-progress-fill 2.5s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }
      `}</style>
    </div>,
    document.body
  );
};

export default SessionExpiredModal;

