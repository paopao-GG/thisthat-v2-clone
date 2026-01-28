/**
 * Quick script to manually trigger Supabase sync
 * Run with: npx tsx scripts/run-sync.ts
 */

import { runUserDataSyncManually } from '../src/jobs/analytics-aggregation.job.js';

async function main() {
  console.log('Starting manual Supabase sync...\n');

  try {
    await runUserDataSyncManually();
    console.log('\n✓ Sync completed successfully!');
  } catch (error) {
    console.error('\n✗ Sync failed:', error);
    process.exit(1);
  }

  process.exit(0);
}

main();
