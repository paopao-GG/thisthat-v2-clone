import { marketsPrisma } from '../src/lib/database.js';

const now = new Date();
const threeDays = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

console.log('Current time:', now.toISOString());
console.log('3 days threshold:', threeDays.toISOString());
console.log('');

// Check query that API uses for ending_soon
const endingSoonMarkets = await marketsPrisma.market.findMany({
  where: {
    status: 'open',
    thisTokenId: { not: null },
    expiresAt: {
      gte: now,
      lte: threeDays,
    },
  },
  select: {
    id: true,
    title: true,
    expiresAt: true,
    imageUrl: true,
    thisTokenId: true,
  },
  orderBy: { expiresAt: 'asc' },
  take: 20,
});

console.log(`Found ${endingSoonMarkets.length} ending soon markets:\n`);

if (endingSoonMarkets.length === 0) {
  console.log('No markets found! Checking why...\n');

  // Check if there are ANY open markets
  const openCount = await marketsPrisma.market.count({
    where: { status: 'open' },
  });
  console.log(`Total open markets: ${openCount}`);

  // Check if there are markets with expiry dates
  const withExpiryCount = await marketsPrisma.market.count({
    where: {
      status: 'open',
      expiresAt: { not: null },
    },
  });
  console.log(`Open markets with expiry: ${withExpiryCount}`);

  // Check if there are markets with token IDs
  const withTokensCount = await marketsPrisma.market.count({
    where: {
      status: 'open',
      thisTokenId: { not: null },
    },
  });
  console.log(`Open markets with tokens: ${withTokensCount}`);

  // Check markets with expiry in the future
  const futureExpiry = await marketsPrisma.market.count({
    where: {
      status: 'open',
      expiresAt: { gte: now },
    },
  });
  console.log(`Open markets expiring in future: ${futureExpiry}`);

  // Show next 5 markets by expiry
  console.log('\nNext 5 markets by expiration:');
  const nextMarkets = await marketsPrisma.market.findMany({
    where: {
      status: 'open',
      expiresAt: { not: null },
    },
    select: { title: true, expiresAt: true, thisTokenId: true },
    orderBy: { expiresAt: 'asc' },
    take: 5,
  });

  nextMarkets.forEach((m, i) => {
    const hasToken = m.thisTokenId ? 'YES' : 'NO';
    const isPast = m.expiresAt && m.expiresAt < now;
    console.log(`${i+1}. ${m.title.slice(0, 60)}`);
    console.log(`   Expires: ${m.expiresAt?.toISOString()} (${isPast ? 'PAST' : 'FUTURE'})`);
    console.log(`   Has token: ${hasToken}`);
  });
} else {
  endingSoonMarkets.forEach((m, i) => {
    const hasImage = m.imageUrl ? 'YES' : 'NO';
    const hours = m.expiresAt ? Math.round((m.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60)) : 0;
    console.log(`${i+1}. ${m.title.slice(0, 60)}`);
    console.log(`   Expires: ${m.expiresAt?.toISOString()} (${hours}h)`);
    console.log(`   Image: ${hasImage}, Token: ${m.thisTokenId ? 'YES' : 'NO'}`);
  });
}

await marketsPrisma.$disconnect();
