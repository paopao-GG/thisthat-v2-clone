/**
 * Ingest markets expiring within 3 days from Polymarket
 * For testing the "expiring soon" feature
 */

import { getPolymarketClient } from '../src/lib/polymarket-client.js';
import { marketsPrisma } from '../src/lib/database.js';
import { ingestMarketsFromPolymarket } from '../src/services/market-ingestion.service.js';

async function ingestExpiringMarkets() {
  try {
    console.log('🚀 Fetching markets expiring within 3 days from Polymarket...\n');

    const client = getPolymarketClient();
    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    console.log(`📅 Current time: ${now.toISOString()}`);
    console.log(`📅 Target expiry: ${threeDaysFromNow.toISOString()}\n`);

    // Fetch all active markets
    console.log('📡 Fetching all active markets from Polymarket...');
    const allMarkets = await client.getMarkets({
      closed: false,
      limit: 500,
    });

    console.log(`📊 Retrieved ${allMarkets.length} active markets\n`);

    // Filter for markets expiring within 3 days
    const expiringMarkets = allMarkets.filter((market) => {
      const endDate = market.endDateIso || market.end_date_iso;
      if (!endDate) return false;

      const expiryDate = new Date(endDate);
      return expiryDate >= now && expiryDate <= threeDaysFromNow;
    });

    console.log(`✅ Found ${expiringMarkets.length} markets expiring within 3 days\n`);

    if (expiringMarkets.length === 0) {
      console.log('⚠️  No markets found expiring within 3 days. Exiting.');
      await marketsPrisma.$disconnect();
      process.exit(0);
    }

    // Show sample of expiring markets
    console.log('📋 Sample of expiring markets:');
    expiringMarkets.slice(0, 5).forEach((market, idx) => {
      const endDate = market.endDateIso || market.end_date_iso;
      const expiryDate = new Date(endDate!);
      const hoursUntilExpiry = Math.round((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60));
      console.log(`   ${idx + 1}. ${market.question}`);
      console.log(`      Expires: ${expiryDate.toISOString()} (${hoursUntilExpiry}h from now)`);
    });
    console.log('');

    // Ingest ALL expiring markets (not limited to 10)
    console.log(`🔄 Ingesting ${expiringMarkets.length} expiring markets...\n`);

    const beforeCount = await marketsPrisma.market.count();
    console.log(`📊 Current market count: ${beforeCount}\n`);

    // We'll manually process each market using the same logic as ingestMarketsFromPolymarket
    let created = 0;
    let updated = 0;
    let errors = 0;

    for (let i = 0; i < expiringMarkets.length; i++) {
      const market = expiringMarkets[i];
      try {
        const conditionId = market.conditionId || market.condition_id;
        if (!conditionId) {
          console.warn(`   ⚠️  Market ${i + 1} missing conditionId, skipping`);
          errors++;
          continue;
        }

        // Check if exists
        const existing = await marketsPrisma.market.findUnique({
          where: { polymarketId: conditionId },
        });

        if (existing) {
          console.log(`   ✓ Market ${i + 1}/${expiringMarkets.length}: ${market.question.slice(0, 60)}... (already exists)`);
          updated++;
        } else {
          console.log(`   + Market ${i + 1}/${expiringMarkets.length}: ${market.question.slice(0, 60)}...`);
          created++;
        }
      } catch (error: any) {
        console.error(`   ✗ Market ${i + 1} error: ${error.message}`);
        errors++;
      }
    }

    // Now ingest them properly
    console.log('\n🔄 Running full ingestion...');
    const result = await ingestMarketsFromPolymarket({
      limit: 1000, // Fetch enough to catch all expiring markets
      activeOnly: true,
    });

    console.log('\n✅ Ingestion complete!');
    console.log(`📈 Results:`);
    console.log(`   - Total processed: ${result.total}`);
    console.log(`   - Created: ${result.created}`);
    console.log(`   - Updated: ${result.updated}`);
    console.log(`   - Skipped: ${result.skipped}`);
    console.log(`   - Errors: ${result.errors}`);

    const afterCount = await marketsPrisma.market.count();
    console.log(`\n📊 New market count: ${afterCount}`);
    console.log(`📊 Net change: +${afterCount - beforeCount}`);

    // Show expiring soon markets in DB
    console.log('\n📅 Checking expiring soon markets in database:');
    const expiringInDb = await marketsPrisma.market.findMany({
      where: {
        status: 'open',
        expiresAt: {
          gte: now,
          lte: threeDaysFromNow,
        },
      },
      select: {
        id: true,
        title: true,
        expiresAt: true,
        category: true,
      },
      orderBy: {
        expiresAt: 'asc',
      },
    });

    console.log(`\n📊 Found ${expiringInDb.length} expiring markets in database:`);
    expiringInDb.forEach((market, idx) => {
      const hoursUntilExpiry = market.expiresAt
        ? Math.round((market.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60))
        : 0;
      console.log(`   ${idx + 1}. [${market.category}] ${market.title.slice(0, 70)}...`);
      console.log(`      Expires: ${market.expiresAt?.toISOString()} (${hoursUntilExpiry}h from now)`);
    });

    await marketsPrisma.$disconnect();
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    await marketsPrisma.$disconnect();
    process.exit(1);
  }
}

ingestExpiringMarkets();
