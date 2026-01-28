/**
 * Show Category Statistics
 *
 * Quick script to view current category stats without running prefetch
 */

import { getAllCategoryStats, getSystemStats } from '../src/services/category-monitor.service.js';
import { marketsPrisma } from '../src/lib/database.js';

async function showStats() {
  try {
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║            CATEGORY STATISTICS DASHBOARD                      ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    const systemStats = await getSystemStats();
    console.log('🌐 System Overview:');
    console.log(`   Total markets:             ${systemStats.totalMarkets}`);
    console.log(`   Total open markets:        ${systemStats.totalOpen}`);
    console.log(`   Average per category:      ${systemStats.averageMarketsPerCategory.toFixed(1)}`);
    console.log(`   Categories needing prefetch: ${systemStats.categoriesNeedingPrefetch}`);
    console.log(`   Categories at capacity:    ${systemStats.categoriesAtCapacity}`);

    const categoryStats = await getAllCategoryStats();
    console.log(`\n📂 Category Breakdown:`);
    console.log('   ┌─────────────────┬───────────┬──────────┬───────────┬────────────┐');
    console.log('   │ Category        │ Count     │ Target   │ Max       │ Status     │');
    console.log('   ├─────────────────┼───────────┼──────────┼───────────┼────────────┤');

    categoryStats.forEach((stat) => {
      const status = stat.needsPrefetch
        ? '🔴 LOW'
        : stat.count >= stat.maxCount
        ? '🟢 FULL'
        : '🟡 OK';
      const countStr = stat.count.toString().padStart(7);
      const targetStr = stat.targetCount.toString().padStart(6);
      const maxStr = stat.maxCount.toString().padStart(7);
      const categoryStr = stat.category.padEnd(15);
      const percentage = ((stat.count / stat.maxCount) * 100).toFixed(1);
      console.log(
        `   │ ${categoryStr} │ ${countStr} │ ${targetStr} │ ${maxStr} │ ${status.padEnd(10)} │ ${percentage}%`
      );
    });
    console.log('   └─────────────────┴───────────┴──────────┴───────────┴────────────┘');

    console.log('\n📈 Progress to 300,000 markets goal:');
    const targetTotal = 300000;
    const progressPercent = ((systemStats.totalMarkets / targetTotal) * 100).toFixed(2);
    const remaining = targetTotal - systemStats.totalMarkets;
    console.log(`   Current: ${systemStats.totalMarkets.toLocaleString()}`);
    console.log(`   Target:  ${targetTotal.toLocaleString()}`);
    console.log(`   Progress: ${progressPercent}%`);
    console.log(`   Remaining: ${remaining.toLocaleString()}`);

    console.log('\n💡 System Configuration:');
    console.log(`   Min per category: ${process.env.MIN_MARKETS_PER_CATEGORY || 500}`);
    console.log(`   Max per category: ${process.env.MAX_MARKETS_PER_CATEGORY || 10000}`);
    console.log(`   Batch size: ${process.env.PREFETCH_BATCH_SIZE || 1000}`);
    console.log(`   Check interval: Every 5 minutes`);

    console.log('\n');

    await marketsPrisma.$disconnect();
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    await marketsPrisma.$disconnect();
    process.exit(1);
  }
}

showStats();
