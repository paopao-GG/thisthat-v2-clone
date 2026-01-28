/**
 * Re-ingest all markets to populate categories
 */

import { ingestMarketsFromPolymarket } from '../src/services/market-ingestion.service.js';
import dotenv from 'dotenv';

dotenv.config();

async function reIngestAllMarkets() {
  try {
    console.log('🔄 Re-ingesting all markets to populate categories...\n');

    // Ingest a large batch to cover all markets
    const result = await ingestMarketsFromPolymarket({
      limit: 1000, // Large limit to get all markets
      activeOnly: true,
    });

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('✅ Re-ingestion Complete!');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`Total processed: ${result.total}`);
    console.log(`Created: ${result.created}`);
    console.log(`Updated: ${result.updated}`);
    console.log(`Skipped: ${result.skipped}`);
    console.log(`Errors: ${result.errors}`);
    console.log('\n💡 Run "npm run list:categories" to see updated category counts.');

  } catch (error: any) {
    console.error('❌ Error re-ingesting markets:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

reIngestAllMarkets();


