import React, { useState, useEffect, useRef } from 'react';
import leftLogo from '@/assets/logo/left.png';
import middleLogo from '@/assets/logo/middle.png';
import rightLogo from '@/assets/logo/right.png';
import bannerBg from '@/assets/bg/banner.png';
import '@/styles/shared/style.css';

interface LoadingPageProps {
  onComplete?: () => void;
  minDuration?: number; // Minimum duration in ms for the animation sequence
}

const LoadingPage: React.FC<LoadingPageProps> = ({
  onComplete,
  minDuration = 3000
}) => {
  const [progress, setProgress] = useState(0);
  const [animationPhase, setAnimationPhase] = useState<'entering' | 'assembling' | 'complete' | 'traveling' | 'exiting'>('entering');
  const [progressComplete, setProgressComplete] = useState(false);
  const assetsLoadedRef = useRef(false);

  // Load banner image asset
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      assetsLoadedRef.current = true;
    };
    img.onerror = () => {
      // On error, still mark as loaded to avoid blocking
      console.warn('[LoadingPage] Failed to preload banner image');
      assetsLoadedRef.current = true;
    };
    img.src = bannerBg;

    // If image is already cached
    if (img.complete) {
      assetsLoadedRef.current = true;
    }
  }, []);

  useEffect(() => {
    const originalBodyOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;
    };
  }, []);

  // Progress bar tracks both time and asset loading
  useEffect(() => {
    const startTime = Date.now();
    let animationFrameId: number;
    let transitionTimeout: ReturnType<typeof setTimeout> | null = null;
    let progressCompleteTimeout: ReturnType<typeof setTimeout> | null = null;

    const updateProgress = () => {
      const elapsed = Date.now() - startTime;
      // Progress goes to 85% based on time, last 15% waits for assets
      const timeProgress = Math.min((elapsed / minDuration) * 85, 85);
      const assetProgress = assetsLoadedRef.current ? 15 : 0;
      const totalProgress = Math.min(timeProgress + assetProgress, 100);

      setProgress(totalProgress);

      // Phase transitions based on time progress
      if (timeProgress < 40) {
        setAnimationPhase('entering');
      } else if (timeProgress < 70) {
        setAnimationPhase('assembling');
      } else {
        setAnimationPhase('complete');
      }

      // Only finish when both time elapsed AND assets loaded
      if (totalProgress >= 100 && assetsLoadedRef.current) {
        // Wait for gradient to fully fill before hiding progress bar
        if (!progressCompleteTimeout) {
          progressCompleteTimeout = setTimeout(() => {
            setProgressComplete(true);
          }, 250);
        }

        if (!transitionTimeout) {
          transitionTimeout = setTimeout(() => {
            // Use requestAnimationFrame for smoother phase transitions
            requestAnimationFrame(() => {
              // Start traveling phase - logo moves to PreLogin position
              setAnimationPhase('traveling');

              // Notify that PreLogin can start rendering
              setTimeout(() => {
                onComplete?.();
              }, 100); // Start PreLogin early

              // After logo reaches destination, start exit phase
              setTimeout(() => {
                requestAnimationFrame(() => {
                  setAnimationPhase('exiting');
                });
              }, 600); // Give time for logo to reach position
            });
          }, 300);
        }
      } else {
        animationFrameId = requestAnimationFrame(updateProgress);
      }
    };

    animationFrameId = requestAnimationFrame(updateProgress);

    // Cleanup on unmount
    return () => {
      cancelAnimationFrame(animationFrameId);
      if (transitionTimeout) {
        clearTimeout(transitionTimeout);
      }
      if (progressCompleteTimeout) {
        clearTimeout(progressCompleteTimeout);
      }
    };
  }, [minDuration, onComplete]);

  const isExiting = animationPhase === 'traveling' || animationPhase === 'exiting';

  return (
    <div className={`loading-page ${isExiting ? 'loading-page-traveling' : ''} ${animationPhase === 'exiting' ? 'loading-page-exiting' : ''}`}>
      {/* Animated background particles */}
      <div className="loading-background">
        <div className="particle particle-1"></div>
        <div className="particle particle-2"></div>
        <div className="particle particle-3"></div>
        <div className="particle particle-4"></div>
        <div className="particle particle-5"></div>
      </div>

      <div className={`loading-content ${animationPhase === 'traveling' || animationPhase === 'exiting' ? 'loading-content-traveling' : ''}`}>
        {/* Logo Container */}
        <div className={`logo-container phase-${animationPhase}`}>
          {/* Left Logo - majestic slide from left */}
          <div className="logo-piece logo-left">
            <div className="logo-glow logo-glow-left"></div>
            <img src={leftLogo} alt="Logo Left" className="logo-image" />
          </div>

          {/* Middle Logo - elegant scale and rotation */}
          <div className="logo-piece logo-middle">
            <div className="logo-glow logo-glow-middle"></div>
            <img src={middleLogo} alt="Logo Middle" className="logo-image" />
          </div>

          {/* Right Logo - majestic slide from right */}
          <div className="logo-piece logo-right">
            <div className="logo-glow logo-glow-right"></div>
            <img src={rightLogo} alt="Logo Right" className="logo-image" />
          </div>
        </div>

        {/* Progress Bar */}
        <div className={`progress-container ${progressComplete ? 'progress-complete' : ''}`}>
          <div className="progress-bar-wrapper">
            <div 
              className="progress-bar-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoadingPage;

