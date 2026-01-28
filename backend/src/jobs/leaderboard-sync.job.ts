/**
 * Sync Redis sorted sets to database rankings
 * Runs every 5 minutes to persist rankings to DB
 */
import { usersPrisma as prisma } from '../lib/database.js';
import { safeRedisZRevRange } from '../lib/redis.js';

const LEADERBOARD_PNL_KEY = 'leaderboard:live:pnl';
const LEADERBOARD_VOLUME_KEY = 'leaderboard:live:volume';

export async function syncLeaderboardToDB() {
  console.log('📊 Syncing leaderboard from Redis to DB...');

  try {
    // Get all users from Redis sorted sets
    const pnlUserIds = await safeRedisZRevRange(LEADERBOARD_PNL_KEY, 0, -1);
    const volumeUserIds = await safeRedisZRevRange(LEADERBOARD_VOLUME_KEY, 0, -1);

    if (pnlUserIds.length === 0 && volumeUserIds.length === 0) {
      console.log('⚠️  No users in Redis sorted sets to sync');
      return;
    }

    // Update PnL rankings (use updateMany to avoid errors on non-existent users)
    const pnlUpdates = pnlUserIds.map((userId, index) =>
      prisma.user.updateMany({
        where: { id: userId },
        data: { rankByPnL: index + 1 },
      })
    );

    // Update Volume rankings
    const volumeUpdates = volumeUserIds.map((userId, index) =>
      prisma.user.updateMany({
        where: { id: userId },
        data: { rankByVolume: index + 1 },
      })
    );

    await Promise.all([...pnlUpdates, ...volumeUpdates]);

    console.log(`✅ Synced ${pnlUserIds.length} PnL and ${volumeUserIds.length} Volume rankings to DB`);
  } catch (error) {
    console.error('❌ Error syncing leaderboard to DB:', error);
  }
}

let intervalId: NodeJS.Timeout | null = null;

export function startLeaderboardSyncJob() {
  if (intervalId) {
    console.log('⚠️  Leaderboard sync job already running');
    return;
  }

  console.log('✅ Starting leaderboard sync job (runs every 5 minutes)');

  // Run immediately
  syncLeaderboardToDB();

  // Then every 5 minutes
  intervalId = setInterval(syncLeaderboardToDB, 5 * 60 * 1000);
}

export function stopLeaderboardSyncJob() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('🛑 Leaderboard sync job stopped');
  }
}

