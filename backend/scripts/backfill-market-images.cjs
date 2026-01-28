require('dotenv').config();
const { PrismaClient } = require('../node_modules/.prisma/client-markets/index.js');
const axios = require('axios');

const prisma = new PrismaClient();

async function backfillImages() {
  console.log('Finding markets without images...');

  const missingImages = await prisma.market.findMany({
    where: {
      imageUrl: null,
      polymarketId: { not: null },
      status: 'open',
    },
    select: {
      id: true,
      polymarketId: true,
      title: true,
    },
    take: 200, // Backfill 200 at a time
  });

  console.log(`Found ${missingImages.length} markets missing images\n`);

  let updated = 0;
  let failed = 0;

  for (const market of missingImages) {
    try {
      // Fetch from CLOB API
      const response = await axios.get(`https://clob.polymarket.com/markets/${market.polymarketId}`);
      const data = response.data;

      const imageUrl = data.image || data.icon || null;

      if (imageUrl && imageUrl.startsWith('https://')) {
        await prisma.market.update({
          where: { id: market.id },
          data: { imageUrl },
        });
        console.log('✅', market.title.substring(0, 50));
        updated++;
      } else {
        console.log('⚠️  No image:', market.title.substring(0, 50));
        failed++;
      }

      // Rate limit: 5 requests/sec
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (error) {
      console.log('❌ Error:', market.title.substring(0, 50), '-', error.message);
      failed++;
    }
  }

  console.log(`\nDone: ${updated} updated, ${failed} failed`);
  await prisma.$disconnect();
}

backfillImages();
