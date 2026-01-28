import React, { useState, useEffect } from 'react';
import { Gift, Clock } from 'lucide-react';

interface DailyCreditsSectionProps {
  dailyStreak: number;
  lastClaimDate: Date | null;
  onClaim: () => Promise<void>;
}

const DailyCreditsSection: React.FC<DailyCreditsSectionProps> = ({
  dailyStreak,
  lastClaimDate,
  onClaim,
}) => {
  const [timeUntilNextClaim, setTimeUntilNextClaim] = useState<string>('');
  const [canClaim, setCanClaim] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);

  useEffect(() => {
    const updateTimer = () => {
      if (!lastClaimDate) {
        setCanClaim(true);
        setTimeUntilNextClaim('');
        return;
      }

      const now = new Date();
      const lastClaim = new Date(lastClaimDate);

      // Calculate next midnight UTC
      const nextMidnight = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + 1,
        0, 0, 0, 0
      ));

      // Check if last claim was before today's UTC midnight
      const todayMidnight = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        0, 0, 0, 0
      ));

      const lastClaimMidnight = new Date(Date.UTC(
        lastClaim.getUTCFullYear(),
        lastClaim.getUTCMonth(),
        lastClaim.getUTCDate(),
        0, 0, 0, 0
      ));

      if (todayMidnight.getTime() > lastClaimMidnight.getTime()) {
        setCanClaim(true);
        setTimeUntilNextClaim('');
      } else {
        setCanClaim(false);
        const diff = nextMidnight.getTime() - now.getTime();
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        setTimeUntilNextClaim(`${hours}h ${minutes}m`);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [lastClaimDate]);

  const handleClaim = async () => {
    if (isClaiming || !canClaim) return;

    setIsClaiming(true);
    try {
      await onClaim();
    } finally {
      setIsClaiming(false);
    }
  };

  const calculateNextReward = () => {
    if (dailyStreak <= 1) return 500; // First claim
    if (dailyStreak <= 3) return 100;
    const bonusMultiplier = Math.floor((dailyStreak - 2) / 2);
    return 100 + (bonusMultiplier * 50);
  };

  const nextReward = calculateNextReward();

  return (
    <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-xl p-4 border border-purple-500/20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-br from-purple-500 to-pink-500 p-2 rounded-lg">
            <Gift className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Daily Credits</h3>
            <p className="text-xs text-gray-400">
              {dailyStreak > 0 ? `${dailyStreak} day streak` : 'Start your streak'}
            </p>
          </div>
        </div>

        {canClaim ? (
          <button
            onClick={handleClaim}
            disabled={isClaiming}
            className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-4 py-2 rounded-lg font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isClaiming ? 'Claiming...' : `Claim ${nextReward}`}
          </button>
        ) : (
          <div className="flex items-center gap-2 text-gray-400 text-sm">
            <Clock className="w-4 h-4" />
            <span>{timeUntilNextClaim}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default DailyCreditsSection;
