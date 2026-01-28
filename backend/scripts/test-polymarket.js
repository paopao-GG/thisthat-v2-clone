/**
 * Test Polymarket price fetching
 */

import { marketsPrisma } from '../dist/lib/database.js';

// Import the price service functions
const priceServicePath = '../dist/services/polymarket-price.service.js';
const priceService = await import(priceServicePath);

const marketId = 'c73ea5f5-da6e-4ba2-93f6-17f4d3ff12c8';

async function testPolymarket() {
  console.log('\n=== Testing Polymarket Price Service ===\n');

  // 1. Check if price service is available
  const isAvailable = priceService.isPriceServiceAvailable();
  console.log('Price service available:', isAvailable);

  if (!isAvailable) {
    console.log('❌ ISSUE: Polymarket price service is NOT available');
    console.log('   This would cause "Failed to place bet after retries" error');
    return;
  }

  // 2. Get market token IDs
  const market = await marketsPrisma.market.findUnique({
    where: { id: marketId },
    select: {
      id: true,
      title: true,
      thisTokenId: true,
      thatTokenId: true,
    }
  });

  if (!market) {
    console.log('Market not found');
    return;
  }

  console.log('\nMarket:', market.title?.substring(0, 50));
  console.log('  thisTokenId:', market.thisTokenId || '(none)');
  console.log('  thatTokenId:', market.thatTokenId || '(none)');

  if (!market.thisTokenId) {
    console.log('\n❌ ISSUE: Market has no thisTokenId');
    console.log('   This would cause "Missing Polymarket token ID" error');
    return;
  }

  // 3. Try to fetch price
  console.log('\n=== Fetching Live Price ===\n');

  try {
    const price = await priceService.getPrice(market.thisTokenId);
    console.log('Price fetched successfully:');
    console.log('  isAvailable:', price.isAvailable);
    console.log('  midpoint:', price.midpoint);
    console.log('  bid:', price.bid);
    console.log('  ask:', price.ask);

    if (!price.isAvailable) {
      console.log('\n❌ ISSUE: Price is NOT available');
      console.log('   This would cause bet to fail');
    } else if (price.midpoint <= 0 || price.midpoint >= 1) {
      console.log('\n❌ ISSUE: Invalid price bounds');
      console.log(`   midpoint=${price.midpoint} is outside valid range (0,1)`);
    } else {
      console.log('\n✅ Price service working correctly');
    }
  } catch (error) {
    console.log('❌ ERROR fetching price:', error.message);
    console.log('\nThis is likely your issue!');
  }

  await marketsPrisma.$disconnect();
}

testPolymarket();
