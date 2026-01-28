require('dotenv').config();
const { PrismaClient } = require('../node_modules/.prisma/client-markets/index.js');
const prisma = new PrismaClient();

async function check() {
  const now = new Date();
  const threeDays = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  const withImages = await prisma.market.count({
    where: {
      status: 'open',
      thisTokenId: { not: null },
      imageUrl: { not: null },
      expiresAt: { gte: now, lte: threeDays }
    }
  });

  const withoutImages = await prisma.market.count({
    where: {
      status: 'open',
      thisTokenId: { not: null },
      imageUrl: null,
      expiresAt: { gte: now, lte: threeDays }
    }
  });

  console.log('\n--- ENDING SOON MARKETS (3 days) ---');
  console.log('WITH images:', withImages);
  console.log('WITHOUT images:', withoutImages);
  console.log('Total:', withImages + withoutImages);

  await prisma.$disconnect();
}
check();
