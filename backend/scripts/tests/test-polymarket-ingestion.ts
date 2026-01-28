import { ingestMarketsFromPolymarket } from '../../src/services/market-ingestion.service.js';
import { prisma } from '../../src/lib/database.js';
import { getPolymarketClient } from '../../src/lib/polymarket-client.js';

async function main() {
  const limit = Number(process.env.TEST_POLYMARKET_LIMIT) || 50;
  console.log(`🔍 Testing Polymarket ingestion (limit=${limit})...`);

  const client = getPolymarketClient();
  const markets = await client.getMarkets({ limit, closed: false });
  const totalTokens = markets.reduce((sum, market) => sum + (market.tokens?.length ?? 0), 0);
  const estimatedCredits = totalTokens;

  console.log('📡 Polymarket response stats:');
  console.log(`- Markets returned: ${markets.length}`);
  console.log(`- Total tokens: ${totalTokens}`);
  console.log(`- Estimated credits used: ${estimatedCredits}`);

  const result = await ingestMarketsFromPolymarket({ limit, activeOnly: true });
  console.log('✅ Ingestion result:', result);

  const counts = await prisma.market.count();
  console.log(`📊 Total markets stored: ${counts}`);
}

main()
  .then(() => {
    console.log('✅ Test run completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Test run failed:', error?.message || error);
    process.exit(1);
  });


