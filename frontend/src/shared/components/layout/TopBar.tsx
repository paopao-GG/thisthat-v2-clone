import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Wallet, Plus, Gift } from 'lucide-react';
import { useAuth } from '@shared/hooks';
import '@/styles/shared/style.css';

const TopBar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  // Debug: log when user changes
  React.useEffect(() => {
    console.log('[TopBar] User updated:', {
      creditBalance: user?.creditBalance,
      purchasedCreditsBalance: user?.purchasedCreditsBalance,
      freeCreditsBalance: user?.freeCreditsBalance,
    });
  }, [user]);

  return (
    <header className="fixed top-0 left-0 right-0 px-3 py-3 z-[100] premium-glass border-b topbar-header">
      <div className="flex justify-between items-center">
        <button
          onClick={() => navigate('/app')}
          className="text-[#f5f5f5] p-1.5 rounded-xl transition-all duration-200 hover:scale-105 active:scale-95 w-fit topbar-back-button"
          aria-label="Go to home"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        
        <div className="flex gap-2 items-center">
          {/* Credits Balance */}
          <div className="flex items-center gap-2 pl-2.5 pr-2.5 py-1.5 rounded-xl topbar-wallet-container">
            <Wallet className="w-4 h-4 text-[#4A90B8]" />
            <span className="text-xs font-semibold text-white tracking-wide">
              {(user?.availableCredits ?? 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};

export default TopBar;


