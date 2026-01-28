/**
 * Analyze what categories Polymarket actually has
 */

import { getPolymarketClient } from '../src/lib/polymarket-client.js';

async function analyzeCategories() {
  try {
    const client = getPolymarketClient();
    console.log('🔍 Analyzing Polymarket market distribution...\n');

    const markets = await client.getMarkets({ limit: 1000, closed: false });
    console.log(`📥 Fetched ${markets.length} active markets\n`);

    const categoryMatches: Record<string, number> = {
      politics: 0,
      sports: 0,
      crypto: 0,
      technology: 0,
      economics: 0,
      entertainment: 0,
      business: 0,
      finance: 0,
      science: 0,
      health: 0,
      gaming: 0,
      pop_culture: 0,
      elections: 0,
      war: 0,
      international: 0,
      us_politics: 0,
    };

    const categoryPatterns: Record<string, RegExp> = {
      elections: /\b(election|vote|voting|ballot|primary|presidential race|electoral)\b/i,
      us_politics: /\b(trump|biden|congress|senate|house|governor|supreme court|white house)\b/i,
      war: /\b(war|military|conflict|invasion|ceasefire|peace|troops|nato|russia|ukraine)\b/i,
      international: /\b(china|russia|europe|asia|africa|middle east|israel|palestine|iran|korea)\b/i,
      sports: /\b(sports|football|basketball|soccer|nfl|nba|mlb|championship|super bowl|olympics|fifa)\b/i,
      crypto: /\b(crypto|bitcoin|ethereum|blockchain|defi|nft|token|coinbase|binance)\b/i,
      technology: /\b(technology|ai|tech|software|hardware|apple|google|microsoft|openai|tesla|spacex)\b/i,
      economics: /\b(economy|recession|inflation|fed|rate|gdp|unemployment|stock market|jobs|interest)\b/i,
      finance: /\b(stock|trading|market|wall street|nasdaq|s&p|dow|investment|bank)\b/i,
      business: /\b(company|ceo|merger|acquisition|revenue|earnings|ipo|startup)\b/i,
      entertainment: /\b(entertainment|movie|tv|celebrity|award|oscar|grammy|netflix|streaming)\b/i,
      pop_culture: /\b(kardashian|taylor swift|beyonce|celebrity|viral|trending|tiktok|youtube)\b/i,
      gaming: /\b(gaming|esports|twitch|game|nintendo|playstation|xbox|video game)\b/i,
      science: /\b(science|research|study|discovery|space|nasa|physics|biology)\b/i,
      health: /\b(health|covid|vaccine|pandemic|disease|medical|hospital|doctor)\b/i,
    };

    markets.forEach(m => {
      const combined = (m.question + ' ' + (m.description || '')).toLowerCase();

      for (const [category, pattern] of Object.entries(categoryPatterns)) {
        if (pattern.test(combined)) {
          categoryMatches[category]++;
        }
      }
    });

    // Sort by count
    const sorted = Object.entries(categoryMatches)
      .sort((a, b) => b[1] - a[1])
      .filter(([_, count]) => count > 0);

    console.log('📊 Market Distribution by Category:\n');
    console.log('┌────────────────────────┬───────────┬─────────────┐');
    console.log('│ Category               │ Count     │ Percentage  │');
    console.log('├────────────────────────┼───────────┼─────────────┤');

    sorted.forEach(([category, count]) => {
      const percentage = ((count / markets.length) * 100).toFixed(1);
      const categoryStr = category.padEnd(22);
      const countStr = count.toString().padStart(7);
      const percentStr = `${percentage}%`.padStart(10);
      console.log(`│ ${categoryStr} │ ${countStr} │ ${percentStr}  │`);
    });

    console.log('└────────────────────────┴───────────┴─────────────┘');

    console.log('\n💡 Recommendations for categories with 100+ markets:');
    sorted
      .filter(([_, count]) => count >= 100)
      .forEach(([category, count]) => {
        console.log(`   ✅ ${category}: ${count} markets`);
      });

    process.exit(0);
  } catch (error: any) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

analyzeCategories();
