/**
 * Test bet placement to diagnose the issue
 */

import { usersPrisma, marketsPrisma } from '../dist/lib/database.js';

async function testBetPlacement() {
  try {
    console.log('\n=== Testing Bet Placement ===\n');

    // Get a user (apollo)
    const user = await usersPrisma.user.findFirst({
      where: {
        name: 'apollo'
      }
    });

    if (!user) {
      console.log('User not found');
      return;
    }

    console.log('User:', user.name);
    console.log('User ID:', user.id);
    console.log('Available Credits:', user.availableCredits);
    console.log('Credit Balance:', user.creditBalance);

    // Get a market
    const market = await marketsPrisma.market.findFirst({
      where: {
        status: 'open'
      }
    });

    if (!market) {
      console.log('No open markets found');
      return;
    }

    console.log('\nMarket:', market.title.substring(0, 60));
    console.log('Market ID:', market.id);
    console.log('Yes Reserve:', market.yesReserve);
    console.log('No Reserve:', market.noReserve);

    // Test bet input
    const betInput = {
      marketId: market.id,
      side: 'this',
      amount: 10
    };

    console.log('\nBet Input:');
    console.log(JSON.stringify(betInput, null, 2));

    // Check if amount is less than available credits
    const availableCredits = Number(user.availableCredits);
    console.log('\n--- Credit Check ---');
    console.log('Available Credits (Number):', availableCredits);
    console.log('Bet Amount:', betInput.amount);
    console.log('Has Sufficient Credits?', availableCredits >= betInput.amount);

    if (availableCredits < betInput.amount) {
      console.log('\n❌ INSUFFICIENT CREDITS!');
      console.log('This is the error the user is seeing');
    } else {
      console.log('\n✅ CREDITS ARE SUFFICIENT');
      console.log('The error must be something else');
    }

    console.log('\n=== Test Complete ===\n');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await usersPrisma.$disconnect();
    await marketsPrisma.$disconnect();
  }
}

testBetPlacement();
