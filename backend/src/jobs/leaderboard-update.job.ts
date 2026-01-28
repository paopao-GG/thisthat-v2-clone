import { updateAllRankings } from '../features/leaderboard/leaderboard.services.js';

let intervalId: NodeJS.Timeout | null = null;

/**
 * Start the leaderboard update job
 * Runs every 15 minutes to recalculate rankings
 */
export function startLeaderboardUpdateJob() {
  if (intervalId) {
    console.log('⚠️  Leaderboard update job already running');
    return;
  }

  console.log('✅ Starting leaderboard update job (runs every 15 minutes)');

  // Run immediately on start
  updateAllRankings()
    .then((result) => {
      console.log(`📊 Leaderboard update: ${result.pnlUpdated} PnL rankings, ${result.volumeUpdated} Volume rankings updated`);
    })
    .catch((error) => {
      console.error('❌ Error in leaderboard update job:', error);
    });

  // Then run every 15 minutes
  intervalId = setInterval(async () => {
    try {
      const result = await updateAllRankings();
      console.log(`📊 Leaderboard update: ${result.pnlUpdated} PnL rankings, ${result.volumeUpdated} Volume rankings updated`);
    } catch (error) {
      console.error('❌ Error in leaderboard update job:', error);
    }
  }, 15 * 60 * 1000); // 15 minutes
}

/**
 * Stop the leaderboard update job
 */
export function stopLeaderboardUpdateJob() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('🛑 Leaderboard update job stopped');
  }
}




