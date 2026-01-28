/**
 * Initialize Redis sorted sets from database on server startup
 */
import { usersPrisma as prisma } from '../lib/database.js';
import { safeRedisZAdd } from '../lib/redis.js';

const LEADERBOARD_PNL_KEY = 'leaderboard:live:pnl';
const LEADERBOARD_VOLUME_KEY = 'leaderboard:live:volume';

export async function initializeLeaderboardCache() {
  console.log('🔄 Initializing leaderboard cache from database...');

  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        overallPnL: true,
        totalVolume: true,
      },
    });

    if (users.length === 0) {
      console.log('⚠️  No users found to initialize leaderboard cache');
      return;
    }

    const promises: Promise<any>[] = [];

    for (const user of users) {
      promises.push(
        safeRedisZAdd(LEADERBOARD_PNL_KEY, Number(user.overallPnL), user.id),
        safeRedisZAdd(LEADERBOARD_VOLUME_KEY, Number(user.totalVolume), user.id)
      );
    }

    await Promise.all(promises);

    console.log(`✅ Initialized leaderboard cache with ${users.length} users`);
  } catch (error) {
    console.error('❌ Error initializing leaderboard cache:', error);
  }
}

