import { usersPrisma as prisma, marketsPrisma } from '../../lib/database.js';
import {
  safeRedisDel,
  safeRedisGet,
  safeRedisKeys,
  safeRedisSetEx,
  safeRedisZAdd,
  safeRedisZRevRangeWithScores,
  safeRedisZCard,
} from '../../lib/redis.js';

const LEADERBOARD_CACHE_TTL = 5 * 60; // 5 minutes in seconds

// Redis sorted set keys for live rankings
const LEADERBOARD_PNL_KEY = 'leaderboard:live:pnl';
const LEADERBOARD_VOLUME_KEY = 'leaderboard:live:volume';

/**
 * Update user score in Redis sorted set (INSTANT)
 */
export async function updateUserScoreInCache(
  userId: string,
  pnl?: number,
  volume?: number
): Promise<void> {
  try {
    const promises: Promise<any>[] = [];

    // Update PnL ranking in Redis sorted set
    if (pnl !== undefined) {
      promises.push(safeRedisZAdd(LEADERBOARD_PNL_KEY, pnl, userId));
    }

    // Update Volume ranking in Redis sorted set
    if (volume !== undefined) {
      promises.push(safeRedisZAdd(LEADERBOARD_VOLUME_KEY, volume, userId));
    }

    await Promise.all(promises);

    // Invalidate old query cache AFTER updating sorted sets
    const keys = await safeRedisKeys('leaderboard:pnl:*');
    const volumeKeys = await safeRedisKeys('leaderboard:volume:*');
    const allKeys = [...keys, ...volumeKeys];
    if (allKeys.length > 0) {
      await safeRedisDel(allKeys);
    }
  } catch (error) {
    console.error('[Leaderboard] Failed to update user score in cache:', error);
  }
}

/**
 * Get real-time leaderboard from Redis sorted set
 */
export async function getLiveLeaderboard(
  type: 'pnl' | 'volume',
  limit: number = 100,
  offset: number = 0
): Promise<{
  leaderboard: any[];
  total: number;
  limit: number;
  offset: number;
}> {
  const key = type === 'pnl' ? LEADERBOARD_PNL_KEY : LEADERBOARD_VOLUME_KEY;

  try {
    // Get top users from sorted set (with scores)
    const results = await safeRedisZRevRangeWithScores(key, offset, offset + limit - 1);

    if (!results || results.length === 0) {
      // Fallback to DB if Redis is empty
      return type === 'pnl' ? getPnLLeaderboard(limit, offset) : getVolumeLeaderboard(limit, offset);
    }

    // Fetch user details from DB (cached separately)
    const userIds = results.map(r => r.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        username: true,
        name: true,
        profileImageUrl: true,
        overallPnL: true,
        totalVolume: true,
        _count: { select: { bets: true } }
      }
    });

    const userMap = new Map(users.map(u => [u.id, u]));

    // Filter results first, then assign sequential ranks
    const filteredResults = results
      .map((result) => {
        const user = userMap.get(result.userId);
        if (!user) return null;

        const totalBets = user._count.bets;
        const volume = Number(user.totalVolume);
        const pnl = Number(user.overallPnL);

        // Filter out users with zero activity
        if (type === 'volume' && volume === 0) return null;
        if (type === 'pnl' && totalBets === 0) return null;

        return { user, totalBets, volume, pnl };
      })
      .filter((data): data is { user: any; totalBets: number; volume: number; pnl: number } => data !== null);

    // Assign sequential ranks after filtering
    const leaderboard = filteredResults.map((data, index) => {
      const wins = Math.floor(data.totalBets * 0.6);
      const winRate = data.totalBets > 0 ? (wins / data.totalBets) * 100 : 0;

      return {
        userId: data.user.id,
        username: data.user.username,
        displayName: data.user.name || data.user.username,
        profileImageUrl: data.user.profileImageUrl,
        rank: offset + index + 1, // Sequential rank after filtering
        totalVolume: data.volume,
        totalPnl: data.pnl,
        winRate: Number(winRate.toFixed(1)),
        totalBets: data.totalBets,
        tokenAllocation: 0,
      };
    });

    return {
      leaderboard,
      total: await safeRedisZCard(key),
      limit,
      offset,
    };
  } catch (error) {
    console.error('Redis leaderboard fetch failed, falling back to DB:', error);
    // Fallback to DB
    return type === 'pnl' ? getPnLLeaderboard(limit, offset) : getVolumeLeaderboard(limit, offset);
  }
}

/**
 * Get PnL leaderboard (top users by overall PnL)
 */
export async function getPnLLeaderboard(limit: number = 100, offset: number = 0) {
  const cacheKey = `leaderboard:pnl:${limit}:${offset}`;
  
  // Try cache first
  const cached = await safeRedisGet(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  // Query database - only users with bets
  const users = await prisma.user.findMany({
    where: {
      bets: {
        some: {} // At least one bet
      }
    },
    orderBy: { overallPnL: 'desc' },
    take: limit,
    skip: offset,
    select: {
      id: true,
      username: true,
      name: true,
      profileImageUrl: true,
      overallPnL: true,
      totalVolume: true,
      rankByPnL: true,
      _count: {
        select: {
          bets: true,
        },
      },
    },
  });

  const total = await prisma.user.count({
    where: {
      bets: {
        some: {} // At least one bet
      }
    }
  });

  const leaderboard = users.map((user, index) => {
    const totalBets = user._count.bets;
    const wins = Math.floor(totalBets * 0.6); // Placeholder - needs actual win tracking
    const winRate = totalBets > 0 ? (wins / totalBets) * 100 : 0;

    return {
      userId: user.id,
      username: user.username,
      displayName: user.name || user.username,
      profileImageUrl: user.profileImageUrl,
      rank: offset + index + 1,
      totalVolume: Number(user.totalVolume),
      totalPnl: Number(user.overallPnL),
      winRate: Number(winRate.toFixed(1)),
      totalBets,
      tokenAllocation: 0,
    };
  });

  const result = {
    leaderboard,
    total,
    limit,
    offset,
  };

  // Cache result
  await safeRedisSetEx(cacheKey, LEADERBOARD_CACHE_TTL, JSON.stringify(result));

  return result;
}

/**
 * Get Volume leaderboard (top users by total volume)
 */
export async function getVolumeLeaderboard(limit: number = 100, offset: number = 0) {
  const cacheKey = `leaderboard:volume:${limit}:${offset}`;

  // Try cache first
  const cached = await safeRedisGet(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  // Query database - only users with bets
  const users = await prisma.user.findMany({
    where: {
      bets: {
        some: {} // At least one bet
      }
    },
    orderBy: { totalVolume: 'desc' },
    take: limit,
    skip: offset,
    select: {
      id: true,
      username: true,
      name: true,
      profileImageUrl: true,
      totalVolume: true,
      overallPnL: true,
      rankByVolume: true,
      _count: {
        select: {
          bets: true,
        },
      },
    },
  });

  const total = await prisma.user.count({
    where: {
      bets: {
        some: {} // At least one bet
      }
    }
  });

  const leaderboard = users.map((user, index) => {
    const totalBets = user._count.bets;
    const wins = Math.floor(totalBets * 0.6); // Placeholder - needs actual win tracking
    const winRate = totalBets > 0 ? (wins / totalBets) * 100 : 0;

    return {
      userId: user.id,
      username: user.username,
      displayName: user.name || user.username,
      profileImageUrl: user.profileImageUrl,
      rank: offset + index + 1,
      totalVolume: Number(user.totalVolume),
      totalPnl: Number(user.overallPnL),
      winRate: Number(winRate.toFixed(1)),
      totalBets,
      tokenAllocation: 0,
    };
  });

  const result = {
    leaderboard,
    total,
    limit,
    offset,
  };

  // Cache result
  await safeRedisSetEx(cacheKey, LEADERBOARD_CACHE_TTL, JSON.stringify(result));

  return result;
}

/**
 * Get category-filtered leaderboard
 * Queries bets joined with markets filtered by category
 */
export async function getCategoryLeaderboard(
  type: 'pnl' | 'volume',
  category: string,
  limit: number = 100,
  offset: number = 0
): Promise<{
  leaderboard: any[];
  total: number;
  limit: number;
  offset: number;
}> {
  const cacheKey = `leaderboard:${type}:category:${category}:${limit}:${offset}`;
  
  // Try cache first
  const cached = await safeRedisGet(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  try {
    // Step 1: Get all market IDs for this category from markets database (case-insensitive)
    const markets = await marketsPrisma.market.findMany({
      where: {
        category: {
          equals: category,
          mode: 'insensitive' as any, // Prisma case-insensitive mode
        }
      },
      select: { id: true },
    });

    if (markets.length === 0) {
      // No markets in this category, return empty leaderboard
      const result = {
        leaderboard: [],
        total: 0,
        limit,
        offset,
      };
      await safeRedisSetEx(cacheKey, LEADERBOARD_CACHE_TTL, JSON.stringify(result));
      return result;
    }

    const marketIds = markets.map(m => m.id);

    // Step 2: Query bets filtered by marketIds and aggregate by user
    const bets = await prisma.bet.findMany({
      where: {
        marketId: { in: marketIds },
      },
      select: {
        userId: true,
        amount: true,
        status: true,
        actualPayout: true,
        potentialPayout: true,
      },
    });

    // Step 3: Aggregate volume and PnL per user
    const userStats = new Map<string, { volume: number; pnl: number; betCount: number; winCount: number }>();

    for (const bet of bets) {
      const userId = bet.userId;
      const amount = Number(bet.amount);
      
      if (!userStats.has(userId)) {
        userStats.set(userId, { volume: 0, pnl: 0, betCount: 0, winCount: 0 });
      }

      const stats = userStats.get(userId)!;
      stats.volume += amount;
      stats.betCount += 1;

      // Calculate PnL for this bet
      if (bet.status === 'won') {
        const payout = bet.actualPayout ? Number(bet.actualPayout) : (bet.potentialPayout ? Number(bet.potentialPayout) : amount);
        stats.pnl += payout - amount;
        stats.winCount += 1;
      } else if (bet.status === 'lost') {
        stats.pnl -= amount;
      }
      // pending and cancelled bets don't affect PnL
    }

    // Step 4: Convert to array, filter out zero activity, and sort
    const userStatsArray = Array.from(userStats.entries())
      .map(([userId, stats]) => ({
        userId,
        ...stats,
      }))
      .filter(stats => {
        // Only include users with actual activity
        if (type === 'volume') {
          return stats.volume > 0;
        } else {
          return stats.betCount > 0;
        }
      });

    // Sort by the requested type
    userStatsArray.sort((a, b) => {
      if (type === 'pnl') {
        return b.pnl - a.pnl;
      } else {
        return b.volume - a.volume;
      }
    });

    // Step 5: Get user details for the top users
    const topUserIds = userStatsArray.slice(offset, offset + limit).map(u => u.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: topUserIds } },
      select: {
        id: true,
        username: true,
        name: true,
        profileImageUrl: true,
      },
    });

    const userMap = new Map(users.map(u => [u.id, u]));

    // Step 6: Build leaderboard entries
    const leaderboard = userStatsArray.slice(offset, offset + limit).map((stats, index) => {
      const user = userMap.get(stats.userId);
      if (!user) return null;

      const winRate = stats.betCount > 0 ? (stats.winCount / stats.betCount) * 100 : 0;

      return {
        userId: user.id,
        username: user.username,
        displayName: user.name || user.username,
        profileImageUrl: user.profileImageUrl,
        rank: offset + index + 1,
        totalVolume: stats.volume,
        totalPnl: stats.pnl,
        winRate: Number(winRate.toFixed(1)),
        totalBets: stats.betCount,
        tokenAllocation: 0,
      };
    }).filter(Boolean);

    const result = {
      leaderboard,
      total: userStatsArray.length,
      limit,
      offset,
    };

    // Cache result
    await safeRedisSetEx(cacheKey, LEADERBOARD_CACHE_TTL, JSON.stringify(result));

    return result;
  } catch (error) {
    console.error('Error fetching category leaderboard:', error);
    // Return empty result on error
    const result = {
      leaderboard: [],
      total: 0,
      limit,
      offset,
    };
    return result;
  }
}

/**
 * Get time-based leaderboard
 * Aggregates PnL and Volume based on time period (today, weekly, monthly, all)
 * Optionally supports category filtering
 */
export async function getTimeBasedLeaderboard(
  type: 'pnl' | 'volume',
  timeFilter: 'today' | 'weekly' | 'monthly' | 'all',
  limit: number = 100,
  offset: number = 0,
  category?: string
): Promise<{
  leaderboard: any[];
  total: number;
  limit: number;
  offset: number;
}> {
  const cacheKey = `leaderboard:${type}:time:${timeFilter}:category:${category || 'all'}:${limit}:${offset}`;

  // Try cache first
  const cached = await safeRedisGet(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  // Calculate time range based on filter
  const now = new Date();
  let startDate: Date | null = null;

  switch (timeFilter) {
    case 'today':
      // Today from 00:00 UTC
      startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      break;
    case 'weekly':
      // Last 7 days
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'monthly':
      // Last 30 days
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case 'all':
      // No time filter - use all-time stats
      startDate = null;
      break;
  }

  // If 'all' and no category, use existing all-time leaderboard
  if (timeFilter === 'all' && !category) {
    return getLiveLeaderboard(type, limit, offset);
  }

  // If 'all' with category, use category leaderboard
  if (timeFilter === 'all' && category) {
    return getCategoryLeaderboard(type, category, limit, offset);
  }

  try {
    // Build where clause for bet query
    const whereClause: any = {
      placedAt: {
        gte: startDate!,
      },
      status: {
        in: ['pending', 'won', 'lost'], // Exclude cancelled
      },
    };

    // If category is specified, filter by market IDs in that category
    if (category) {
      console.log(`[Leaderboard] Filtering by category: "${category}"`);

      // Case-insensitive search for category
      const markets = await marketsPrisma.market.findMany({
        where: {
          category: {
            equals: category,
            mode: 'insensitive' as any, // Prisma case-insensitive mode
          }
        },
        select: { id: true },
      });

      console.log(`[Leaderboard] Found ${markets.length} markets in category "${category}"`);

      if (markets.length === 0) {
        console.log(`[Leaderboard] No markets found for category "${category}", returning empty result`);
        // No markets in this category, return empty leaderboard
        const result = {
          leaderboard: [],
          total: 0,
          limit,
          offset,
        };
        await safeRedisSetEx(cacheKey, 60, JSON.stringify(result));
        return result;
      }

      const marketIds = markets.map(m => m.id);
      console.log(`[Leaderboard] Market IDs for category "${category}":`, marketIds.slice(0, 5));
      whereClause.marketId = { in: marketIds };
    }

    // Query bets within time period (and optionally category) and aggregate by user
    const bets = await prisma.bet.findMany({
      where: whereClause,
      select: {
        userId: true,
        amount: true,
        actualPayout: true,
        potentialPayout: true,
        status: true,
      },
    });

    console.log(`[Leaderboard] Time filter "${timeFilter}", category "${category || 'all'}": Found ${bets.length} bets`);
    console.log(`[Leaderboard] Bet statuses:`, bets.reduce((acc: any, bet) => {
      acc[bet.status] = (acc[bet.status] || 0) + 1;
      return acc;
    }, {}));
    console.log(`[Leaderboard] Time range: ${startDate ? startDate.toISOString() : 'all time'} to ${now.toISOString()}`);

    // Aggregate stats by user
    const userStatsMap = new Map<string, { volume: number; pnl: number; betCount: number; wonCount: number; lostCount: number }>();

    for (const bet of bets) {
      const stats = userStatsMap.get(bet.userId) || { volume: 0, pnl: 0, betCount: 0, wonCount: 0, lostCount: 0 };

      stats.volume += Number(bet.amount);
      stats.betCount += 1;

      // Calculate PnL for this bet
      if (bet.status === 'won' && bet.actualPayout) {
        // Realized gain
        const betPnl = Number(bet.actualPayout) - Number(bet.amount);
        stats.pnl += betPnl;
        stats.wonCount += 1;
        console.log(`[Leaderboard] Won bet: amount=${bet.amount}, payout=${bet.actualPayout}, pnl=${betPnl}`);
      } else if (bet.status === 'lost') {
        // Realized loss
        stats.pnl -= Number(bet.amount);
        stats.lostCount += 1;
        console.log(`[Leaderboard] Lost bet: amount=${bet.amount}, pnl=-${bet.amount}`);
      } else if (bet.status === 'pending' && bet.potentialPayout) {
        // Unrealized PnL for pending bets (estimate based on potential payout)
        const unrealizedPnl = Number(bet.potentialPayout) - Number(bet.amount);
        stats.pnl += unrealizedPnl;
        console.log(`[Leaderboard] Pending bet: amount=${bet.amount}, potential=${bet.potentialPayout}, unrealized pnl=${unrealizedPnl}`);
      }
      // Note: cancelled bets contribute to volume but not PnL

      userStatsMap.set(bet.userId, stats);
    }

    // Convert to array and filter out users with zero activity
    const userStatsArray = Array.from(userStatsMap.entries())
      .map(([userId, stats]) => ({
        userId,
        ...stats,
      }))
      .filter(stats => {
        // Only include users with actual activity
        if (type === 'volume') {
          return stats.volume > 0; // Must have placed bets
        } else {
          return stats.betCount > 0; // Must have bets to have PnL
        }
      });

    // Sort by selected type
    userStatsArray.sort((a, b) => {
      const aValue = type === 'volume' ? a.volume : a.pnl;
      const bValue = type === 'volume' ? b.volume : b.pnl;
      return bValue - aValue; // Descending
    });

    // Apply pagination
    const paginatedStats = userStatsArray.slice(offset, offset + limit);

    // Fetch user details
    const userIds = paginatedStats.map(s => s.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        username: true,
        name: true,
        profileImageUrl: true,
      },
    });

    const userMap = new Map(users.map(u => [u.id, u]));

    // Build leaderboard entries
    const leaderboard = paginatedStats.map((stats, index) => {
      const user = userMap.get(stats.userId);
      if (!user) return null;

      const winRate = stats.betCount > 0 ? ((stats.wonCount / stats.betCount) * 100) : 0;

      console.log(`[Leaderboard] User ${user.username}: volume=${stats.volume}, pnl=${stats.pnl}, bets=${stats.betCount}`);

      return {
        userId: user.id,
        username: user.username,
        displayName: user.name || user.username,
        profileImageUrl: user.profileImageUrl,
        rank: offset + index + 1, // Rank based on actual position in sorted array
        totalVolume: stats.volume,
        totalPnl: stats.pnl,
        winRate: Number(winRate.toFixed(1)),
        totalBets: stats.betCount,
        tokenAllocation: 0,
      };
    }).filter(Boolean);

    const result = {
      leaderboard,
      total: userStatsArray.length,
      limit,
      offset,
    };

    console.log(`[Leaderboard] Returning ${leaderboard.length} entries, total users with activity: ${userStatsArray.length}`);
    if (leaderboard.length > 0) {
      console.log(`[Leaderboard] First entry rank: ${leaderboard[0]?.rank}, Last entry rank: ${leaderboard[leaderboard.length - 1]?.rank}`);
    }

    // Cache result (shorter TTL for time-based queries)
    await safeRedisSetEx(cacheKey, 60, JSON.stringify(result)); // 1 minute cache

    return result;
  } catch (error) {
    console.error('Error fetching time-based leaderboard:', error);
    // Return empty result on error
    const result = {
      leaderboard: [],
      total: 0,
      limit,
      offset,
    };
    return result;
  }
}

/**
 * Get user's current ranking
 */
export async function getUserRanking(userId: string, type: 'pnl' | 'volume'): Promise<{
  rank: number | null;
  totalUsers: number;
  overallPnL: number;
  totalVolume: number;
} | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      rankByPnL: true,
      rankByVolume: true,
      overallPnL: true,
      totalVolume: true,
    },
  });

  if (!user) {
    return null;
  }

  const totalUsers = await prisma.user.count();

  return {
    rank: type === 'pnl' ? user.rankByPnL : user.rankByVolume,
    totalUsers,
    overallPnL: Number(user.overallPnL),
    totalVolume: Number(user.totalVolume),
  };
}

/**
 * Recalculate and update all user rankings
 */
export async function updateAllRankings(): Promise<{
  pnlUpdated: number;
  volumeUpdated: number;
}> {
  // Get all users ordered by PnL
  const pnlUsers = await prisma.user.findMany({
    orderBy: { overallPnL: 'desc' },
    select: { id: true },
  });

  // Get all users ordered by Volume
  const volumeUsers = await prisma.user.findMany({
    orderBy: { totalVolume: 'desc' },
    select: { id: true },
  });

  // Update PnL rankings
  const pnlUpdates = pnlUsers.map((user, index) =>
    prisma.user.update({
      where: { id: user.id },
      data: { rankByPnL: index + 1 },
    }),
  );

  // Update Volume rankings
  const volumeUpdates = volumeUsers.map((user, index) =>
    prisma.user.update({
      where: { id: user.id },
      data: { rankByVolume: index + 1 },
    }),
  );

  await Promise.all([...pnlUpdates, ...volumeUpdates]);

  // Invalidate ONLY old query cache, NOT the live sorted sets
  const pnlKeys = await safeRedisKeys('leaderboard:pnl:*');
  const volumeKeys = await safeRedisKeys('leaderboard:volume:*');
  const allKeys = [...pnlKeys, ...volumeKeys];
  if (allKeys.length > 0) {
    await safeRedisDel(allKeys);
  }

  return {
    pnlUpdated: pnlUsers.length,
    volumeUpdated: volumeUsers.length,
  };
}

