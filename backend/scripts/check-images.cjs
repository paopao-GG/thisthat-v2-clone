const { PrismaClient } = require('../node_modules/.prisma/client-markets');
const prisma = new PrismaClient();

async function main() {
  const noImageMarkets = await prisma.market.findMany({
    where: { imageUrl: null },
    select: { id: true, polymarketId: true, title: true, category: true },
    take: 10
  });

  console.log('Sample markets without images:');
  noImageMarkets.forEach(m => {
    console.log('-', m.title?.substring(0, 60), '| Category:', m.category);
  });

  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
