/**
 * Search Polymarket for weather markets
 */

import { getPolymarketClient } from '../src/lib/polymarket-client.js';

async function searchWeather() {
  try {
    const client = getPolymarketClient();
    console.log('🔍 Searching Polymarket for weather-related markets...\n');

    const markets = await client.getMarkets({ limit: 500, closed: false });
    console.log(`📥 Fetched ${markets.length} active markets from Polymarket\n`);

    let weatherCount = 0;
    const weatherMarkets: string[] = [];

    markets.forEach(m => {
      const combined = (m.question + ' ' + (m.description || '')).toLowerCase();
      if (combined.match(/weather|climate|temperature|rain|snow|hurricane|tornado|frost|hail|storm/)) {
        weatherCount++;
        weatherMarkets.push(m.question);
      }
    });

    console.log('✅ Weather markets found:\n');
    weatherMarkets.forEach((title, i) => {
      console.log(`${i + 1}. ${title}`);
    });

    console.log(`\n📊 Summary:`);
    console.log(`   - Total markets searched: ${markets.length}`);
    console.log(`   - Weather markets found: ${weatherCount}`);
    console.log(`   - Percentage: ${((weatherCount / markets.length) * 100).toFixed(2)}%`);
    console.log(`\n⚠️  Weather markets are VERY RARE on Polymarket!`);

    process.exit(0);
  } catch (error: any) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

searchWeather();
