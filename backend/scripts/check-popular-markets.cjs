const { PrismaClient } = require('../node_modules/.prisma/client-markets');
const prisma = new PrismaClient();

async function main() {
  // Get popular markets (high volume24hr) - same query as getRandomMarkets
  const popularMarkets = await prisma.market.findMany({
    take: 30,
    where: { status: 'open' },
    select: { id: true, title: true, imageUrl: true, volume24hr: true },
    orderBy: [
      { volume24hr: 'desc' },
      { updatedAt: 'desc' },
    ]
  });

  console.log('=== Top 30 Popular Markets (by volume24hr) ===\n');
  popularMarkets.forEach((m, i) => {
    console.log(`${i + 1}. Title: ${m.title?.substring(0, 50)}`);
    console.log(`   Volume24hr: ${m.volume24hr || 0}`);
    console.log(`   ImageUrl: ${m.imageUrl ? m.imageUrl.substring(0, 50) + '...' : 'NULL'}`);
    console.log('');
  });

  const withImages = popularMarkets.filter(m => m.imageUrl).length;
  console.log(`\n=== Summary: ${withImages}/${popularMarkets.length} popular markets have images ===`);

  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
