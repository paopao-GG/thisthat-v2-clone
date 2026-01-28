/**
 * Fix missing categories by re-ingesting markets from Polymarket
 * This will update all existing markets with their categories
 */

import { prisma } from '../src/lib/database.js';
import { getPolymarketClient } from '../src/lib/polymarket-client.js';
import { ingestMarketsFromPolymarket } from '../src/services/market-ingestion.service.js';
import dotenv from 'dotenv';

dotenv.config();

async function fixCategories() {
  try {
    console.log('🔍 Checking Polymarket API for categories...\n');

    // First, test if the API returns categories
    const client = getPolymarketClient();
    const sampleMarkets = await client.getMarkets({
      closed: false, // active markets
      limit: 10,
    });

    if (sampleMarkets.length === 0) {
      console.log('❌ No markets returned from Polymarket API');
      await prisma.$disconnect();
      return;
    }

    console.log('📊 Sample markets from Polymarket API:');
    let categoriesFound = 0;
    sampleMarkets.slice(0, 3).forEach((market, i) => {
      const hasCategory = !!market.category;
      if (hasCategory) categoriesFound++;
      console.log(`  ${i + 1}. ${market.question?.substring(0, 60)}...`);
      console.log(`     Category: ${market.category || '(null)'}`);
      console.log('');
    });

    // Show full structure of first market to debug
    if (sampleMarkets[0]) {
      console.log('🔍 Full API response structure (first market - showing all fields):');
      const keys = Object.keys(sampleMarkets[0]);
      console.log(`   Available fields: ${keys.join(', ')}\n`);
      
      // Check for category in different possible locations
      const market = sampleMarkets[0] as any;
      console.log('   Category field check:');
      console.log(`     market.category: ${market.category || '(undefined/null)'}`);
      console.log(`     market.categories: ${market.categories || '(undefined/null)'}`);
      console.log(`     market.tag: ${market.tag || '(undefined/null)'}`);
      console.log(`     market.tags: ${JSON.stringify(market.tags || [])}`);
      console.log(`     market.metadata?.category: ${market.metadata?.category || '(undefined/null)'}`);
      console.log('');
    }

    if (categoriesFound === 0) {
      console.log('⚠️  WARNING: Polymarket API is not returning categories in the response.');
      console.log('   This might mean:');
      console.log('   1. The API format has changed');
      console.log('   2. Categories are in a different field');
      console.log('   3. The API endpoint needs different parameters\n');
      
      // Show full market structure for debugging
      if (sampleMarkets[0]) {
        console.log('📋 Full market structure (first market):');
        console.log(JSON.stringify(sampleMarkets[0], null, 2));
      }
    } else {
      console.log(`✅ Found ${categoriesFound}/5 markets with categories in API response\n`);
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log('🔄 Starting market re-ingestion to update categories...');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Get current market count
    const beforeCount = await prisma.market.count();
    const beforeWithCategories = await prisma.market.count({
      where: { category: { not: null } },
    });

    console.log(`Before: ${beforeCount} total markets, ${beforeWithCategories} with categories\n`);

    // Re-ingest markets (this will update existing ones)
    const result = await ingestMarketsFromPolymarket({
      limit: 500, // Update up to 500 markets
      activeOnly: true,
    });

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📊 Ingestion Results:');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`Total processed:  ${result.total}`);
    console.log(`Created:          ${result.created}`);
    console.log(`Updated:          ${result.updated}`);
    console.log(`Skipped:          ${result.skipped}`);
    console.log(`Errors:           ${result.errors}\n`);

    // Check results
    const afterCount = await prisma.market.count();
    const afterWithCategories = await prisma.market.count({
      where: { category: { not: null } },
    });

    console.log(`After:  ${afterCount} total markets, ${afterWithCategories} with categories\n`);

    if (afterWithCategories > beforeWithCategories) {
      console.log(`✅ SUCCESS! Updated ${afterWithCategories - beforeWithCategories} markets with categories!\n`);
      
      // Show category breakdown
      const categories = await prisma.market.groupBy({
        by: ['category'],
        where: {
          category: { not: null },
        },
        _count: {
          category: true,
        },
        orderBy: {
          _count: {
            category: 'desc',
          },
        },
      });

      if (categories.length > 0) {
        console.log('📂 Categories now in database:');
        categories.forEach((cat, i) => {
          console.log(`  ${i + 1}. ${cat.category}: ${cat._count.category} markets`);
        });
      }
    } else {
      console.log('⚠️  No new categories were added.');
      console.log('   This might mean the Polymarket API is not returning categories.');
    }

  } catch (error: any) {
    console.error('❌ Error fixing categories:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

fixCategories();
