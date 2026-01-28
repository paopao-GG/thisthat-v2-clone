// Count markets by category
import { PrismaClient as MarketsPrismaClient } from '../node_modules/.prisma/client-markets/index.js';

const prisma = new MarketsPrismaClient({
  log: ['error'],
});

async function countMarketsByCategory() {
  try {
    // Get count by category
    const categoryCounts = await prisma.$queryRaw`
      SELECT
        category,
        COUNT(*) as count,
        COUNT(CASE WHEN status = 'open' THEN 1 END) as open_count,
        COUNT(CASE WHEN status = 'closed' THEN 1 END) as closed_count
      FROM markets
      WHERE category IS NOT NULL
      GROUP BY category
      ORDER BY count DESC
    `;

    console.log('\n📊 Markets Count by Category:\n');
    console.log('Category'.padEnd(20) + 'Total'.padEnd(10) + 'Open'.padEnd(10) + 'Closed');
    console.log('─'.repeat(50));

    let totalMarkets = 0;
    let totalOpen = 0;
    let totalClosed = 0;

    categoryCounts.forEach((row) => {
      const count = Number(row.count);
      const openCount = Number(row.open_count);
      const closedCount = Number(row.closed_count);

      console.log(
        (row.category || 'null').padEnd(20) +
        count.toString().padEnd(10) +
        openCount.toString().padEnd(10) +
        closedCount.toString()
      );

      totalMarkets += count;
      totalOpen += openCount;
      totalClosed += closedCount;
    });

    console.log('─'.repeat(50));
    console.log(
      'TOTAL'.padEnd(20) +
      totalMarkets.toString().padEnd(10) +
      totalOpen.toString().padEnd(10) +
      totalClosed.toString()
    );

    console.log(`\n✅ Total Categories: ${categoryCounts.length}`);
    console.log(`✅ Total Markets: ${totalMarkets}`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

countMarketsByCategory();
