/**
 * Test placing a bet directly to see the actual error
 */

import { usersPrisma, marketsPrisma } from '../dist/lib/database.js';

const userId = '38984526-816c-494c-a921-2687dc990ac6'; // apollo_asdf
const marketId = 'c73ea5f5-da6e-4ba2-93f6-17f4d3ff12c8';
const amount = 100;

async function testBet() {
  console.log('\n=== Testing Bet Placement ===\n');

  // 1. Get user balances
  const user = await usersPrisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      freeCreditsBalance: true,
      purchasedCreditsBalance: true,
      availableCredits: true,
      creditBalance: true,
    }
  });

  if (!user) {
    console.log('User not found');
    return;
  }

  console.log('User:', user.username);
  console.log('  Free Credits:', Number(user.freeCreditsBalance));
  console.log('  Purchased Credits:', Number(user.purchasedCreditsBalance));
  console.log('  Available Credits:', Number(user.availableCredits));
  console.log('  Credit Balance:', Number(user.creditBalance));
  console.log('  Bet Amount:', amount);
  console.log('');

  // 2. Get market
  const market = await marketsPrisma.market.findUnique({
    where: { id: marketId },
    select: {
      id: true,
      title: true,
      status: true,
      expiresAt: true,
      thisTokenId: true,
      thatTokenId: true,
    }
  });

  if (!market) {
    console.log('Market not found');
    return;
  }

  console.log('Market:', market.title?.substring(0, 50));
  console.log('  Status:', market.status);
  console.log('  Has thisTokenId:', !!market.thisTokenId);
  console.log('  Has thatTokenId:', !!market.thatTokenId);
  console.log('');

  // 3. Check if market is ending soon
  const now = new Date();
  const hoursLeft = market.expiresAt
    ? (market.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60)
    : null;
  const isEndingSoon = hoursLeft !== null && hoursLeft < 24 && hoursLeft > 0;

  console.log('Hours until expiry:', hoursLeft?.toFixed(1) || 'N/A');
  console.log('Is ending soon:', isEndingSoon);
  console.log('');

  // 4. Simulate the atomic balance check
  const freeBalance = Number(user.freeCreditsBalance);
  const purchasedBalance = Number(user.purchasedCreditsBalance);

  console.log('=== Simulating Balance Check ===\n');

  if (isEndingSoon) {
    console.log('Market is ending soon - requires PURCHASED credits only');
    if (purchasedBalance >= amount) {
      console.log('✅ WOULD PASS: Has enough purchased credits');
    } else {
      console.log('❌ WOULD FAIL: Not enough purchased credits');
      console.log(`   Need: ${amount}, Have: ${purchasedBalance}`);
    }
  } else {
    console.log('Normal market - can use FREE or PURCHASED credits');
    if (freeBalance >= amount) {
      console.log('✅ WOULD PASS: Has enough free credits');
    } else if (purchasedBalance >= amount) {
      console.log('✅ WOULD PASS: Has enough purchased credits (fallback)');
    } else {
      console.log('❌ WOULD FAIL: Not enough total credits');
      console.log(`   Need: ${amount}, Have: ${freeBalance + purchasedBalance}`);
    }
  }

  // 5. Actually try the atomic update (dry run - we'll rollback)
  console.log('\n=== Testing Actual Atomic Update ===\n');

  try {
    const result = await usersPrisma.$transaction(async (tx) => {
      // Try free credits first
      let updateResult = await tx.user.updateMany({
        where: {
          id: userId,
          freeCreditsBalance: { gte: amount },
        },
        data: {
          freeCreditsBalance: { decrement: amount },
          availableCredits: { decrement: amount },
          creditBalance: { decrement: amount },
        },
      });

      if (updateResult.count > 0) {
        console.log('✅ Free credits atomic update SUCCEEDED');
        // Rollback by throwing
        throw new Error('ROLLBACK_SUCCESS_FREE');
      }

      // Fallback to purchased
      updateResult = await tx.user.updateMany({
        where: {
          id: userId,
          purchasedCreditsBalance: { gte: amount },
        },
        data: {
          purchasedCreditsBalance: { decrement: amount },
          availableCredits: { decrement: amount },
          creditBalance: { decrement: amount },
        },
      });

      if (updateResult.count > 0) {
        console.log('✅ Purchased credits atomic update SUCCEEDED');
        throw new Error('ROLLBACK_SUCCESS_PURCHASED');
      }

      console.log('❌ Both atomic updates FAILED');
      throw new Error('ROLLBACK_FAILED');
    });
  } catch (e) {
    if (e.message === 'ROLLBACK_SUCCESS_FREE') {
      console.log('   -> Bet would use FREE credits');
    } else if (e.message === 'ROLLBACK_SUCCESS_PURCHASED') {
      console.log('   -> Bet would use PURCHASED credits');
    } else if (e.message === 'ROLLBACK_FAILED') {
      console.log('   -> Bet would FAIL - no sufficient balance in either wallet');
      console.log('\n⚠️  This is likely your bug - DB shows balance but atomic check fails');
    } else {
      console.log('Unexpected error:', e.message);
    }
  }

  await usersPrisma.$disconnect();
  await marketsPrisma.$disconnect();
}

testBet();
