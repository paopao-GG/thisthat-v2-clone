import { marketsPrisma } from '../dist/lib/database.js';

async function checkMarkets() {
  try {
    const total = await marketsPrisma.market.count();
    const open = await marketsPrisma.market.count({ where: { status: 'open' } });
    const closed = await marketsPrisma.market.count({ where: { status: 'closed' } });

    const byCategory = await marketsPrisma.market.groupBy({
      by: ['category'],
      where: { status: 'open' },
      _count: { category: true },
    });

    console.log('=== MARKET DATABASE STATS ===');
    console.log(`Total markets: ${total}`);
    console.log(`Open markets: ${open}`);
    console.log(`Closed markets: ${closed}`);
    console.log('');
    console.log('=== OPEN MARKETS BY CATEGORY ===');
    byCategory
      .sort((a, b) => (b._count?.category || 0) - (a._count?.category || 0))
      .forEach(({ category, _count }) => {
        console.log(`${category}: ${_count.category}`);
      });

    await marketsPrisma.$disconnect();
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

checkMarkets();
