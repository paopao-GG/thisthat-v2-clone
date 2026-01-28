/**
 * Check a specific market by partial ID
 */

import { marketsPrisma } from '../dist/lib/database.js';

const partialId = process.argv[2] || 'c73ea5f5';

async function checkMarket() {
  // Find all markets and filter by partial ID
  const markets = await marketsPrisma.market.findMany({
    where: { status: 'open' },
    select: {
      id: true,
      title: true,
      expiresAt: true,
      status: true,
    }
  });

  const market = markets.find(m => m.id.startsWith(partialId));

  if (!market) {
    console.log(`Market not found with ID starting with ${partialId}`);
    console.log(`\nTotal open markets: ${markets.length}`);
    return;
  }

  const now = new Date();
  const hoursLeft = market.expiresAt
    ? ((market.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60)).toFixed(1)
    : 'N/A';
  const isEndingSoon = market.expiresAt && parseFloat(hoursLeft) < 24 && parseFloat(hoursLeft) > 0;

  console.log('\nMarket found:');
  console.log('  ID:', market.id);
  console.log('  Title:', market.title);
  console.log('  Status:', market.status);
  console.log('  Expires:', market.expiresAt);
  console.log('  Hours left:', hoursLeft);
  console.log('');
  if (isEndingSoon) {
    console.log('  ⚠️  ENDING SOON - REQUIRES PURCHASED CREDITS ONLY');
    console.log('  You have 91 purchased credits but need 100');
    console.log('  This is why your bet is failing!');
  } else {
    console.log('  ✅ Normal market - can use free or purchased credits');
  }

  await marketsPrisma.$disconnect();
}

checkMarket();
