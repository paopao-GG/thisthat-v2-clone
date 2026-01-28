/**
 * Test script to check if Polymarket API returns categories
 */

import { getPolymarketClient } from '../src/lib/polymarket-client.js';
import dotenv from 'dotenv';

dotenv.config();

async function testPolymarketCategories() {
  try {
    console.log('🔍 Testing Polymarket API for category data...\n');

    const client = getPolymarketClient();
    
    // Fetch a small sample of markets
    const markets = await client.getMarkets({
      closed: false, // active markets
      limit: 10,
    });

    console.log(`✅ Fetched ${markets.length} markets from Polymarket\n`);
    console.log('═══════════════════════════════════════════════════════════');
    console.log('Sample Market Data:');
    console.log('═══════════════════════════════════════════════════════════\n');

    let marketsWithCategories = 0;
    let marketsWithoutCategories = 0;

    // Check list response
    markets.slice(0, 5).forEach((market, index) => {
      console.log(`${index + 1}. ${market.question?.substring(0, 60)}...`);
      console.log(`   Condition ID: ${market.conditionId || market.condition_id || 'N/A'}`);
      console.log(`   Category (from list): ${market.category || '(null/undefined)'}`);
      console.log(`   Tags: ${market.tags ? market.tags.join(', ') : '(none)'}`);
      console.log(`   Accepting Orders: ${market.accepting_orders ?? 'N/A'}`);
      console.log('');

      if (market.category) {
        marketsWithCategories++;
      } else {
        marketsWithoutCategories++;
      }
    });

    // Try fetching individual market details to see if category is there
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('Testing Individual Market Endpoint:');
    console.log('═══════════════════════════════════════════════════════════\n');

    if (markets.length > 0 && markets[0].conditionId) {
      const individualMarket = await client.getMarket(markets[0].conditionId);
      if (individualMarket) {
        console.log(`Individual market fetch for: ${individualMarket.question?.substring(0, 60)}...`);
        console.log(`   Category: ${individualMarket.category || '(null/undefined)'}`);
        console.log(`   Tags: ${individualMarket.tags ? individualMarket.tags.join(', ') : '(none)'}`);
        console.log(`   Full object keys: ${Object.keys(individualMarket).join(', ')}`);
        console.log('');
      }
    }

    // Check all markets
    markets.forEach(m => {
      if (m.category) marketsWithCategories++;
      else marketsWithoutCategories++;
    });

    console.log('═══════════════════════════════════════════════════════════');
    console.log('Summary:');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`Total markets checked: ${markets.length}`);
    console.log(`Markets WITH categories: ${marketsWithCategories}`);
    console.log(`Markets WITHOUT categories: ${marketsWithoutCategories}`);

    if (marketsWithCategories > 0) {
      console.log('\n✅ Polymarket API DOES return categories!');
      console.log('   Re-ingesting markets will populate categories in database.');
    } else {
      console.log('\n⚠️  Polymarket API does NOT return categories in this response.');
      console.log('   This might be an API limitation or the markets may not have categories assigned.');
    }

  } catch (error: any) {
    console.error('❌ Error testing Polymarket API:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testPolymarketCategories();

