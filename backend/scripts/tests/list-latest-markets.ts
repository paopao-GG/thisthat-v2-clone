import { prisma } from '../../src/lib/database.js';

async function main() {
  const limit = Number(process.env.TEST_MARKET_LIST_LIMIT) || 25;
  const markets = await prisma.market.findMany({
    orderBy: { updatedAt: 'desc' },
    take: limit,
    select: {
      id: true,
      polymarketId: true,
      title: true,
      status: true,
      updatedAt: true,
      createdAt: true,
    },
  });

  console.table(
    markets.map((m) => ({
      id: m.id,
      polymarketId: m.polymarketId,
      status: m.status,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
      title: m.title.slice(0, 60),
    }))
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Failed to list markets:', error?.message || error);
    process.exit(1);
  });



