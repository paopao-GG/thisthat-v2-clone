/**
 * Test Category Prefetch System
 *
 * Demonstrates the intelligent prefetching system by:
 * 1. Showing current category stats
 * 2. Running a prefetch cycle
 * 3. Showing updated stats
 */

import { getAllCategoryStats, getSystemStats } from '../src/services/category-monitor.service.js';
import { triggerManualPrefetch } from '../src/jobs/category-prefetch.job.js';
import { marketsPrisma } from '../src/lib/database.js';

async function testCategoryPrefetch() {
  try {
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║         CATEGORY PREFETCH SYSTEM - TEST RUN                   ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    // Show initial stats
    console.log('📊 INITIAL STATE:');
    console.log('─────────────────────────────────────────────────────────────────');

    const initialSystemStats = await getSystemStats();
    console.log(`\n🌐 System Overview:`);
    console.log(`   Total markets:             ${initialSystemStats.totalMarkets}`);
    console.log(`   Total open markets:        ${initialSystemStats.totalOpen}`);
    console.log(`   Average per category:      ${initialSystemStats.averageMarketsPerCategory.toFixed(1)}`);
    console.log(`   Categories needing prefetch: ${initialSystemStats.categoriesNeedingPrefetch}`);
    console.log(`   Categories at capacity:    ${initialSystemStats.categoriesAtCapacity}`);

    const initialCategoryStats = await getAllCategoryStats();
    console.log(`\n📂 Category Breakdown:`);
    console.log('   ┌─────────────────┬───────────┬──────────┬────────────┐');
    console.log('   │ Category        │ Count     │ Target   │ Status     │');
    console.log('   ├─────────────────┼───────────┼──────────┼────────────┤');

    initialCategoryStats.forEach((stat) => {
      const status = stat.needsPrefetch
        ? '🔴 LOW'
        : stat.count >= stat.maxCount
        ? '🟢 FULL'
        : '🟡 OK';
      const countStr = stat.count.toString().padStart(7);
      const targetStr = stat.targetCount.toString().padStart(6);
      const categoryStr = stat.category.padEnd(15);
      console.log(`   │ ${categoryStr} │ ${countStr} │ ${targetStr} │ ${status.padEnd(10)} │`);
    });
    console.log('   └─────────────────┴───────────┴──────────┴────────────┘');

    // Run prefetch
    console.log('\n\n🔄 RUNNING PREFETCH CYCLE...');
    console.log('─────────────────────────────────────────────────────────────────');
    await triggerManualPrefetch();

    // Show final stats
    console.log('\n\n📊 FINAL STATE:');
    console.log('─────────────────────────────────────────────────────────────────');

    const finalSystemStats = await getSystemStats();
    console.log(`\n🌐 System Overview:`);
    console.log(`   Total markets:             ${finalSystemStats.totalMarkets} (+${finalSystemStats.totalMarkets - initialSystemStats.totalMarkets})`);
    console.log(`   Total open markets:        ${finalSystemStats.totalOpen} (+${finalSystemStats.totalOpen - initialSystemStats.totalOpen})`);
    console.log(`   Average per category:      ${finalSystemStats.averageMarketsPerCategory.toFixed(1)}`);
    console.log(`   Categories needing prefetch: ${finalSystemStats.categoriesNeedingPrefetch}`);
    console.log(`   Categories at capacity:    ${finalSystemStats.categoriesAtCapacity}`);

    const finalCategoryStats = await getAllCategoryStats();
    console.log(`\n📂 Category Breakdown:`);
    console.log('   ┌─────────────────┬───────────┬──────────┬────────────┐');
    console.log('   │ Category        │ Count     │ Target   │ Status     │');
    console.log('   ├─────────────────┼───────────┼──────────┼────────────┤');

    finalCategoryStats.forEach((stat, idx) => {
      const initialStat = initialCategoryStats[idx];
      const change = stat.count - initialStat.count;
      const status = stat.needsPrefetch
        ? '🔴 LOW'
        : stat.count >= stat.maxCount
        ? '🟢 FULL'
        : '🟡 OK';
      const countStr = `${stat.count}`.padStart(7);
      const changeStr = change > 0 ? ` (+${change})` : '';
      const targetStr = stat.targetCount.toString().padStart(6);
      const categoryStr = stat.category.padEnd(15);
      console.log(`   │ ${categoryStr} │ ${countStr}${changeStr.padEnd(0)} │ ${targetStr} │ ${status.padEnd(10)} │`);
    });
    console.log('   └─────────────────┴───────────┴──────────┴────────────┘');

    console.log('\n\n✅ Test complete!\n');

    await marketsPrisma.$disconnect();
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    await marketsPrisma.$disconnect();
    process.exit(1);
  }
}

testCategoryPrefetch();
