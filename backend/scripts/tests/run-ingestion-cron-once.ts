import { startMarketIngestionJob, stopMarketIngestionJob } from '../../src/jobs/market-ingestion.job.js';

async function main() {
  console.log('🕒 Starting ingestion cron job for a single cycle...');
  startMarketIngestionJob();

  const waitMs = Number(process.env.TEST_CRON_WAIT_MS) || 15000;
  console.log(`⏱ Waiting ${waitMs}ms to observe logs...`);
  await new Promise((resolve) => setTimeout(resolve, waitMs));

  stopMarketIngestionJob();
  console.log('✅ Ingestion cron job stop signal sent.');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Cron test failed:', error?.message || error);
    process.exit(1);
  });



