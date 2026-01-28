console.log('🧪 Market Ingestion Configuration');
console.log('--------------------------------');
console.log(`MARKET_INGEST_CRON: ${process.env.MARKET_INGEST_CRON || '*/5 * * * * (default)'}`);
console.log(`MARKET_INGEST_LIMIT: ${process.env.MARKET_INGEST_LIMIT || '500 (default)'}`);
console.log(`TEST_POLYMARKET_LIMIT: ${process.env.TEST_POLYMARKET_LIMIT || '(not set)'}`);
console.log(`POLYMARKET_BASE_URL: ${process.env.POLYMARKET_BASE_URL || '(default gamma)'}`);
console.log(`POLYMARKET_API_KEY: ${process.env.POLYMARKET_API_KEY ? '(set)' : '(not set, using public endpoints)'}`);



