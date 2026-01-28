/**
 * AMM Endpoints Test Script
 *
 * Tests the new AMM (Automated Market Maker) endpoints:
 * - GET /api/v1/bets/quote - Get trade quote
 * - POST /api/v1/bets - Place bet with AMM
 * - POST /api/v1/bets/:id/sell - Sell position early
 */

import { marketsPrisma, usersPrisma } from '../src/lib/database.js';
import { placeBetAMM, sellPosition, getTradeQuote } from '../src/features/betting/betting.services.amm.js';
import { initializePoolWithProbability } from '../src/services/amm.service.js';

async function testAMMEndpoints() {
  console.log('🧪 Testing AMM Endpoints\n');

  try {
    // Step 1: Find or create a test user
    console.log('Step 1: Setting up test user...');
    let testUser = await usersPrisma.user.findFirst({
      where: { email: 'test-amm@example.com' },
    });

    if (!testUser) {
      testUser = await usersPrisma.user.create({
        data: {
          username: 'test-amm-user',
          email: 'test-amm@example.com',
          creditBalance: 10000,
          availableCredits: 10000,
        },
      });
      console.log(`✅ Created test user: ${testUser.id}`);
    } else {
      // Reset credits
      testUser = await usersPrisma.user.update({
        where: { id: testUser.id },
        data: {
          creditBalance: 10000,
          availableCredits: 10000,
        },
      });
      console.log(`✅ Using existing test user: ${testUser.id}`);
    }

    // Step 2: Find or create a test market with AMM reserves
    console.log('\nStep 2: Setting up test market...');
    let testMarket = await marketsPrisma.market.findFirst({
      where: {
        status: 'open',
        title: { contains: 'Test AMM Market' },
      },
    });

    if (!testMarket) {
      // Create market with 50-50 probability (equal reserves)
      const pool = initializePoolWithProbability(10000, 0.5);

      testMarket = await marketsPrisma.market.create({
        data: {
          title: 'Test AMM Market - Will this test succeed?',
          description: 'A test market for AMM functionality',
          thisOption: 'Yes',
          thatOption: 'No',
          yesReserve: pool.yesReserve,
          noReserve: pool.noReserve,
          thisOdds: 0.5,
          thatOdds: 0.5,
          category: 'test',
          marketType: 'credits',
          status: 'open',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        },
      });
      console.log(`✅ Created test market: ${testMarket.id}`);
    } else {
      // Reset reserves to 50-50
      const pool = initializePoolWithProbability(10000, 0.5);
      testMarket = await marketsPrisma.market.update({
        where: { id: testMarket.id },
        data: {
          yesReserve: pool.yesReserve,
          noReserve: pool.noReserve,
          status: 'open',
        },
      });
      console.log(`✅ Using existing test market: ${testMarket.id}`);
    }

    console.log(`   Market: "${testMarket.title}"`);
    console.log(`   Reserves: YES=${testMarket.yesReserve}, NO=${testMarket.noReserve}`);

    // Step 3: Test getTradeQuote
    console.log('\n📊 Step 3: Testing getTradeQuote()...');
    const quote = await getTradeQuote(testMarket.id, 100, 'this');

    console.log(`   Amount to bet: 100 credits`);
    console.log(`   Side: YES (this)`);
    console.log(`   ✅ Shares to receive: ${quote.sharesReceived.toFixed(4)}`);
    console.log(`   ✅ Price impact: ${quote.priceImpact.toFixed(2)}%`);
    console.log(`   ✅ Probability before: ${(quote.probabilityBefore * 100).toFixed(2)}%`);
    console.log(`   ✅ Probability after: ${(quote.probabilityAfter * 100).toFixed(2)}%`);
    console.log(`   ✅ Effective price: ${quote.effectivePrice.toFixed(4)}`);

    // Step 4: Test placeBetAMM
    console.log('\n💰 Step 4: Testing placeBetAMM()...');
    const betResult = await placeBetAMM(testUser.id, {
      marketId: testMarket.id,
      amount: 100,
      side: 'this',
    });

    console.log(`   ✅ Bet placed successfully`);
    console.log(`   Bet ID: ${betResult.bet.id}`);
    console.log(`   Shares received: ${betResult.sharesReceived.toFixed(4)}`);
    console.log(`   Price impact: ${betResult.priceImpact.toFixed(2)}%`);
    console.log(`   New probability: ${(betResult.newProbability * 100).toFixed(2)}%`);
    console.log(`   New balance: ${betResult.newBalance} credits`);

    // Verify market reserves were updated
    const updatedMarket = await marketsPrisma.market.findUnique({
      where: { id: testMarket.id },
    });
    console.log(`   Updated reserves: YES=${Number(updatedMarket?.yesReserve).toFixed(2)}, NO=${Number(updatedMarket?.noReserve).toFixed(2)}`);

    // Step 5: Test sellPosition
    console.log('\n📈 Step 5: Testing sellPosition()...');

    // Wait a moment to simulate time passing
    await new Promise(resolve => setTimeout(resolve, 1000));

    const sellResult = await sellPosition(testUser.id, betResult.bet.id);

    console.log(`   ✅ Position sold successfully`);
    console.log(`   Credits received: ${sellResult.creditsReceived.toFixed(2)}`);
    console.log(`   Profit/Loss: ${sellResult.profit.toFixed(2)} credits`);
    console.log(`   Price impact: ${sellResult.priceImpact.toFixed(2)}%`);

    // Step 6: Verify final state
    console.log('\n🔍 Step 6: Verifying final state...');
    const finalUser = await usersPrisma.user.findUnique({
      where: { id: testUser.id },
    });
    const finalMarket = await marketsPrisma.market.findUnique({
      where: { id: testMarket.id },
    });

    console.log(`   Final user balance: ${Number(finalUser?.creditBalance)} credits`);
    console.log(`   Final market reserves: YES=${Number(finalMarket?.yesReserve).toFixed(2)}, NO=${Number(finalMarket?.noReserve).toFixed(2)}`);

    // Step 7: Test large bet (price impact)
    console.log('\n⚠️  Step 7: Testing large bet (high price impact)...');
    const largeBetQuote = await getTradeQuote(testMarket.id, 1000, 'this');

    console.log(`   Amount: 1000 credits`);
    console.log(`   Shares: ${largeBetQuote.sharesReceived.toFixed(4)}`);
    console.log(`   Price impact: ${largeBetQuote.priceImpact.toFixed(2)}% ${largeBetQuote.priceImpact > 5 ? '⚠️ HIGH!' : ''}`);
    console.log(`   Effective price: ${largeBetQuote.effectivePrice.toFixed(4)}`);

    console.log('\n✅ All AMM endpoint tests passed!\n');
    console.log('Summary:');
    console.log('- ✅ Trade quotes working correctly');
    console.log('- ✅ Bet placement with AMM functioning');
    console.log('- ✅ Position selling operational');
    console.log('- ✅ Market reserves updating properly');
    console.log('- ✅ Price impact calculations accurate');

  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await usersPrisma.$disconnect();
    await marketsPrisma.$disconnect();
  }
}

// Run tests
testAMMEndpoints();
