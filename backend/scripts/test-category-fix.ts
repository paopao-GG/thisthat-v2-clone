/**
 * Test category filtering fix
 */

import { ingestMarketsFromPolymarket } from '../src/services/market-ingestion.service.js';
import { marketsPrisma } from '../src/lib/database.js';

async function testFix() {
  try {
    console.log('🧪 Testing category filtering fix...\n');

    // Get count before
    const beforeCount = await marketsPrisma.market.count({
      where: { category: 'politics' },
    });
    console.log(`📊 Politics markets before: ${beforeCount}\n`);

    // Try to fetch 100 politics markets
    console.log('🔄 Fetching 100 politics markets...');
    const result = await ingestMarketsFromPolymarket({
      limit: 100,
      activeOnly: true,
      category: 'politics',
    });

    console.log('\n✅ Ingestion result:');
    console.log(`   - Total processed: ${result.total}`);
    console.log(`   - Created: ${result.created}`);
    console.log(`   - Updated: ${result.updated}`);
    console.log(`   - Skipped: ${result.skipped}`);
    console.log(`   - Errors: ${result.errors}`);

    // Get count after
    const afterCount = await marketsPrisma.market.count({
      where: { category: 'politics' },
    });
    console.log(`\n📊 Politics markets after: ${afterCount}`);
    console.log(`📈 Net change: +${afterCount - beforeCount}`);

    await marketsPrisma.$disconnect();
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    await marketsPrisma.$disconnect();
    process.exit(1);
  }
}

testFix();
