/**
 * Analytics Aggregation Job
 *
 * Runs daily at 01:00 UTC to compute retention and conversion metrics.
 * Results are stored in local PostgreSQL (analytics_metrics table).
 *
 * This job does NOT handle UTM tracking - that's GA4's job.
 */

import cron from 'node-cron';
import { usersPrisma } from '../lib/database.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const BATCH_SIZE = 1000;

// Store last sync timestamp for incremental sync
let lastSyncTimestamp: Date | null = null;

// Type for metric storage
interface MetricData {
  metricName: string;
  metricValue: number;
  dimensions?: Record<string, unknown>;
  periodStart: Date;
  periodEnd: Date;
}

/**
 * Store a computed metric in local PostgreSQL only
 * (Supabase sync removed for local development)
 */
async function storeMetric(metric: MetricData): Promise<void> {
  // Store in local PostgreSQL
  try {
    await usersPrisma.$executeRaw`
      INSERT INTO analytics_metrics (id, metric_name, metric_value, dimensions, period_start, period_end, computed_at)
      VALUES (
        gen_random_uuid(),
        ${metric.metricName},
        ${metric.metricValue},
        ${metric.dimensions ? JSON.stringify(metric.dimensions) : null}::jsonb,
        ${metric.periodStart},
        ${metric.periodEnd},
        NOW()
      )
      ON CONFLICT (metric_name, period_start, period_end)
      DO UPDATE SET
        metric_value = EXCLUDED.metric_value,
        dimensions = EXCLUDED.dimensions,
        computed_at = NOW()
    `;
  } catch (error) {
    console.error(`[Analytics] Failed to store metric ${metric.metricName} locally:`, error);
  }

  // Supabase backup removed for local development
  // If you need cloud backup, implement your own solution
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get day boundaries for a given date
 */
function getDayBoundaries(date: Date): { startOfDay: Date; endOfDay: Date } {
  const startOfDay = new Date(date);
  startOfDay.setUTCHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setUTCHours(23, 59, 59, 999);

  return { startOfDay, endOfDay };
}

// ============================================================================
// COMPUTE FUNCTIONS
// ============================================================================

/**
 * Compute daily active users (DAU) and total bets in a single query
 * Returns both to avoid redundant queries
 */
async function computeDAUAndTotalBets(date: Date): Promise<{ dau: number; totalBets: number }> {
  const { startOfDay, endOfDay } = getDayBoundaries(date);

  // Single query to get both DAU and total bets
  const result = await usersPrisma.$queryRaw<[{ dau: bigint; total_bets: bigint }]>`
    SELECT
      COUNT(DISTINCT user_id) as dau,
      COUNT(*) as total_bets
    FROM bets
    WHERE placed_at >= ${startOfDay} AND placed_at <= ${endOfDay}
  `;

  return {
    dau: Number(result[0]?.dau || 0),
    totalBets: Number(result[0]?.total_bets || 0),
  };
}

/**
 * Compute new signups for a day
 */
async function computeNewSignups(date: Date): Promise<number> {
  const { startOfDay, endOfDay } = getDayBoundaries(date);

  return usersPrisma.user.count({
    where: {
      createdAt: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
  });
}

/**
 * Compute retention rate for a specific day (D1, D7, D30)
 *
 * @param cohortDate - The date users signed up
 * @param retentionDay - Days after signup to check (1, 7, 30)
 */
async function computeRetention(cohortDate: Date, retentionDay: number): Promise<number> {
  const { startOfDay: cohortStart, endOfDay: cohortEnd } = getDayBoundaries(cohortDate);

  // Get users who signed up on cohort date
  const cohortUsers = await usersPrisma.user.findMany({
    where: {
      createdAt: {
        gte: cohortStart,
        lte: cohortEnd,
      },
    },
    select: { id: true },
  });

  if (cohortUsers.length === 0) return 0;

  // Check activity on retention day
  const retentionDate = new Date(cohortDate);
  retentionDate.setUTCDate(retentionDate.getUTCDate() + retentionDay);

  const { startOfDay: retentionStart, endOfDay: retentionEnd } = getDayBoundaries(retentionDate);
  const cohortUserIds = cohortUsers.map(u => u.id);

  const activeOnRetentionDay = await usersPrisma.bet.groupBy({
    by: ['userId'],
    where: {
      userId: { in: cohortUserIds },
      placedAt: {
        gte: retentionStart,
        lte: retentionEnd,
      },
    },
  });

  return (activeOnRetentionDay.length / cohortUsers.length) * 100;
}

/**
 * Compute X connect to first bet conversion rate
 */
async function computeConversionRate(date: Date, newSignups: number): Promise<number> {
  if (newSignups === 0) return 0;

  const { startOfDay, endOfDay } = getDayBoundaries(date);

  // Users who connected X AND placed a bet on the same day
  const usersWhoBet = await usersPrisma.user.count({
    where: {
      createdAt: {
        gte: startOfDay,
        lte: endOfDay,
      },
      bets: {
        some: {
          placedAt: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
      },
    },
  });

  return (usersWhoBet / newSignups) * 100;
}

/**
 * Compute paying user conversion rate
 */
async function computePayingUserRate(date: Date, dau: number): Promise<number> {
  if (dau === 0) return 0;

  const { startOfDay, endOfDay } = getDayBoundaries(date);

  // Get active users on this day
  const activeUsers = await usersPrisma.bet.groupBy({
    by: ['userId'],
    where: {
      placedAt: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
  });

  const activeUserIds = activeUsers.map(u => u.userId);

  // How many of them made a payment
  const payingUsers = await usersPrisma.payment.groupBy({
    by: ['userId'],
    where: {
      userId: { in: activeUserIds },
      status: 'completed',
      completedAt: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
  });

  return (payingUsers.length / activeUsers.length) * 100;
}

/**
 * Compute most popular credit package
 */
async function computePopularPackages(date: Date): Promise<Record<string, number>> {
  const { startOfDay, endOfDay } = getDayBoundaries(date);

  const packageCounts = await usersPrisma.payment.groupBy({
    by: ['packageId'],
    where: {
      status: 'completed',
      completedAt: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
    _count: { id: true },
  });

  const result: Record<string, number> = {};
  for (const pkg of packageCounts) {
    if (pkg.packageId) {
      result[pkg.packageId] = pkg._count.id;
    }
  }

  return result;
}

/**
 * Compute purchase frequency metrics
 */
async function computePurchaseFrequency(date: Date): Promise<{
  avgPurchasesPerUser: number;
  totalPurchases: number;
  uniqueBuyers: number;
  repeatBuyers: number;
}> {
  // Return zero values since payment system has been removed
  return {
    avgPurchasesPerUser: 0,
    totalPurchases: 0,
    uniqueBuyers: 0,
    repeatBuyers: 0,
  };
}

/**
 * Compute repeat users (users who have been active on multiple distinct days)
 */
async function computeRepeatUsers(date: Date): Promise<number> {
  const { endOfDay } = getDayBoundaries(date);

  // Users who placed bets on more than one distinct day (up to and including this date)
  const result = await usersPrisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count
    FROM (
      SELECT user_id
      FROM bets
      WHERE placed_at <= ${endOfDay}
      GROUP BY user_id
      HAVING COUNT(DISTINCT DATE(placed_at)) > 1
    ) repeat_users
  `;

  return Number(result[0]?.count || 0);
}

/**
 * Compute cumulative users with at least one bet (all time up to date)
 */
async function computeUsersWithBets(date: Date): Promise<number> {
  const { endOfDay } = getDayBoundaries(date);

  const result = await usersPrisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(DISTINCT user_id) as count
    FROM bets
    WHERE placed_at <= ${endOfDay}
  `;

  return Number(result[0]?.count || 0);
}

/**
 * Compute cohort retention curve using a SINGLE query instead of N queries
 * Returns retention % for each day from D1 to maxDay
 */
async function computeCohortRetentionCurve(
  cohortDate: Date,
  maxDay: number
): Promise<Record<string, number>> {
  const { startOfDay: cohortStart, endOfDay: cohortEnd } = getDayBoundaries(cohortDate);

  // Get cohort users
  const cohortUsers = await usersPrisma.user.findMany({
    where: {
      createdAt: {
        gte: cohortStart,
        lte: cohortEnd,
      },
    },
    select: { id: true },
  });

  if (cohortUsers.length === 0) {
    const curve: Record<string, number> = { cohort_size: 0 };
    for (let day = 1; day <= maxDay; day++) {
      curve[`d${day}`] = 0;
    }
    return curve;
  }

  const cohortUserIds = cohortUsers.map(u => u.id);
  const curve: Record<string, number> = { cohort_size: cohortUsers.length };

  // Calculate the end date for the retention window
  const retentionEndDate = new Date(cohortDate);
  retentionEndDate.setUTCDate(retentionEndDate.getUTCDate() + maxDay);
  retentionEndDate.setUTCHours(23, 59, 59, 999);

  // Single query to get all retention data for all days at once
  const retentionData = await usersPrisma.$queryRaw<Array<{ day_offset: number; user_count: bigint }>>`
    SELECT
      (DATE(placed_at) - DATE(${cohortStart}))::int as day_offset,
      COUNT(DISTINCT user_id) as user_count
    FROM bets
    WHERE user_id = ANY(${cohortUserIds})
      AND placed_at >= ${cohortStart}
      AND placed_at <= ${retentionEndDate}
    GROUP BY DATE(placed_at)
    ORDER BY day_offset
  `;

  // Build a map of day_offset -> user_count
  const retentionMap = new Map<number, number>();
  for (const row of retentionData) {
    retentionMap.set(row.day_offset, Number(row.user_count));
  }

  // Fill in the curve
  for (let day = 1; day <= maxDay; day++) {
    const usersOnDay = retentionMap.get(day) || 0;
    curve[`d${day}`] = (usersOnDay / cohortUsers.length) * 100;
  }

  return curve;
}

/**
 * Compute total X followers across all users
 * This requires the x_followers_count field to be stored during OAuth
 */
async function computeTotalXFollowers(): Promise<number> {
  try {
    // Sum all followers from OAuth accounts
    const result = await usersPrisma.oAuthAccount.aggregate({
      _sum: {
        followersCount: true,
      },
      where: {
        provider: 'twitter',
      },
    });

    return result._sum.followersCount || 0;
  } catch {
    // Field may not exist yet
    console.log('[Analytics] X followers count not available - field may not exist');
    return 0;
  }
}

// ============================================================================
// INCREMENTAL SYNC FUNCTIONS
// ============================================================================

/**
 * Sync user data to Supabase (incremental - only changed records)
 * Uses updated_at timestamp to track changes since last sync
 */
async function syncUserDataToSupabase(forceFullSync = false): Promise<void> {
  console.log(`[Analytics] Starting ${forceFullSync ? 'full' : 'incremental'} user data sync to Supabase...`);
  const syncStart = Date.now();
  const syncTime = new Date();

  // For incremental sync, only get records updated since last sync
  const sinceTimestamp = forceFullSync ? null : lastSyncTimestamp;

  try {
    // PHASE 1: Sync users first (other tables have FK constraints on user_id)
    const usersResult = await syncUsersIncremental(sinceTimestamp);

    // PHASE 2: Supabase sync disabled for local development
    // If you need cloud backup, implement your own solution
    console.log(`[Analytics] Supabase sync disabled - local development mode`);
    console.log(`[Analytics] Users updated since last sync: ${usersResult}`);

  } catch (error) {
    console.error('[Analytics] User data sync failed:', error);
  }
}

/**
 * Sync users incrementally
 */
async function syncUsersIncremental(sinceTimestamp: Date | null): Promise<number> {
  const whereClause = sinceTimestamp ? { updatedAt: { gte: sinceTimestamp } } : {};

  const totalUsers = await usersPrisma.user.count({ where: whereClause });
  let usersSynced = 0;

  for (let skip = 0; skip < totalUsers; skip += BATCH_SIZE) {
    const users = await usersPrisma.user.findMany({
      where: whereClause,
      skip,
      take: BATCH_SIZE,
    });

    const supabaseUsers: SupabaseUser[] = users.map(u => ({
      id: u.id,
      username: u.username,
      email: u.email,
      name: u.name || undefined,
      profile_image_url: u.profileImageUrl || undefined,
      referral_code: u.referralCode,
      referred_by_id: u.referredById || undefined,
      referral_count: u.referralCount,
      referral_credits_earned: Number(u.referralCreditsEarned),
      free_credits_balance: Number(u.freeCreditsBalance),
      purchased_credits_balance: Number(u.purchasedCreditsBalance),
      total_volume: Number(u.totalVolume),
      overall_pnl: Number(u.overallPnL),
      rank_by_pnl: u.rankByPnL || undefined,
      rank_by_volume: u.rankByVolume || undefined,
      consecutive_days_online: u.consecutiveDaysOnline,
      last_daily_reward_at: u.lastDailyRewardAt?.toISOString(),
      last_login_at: u.lastLoginAt?.toISOString(),
      multiplier_expires_at: u.multiplierExpiresAt?.toISOString(),
      multiplier_package_id: u.multiplierPackageId || undefined,
      created_at: u.createdAt.toISOString(),
      updated_at: u.updatedAt.toISOString(),
    }));

    await syncUsers(supabaseUsers);
    usersSynced += users.length;
  }

  return usersSynced;
}

/**
 * Sync bets incrementally (bets don't have updatedAt, use placedAt/resolvedAt)
 */
async function syncBetsIncremental(sinceTimestamp: Date | null): Promise<number> {
  // For bets, we check placedAt OR resolvedAt since last sync
  const whereClause = sinceTimestamp
    ? {
        OR: [
          { placedAt: { gte: sinceTimestamp } },
          { resolvedAt: { gte: sinceTimestamp } },
        ],
      }
    : {};

  const totalBets = await usersPrisma.bet.count({ where: whereClause });
  let betsSynced = 0;

  for (let skip = 0; skip < totalBets; skip += BATCH_SIZE) {
    const bets = await usersPrisma.bet.findMany({
      where: whereClause,
      skip,
      take: BATCH_SIZE,
    });

    const supabaseBets: SupabaseBet[] = bets.map(b => ({
      id: b.id,
      user_id: b.userId,
      market_id: b.marketId,
      amount: Number(b.amount),
      side: b.side,
      credit_source: b.creditSource,
      shares_received: Number(b.sharesReceived),
      price_at_bet: Number(b.priceAtBet),
      status: b.status,
      placed_at: b.placedAt.toISOString(),
      resolved_at: b.resolvedAt?.toISOString(),
    }));

    await syncBets(supabaseBets);
    betsSynced += bets.length;
  }

  return betsSynced;
}

/**
 * Sync payments incrementally
 * NOTE: Payment system has been removed, returning 0
 */
async function syncPaymentsIncremental(sinceTimestamp: Date | null): Promise<number> {
  return 0;
}

/**
 * Sync OAuth accounts incrementally
 */
async function syncOAuthAccountsIncremental(sinceTimestamp: Date | null): Promise<number> {
  const whereClause = sinceTimestamp ? { updatedAt: { gte: sinceTimestamp } } : {};

  const totalOAuth = await usersPrisma.oAuthAccount.count({ where: whereClause });
  let oauthSynced = 0;

  for (let skip = 0; skip < totalOAuth; skip += BATCH_SIZE) {
    const accounts = await usersPrisma.oAuthAccount.findMany({
      where: whereClause,
      skip,
      take: BATCH_SIZE,
    });

    const supabaseAccounts: SupabaseOAuthAccount[] = accounts.map(a => ({
      id: a.id,
      user_id: a.userId,
      provider: a.provider,
      provider_account_id: a.providerAccountId,
      username: a.username || undefined,
      followers_count: a.followersCount || undefined,
      following_count: a.followingCount || undefined,
      created_at: a.createdAt.toISOString(),
      updated_at: a.updatedAt.toISOString(),
    }));

    await syncOAuthAccounts(supabaseAccounts);
    oauthSynced += accounts.length;
  }

  return oauthSynced;
}

/**
 * Sync credit transactions incrementally
 */
async function syncCreditTransactionsIncremental(sinceTimestamp: Date | null): Promise<number> {
  const whereClause = sinceTimestamp ? { createdAt: { gte: sinceTimestamp } } : {};

  const totalTx = await usersPrisma.creditTransaction.count({ where: whereClause });
  let txSynced = 0;

  for (let skip = 0; skip < totalTx; skip += BATCH_SIZE) {
    const transactions = await usersPrisma.creditTransaction.findMany({
      where: whereClause,
      skip,
      take: BATCH_SIZE,
    });

    const supabaseTx: SupabaseCreditTransaction[] = transactions.map(t => ({
      id: t.id,
      user_id: t.userId,
      amount: Number(t.amount),
      transaction_type: t.transactionType,
      reference_id: t.referenceId || undefined,
      balance_after: Number(t.balanceAfter),
      created_at: t.createdAt.toISOString(),
    }));

    await syncCreditTransactions(supabaseTx);
    txSynced += transactions.length;
  }

  return txSynced;
}

/**
 * Sync daily rewards incrementally
 */
async function syncDailyRewardsIncremental(sinceTimestamp: Date | null): Promise<number> {
  const whereClause = sinceTimestamp ? { claimedAt: { gte: sinceTimestamp } } : {};

  const totalRewards = await usersPrisma.dailyReward.count({ where: whereClause });
  let rewardsSynced = 0;

  for (let skip = 0; skip < totalRewards; skip += BATCH_SIZE) {
    const rewards = await usersPrisma.dailyReward.findMany({
      where: whereClause,
      skip,
      take: BATCH_SIZE,
    });

    const supabaseRewards: SupabaseDailyReward[] = rewards.map(r => ({
      id: r.id,
      user_id: r.userId,
      credits_awarded: Number(r.creditsAwarded),
      claimed_at: r.claimedAt.toISOString(),
    }));

    await syncDailyRewards(supabaseRewards);
    rewardsSynced += rewards.length;
  }

  return rewardsSynced;
}

// ============================================================================
// MAIN AGGREGATION
// ============================================================================

/**
 * Main aggregation function - runs all computations for yesterday
 * Uses parallel execution for independent metrics
 */
async function runDailyAggregation(): Promise<void> {
  console.log('[Analytics] Starting daily aggregation...');
  const startTime = Date.now();

  // Compute metrics for yesterday (complete day)
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  yesterday.setUTCHours(0, 0, 0, 0);

  const periodStart = new Date(yesterday);
  const periodEnd = new Date(yesterday);
  periodEnd.setUTCHours(23, 59, 59, 999);

  try {
    // ========================================================================
    // PHASE 1: Compute independent metrics in parallel
    // ========================================================================
    const [
      dauAndBets,
      newSignups,
      popularPackages,
      purchaseFrequency,
      totalFollowers,
      repeatUsers,
      usersWithBets,
    ] = await Promise.all([
      computeDAUAndTotalBets(yesterday),
      computeNewSignups(yesterday),
      computePopularPackages(yesterday),
      computePurchaseFrequency(yesterday),
      computeTotalXFollowers(),
      computeRepeatUsers(yesterday),
      computeUsersWithBets(yesterday),
    ]);

    const { dau, totalBets } = dauAndBets;
    const avgBets = dau > 0 ? totalBets / dau : 0;

    // ========================================================================
    // PHASE 2: Compute dependent metrics (need pre-computed values)
    // ========================================================================
    const [conversionRate, payingRate] = await Promise.all([
      computeConversionRate(yesterday, newSignups),
      computePayingUserRate(yesterday, dau),
    ]);

    // ========================================================================
    // PHASE 3: Compute retention metrics in parallel
    // ========================================================================
    const d1CohortDate = new Date(yesterday);
    d1CohortDate.setUTCDate(d1CohortDate.getUTCDate() - 1);

    const d7CohortDate = new Date(yesterday);
    d7CohortDate.setUTCDate(d7CohortDate.getUTCDate() - 7);

    const d30CohortDate = new Date(yesterday);
    d30CohortDate.setUTCDate(d30CohortDate.getUTCDate() - 30);

    // Compute all retention metrics in parallel
    const [
      d1Retention,
      d2Retention,
      d3Retention,
      d4Retention,
      d5Retention,
      d6Retention,
      d7Retention,
      d30Retention,
      d7Curve,
      d30Curve,
    ] = await Promise.all([
      computeRetention(d1CohortDate, 1),
      computeRetention(new Date(yesterday.getTime() - 2 * 24 * 60 * 60 * 1000), 2),
      computeRetention(new Date(yesterday.getTime() - 3 * 24 * 60 * 60 * 1000), 3),
      computeRetention(new Date(yesterday.getTime() - 4 * 24 * 60 * 60 * 1000), 4),
      computeRetention(new Date(yesterday.getTime() - 5 * 24 * 60 * 60 * 1000), 5),
      computeRetention(new Date(yesterday.getTime() - 6 * 24 * 60 * 60 * 1000), 6),
      computeRetention(d7CohortDate, 7),
      computeRetention(d30CohortDate, 30),
      computeCohortRetentionCurve(d7CohortDate, 7),
      computeCohortRetentionCurve(d30CohortDate, 30),
    ]);

    // ========================================================================
    // PHASE 4: Store all metrics (can be done in parallel)
    // ========================================================================
    await Promise.all([
      // Core metrics
      storeMetric({ metricName: 'dau', metricValue: dau, periodStart, periodEnd }),
      storeMetric({ metricName: 'new_signups', metricValue: newSignups, periodStart, periodEnd }),
      storeMetric({ metricName: 'total_bets', metricValue: totalBets, periodStart, periodEnd }),
      storeMetric({ metricName: 'avg_bets_per_user', metricValue: avgBets, periodStart, periodEnd }),
      storeMetric({ metricName: 'signup_to_bet_conversion', metricValue: conversionRate, periodStart, periodEnd }),
      storeMetric({ metricName: 'paying_user_rate', metricValue: payingRate, periodStart, periodEnd }),

      // Retention metrics
      storeMetric({ metricName: 'd1_retention', metricValue: d1Retention, periodStart: d1CohortDate, periodEnd: d1CohortDate }),
      storeMetric({ metricName: 'd2_retention', metricValue: d2Retention, periodStart: new Date(yesterday.getTime() - 2 * 24 * 60 * 60 * 1000), periodEnd: new Date(yesterday.getTime() - 2 * 24 * 60 * 60 * 1000) }),
      storeMetric({ metricName: 'd3_retention', metricValue: d3Retention, periodStart: new Date(yesterday.getTime() - 3 * 24 * 60 * 60 * 1000), periodEnd: new Date(yesterday.getTime() - 3 * 24 * 60 * 60 * 1000) }),
      storeMetric({ metricName: 'd4_retention', metricValue: d4Retention, periodStart: new Date(yesterday.getTime() - 4 * 24 * 60 * 60 * 1000), periodEnd: new Date(yesterday.getTime() - 4 * 24 * 60 * 60 * 1000) }),
      storeMetric({ metricName: 'd5_retention', metricValue: d5Retention, periodStart: new Date(yesterday.getTime() - 5 * 24 * 60 * 60 * 1000), periodEnd: new Date(yesterday.getTime() - 5 * 24 * 60 * 60 * 1000) }),
      storeMetric({ metricName: 'd6_retention', metricValue: d6Retention, periodStart: new Date(yesterday.getTime() - 6 * 24 * 60 * 60 * 1000), periodEnd: new Date(yesterday.getTime() - 6 * 24 * 60 * 60 * 1000) }),
      storeMetric({ metricName: 'd7_retention', metricValue: d7Retention, periodStart: d7CohortDate, periodEnd: d7CohortDate }),
      storeMetric({ metricName: 'd30_retention', metricValue: d30Retention, periodStart: d30CohortDate, periodEnd: d30CohortDate }),

      // Package and purchase metrics
      storeMetric({ metricName: 'package_popularity', metricValue: Object.values(popularPackages).reduce((a, b) => a + b, 0), dimensions: popularPackages, periodStart, periodEnd }),
      storeMetric({ metricName: 'purchase_frequency', metricValue: purchaseFrequency.avgPurchasesPerUser, dimensions: { total_purchases: purchaseFrequency.totalPurchases, unique_buyers: purchaseFrequency.uniqueBuyers, repeat_buyers: purchaseFrequency.repeatBuyers }, periodStart, periodEnd }),

      // Social and engagement metrics
      storeMetric({ metricName: 'total_x_followers', metricValue: totalFollowers, periodStart, periodEnd }),
      storeMetric({ metricName: 'keystone_engagement', metricValue: 0, dimensions: { status: 'not_implemented' }, periodStart, periodEnd }),
      storeMetric({ metricName: 'repeat_users', metricValue: repeatUsers, periodStart, periodEnd }),
      storeMetric({ metricName: 'users_with_bets', metricValue: usersWithBets, periodStart, periodEnd }),

      // Retention curves
      storeMetric({ metricName: 'd1_to_d7_retention_curve', metricValue: d7Curve.cohort_size, dimensions: d7Curve, periodStart: d7CohortDate, periodEnd: d7CohortDate }),
      storeMetric({ metricName: 'd1_to_d30_retention_curve', metricValue: d30Curve.cohort_size, dimensions: d30Curve, periodStart: d30CohortDate, periodEnd: d30CohortDate }),
    ]);

    // Log summary
    console.log(`[Analytics] DAU: ${dau}, Signups: ${newSignups}, Bets: ${totalBets}`);
    console.log(`[Analytics] Conversion: ${conversionRate.toFixed(1)}%, Paying: ${payingRate.toFixed(1)}%`);
    console.log(`[Analytics] D1: ${d1Retention.toFixed(1)}%, D7: ${d7Retention.toFixed(1)}%, D30: ${d30Retention.toFixed(1)}%`);

    const elapsed = Date.now() - startTime;
    console.log(`[Analytics] Metrics aggregation completed in ${elapsed}ms`);

    // Note: Sync is handled separately by startSupabaseSyncJob, not duplicated here

  } catch (error) {
    console.error('[Analytics] Aggregation failed:', error);
  }
}

// ============================================================================
// CRON JOBS
// ============================================================================

let analyticsAggregationTask: cron.ScheduledTask | null = null;

/**
 * Start the analytics aggregation cron job
 */
export function startAnalyticsAggregationJob(): void {
  if (analyticsAggregationTask) {
    console.log('[Analytics] Aggregation job already running');
    return;
  }

  // Run daily at 01:00 UTC (after daily credits job at 00:00)
  analyticsAggregationTask = cron.schedule('0 1 * * *', async () => {
    await runDailyAggregation();
  }, {
    timezone: 'UTC',
  });

  console.log('[Analytics] Aggregation job scheduled for 01:00 UTC daily');
}

/**
 * Stop the analytics aggregation cron job
 */
export function stopAnalyticsAggregationJob(): void {
  if (analyticsAggregationTask) {
    analyticsAggregationTask.stop();
    analyticsAggregationTask = null;
    console.log('[Analytics] Aggregation job stopped');
  }
}

/**
 * Run aggregation manually (for testing or backfill)
 */
export async function runAggregationManually(): Promise<void> {
  await runDailyAggregation();
}

export default {
  startAnalyticsAggregationJob,
  stopAnalyticsAggregationJob,
  runAggregationManually,
};
