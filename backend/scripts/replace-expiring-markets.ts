/**
 * Replace expiring markets in DB with newly fetched ones
 * 1. Remove all markets expiring within 3 days
 * 2. Ingest markets from expiring-markets.json
 */

import { readFileSync } from 'fs';
import { marketsPrisma } from '../src/lib/database.js';
import type { PolymarketMarket } from '../src/lib/polymarket-client.js';

// Import the extraction logic from market ingestion service
function clampOdds(value: number | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0.5;
  }
  return Math.min(Math.max(value, 0.01), 0.99);
}

function initializePoolWithProbability(totalLiquidity: number, probability: number) {
  const noReserve = probability * totalLiquidity;
  const yesReserve = (1 - probability) * totalLiquidity;
  return { yesReserve, noReserve };
}

function isValidImageUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  if (!url.startsWith('https://')) return false;
  try {
    const parsed = new URL(url);
    if (!parsed.hostname || parsed.hostname.length < 3) return false;
    return true;
  } catch {
    return false;
  }
}

function extractStaticData(market: any) {
  // Extract THIS/THAT options from outcomes
  let outcomes: string[] = [];
  if (typeof market.outcomes === 'string') {
    try {
      outcomes = JSON.parse(market.outcomes);
    } catch {
      outcomes = ['YES', 'NO'];
    }
  } else if (Array.isArray(market.outcomes)) {
    outcomes = market.outcomes;
  } else {
    outcomes = ['YES', 'NO'];
  }

  const thisOption = outcomes[0] || 'YES';
  const thatOption = outcomes[1] || 'NO';

  // Extract token IDs from clobTokenIds
  let thisTokenId: string | null = null;
  let thatTokenId: string | null = null;

  if (market.clobTokenIds) {
    try {
      const tokenIds = typeof market.clobTokenIds === 'string'
        ? JSON.parse(market.clobTokenIds)
        : market.clobTokenIds;
      if (Array.isArray(tokenIds) && tokenIds.length >= 2) {
        thisTokenId = tokenIds[0];
        thatTokenId = tokenIds[1];
      }
    } catch (e) {
      console.warn(`Failed to parse clobTokenIds for ${market.conditionId}`);
    }
  }

  // Parse outcome prices
  let thisPrice = 0.5;
  let thatPrice = 0.5;
  if (market.outcomePrices) {
    try {
      const prices = typeof market.outcomePrices === 'string'
        ? JSON.parse(market.outcomePrices)
        : market.outcomePrices;
      if (Array.isArray(prices) && prices.length >= 2) {
        thisPrice = parseFloat(prices[0]);
        thatPrice = parseFloat(prices[1]);
      }
    } catch (e) {
      console.warn(`Failed to parse outcomePrices for ${market.conditionId}`);
    }
  }

  // Determine status
  let status: 'open' | 'closed' | 'resolved' = 'open';
  if (market.archived) {
    status = 'closed';
  } else if (market.acceptingOrders === true || market.active === true) {
    status = 'open';
  } else if (market.acceptingOrders === false || market.closed) {
    status = 'closed';
  }

  // Parse end date
  const endDateStr = market.endDate || market.endDateIso || market.end_date_iso;
  const expiresAt = endDateStr ? new Date(endDateStr) : null;

  // Derive category
  let category = 'general';

  // Check sportsMarketType field first
  if (market.sportsMarketType) {
    category = 'sports';
  } else {
    const titleLower = (market.question || '').toLowerCase();
    const descLower = (market.description || '').toLowerCase();
    const combined = `${titleLower} ${descLower}`;

    if (combined.match(/\b(nfl|nba|mlb|nhl|fifa|uefa|super\s+bowl|serie\s+a|milan|football|basketball|baseball|hockey|soccer)\b/)) {
      category = 'sports';
    } else if (combined.match(/\b(bitcoin|ethereum|btc|eth|crypto|solana|xrp|up\s+or\s+down)\b/)) {
      category = 'crypto';
    } else if (combined.match(/\b(election|politics|trump|biden)\b/)) {
      category = 'politics';
    }
  }

  // Calculate AMM reserves
  const INITIAL_LIQUIDITY = 10000;
  const yesProbability = clampOdds(thisPrice);
  const pool = initializePoolWithProbability(INITIAL_LIQUIDITY, yesProbability);

  // Extract image URL
  const rawImageUrl = market.image || market.icon || null;
  const imageUrl = isValidImageUrl(rawImageUrl) ? rawImageUrl : null;

  return {
    polymarketId: market.conditionId || market.condition_id,
    title: market.question,
    description: market.description || null,
    imageUrl,
    thisOption,
    thatOption,
    thisTokenId,
    thatTokenId,
    yesReserve: pool.yesReserve,
    noReserve: pool.noReserve,
    thisOdds: yesProbability,
    thatOdds: clampOdds(thatPrice),
    lastPriceUpdate: new Date(),
    liquidity: typeof market.liquidity === 'string' ? parseFloat(market.liquidity) : market.liquidityNum || null,
    volume: typeof market.volume === 'string' ? parseFloat(market.volume) : market.volumeNum || null,
    volume24hr: market.volume24hr || null,
    category,
    marketType: 'polymarket' as const,
    status,
    expiresAt,
  };
}

async function replaceExpiringMarkets() {
  try {
    console.log('🔄 Replacing expiring markets in database...\n');

    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    console.log(`📅 Current time: ${now.toISOString()}`);
    console.log(`📅 Expiry threshold: ${threeDaysFromNow.toISOString()}\n`);

    // Step 1: Find and delete existing expiring markets
    console.log('🗑️  Step 1: Removing existing expiring markets...');

    const existingExpiring = await marketsPrisma.market.findMany({
      where: {
        status: 'open',
        expiresAt: {
          gte: now,
          lte: threeDaysFromNow,
        },
      },
      select: { id: true, title: true, expiresAt: true },
    });

    console.log(`Found ${existingExpiring.length} existing expiring markets`);

    if (existingExpiring.length > 0) {
      const deleteResult = await marketsPrisma.market.deleteMany({
        where: {
          status: 'open',
          expiresAt: {
            gte: now,
            lte: threeDaysFromNow,
          },
        },
      });
      console.log(`✓ Deleted ${deleteResult.count} markets\n`);
    }

    // Step 2: Load markets from JSON
    console.log('📂 Step 2: Loading markets from expiring-markets.json...');

    const jsonPath = './expiring-markets.json';
    const marketsJson = readFileSync(jsonPath, 'utf-8');
    const markets = JSON.parse(marketsJson);

    console.log(`✓ Loaded ${markets.length} markets from JSON\n`);

    // Step 3: Insert new markets
    console.log('💾 Step 3: Inserting new markets...\n');

    let created = 0;
    let updated = 0;
    let errors = 0;

    for (let i = 0; i < markets.length; i++) {
      const market = markets[i];
      try {
        const staticData = extractStaticData(market);

        if (!staticData.polymarketId || !staticData.title) {
          console.log(`   ⚠️  Market ${i + 1}: Missing required fields, skipping`);
          errors++;
          continue;
        }

        // Check if already exists (shouldn't, but just in case)
        const existing = await marketsPrisma.market.findUnique({
          where: { polymarketId: staticData.polymarketId },
        });

        if (existing) {
          await marketsPrisma.market.update({
            where: { polymarketId: staticData.polymarketId },
            data: {
              ...staticData,
              updatedAt: new Date(),
            },
          });
          console.log(`   ✓ Market ${i + 1}/${markets.length}: ${staticData.title.slice(0, 60)}... (updated)`);
          updated++;
        } else {
          await marketsPrisma.market.create({
            data: staticData,
          });
          console.log(`   + Market ${i + 1}/${markets.length}: ${staticData.title.slice(0, 60)}... (created)`);
          created++;
        }
      } catch (error: any) {
        console.error(`   ✗ Market ${i + 1}: ${error.message}`);
        errors++;
      }
    }

    console.log('\n✅ Replacement complete!');
    console.log(`📊 Results:`);
    console.log(`   - Created: ${created}`);
    console.log(`   - Updated: ${updated}`);
    console.log(`   - Errors: ${errors}`);

    // Step 4: Verify results
    console.log('\n🔍 Verification: Checking expiring markets in DB...');

    const finalExpiring = await marketsPrisma.market.findMany({
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
        thisOdds: true,
        thatOdds: true,
      },
      orderBy: { expiresAt: 'asc' },
    });

    console.log(`\n📊 Found ${finalExpiring.length} expiring markets in database:\n`);

    finalExpiring.forEach((market, idx) => {
      const hoursUntilExpiry = market.expiresAt
        ? Math.round((market.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60))
        : 0;
      console.log(`   ${idx + 1}. [${market.category}] ${market.title.slice(0, 70)}...`);
      console.log(`      Expires: ${market.expiresAt?.toISOString()} (${hoursUntilExpiry}h)`);
      console.log(`      Odds: ${(market.thisOdds * 100).toFixed(1)}% / ${(market.thatOdds * 100).toFixed(1)}%`);
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

replaceExpiringMarkets();
