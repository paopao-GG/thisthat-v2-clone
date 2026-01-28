/**
 * Fix miscategorized markets
 *
 * Run this script to re-categorize all existing markets using the updated keyword detection.
 * This is needed after improving category keywords to fix markets that were miscategorized
 * (e.g., Academy Awards markets incorrectly placed in elections).
 */

import { marketsPrisma as prisma } from '../src/lib/database.js';

// Same categorization logic from market-ingestion.service.ts
function categorizeMarket(title: string, description: string | null): string {
  const titleLower = title.toLowerCase();
  const descLower = (description || '').toLowerCase();
  const combined = `${titleLower} ${descLower}`;

  // Category keywords mapping (SPORTS FIRST - highest priority)
  // Priority order matters - more specific categories checked first
  if (combined.match(/\b(nfl|nba|mlb|nhl|fifa|uefa|super\s+bowl|world\s+series|stanley\s+cup|olympics|championship|playoff|tournament|league|premier\s+league|serie\s+a|la\s+liga|bundesliga|eredivisie|ligue\s+1|football|basketball|baseball|hockey|soccer|tennis|golf|masters|formula\s+1|f1|ufc|boxing|mma|relegated?|relegation)\b/)) {
    return 'sports';
  } else if (combined.match(/\b(academy\s+awards?|oscar|golden\s+globe|entertainment|movie|film|tv\s+show|television|celebrity|award\s+show|grammy|emmy|mtv|billboard|actor|actress|director|screenplay|concert|streaming|netflix)\b/)) {
    return 'entertainment';
  } else if (combined.match(/\b(presidential\s+election|presidential\s+race|general\s+election|electoral\s+college|midterm\s+election|primary\s+election)\b/) ||
             (combined.match(/\b(election|vote|voting|ballot|primary|electoral|midterm)\b/) && !combined.match(/\b(selection|reelection)\b/))) {
    return 'elections';
  } else if (combined.match(/\b(trump|biden|congress|senate|house\s+of\s+representatives|governor|supreme\s+court|white\s+house|politics|political\s+party)\b/)) {
    return 'politics';
  } else if (combined.match(/\b(china|russia|europe|asia|africa|middle\s+east|israel|palestine|iran|korea|war|military|conflict|nato|ukraine|india|japan)\b/)) {
    return 'international';
  } else if (combined.match(/\b(company|ceo|merger|acquisition|revenue|earnings|ipo|startup|business|corporate|venture\s+capital)\b/)) {
    return 'business';
  } else if (combined.match(/\b(economy|recession|inflation|federal\s+reserve|fed|interest\s+rate|gdp|unemployment|stock\s+market|jobs|economic)\b/)) {
    return 'economics';
  } else if (combined.match(/\b(technology|artificial\s+intelligence|machine\s+learning|ai\s+model|tech|software|hardware|apple|google|microsoft|openai|tesla|spacex|gpt|claude)\b/)) {
    return 'technology';
  } else if (combined.match(/\b(crypto|bitcoin|ethereum|blockchain|defi|nft|token|coinbase|binance|web3|solana|btc|eth)\b/)) {
    return 'crypto';
  } else if (combined.match(/\b(science|research|study|discovery|space\s+exploration|nasa|physics|biology|chemistry|scientific)\b/)) {
    return 'science';
  } else {
    return 'general';
  }
}

async function fixMiscategorizedMarkets() {
  console.log('[Category Fix] Starting re-categorization of all markets...');

  try {
    // Fetch all markets
    const markets = await prisma.market.findMany({
      where: {
        status: 'open'
      },
      select: {
        id: true,
        title: true,
        description: true,
        category: true,
      },
    });

    console.log(`[Category Fix] Found ${markets.length} open markets to process`);

    let updated = 0;
    let unchanged = 0;
    const categoryChanges: Record<string, { from: string; to: string; count: number }[]> = {};

    // Process in batches of 100
    const batchSize = 100;
    for (let i = 0; i < markets.length; i += batchSize) {
      const batch = markets.slice(i, i + batchSize);

      for (const market of batch) {
        const newCategory = categorizeMarket(market.title, market.description);

        if (newCategory !== market.category) {
          // Track category changes for reporting
          const key = `${market.category} → ${newCategory}`;
          if (!categoryChanges[key]) {
            categoryChanges[key] = [];
          }
          categoryChanges[key].push({
            from: market.category || 'null',
            to: newCategory,
            count: 1
          });

          // Update market
          await prisma.market.update({
            where: { id: market.id },
            data: { category: newCategory },
          });

          updated++;

          // Log notable changes (e.g., Academy Awards moved to entertainment)
          if (market.title.toLowerCase().includes('academy') || market.title.toLowerCase().includes('oscar')) {
            console.log(`[Category Fix] ${market.category} → ${newCategory}: ${market.title.slice(0, 80)}`);
          }
        } else {
          unchanged++;
        }
      }

      // Progress report
      if ((i + batch.length) % 500 === 0) {
        console.log(`[Category Fix] Progress: ${i + batch.length}/${markets.length} processed`);
      }
    }

    console.log('\n[Category Fix] Complete!');
    console.log(`  Updated: ${updated}`);
    console.log(`  Unchanged: ${unchanged}`);

    // Print category change summary
    console.log('\n[Category Fix] Category Changes Summary:');
    const sortedChanges = Object.entries(categoryChanges).sort((a, b) =>
      b[1].reduce((sum, c) => sum + c.count, 0) - a[1].reduce((sum, c) => sum + c.count, 0)
    );

    for (const [changeKey, changes] of sortedChanges) {
      const total = changes.reduce((sum, c) => sum + c.count, 0);
      console.log(`  ${changeKey}: ${total} markets`);
    }

    await prisma.$disconnect();
    process.exit(0);
  } catch (error: any) {
    console.error('[Category Fix] Fatal error:', error?.message || error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

// Run the fix
fixMiscategorizedMarkets();
