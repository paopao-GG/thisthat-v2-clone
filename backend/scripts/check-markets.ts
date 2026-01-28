/**
 * Check markets in database
 */

import { marketsPrisma } from '../src/lib/database.js';

async function checkMarkets() {
  try {
    console.log('🔍 Checking markets in database...\n');

    // Get total count
    const total = await marketsPrisma.market.count();
    console.log(`📊 Total markets: ${total}`);

    // Get count by status
    const openCount = await marketsPrisma.market.count({ where: { status: 'open' } });
    const closedCount = await marketsPrisma.market.count({ where: { status: 'closed' } });
    const resolvedCount = await marketsPrisma.market.count({ where: { status: 'resolved' } });

    console.log(`  - Open: ${openCount}`);
    console.log(`  - Closed: ${closedCount}`);
    console.log(`  - Resolved: ${resolvedCount}`);

    // Get count by category
    console.log('\n📂 Markets by category:');
    const categories = await marketsPrisma.market.groupBy({
      by: ['category'],
      _count: true,
    });
    categories.forEach(cat => {
      console.log(`  - ${cat.category || 'NULL'}: ${cat._count}`);
    });

    // Get latest 5 markets
    console.log('\n📈 Latest 5 markets:');
    const latest = await marketsPrisma.market.findMany({
      take: 5,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        category: true,
        status: true,
        updatedAt: true,
      },
    });

    latest.forEach((market, idx) => {
      console.log(`\n${idx + 1}. ${market.title}`);
      console.log(`   Category: ${market.category || 'N/A'}`);
      console.log(`   Status: ${market.status}`);
      console.log(`   Updated: ${market.updatedAt.toISOString()}`);
    });

    await marketsPrisma.$disconnect();
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    await marketsPrisma.$disconnect();
    process.exit(1);
  }
}

checkMarkets();
