import { cleanExpiredMarketsWithNoBets } from '../src/services/market-janitor.service.js';
import { marketsPrisma } from '../src/lib/database.js';

async function run() {
  console.log('Starting cleanup of expired markets with no bets...\n');
  console.log('Current time:', new Date().toISOString());
  console.log('');

  const result = await cleanExpiredMarketsWithNoBets();

  console.log('=== CLEANUP COMPLETE ===');
  console.log(`✓ Deleted: ${result.deleted} markets (no bets)`);
  console.log(`✗ Skipped: ${result.skipped} markets (have bets)`);
  console.log('');

  if (result.skippedMarkets.length > 0) {
    console.log('Skipped markets (have bets):');
    const displayLimit = 20;
    const toDisplay = result.skippedMarkets.slice(0, displayLimit);

    for (const m of toDisplay) {
      const titlePreview = m.title.slice(0, 60);
      console.log(`  [${m.betCount} bet${m.betCount === 1 ? '' : 's'}] ${titlePreview}`);
    }

    if (result.skippedMarkets.length > displayLimit) {
      console.log(`  ... and ${result.skippedMarkets.length - displayLimit} more`);
    }
  }

  await marketsPrisma.$disconnect();
}

run().catch((error) => {
  console.error('Error running cleanup:', error);
  process.exit(1);
});
