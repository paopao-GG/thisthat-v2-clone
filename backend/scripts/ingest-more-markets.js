// Manually ingest more markets to reach 1000+ per category
import { ingestMarketsFromPolymarket } from '../src/services/market-ingestion.service.js';

async function ingestMoreMarkets() {
  try {
    console.log('🚀 Starting large market ingestion...');
    console.log('⏱️  This may take 5-10 minutes depending on API response...\n');

    // Ingest 10,000 markets to ensure we get at least 1000 per major category
    // Polymarket has category distribution roughly:
    // - Sports: 30-40%
    // - Elections: 20-30%
    // - General/Politics: 20-30%
    // - Others: 10-20%
    const result = await ingestMarketsFromPolymarket({
      limit: 10000,
      activeOnly: true,
    });

    console.log('\n✅ Ingestion Complete!\n');
    console.log('📊 Results:');
    console.log(`   Total processed: ${result.total}`);
    console.log(`   Created: ${result.created}`);
    console.log(`   Updated: ${result.updated}`);
    console.log(`   Skipped: ${result.skipped}`);
    console.log(`   Errors: ${result.errors}`);

    console.log('\n💡 Run the count script to see updated category counts:');
    console.log('   node scripts/count-markets-by-category.js');

  } catch (error) {
    console.error('❌ Error during ingestion:', error);
    process.exit(1);
  }
}

ingestMoreMarkets();
