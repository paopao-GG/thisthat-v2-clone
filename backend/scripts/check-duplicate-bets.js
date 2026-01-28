/**
 * Check if user has placed multiple bets on the same market
 * This would indicate the duplicate market bug is happening
 */

import { usersPrisma } from '../dist/lib/database.js';

async function checkDuplicateBets() {
  try {
    console.log('\n=== CHECKING FOR DUPLICATE BETS ON SAME MARKET ===\n');

    // Find all bets grouped by user and market
    const bets = await usersPrisma.bet.findMany({
      where: {
        status: 'pending' // Only check pending bets
      },
      select: {
        id: true,
        userId: true,
        marketId: true,
        amount: true,
        side: true,
        placedAt: true,
        user: {
          select: {
            email: true,
            username: true
          }
        }
      },
      orderBy: {
        placedAt: 'desc'
      }
    });

    console.log(`Total pending bets: ${bets.length}\n`);

    // Group by user and market to find duplicates
    const userMarketMap = new Map();

    for (const bet of bets) {
      const key = `${bet.userId}:${bet.marketId}`;

      if (!userMarketMap.has(key)) {
        userMarketMap.set(key, []);
      }

      userMarketMap.get(key).push(bet);
    }

    // Find duplicates (same user + same market, multiple bets)
    const duplicates = Array.from(userMarketMap.entries())
      .filter(([_, bets]) => bets.length > 1);

    if (duplicates.length === 0) {
      console.log('✅ No duplicate bets found. Each user has at most 1 pending bet per market.');
    } else {
      console.log(`⚠️  Found ${duplicates.length} markets with multiple bets from the same user!\n`);

      duplicates.forEach(([key, bets]) => {
        const [userId, marketId] = key.split(':');
        console.log(`Market: ${marketId.substring(0, 8)}`);
        console.log(`User: ${bets[0].user.username || bets[0].user.email}`);
        console.log(`Number of bets: ${bets.length}`);
        console.log('Bet details:');

        bets.forEach((bet, index) => {
          console.log(`  ${index + 1}. ${bet.amount} credits on ${bet.side.toUpperCase()} at ${bet.placedAt.toISOString()}`);
        });

        console.log('');
      });

      console.log('\n💡 This confirms the bug: Users are betting on the same market multiple times!');
      console.log('This happens because "All Categories" returns duplicate markets in consecutive fetches.');
    }

    await usersPrisma.$disconnect();
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
    await usersPrisma.$disconnect();
    process.exit(1);
  }
}

checkDuplicateBets();
