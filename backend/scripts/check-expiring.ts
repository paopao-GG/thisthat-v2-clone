import { marketsPrisma as prisma } from '../src/lib/database.js';

async function run() {
  const now = new Date();
  const in24h = new Date(now.getTime() + 86400000);

  console.log('Current time:', now.toISOString());

  const count = await prisma.market.count({
    where: { status: 'open', expiresAt: { gte: now, lte: in24h } }
  });
  console.log('\n=== EXPIRING IN < 24 HOURS ===');
  console.log('Count:', count);

  const expired = await prisma.market.count({
    where: { status: 'open', expiresAt: { lt: now } }
  });
  console.log('\n=== ALREADY EXPIRED BUT STILL OPEN ===');
  console.log('Count:', expired);

  if (count > 0) {
    const samples = await prisma.market.findMany({
      where: { status: 'open', expiresAt: { gte: now, lte: in24h } },
      select: { title: true, category: true, expiresAt: true },
      take: 20,
      orderBy: { expiresAt: 'asc' }
    });

    console.log('\nSample expiring markets:');
    for (const m of samples) {
      const hrs = ((m.expiresAt!.getTime() - now.getTime()) / 3600000).toFixed(1);
      console.log(`  [${hrs}h] ${m.category} | ${m.title.slice(0, 55)}`);
    }
  }

  if (expired > 0) {
    const expiredSamples = await prisma.market.findMany({
      where: { status: 'open', expiresAt: { lt: now } },
      select: { title: true, category: true, expiresAt: true },
      take: 10,
      orderBy: { expiresAt: 'desc' }
    });

    console.log('\nSample already-expired markets:');
    for (const m of expiredSamples) {
      const hrsAgo = ((now.getTime() - m.expiresAt!.getTime()) / 3600000).toFixed(1);
      console.log(`  [${hrsAgo}h ago] ${m.category} | ${m.title.slice(0, 50)}`);
    }
  }

  await prisma.$disconnect();
}

run().catch(console.error);
