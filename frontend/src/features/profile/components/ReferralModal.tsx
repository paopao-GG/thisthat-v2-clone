import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Copy, Check } from 'lucide-react';
import '@/styles/profile/style.css';
import '@/styles/betting/style.css';

interface ReferralModalProps {
  isOpen: boolean;
  referralCode: string;
  referralLink: string;
  onClose: () => void;
  onShareLink: () => void;
}

const ReferralModal: React.FC<ReferralModalProps> = ({
  isOpen,
  referralCode,
  referralLink,
  onClose,
}) => {
  const scrollYRef = useRef<number>(0);
  const [copied, setCopied] = useState(false);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = referralLink;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [referralLink]);

  const handleShareToX = useCallback(() => {
    const text = encodeURIComponent('Swipe the future with ThisThat.\nJoin the beta now and earn 500 free credits!');
    const url = encodeURIComponent(referralLink);
    const twitterUrl = `https://twitter.com/intent/tweet?text=${text}&url=${url}`;
    window.open(twitterUrl, '_blank', 'noopener,noreferrer');
  }, [referralLink]);

  // Disable body scrolling when modal is open
  useEffect(() => {
    if (isOpen) {
      // Save current scroll position
      scrollYRef.current = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollYRef.current}px`;
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';
      
      return () => {
        // Restore scrolling
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        document.body.style.overflow = '';
        window.scrollTo(0, scrollYRef.current);
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    (
      <div 
        className="fixed inset-0 flex items-center justify-center z-[200] p-3 sm:p-4 referral-modal-overlay"
        onClick={(e) => {
          // Only close if clicking the overlay itself, not children
          if (e.target === e.currentTarget) {
            onClose();
          }
        }}
      >
        <div 
          className="relative w-full max-w-md max-h-[90vh] overflow-y-auto p-4 sm:p-5 md:p-6 animate-slideDown referral-modal"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-4 sm:mb-5 md:mb-6">
            <h2 className="text-lg sm:text-xl md:text-2xl font-semibold text-[#f5f5f5]">Invite Friends</h2>
            <button
              onClick={onClose}
              className="text-[#f5f5f5]/60 hover:text-[#f5f5f5] transition-colors"
            >
              <X className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7" />
            </button>
          </div>

          {/* Content */}
          <div className="space-y-4 sm:space-y-5 md:space-y-6">
            {/* Referral Link Section */}
            <div className="space-y-2 sm:space-y-3">
              <p className="text-xs sm:text-sm md:text-base text-[#f5f5f5]/70">Share your referral link with friends</p>
              <div className="flex items-center gap-2 p-3 referral-code-container">
                <span className="flex-1 text-sm font-mono text-[#f5f5f5] truncate">
                  thisthat.xyz/?ref={referralCode}
                </span>
                <button
                  onClick={handleCopyLink}
                  className={`p-2 transition-all duration-200 referral-copy-button ${
                    copied ? 'text-[#4A90B8]' : 'text-[#f5f5f5]/60 hover:text-[#f5f5f5]'
                  }`}
                >
                  {copied ? (
                    <Check className="w-4 h-4 sm:w-5 sm:h-5" />
                  ) : (
                    <Copy className="w-4 h-4 sm:w-5 sm:h-5" />
                  )}
                </button>
              </div>
              {copied && (
                <p className="text-xs text-[#4A90B8] text-center animate-fadeIn">Link copied to clipboard!</p>
              )}
            </div>

            {/* Share to X Button */}
            <div className="space-y-2 sm:space-y-3">
              <button
                onClick={handleShareToX}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 transition-all duration-200 font-medium referral-share-button hover:scale-[1.02] active:scale-[0.98]"
              >
                <svg className="w-4 h-4 sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                Share Link
              </button>
            </div>
          </div>
        </div>
      </div>
    ),
    document.body
  );
};

export default ReferralModal;
