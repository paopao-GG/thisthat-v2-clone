/**
 * Check for markets ending soon (< 24 hours)
 * These markets require PURCHASED credits only
 */

import { marketsPrisma } from '../dist/lib/database.js';

async function checkEndingSoon() {
  const now = new Date();
  const threshold = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const endingSoonMarkets = await marketsPrisma.market.findMany({
    where: {
      status: 'open',
      expiresAt: {
        gte: now,
        lte: threshold
      }
    },
    select: {
      id: true,
      title: true,
      expiresAt: true,
    },
    take: 20
  });

  console.log('\n🕐 Markets ending within 24 hours (require PURCHASED credits only):\n');

  if (endingSoonMarkets.length === 0) {
    console.log('None found');
  } else {
    endingSoonMarkets.forEach(m => {
      const hoursLeft = ((m.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60)).toFixed(1);
      const shortId = m.id.substring(0, 8);
      const shortTitle = m.title ? m.title.substring(0, 50) : 'No title';
      console.log(`- ${shortId}... | ${hoursLeft}h left | ${shortTitle}...`);
    });
  }

  await marketsPrisma.$disconnect();
}

checkEndingSoon();
