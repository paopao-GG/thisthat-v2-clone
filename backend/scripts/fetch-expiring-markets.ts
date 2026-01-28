/**
 * Fetch 10 markets expiring within 3 days from Polymarket
 * Output to JSON file for testing
 */

import { writeFileSync } from 'fs';
import { getPolymarketClient } from '../src/lib/polymarket-client.js';
import axios from 'axios';

async function fetchExpiringMarkets() {
  try {
    console.log('🚀 Fetching markets expiring within 3 days from Polymarket...\n');

    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    console.log(`📅 Current time: ${now.toISOString()}`);
    console.log(`📅 Target expiry: ${threeDaysFromNow.toISOString()}\n`);

    // Use Gamma API directly with end_date filters
    const GAMMA_API_URL = 'https://gamma-api.polymarket.com';

    console.log('📡 Fetching markets with expiration date filters...');

    const response = await axios.get(`${GAMMA_API_URL}/markets`, {
      params: {
        closed: false, // Only active markets
        end_date_min: now.toISOString(), // Must expire after now
        end_date_max: threeDaysFromNow.toISOString(), // Must expire within 3 days
        limit: 100, // Fetch more to ensure we get at least 10
        order: 'endDate', // Order by end date
        ascending: true, // Soonest first
      },
    });

    const markets = response.data;
    console.log(`📊 Retrieved ${markets.length} markets expiring within 3 days\n`);

    if (markets.length === 0) {
      console.log('⚠️  No markets found expiring within 3 days.');
      console.log('Trying with 7 days instead...\n');

      // Fallback: try 7 days
      const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const fallbackResponse = await axios.get(`${GAMMA_API_URL}/markets`, {
        params: {
          closed: false,
          end_date_min: now.toISOString(),
          end_date_max: sevenDaysFromNow.toISOString(),
          limit: 100,
          order: 'endDate',
          ascending: true,
        },
      });

      markets.push(...fallbackResponse.data);
      console.log(`📊 Retrieved ${markets.length} markets expiring within 7 days\n`);
    }

    // Take first 10 markets
    const selectedMarkets = markets.slice(0, 10);

    console.log('📋 Selected markets:');
    selectedMarkets.forEach((market: any, idx: number) => {
      const endDate = market.endDate || market.end_date_iso || market.endDateIso;
      const expiryDate = new Date(endDate);
      const hoursUntilExpiry = Math.round((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60));
      console.log(`   ${idx + 1}. ${market.question}`);
      console.log(`      Expires: ${expiryDate.toISOString()} (${hoursUntilExpiry}h from now)`);
      console.log(`      ID: ${market.conditionId || market.condition_id}`);
    });

    // Save to JSON file
    const outputPath = './expiring-markets.json';
    writeFileSync(outputPath, JSON.stringify(selectedMarkets, null, 2));

    console.log(`\n✅ Saved ${selectedMarkets.length} markets to ${outputPath}`);

    // Also create a summary
    const summary = {
      fetchedAt: now.toISOString(),
      timeRange: {
        from: now.toISOString(),
        to: threeDaysFromNow.toISOString(),
      },
      totalMarkets: selectedMarkets.length,
      markets: selectedMarkets.map((m: any) => ({
        id: m.conditionId || m.condition_id,
        question: m.question,
        endDate: m.endDate || m.end_date_iso || m.endDateIso,
        category: m.category,
        volume: m.volume,
        liquidity: m.liquidity,
        outcomes: m.outcomes,
      })),
    };

    const summaryPath = './expiring-markets-summary.json';
    writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    console.log(`✅ Saved summary to ${summaryPath}`);

    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

fetchExpiringMarkets();
