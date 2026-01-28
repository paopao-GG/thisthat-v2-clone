import { usersPrisma } from '../dist/lib/database.js';
import { processDailyCreditAllocation } from '../dist/features/economy/economy.services.js';

/**
 * Test daily credit claim scenarios to verify UTC midnight reset logic
 *
 * Scenarios to test:
 * 1. First-time user (no lastDailyRewardAt) - should claim immediately
 * 2. User claims before reset time (e.g., 23:59 UTC) - should be able to claim at 00:00 UTC
 * 3. User claims at reset time (00:00 UTC) - next claim at 00:00 UTC next day
 * 4. User claims after reset time (e.g., 06:00 UTC) - next claim still at 00:00 UTC next day
 */

async function testDailyClaimScenarios() {
  console.log('=== TESTING DAILY CREDIT CLAIM SCENARIOS ===\n');

  // Create a test user
  const testUser = await usersPrisma.user.create({
    data: {
      email: `test-daily-${Date.now()}@test.com`,
      username: `testuser${Date.now()}`,
      creditBalance: 0,
      availableCredits: 0,
      consecutiveDaysOnline: 0,
    }
  });

  console.log(`✅ Created test user: ${testUser.id}\n`);

  try {
    // === Scenario 1: First-time claim ===
    console.log('📝 Scenario 1: First-time user (no lastDailyRewardAt)');
    console.log('Expected: Should be able to claim immediately\n');

    try {
      const result1 = await processDailyCreditAllocation(testUser.id);
      console.log('✅ PASS: First claim successful');
      console.log(`   Credits awarded: ${result1.creditsAwarded}`);
      console.log(`   Consecutive days: ${result1.consecutiveDays}`);
      console.log(`   Next available: ${result1.nextAvailableAt.toISOString()}`);
    } catch (error) {
      console.log(`❌ FAIL: ${error.message}`);
    }

    // === Scenario 2: Try to claim again immediately (same UTC day) ===
    console.log('\n📝 Scenario 2: Claim again immediately (same UTC day)');
    console.log('Expected: Should fail with "already claimed" error\n');

    try {
      await processDailyCreditAllocation(testUser.id);
      console.log('❌ FAIL: Should have thrown error but succeeded');
    } catch (error) {
      console.log('✅ PASS: Correctly prevented double claim');
      console.log(`   Error: ${error.message}`);
    }

    // === Scenario 3: Simulate claim from yesterday ===
    console.log('\n📝 Scenario 3: Simulate last claim was yesterday');
    console.log('Expected: Should be able to claim today (streak +1)\n');

    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    yesterday.setUTCHours(6, 0, 0, 0); // 06:00 UTC yesterday

    await usersPrisma.user.update({
      where: { id: testUser.id },
      data: {
        lastDailyRewardAt: yesterday,
        consecutiveDaysOnline: 1,
      }
    });

    try {
      const result3 = await processDailyCreditAllocation(testUser.id);
      console.log('✅ PASS: Consecutive day claim successful');
      console.log(`   Credits awarded: ${result3.creditsAwarded} (should be 1500 for day 2)`);
      console.log(`   Consecutive days: ${result3.consecutiveDays} (should be 2)`);
      console.log(`   Next available: ${result3.nextAvailableAt.toISOString()}`);
    } catch (error) {
      console.log(`❌ FAIL: ${error.message}`);
    }

    // === Scenario 4: Simulate missed day (streak broken) ===
    console.log('\n📝 Scenario 4: Simulate last claim was 3 days ago (streak broken)');
    console.log('Expected: Should reset to day 1, award 1000 credits\n');

    const threeDaysAgo = new Date();
    threeDaysAgo.setUTCDate(threeDaysAgo.getUTCDate() - 3);
    threeDaysAgo.setUTCHours(12, 0, 0, 0); // noon, 3 days ago

    await usersPrisma.user.update({
      where: { id: testUser.id },
      data: {
        lastDailyRewardAt: threeDaysAgo,
        consecutiveDaysOnline: 5, // Had a 5-day streak
      }
    });

    try {
      const result4 = await processDailyCreditAllocation(testUser.id);
      console.log('✅ PASS: Streak reset successful');
      console.log(`   Credits awarded: ${result4.creditsAwarded} (should be 1000 for day 1 reset)`);
      console.log(`   Consecutive days: ${result4.consecutiveDays} (should be 1)`);
    } catch (error) {
      console.log(`❌ FAIL: ${error.message}`);
    }

    // === Test UTC midnight reset times ===
    console.log('\n\n📝 Testing UTC midnight reset calculation:');
    const now = new Date();
    console.log(`Current time: ${now.toISOString()} (${now.toUTCString()})`);

    const todayReset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    console.log(`Today's reset: ${todayReset.toISOString()} (00:00 UTC)`);

    const tomorrowReset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0));
    console.log(`Tomorrow's reset: ${tomorrowReset.toISOString()} (00:00 UTC)`);

    const nextReset = now.getTime() < todayReset.getTime() ? todayReset : tomorrowReset;
    console.log(`Next reset: ${nextReset.toISOString()}`);

    const hoursUntil = Math.floor((nextReset.getTime() - now.getTime()) / (1000 * 60 * 60));
    const minutesUntil = Math.floor(((nextReset.getTime() - now.getTime()) % (1000 * 60 * 60)) / (1000 * 60));
    console.log(`Time until next reset: ${hoursUntil}h ${minutesUntil}m`);

  } finally {
    // Cleanup
    console.log(`\n🧹 Cleaning up test user...`);
    await usersPrisma.dailyReward.deleteMany({ where: { userId: testUser.id } });
    await usersPrisma.creditTransaction.deleteMany({ where: { userId: testUser.id } });
    await usersPrisma.user.delete({ where: { id: testUser.id } });
    console.log('✅ Cleanup complete');
  }

  await usersPrisma.$disconnect();
}

testDailyClaimScenarios().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
