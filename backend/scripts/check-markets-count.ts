import { marketsPrisma } from '../src/lib/database.js';

async function checkMarkets() {
  try {
    const count = await marketsPrisma.market.count();
    console.log('Total markets in database:', count);

    const openCount = await marketsPrisma.market.count({
      where: { status: 'open' }
    });
    console.log('Open markets:', openCount);

    if (openCount > 0) {
      const sample = await marketsPrisma.market.findMany({
        take: 3,
        where: { status: 'open' },
        select: {
          id: true,
          title: true,
          category: true,
          status: true,
        }
      });
      console.log('\nSample markets:');
      sample.forEach(m => console.log(`- ${m.title} (${m.category})`));
    }
  } catch (error: any) {
    console.error('Error:', error.message);
  } finally {
    await marketsPrisma.$disconnect();
    process.exit(0);
  }
}

checkMarkets();
