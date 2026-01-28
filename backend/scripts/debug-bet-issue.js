/**
 * Debug script to check user credits and bet placement
 */

import { usersPrisma, marketsPrisma } from '../dist/lib/database.js';

async function debugBetIssue() {
  try {
    console.log('\n=== Debugging Bet Placement Issue ===\n');

    // Get all users with their credits
    const users = await usersPrisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        availableCredits: true,
        creditBalance: true,
        expendedCredits: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 5,
    });

    console.log('Recent Users:');
    users.forEach((user, i) => {
      console.log(`\n${i + 1}. ${user.name || user.email}`);
      console.log(`   ID: ${user.id}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Available Credits: ${user.availableCredits}`);
      console.log(`   Credit Balance: ${user.creditBalance}`);
      console.log(`   Expended Credits: ${user.expendedCredits}`);
    });

    // Get recent markets
    const markets = await marketsPrisma.market.findMany({
      where: {
        status: 'open',
      },
      select: {
        id: true,
        title: true,
        status: true,
        yesReserve: true,
        noReserve: true,
        thisOdds: true,
        thatOdds: true,
      },
      take: 5,
    });

    console.log('\n\nRecent Open Markets:');
    markets.forEach((market, i) => {
      console.log(`\n${i + 1}. ${market.title.substring(0, 60)}...`);
      console.log(`   ID: ${market.id}`);
      console.log(`   Status: ${market.status}`);
      console.log(`   Yes Reserve: ${market.yesReserve}`);
      console.log(`   No Reserve: ${market.noReserve}`);
      console.log(`   This Odds: ${market.thisOdds}`);
      console.log(`   That Odds: ${market.thatOdds}`);
    });

    // Get recent bets
    const recentBets = await usersPrisma.bet.findMany({
      orderBy: {
        placedAt: 'desc',
      },
      take: 5,
      include: {
        user: {
          select: {
            email: true,
            name: true,
          },
        },
      },
    });

    console.log('\n\nRecent Bets:');
    recentBets.forEach((bet, i) => {
      console.log(`\n${i + 1}. ${bet.user.name || bet.user.email}`);
      console.log(`   Bet ID: ${bet.id}`);
      console.log(`   Market ID: ${bet.marketId}`);
      console.log(`   Amount: ${bet.amount}`);
      console.log(`   Side: ${bet.side}`);
      console.log(`   Status: ${bet.status}`);
      console.log(`   Placed At: ${bet.placedAt}`);
    });

    console.log('\n\n=== Debug Complete ===\n');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await usersPrisma.$disconnect();
    await marketsPrisma.$disconnect();
  }
}

debugBetIssue();
