const { PrismaClient } = require('../node_modules/.prisma/client-markets');
const prisma = new PrismaClient();

async function main() {
  // Get a sample of markets to check if imageUrl exists in DB
  const markets = await prisma.market.findMany({
    take: 10,
    select: { id: true, title: true, imageUrl: true },
    orderBy: { updatedAt: 'desc' }
  });

  // Also get markets WITH images
  const marketsWithImages = await prisma.market.findMany({
    take: 10,
    where: { imageUrl: { not: null } },
    select: { id: true, title: true, imageUrl: true },
    orderBy: { updatedAt: 'desc' }
  });

  console.log('=== Markets WITH images (most recent) ===\n');
  marketsWithImages.forEach((m, i) => {
    console.log(`${i + 1}. Title: ${m.title?.substring(0, 50)}`);
    console.log(`   ImageUrl: ${m.imageUrl ? m.imageUrl.substring(0, 60) + '...' : 'NULL'}`);
    console.log('');
  });

  console.log('=== Sample markets from DB (most recently updated) ===\n');
  markets.forEach((m, i) => {
    console.log(`${i + 1}. Title: ${m.title?.substring(0, 50)}`);
    console.log(`   ImageUrl: ${m.imageUrl ? m.imageUrl.substring(0, 60) + '...' : 'NULL'}`);
    console.log('');
  });

  // Stats
  const total = await prisma.market.count();
  const withImages = await prisma.market.count({ where: { imageUrl: { not: null } } });

  console.log('=== Statistics ===');
  console.log(`Total markets: ${total}`);
  console.log(`With images: ${withImages} (${((withImages/total)*100).toFixed(1)}%)`);
  console.log(`Without images: ${total - withImages} (${(((total-withImages)/total)*100).toFixed(1)}%)`);

  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
