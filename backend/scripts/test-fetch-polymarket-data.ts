/**
 * Test Script: Fetch Polymarket Data and Export to JSON
 * 
 * This script fetches markets and events from Polymarket's Gamma API
 * and exports them to JSON files for inspection.
 * 
 * Usage:
 *   npm run test:fetch-polymarket
 *   or
 *   tsx scripts/test-fetch-polymarket-data.ts
 */

import { getPolymarketClient } from '../src/lib/polymarket-client.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

interface FetchStats {
  markets: {
    total: number;
    active: number;
    closed: number;
    withCategory: number;
    sampleIds: string[];
  };
  events: {
    total: number;
    active: number;
    closed: number;
    featured: number;
    sampleIds: string[];
  };
}

async function fetchAndExportData() {
  console.log('🚀 Starting Polymarket Data Fetch Test...\n');
  console.log(`📡 API Base URL: ${process.env.POLYMARKET_BASE_URL || 'https://gamma-api.polymarket.com'}\n`);

  const client = getPolymarketClient();
  const outputDir = path.join(process.cwd(), 'polymarket-export');
  const stats: FetchStats = {
    markets: {
      total: 0,
      active: 0,
      closed: 0,
      withCategory: 0,
      sampleIds: [],
    },
    events: {
      total: 0,
      active: 0,
      closed: 0,
      featured: 0,
      sampleIds: [],
    },
  };

  try {
    // Create output directory
    await fs.mkdir(outputDir, { recursive: true });
    console.log(`📁 Output directory: ${outputDir}\n`);

    // ============================================
    // FETCH MARKETS
    // ============================================
    console.log('📊 Fetching Markets...');
    console.log('   Fetching active markets...');
    
    const activeMarkets = await client.getMarkets({
      closed: false,
      limit: 100, // Fetch 100 active markets
    });

    console.log(`   ✅ Fetched ${activeMarkets.length} active markets`);

    console.log('   Fetching closed markets...');
    const closedMarkets = await client.getMarkets({
      closed: true,
      limit: 50, // Fetch 50 closed markets
    });

    console.log(`   ✅ Fetched ${closedMarkets.length} closed markets`);

    const allMarkets = [...activeMarkets, ...closedMarkets];
    stats.markets.total = allMarkets.length;
    stats.markets.active = activeMarkets.length;
    stats.markets.closed = closedMarkets.length;
    stats.markets.withCategory = allMarkets.filter((m) => m.category).length;
    stats.markets.sampleIds = allMarkets.slice(0, 5).map((m) => m.conditionId || m.condition_id || 'N/A');

    // Save markets to JSON
    const marketsFile = path.join(outputDir, 'markets.json');
    await fs.writeFile(
      marketsFile,
      JSON.stringify(allMarkets, null, 2),
      'utf-8'
    );
    console.log(`   💾 Saved to: ${marketsFile}`);

    // Save a sample market (first one) for easy inspection
    if (allMarkets.length > 0) {
      const sampleMarketFile = path.join(outputDir, 'sample-market.json');
      await fs.writeFile(
        sampleMarketFile,
        JSON.stringify(allMarkets[0], null, 2),
        'utf-8'
      );
      console.log(`   💾 Sample market saved to: ${sampleMarketFile}`);
    }

    // ============================================
    // FETCH EVENTS
    // ============================================
    console.log('\n📅 Fetching Events...');
    console.log('   Fetching active events...');
    
    const activeEvents = await client.getEvents({
      closed: false,
      limit: 50, // Fetch 50 active events
    });

    console.log(`   ✅ Fetched ${activeEvents.length} active events`);

    console.log('   Fetching closed events...');
    const closedEvents = await client.getEvents({
      closed: true,
      limit: 25, // Fetch 25 closed events
    });

    console.log(`   ✅ Fetched ${closedEvents.length} closed events`);

    const allEvents = [...activeEvents, ...closedEvents];
    stats.events.total = allEvents.length;
    stats.events.active = activeEvents.length;
    stats.events.closed = closedEvents.length;
    stats.events.featured = allEvents.filter((e) => e.featured).length;
    stats.events.sampleIds = allEvents.slice(0, 5).map((e) => e.id || 'N/A');

    // Save events to JSON
    const eventsFile = path.join(outputDir, 'events.json');
    await fs.writeFile(
      eventsFile,
      JSON.stringify(allEvents, null, 2),
      'utf-8'
    );
    console.log(`   💾 Saved to: ${eventsFile}`);

    // Save a sample event (first one) for easy inspection
    if (allEvents.length > 0) {
      const sampleEventFile = path.join(outputDir, 'sample-event.json');
      await fs.writeFile(
        sampleEventFile,
        JSON.stringify(allEvents[0], null, 2),
        'utf-8'
      );
      console.log(`   💾 Sample event saved to: ${sampleEventFile}`);
    }

    // ============================================
    // FETCH DETAILS FOR SAMPLE MARKET
    // ============================================
    if (allMarkets.length > 0) {
      const sampleMarketId = allMarkets[0].conditionId || allMarkets[0].condition_id;
      if (sampleMarketId) {
        console.log(`\n🔍 Fetching details for market: ${sampleMarketId}...`);
        const marketDetails = await client.getMarket(sampleMarketId);
        if (marketDetails) {
          const marketDetailsFile = path.join(outputDir, 'market-details.json');
          await fs.writeFile(
            marketDetailsFile,
            JSON.stringify(marketDetails, null, 2),
            'utf-8'
          );
          console.log(`   💾 Market details saved to: ${marketDetailsFile}`);
        }
      }
    }

    // ============================================
    // FETCH MARKETS FOR SAMPLE EVENT
    // ============================================
    if (allEvents.length > 0) {
      const sampleEventId = allEvents[0].id;
      if (sampleEventId) {
        console.log(`\n🔗 Fetching markets for event: ${sampleEventId}...`);
        const eventMarkets = await client.getEventMarkets(sampleEventId);
        if (eventMarkets.length > 0) {
          const eventMarketsFile = path.join(outputDir, 'event-markets.json');
          await fs.writeFile(
            eventMarketsFile,
            JSON.stringify(eventMarkets, null, 2),
            'utf-8'
          );
          console.log(`   💾 Event markets (${eventMarkets.length}) saved to: ${eventMarketsFile}`);
        }
      }
    }

    // ============================================
    // SAVE STATISTICS
    // ============================================
    const statsFile = path.join(outputDir, 'fetch-stats.json');
    await fs.writeFile(
      statsFile,
      JSON.stringify(stats, null, 2),
      'utf-8'
    );

    // ============================================
    // PRINT SUMMARY
    // ============================================
    console.log('\n' + '='.repeat(60));
    console.log('📈 FETCH SUMMARY');
    console.log('='.repeat(60));
    console.log('\n📊 MARKETS:');
    console.log(`   Total fetched: ${stats.markets.total}`);
    console.log(`   Active: ${stats.markets.active}`);
    console.log(`   Closed: ${stats.markets.closed}`);
    console.log(`   With category: ${stats.markets.withCategory}`);
    console.log(`   Sample IDs: ${stats.markets.sampleIds.join(', ')}`);

    console.log('\n📅 EVENTS:');
    console.log(`   Total fetched: ${stats.events.total}`);
    console.log(`   Active: ${stats.events.active}`);
    console.log(`   Closed: ${stats.events.closed}`);
    console.log(`   Featured: ${stats.events.featured}`);
    console.log(`   Sample IDs: ${stats.events.sampleIds.join(', ')}`);

    console.log('\n📁 FILES CREATED:');
    console.log(`   ${marketsFile}`);
    console.log(`   ${path.join(outputDir, 'sample-market.json')}`);
    console.log(`   ${eventsFile}`);
    console.log(`   ${path.join(outputDir, 'sample-event.json')}`);
    console.log(`   ${path.join(outputDir, 'market-details.json')}`);
    console.log(`   ${path.join(outputDir, 'event-markets.json')}`);
    console.log(`   ${statsFile}`);

    console.log('\n✅ Test completed successfully!');
    console.log(`\n💡 Tip: Check the files in ${outputDir} to inspect the data.\n`);

  } catch (error: any) {
    console.error('\n❌ Error fetching Polymarket data:');
    console.error(`   ${error.message}`);
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Data: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    process.exit(1);
  }
}

// Run the script
fetchAndExportData().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});




