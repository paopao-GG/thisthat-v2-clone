/**
 * Ingest 1000 markets from Polymarket
 */

import { ingestMarketsFromPolymarket } from '../src/services/market-ingestion.service.js';
import { marketsPrisma } from '../src/lib/database.js';

async function ingest1000Markets() {
  try {
    console.log('🚀 Starting ingestion of 1000 markets from Polymarket...\n');

    // Check current count
    const beforeCount = await marketsPrisma.market.count();
    console.log(`📊 Current market count: ${beforeCount}\n`);

    // Ingest 1000 markets
    const result = await ingestMarketsFromPolymarket({
      limit: 1000,
      activeOnly: true, // Only active/open markets
    });

    console.log('\n✅ Ingestion complete!');
    console.log(`📈 Results:`);
    console.log(`   - Total processed: ${result.total}`);
    console.log(`   - Created: ${result.created}`);
    console.log(`   - Updated: ${result.updated}`);
    console.log(`   - Skipped: ${result.skipped}`);
    console.log(`   - Errors: ${result.errors}`);

    // Check new count
    const afterCount = await marketsPrisma.market.count();
    console.log(`\n📊 New market count: ${afterCount}`);
    console.log(`📊 Net change: +${afterCount - beforeCount}`);

    // Show breakdown by category
    console.log('\n📂 Markets by category:');
    const categories = await marketsPrisma.market.groupBy({
      by: ['category'],
      _count: true,
      orderBy: {
        _count: {
          category: 'desc',
        },
      },
    });

    categories.forEach(cat => {
      console.log(`   - ${cat.category || 'NULL'}: ${cat._count}`);
    });

    // Show breakdown by status
    console.log('\n📊 Markets by status:');
    const openCount = await marketsPrisma.market.count({ where: { status: 'open' } });
    const closedCount = await marketsPrisma.market.count({ where: { status: 'closed' } });
    const resolvedCount = await marketsPrisma.market.count({ where: { status: 'resolved' } });
    console.log(`   - Open: ${openCount}`);
    console.log(`   - Closed: ${closedCount}`);
    console.log(`   - Resolved: ${resolvedCount}`);

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

ingest1000Markets();
