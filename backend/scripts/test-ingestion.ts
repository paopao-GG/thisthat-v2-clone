/**
 * Test Market Ingestion Script
 * Run this to manually test market ingestion and see detailed logs
 * 
 * Usage: npx tsx scripts/test-ingestion.ts
 */

import dotenv from 'dotenv';
import { ingestMarketsFromPolymarket } from '../src/services/market-ingestion.service.js';
import { getPolymarketClient } from '../src/lib/polymarket-client.js';

// Load environment variables
dotenv.config();

async function testIngestion() {
  console.log('🧪 Testing Market Ingestion...\n');
  
  // Test 1: Check Polymarket client
  console.log('1️⃣ Testing Polymarket Client Connection...');
  try {
    const client = getPolymarketClient();
    console.log('✅ Polymarket client created');
    
    // Try fetching a small batch
    console.log('   Fetching 5 markets from Polymarket API...');
    const testMarkets = await client.getMarkets({
      closed: false,
      limit: 5,
      offset: 0,
    });
    
    console.log(`   ✅ Successfully fetched ${testMarkets.length} markets from API`);
    if (testMarkets.length > 0) {
      console.log(`   Sample market: ${testMarkets[0].question || testMarkets[0].conditionId}`);
    }
  } catch (error: any) {
    console.error('   ❌ Failed to fetch from Polymarket API:', error.message);
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Response:`, error.response.data);
    }
    return;
  }
  
  console.log('\n2️⃣ Testing Market Ingestion Service...');
  try {
    const result = await ingestMarketsFromPolymarket({
      limit: 10, // Small batch for testing
      activeOnly: true,
    });
    
    console.log('\n📊 Ingestion Results:');
    console.log(`   Total fetched: ${result.total}`);
    console.log(`   Created: ${result.created}`);
    console.log(`   Updated: ${result.updated}`);
    console.log(`   Skipped: ${result.skipped}`);
    console.log(`   Errors: ${result.errors}`);
    
    if (result.total === 0) {
      console.log('\n⚠️  WARNING: No markets were fetched!');
      console.log('   Possible causes:');
      console.log('   - Polymarket API is down');
      console.log('   - API rate limit reached');
      console.log('   - Network connectivity issues');
      console.log('   - Invalid API endpoint');
    } else if (result.created === 0 && result.updated === 0) {
      console.log('\n⚠️  WARNING: Markets fetched but none were saved!');
      console.log('   Possible causes:');
      console.log('   - Database connection issue');
      console.log('   - All markets already exist (check database)');
      console.log('   - Schema validation errors');
    } else {
      console.log('\n✅ Ingestion completed successfully!');
    }
  } catch (error: any) {
    console.error('\n❌ Ingestion failed:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
  }
  
  console.log('\n🏁 Test complete');
}

// Run the test
testIngestion().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

