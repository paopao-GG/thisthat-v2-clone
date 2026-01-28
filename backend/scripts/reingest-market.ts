/**
 * Re-ingest a single market by ID
 * Usage: npx tsx scripts/reingest-market.ts <market-id>
 */

import { marketsPrisma } from '../src/lib/database.js';
import { getPrice } from '../src/services/polymarket-price.service.js';
import dotenv from 'dotenv';

dotenv.config();

const marketId = process.argv[2];

if (!marketId) {
  console.error('❌ Usage: npx tsx scripts/reingest-market.ts <market-id>');
  process.exit(1);
}

async function reingestMarket(id: string) {
  try {
    console.log(`🔄 Looking up market: ${id}\n`);

    // Get market from database
    const market = await marketsPrisma.market.findUnique({
      where: { id },
      select: {
        id: true,
        polymarketId: true,
        title: true,
        thisOdds: true,
        thatOdds: true,
        thisTokenId: true,
        thatTokenId: true,
        expiresAt: true,
      },
    });

    if (!market) {
      console.error(`❌ Market not found: ${id}`);
      process.exit(1);
    }

    console.log('📊 Current market data:');
    console.log(`   Title: ${market.title}`);
    console.log(`   Polymarket ID: ${market.polymarketId}`);
    console.log(`   THIS Token ID: ${market.thisTokenId}`);
    console.log(`   THAT Token ID: ${market.thatTokenId}`);
    console.log(`   Current thisOdds: ${market.thisOdds}`);
    console.log(`   Current thatOdds: ${market.thatOdds}`);
    console.log(`   Expires: ${market.expiresAt}`);
    console.log('');

    // Fetch live prices from Polymarket
    if (!market.thisTokenId) {
      console.error('❌ Market has no thisTokenId - cannot fetch live prices');
      process.exit(1);
    }

    console.log('🔍 Fetching live prices from Polymarket...');

    const thisPrice = await getPrice(market.thisTokenId);
    const thatPrice = market.thatTokenId ? await getPrice(market.thatTokenId) : null;

    console.log(`   THIS live price: ${thisPrice.midpoint} (available: ${thisPrice.isAvailable})`);
    if (thatPrice) {
      console.log(`   THAT live price: ${thatPrice.midpoint} (available: ${thatPrice.isAvailable})`);
    }
    console.log('');

    // Calculate new odds
    const newThisOdds = thisPrice.isAvailable ? thisPrice.midpoint : (thatPrice?.isAvailable ? 1 - thatPrice.midpoint : 0.5);
    const newThatOdds = thatPrice?.isAvailable ? thatPrice.midpoint : (thisPrice.isAvailable ? 1 - thisPrice.midpoint : 0.5);

    console.log('📝 Updating market with new odds:');
    console.log(`   New thisOdds: ${newThisOdds}`);
    console.log(`   New thatOdds: ${newThatOdds}`);
    console.log('');

    // Update market in database
    await marketsPrisma.market.update({
      where: { id },
      data: {
        thisOdds: newThisOdds,
        thatOdds: newThatOdds,
        updatedAt: new Date(),
      },
    });

    console.log('✅ Market updated successfully!');
    console.log('');

    // Verify update
    const updated = await marketsPrisma.market.findUnique({
      where: { id },
      select: { thisOdds: true, thatOdds: true },
    });

    console.log('🔍 Verification:');
    console.log(`   thisOdds: ${updated?.thisOdds}`);
    console.log(`   thatOdds: ${updated?.thatOdds}`);

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await marketsPrisma.$disconnect();
  }
}

reingestMarket(marketId);
