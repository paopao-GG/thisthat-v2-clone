/**
 * Test new category system
 */

import { ingestMarketsFromPolymarket } from '../src/services/market-ingestion.service.js';
import { getAllCategoryStats } from '../src/services/category-monitor.service.js';
import { marketsPrisma } from '../src/lib/database.js';

async function testNewCategories() {
  try {
    console.log('🧪 Testing new category system...\n');
    console.log('📥 Fetching 1000 markets from Polymarket to re-categorize...\n');

    // Ingest 1000 markets (will re-categorize existing ones)
    const result = await ingestMarketsFromPolymarket({
      limit: 1000,
      activeOnly: true,
    });

    console.log('\n✅ Ingestion result:');
    console.log(`   - Total processed: ${result.total}`);
    console.log(`   - Created: ${result.created}`);
    console.log(`   - Updated: ${result.updated}`);
    console.log(`   - Skipped: ${result.skipped}`);
    console.log(`   - Errors: ${result.errors}`);

    // Get updated stats
    console.log('\n📊 Category distribution after re-categorization:\n');
    const stats = await getAllCategoryStats();

    console.log('┌──────────────────┬───────────┬──────────┬────────────┐');
    console.log('│ Category         │ Count     │ Target   │ Status     │');
    console.log('├──────────────────┼───────────┼──────────┼────────────┤');

    stats.forEach((stat) => {
      const status = stat.needsPrefetch ? '🔴 LOW' : stat.count >= stat.maxCount ? '🟢 FULL' : '🟡 OK';
      const categoryStr = stat.category.padEnd(16);
      const countStr = stat.count.toString().padStart(7);
      const targetStr = stat.targetCount.toString().padStart(6);
      console.log(`│ ${categoryStr} │ ${countStr} │ ${targetStr} │ ${status.padEnd(10)} │`);
    });
    console.log('└──────────────────┴───────────┴──────────┴────────────┘');

    // Check if weather is gone
    const weatherCount = await marketsPrisma.market.count({
      where: { category: 'weather' },
    });
    console.log(`\n❌ Weather category (should be 0): ${weatherCount} markets`);

    // Check new categories
    const electionsCount = await marketsPrisma.market.count({
      where: { category: 'elections' },
    });
    const internationalCount = await marketsPrisma.market.count({
      where: { category: 'international' },
    });
    const businessCount = await marketsPrisma.market.count({
      where: { category: 'business' },
    });
    const scienceCount = await marketsPrisma.market.count({
      where: { category: 'science' },
    });

    console.log(`\n✅ New categories:`);
    console.log(`   - Elections: ${electionsCount} markets`);
    console.log(`   - International: ${internationalCount} markets`);
    console.log(`   - Business: ${businessCount} markets`);
    console.log(`   - Science: ${scienceCount} markets`);

    await marketsPrisma.$disconnect();
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    await marketsPrisma.$disconnect();
    process.exit(1);
  }
}

testNewCategories();
