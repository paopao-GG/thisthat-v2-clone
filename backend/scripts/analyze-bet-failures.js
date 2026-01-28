/**
 * Analyze bet failures to find patterns
 */

import { usersPrisma, marketsPrisma } from '../dist/lib/database.js';

async function analyzeBetFailures() {
  try {
    console.log('\n=== Analyzing Recent Bet Patterns ===\n');

    const userId = '2f136a5f-e55b-440c-82c2-33a4587ec3dc';

    // Get user current state
    const user = await usersPrisma.user.findUnique({
      where: { id: userId }
    });

    console.log('Current user state:');
    console.log('Available Credits:', user.availableCredits.toString());
    console.log('Credit Balance:', user.creditBalance.toString());

    // Get recent bets in last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentBets = await usersPrisma.bet.findMany({
      where: {
        userId,
        placedAt: { gte: oneHourAgo }
      },
      orderBy: { placedAt: 'desc' }
    });

    console.log(`\n${recentBets.length} bets in the last hour:\n`);

    // Group by time windows to find patterns
    let currentCredits = Number(user.availableCredits);

    for (let i = recentBets.length - 1; i >= 0; i--) {
      const bet = recentBets[i];
      const time = bet.placedAt.toISOString().substr(11, 12);
      const amount = Number(bet.amount);

      // This is the credits they WOULD have had before this bet
      const creditsBeforeBet = currentCredits + amount;

      console.log(`${time} - ${amount} credits (${bet.status})`);
      console.log(`  Credits before: ${creditsBeforeBet}, After: ${currentCredits}`);

      if (bet.status === 'cancelled') {
        // Cancelled bets return credits
        currentCredits += amount;
      }
    }

    // Check if there are any patterns with market status
    const marketIds = [...new Set(recentBets.map(b => b.marketId))];
    const markets = await marketsPrisma.market.findMany({
      where: { id: { in: marketIds } }
    });

    console.log(`\n${markets.length} unique markets bet on:`);
    markets.forEach(m => {
      const count = recentBets.filter(b => b.marketId === m.id).length;
      console.log(`- ${m.title.substring(0, 50)}... (${count} bets, status: ${m.status})`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await usersPrisma.$disconnect();
    await marketsPrisma.$disconnect();
  }
}

analyzeBetFailures();
