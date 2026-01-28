import { marketsPrisma as prisma } from '../src/lib/database.js';

const now = new Date();
const in24h = new Date(now.getTime() + 86400000);

const markets = await prisma.market.findMany({
  where: {
    status: 'open',
    expiresAt: { gte: now, lte: in24h }
  },
  select: {
    title: true,
    imageUrl: true,
    thisTokenId: true,
    category: true
  },
  take: 10
});

console.log('=== EXPIRING MARKETS (<24h) ===');
console.log('Total:', markets.length);
console.log('');

for (const m of markets) {
  console.log('Title:', m.title.slice(0, 55));
  console.log('  imageUrl:', m.imageUrl || 'NULL');
  console.log('  thisTokenId:', m.thisTokenId ? 'YES' : 'NULL');
  console.log('  category:', m.category);
  console.log('');
}

await prisma.$disconnect();
