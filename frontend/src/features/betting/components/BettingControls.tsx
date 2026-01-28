import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import '@/styles/betting/style.css';

interface BettingControlsProps {
  isOpen: boolean;
  onClose: () => void;
  betAmount: number;
  setBetAmount: (amount: number) => void;
  maxCredits: number;
  onConfirm: () => void;
  market?: { isEndingSoon?: boolean };
}

const BettingControls: React.FC<BettingControlsProps> = ({
  isOpen,
  onClose,
  betAmount,
  setBetAmount,
  maxCredits,
  onConfirm,
  market: _market,
}) => {
  const [draftAmount, setDraftAmount] = useState<string>(betAmount.toString());
  const inputRef = useRef<HTMLInputElement>(null);

  const formatWithCommas = (value: string, allowDecimal = false): string => {
    if (allowDecimal) {
      // Allow decimal point
      const cleaned = value.replace(/,/g, '').replace(/[^0-9.]/g, '');
      const parts = cleaned.split('.');
      // Handle multiple decimal points - only keep first one
      if (parts.length > 2) return formatWithCommas(parts[0] + '.' + parts.slice(1).join(''), true);

      // Format integer part with commas
      const intPart = parts[0] ? parseInt(parts[0], 10).toLocaleString() : '0';

      if (parts.length === 2) {
        // Has decimal part
        return intPart + '.' + parts[1].slice(0, 2); // Max 2 decimal places
      }
      // Check if original had trailing decimal point
      if (cleaned.endsWith('.')) {
        return intPart + '.';
      }
      return intPart === '0' && !parts[0] ? '' : intPart;
    }
    const numericValue = value.replace(/,/g, '').replace(/[^0-9]/g, '');
    if (!numericValue) return '';
    return parseInt(numericValue, 10).toLocaleString();
  };

  const parsedDraftAmount = useMemo(() => {
    const numericValue = draftAmount.replace(/,/g, '').replace(/[^0-9.]/g, '');
    if (!numericValue) return 0;
    const value = parseFloat(numericValue);
    return Number.isFinite(value) ? value : 0;
  }, [draftAmount]);

  // Keep maxCredits as-is (support decimals)
  const maxCreditsNum = Math.max(maxCredits, 0);
  const clampToCredits = (value: number) => Math.min(Math.max(value, 0), maxCreditsNum);

  // Helper to check if amount is within max (with small epsilon for floating point)
  const isWithinMax = (amount: number) => amount <= maxCreditsNum + 0.001;

  // Track if we've already initialized for this modal open
  const hasInitializedRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      // Reset initialization flag when modal closes
      hasInitializedRef.current = false;
      return;
    }

    // Only initialize once per modal open, not on every betAmount change
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    // Sync draft amount immediately (deferred to avoid cascading renders)
    queueMicrotask(() => {
      setDraftAmount(betAmount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }));
    });

    // Focus after next frame to ensure DOM is ready
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      // Select all text for easy editing
      inputRef.current?.select();
    });
  }, [isOpen, betAmount]);

  if (!isOpen) return null;

  const handleConfirm = (e: React.MouseEvent) => {
    e.stopPropagation();
    const clamped = clampToCredits(parsedDraftAmount);
    setBetAmount(clamped);
    setDraftAmount(clamped.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }));
    if (clamped > 0 && isWithinMax(clamped)) {
      onConfirm();
      onClose();
    }
  };

  return createPortal(
    (
      <div
        className="fixed inset-0 flex items-center justify-center z-[9999] p-4 betting-controls-modal-overlay"
        onClick={onClose}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
        style={{ pointerEvents: 'auto', touchAction: 'auto' }}
      >
        <div
          className="relative w-full max-w-md p-4 sm:p-5 md:p-6 backdrop-blur-sm animate-slideDown betting-controls-modal"
          onClick={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          style={{ touchAction: 'auto' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-4 sm:mb-5 md:mb-6">
            <h3 className="text-lg sm:text-xl md:text-2xl font-semibold text-[#f5f5f5]">Bet Amount</h3>
            <button
              onClick={onClose}
              className="text-[#f5f5f5]/60 hover:text-[#f5f5f5] transition-colors"
            >
              <X className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7" />
            </button>
          </div>

          {/* Content */}
          <div className="space-y-4 sm:space-y-5 md:space-y-6">
            {/* Amount Section */}
            <div className="space-y-2 sm:space-y-3">
              <p className="text-xs sm:text-sm md:text-base text-[#f5f5f5]/70">Enter bet amount</p>
              <div
                className="flex items-center gap-2 p-2.5 sm:p-3 md:p-3.5 betting-controls-amount-input-container"
                style={{ touchAction: 'auto' }}
                onClick={(e) => {
                  e.stopPropagation();
                  inputRef.current?.focus();
                }}
              >
                <input
                  ref={inputRef}
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9]*\.?[0-9]*"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  value={draftAmount}
                  onChange={(e) => {
                    const next = e.target.value.replace(/,/g, '');
                    setDraftAmount(formatWithCommas(next, true));
                  }}
                  onBlur={(e) => {
                    const numericValue = e.target.value.replace(/,/g, '').replace(/[^0-9.]/g, '');
                    const value = numericValue ? parseFloat(numericValue) : 0;
                    const clamped = clampToCredits(Number.isFinite(value) ? value : 0);
                    setBetAmount(clamped);
                    setDraftAmount(clamped.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }));
                  }}
                  onTouchStart={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  className="flex-1 text-sm sm:text-base md:text-lg font-semibold bg-transparent border-none outline-none text-[#f5f5f5] focus:outline-none betting-controls-amount-input"
                  style={{ touchAction: 'auto', WebkitUserSelect: 'text', userSelect: 'text' }}
                  placeholder="0"
                />
              </div>
              <div className="text-xs sm:text-sm text-[#f5f5f5]/50 text-right">
                Max: {maxCreditsNum.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
              </div>
            </div>

            {/* Increment Buttons */}
            <div className="space-y-2 sm:space-y-3">
              <p className="text-xs sm:text-sm md:text-base text-[#f5f5f5]/70">Quick add</p>
              <div className="flex gap-2">
                <button
                  className="flex-1 py-2 sm:py-2.5 md:py-3 px-2 sm:px-3 md:px-4 text-[#f5f5f5] text-xs sm:text-sm md:text-base font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none betting-controls-increment-button"
                  onClick={() => {
                    const newAmount = Math.min(parsedDraftAmount + 1, maxCreditsNum);
                    setBetAmount(newAmount);
                    setDraftAmount(newAmount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }));
                  }}
                  disabled={parsedDraftAmount >= maxCreditsNum}
                >
                  +1
                </button>
                <button
                  className="flex-1 py-2 sm:py-2.5 md:py-3 px-2 sm:px-3 md:px-4 text-[#f5f5f5] text-xs sm:text-sm md:text-base font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none betting-controls-increment-button"
                  onClick={() => {
                    const newAmount = Math.min(parsedDraftAmount + 250, maxCreditsNum);
                    setBetAmount(newAmount);
                    setDraftAmount(newAmount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }));
                  }}
                  disabled={parsedDraftAmount >= maxCreditsNum}
                >
                  +250
                </button>
                <button
                  className="flex-1 py-2 sm:py-2.5 md:py-3 px-2 sm:px-3 md:px-4 text-[#f5f5f5] text-xs sm:text-sm md:text-base font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none betting-controls-increment-button"
                  onClick={() => {
                    const newAmount = Math.min(parsedDraftAmount + 100, maxCreditsNum);
                    setBetAmount(newAmount);
                    setDraftAmount(newAmount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }));
                  }}
                  disabled={parsedDraftAmount >= maxCreditsNum}
                >
                  +100
                </button>
                <button
                  className="flex-1 py-2 sm:py-2.5 md:py-3 px-2 sm:px-3 md:px-4 text-[#f5f5f5] text-xs sm:text-sm md:text-base font-medium transition-all focus:outline-none betting-controls-increment-button"
                  onClick={() => {
                    setBetAmount(maxCreditsNum);
                    setDraftAmount(maxCreditsNum.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }));
                  }}
                >
                  Max
                </button>
              </div>
            </div>

            {/* Confirm Amount Button */}
            <button
              onClick={handleConfirm}
              className={`w-full flex items-center justify-center gap-2 px-3 sm:px-4 md:px-5 py-2.5 sm:py-3 md:py-3.5 text-xs sm:text-sm md:text-base transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed ${
                parsedDraftAmount > 0 && isWithinMax(parsedDraftAmount)
                  ? 'betting-controls-place-bet-button'
                  : 'betting-controls-place-bet-button-disabled'
              }`}
              disabled={parsedDraftAmount === 0 || !isWithinMax(parsedDraftAmount)}
            >
              BET
            </button>
          </div>
        </div>
      </div>
    ),
    document.body
  );
};

export default BettingControls;
