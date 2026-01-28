import { marketsPrisma } from '../src/lib/database.js';

const allMarkets = await marketsPrisma.market.findMany({
  where: { status: 'open' },
  select: { id: true, title: true, expiresAt: true, category: true },
  orderBy: { expiresAt: 'asc' },
  take: 15,
});

console.log('First 15 open markets by expiration date:\n');
allMarkets.forEach((m, i) => {
  const expiry = m.expiresAt ? new Date(m.expiresAt).toISOString() : 'null';
  console.log(`${i+1}. [${m.category}] ${m.title.slice(0, 60)}`);
  console.log(`   Expires: ${expiry}`);
});

await marketsPrisma.$disconnect();
