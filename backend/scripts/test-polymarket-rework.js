/**
 * Test Script for Polymarket Rework
 *
 * Tests all new features locally:
 * - Database schema
 * - Market ingestion with images
 * - Enhanced category monitor
 * - Popularity sorting
 * - API endpoints
 *
 * Usage: node scripts/test-polymarket-rework.js
 */

import { marketsPrisma } from '../dist/lib/database.js';
import { ingestMarketsFromPolymarket, updateMarketImagesFromEvents } from '../dist/services/market-ingestion.service.js';
import { monitorAndRefillCategories, getAllCategoryStats } from '../dist/services/category-monitor-enhanced.service.js';
import { getRandomMarkets } from '../dist/features/markets/markets.services.js';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step, title) {
  log(`\n${'='.repeat(60)}`, 'cyan');
  log(`STEP ${step}: ${title}`, 'cyan');
  log('='.repeat(60), 'cyan');
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'blue');
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Test 1: Verify Database Schema
async function testDatabaseSchema() {
  logStep(1, 'Verify Database Schema');

  try {
    // Try to select new columns
    const result = await marketsPrisma.$queryRaw`
      SELECT
        column_name,
        data_type
      FROM information_schema.columns
      WHERE table_name = 'markets'
      AND column_name IN ('image_url', 'volume', 'volume_24hr')
      ORDER BY column_name;
    `;

    if (result.length === 3) {
      logSuccess('All 3 new columns exist: image_url, volume, volume_24hr');
      result.forEach(col => {
        logInfo(`  - ${col.column_name}: ${col.data_type}`);
      });
      return true;
    } else {
      logError(`Only ${result.length}/3 columns found. Run: npm run db:push`);
      return false;
    }
  } catch (error) {
    logError(`Schema check failed: ${error.message}`);
    return false;
  }
}

// Test 2: Market Ingestion
async function testMarketIngestion() {
  logStep(2, 'Test Market Ingestion');

  try {
    logInfo('Fetching 50 markets from Polymarket...');
    const result = await ingestMarketsFromPolymarket({ limit: 50, activeOnly: true });

    logSuccess(`Ingestion complete!`);
    logInfo(`  - Total processed: ${result.total}`);
    logInfo(`  - Created: ${result.created}`);
    logInfo(`  - Updated: ${result.updated}`);
    logInfo(`  - Skipped: ${result.skipped}`);
    logInfo(`  - Errors: ${result.errors}`);

    if (result.errors > 0) {
      logWarning('Some markets had errors during ingestion');
    }

    return result.total > 0;
  } catch (error) {
    logError(`Ingestion failed: ${error.message}`);
    return false;
  }
}

// Test 3: Image Update
async function testImageUpdate() {
  logStep(3, 'Test Image Update from Events');

  try {
    logInfo('Fetching event images from Polymarket...');
    const result = await updateMarketImagesFromEvents();

    logSuccess('Image update complete!');
    logInfo(`  - Events processed: ${result.eventsProcessed}`);
    logInfo(`  - Markets updated: ${result.marketsUpdated}`);
    logInfo(`  - Errors: ${result.errors}`);

    if (result.marketsUpdated > 0) {
      logSuccess(`${result.marketsUpdated} markets now have images`);
    } else {
      logWarning('No markets were updated with images');
    }

    return true;
  } catch (error) {
    logError(`Image update failed: ${error.message}`);
    return false;
  }
}

// Test 4: Verify Data in Database
async function testDatabaseData() {
  logStep(4, 'Verify Data in Database');

  try {
    const stats = await marketsPrisma.$queryRaw`
      SELECT
        COUNT(*) as total_markets,
        COUNT(image_url) as markets_with_images,
        COUNT(volume) as markets_with_volume,
        COUNT(volume_24hr) as markets_with_volume_24hr
      FROM markets
      WHERE status = 'open';
    `;

    const data = stats[0];

    // Convert BigInt to Number for calculations
    const totalMarkets = Number(data.total_markets);
    const withImages = Number(data.markets_with_images);
    const withVolume = Number(data.markets_with_volume);
    const withVolume24hr = Number(data.markets_with_volume_24hr);

    logSuccess('Database statistics:');
    logInfo(`  - Total open markets: ${totalMarkets}`);
    logInfo(`  - Markets with images: ${withImages} (${Math.round(withImages / totalMarkets * 100)}%)`);
    logInfo(`  - Markets with volume: ${withVolume} (${Math.round(withVolume / totalMarkets * 100)}%)`);
    logInfo(`  - Markets with volume_24hr: ${withVolume24hr} (${Math.round(withVolume24hr / totalMarkets * 100)}%)`);

    if (totalMarkets === 0) {
      logError('No markets in database!');
      return false;
    }

    if (withImages === 0) {
      logWarning('No markets have images yet');
    }

    return true;
  } catch (error) {
    logError(`Database check failed: ${error.message}`);
    return false;
  }
}

// Test 5: Enhanced Category Monitor
async function testEnhancedMonitor() {
  logStep(5, 'Test Enhanced Category Monitor');

  try {
    logInfo('Getting category stats...');
    const stats = await getAllCategoryStats();

    logSuccess('Category statistics:');
    stats.forEach(stat => {
      const status = stat.isBackedOff
        ? '⏸️  BACKED OFF'
        : stat.needsRefill
        ? '🔴 NEEDS REFILL'
        : '🟢 HEALTHY';

      const backoffInfo = stat.isBackedOff ? ` (${stat.backoffDays} days)` : '';
      log(`  ${status} ${stat.category.padEnd(15)} ${stat.count.toString().padStart(5)} / 1000 markets${backoffInfo}`);
    });

    const needsRefill = stats.filter(s => s.needsRefill && !s.isBackedOff);
    if (needsRefill.length > 0) {
      logWarning(`${needsRefill.length} categories need refilling`);
      logInfo('To fill categories, run: node -e "import(\'./dist/services/category-monitor-enhanced.service.js\').then(m => m.monitorAndRefillCategories())"');
    } else {
      logSuccess('All categories are healthy!');
    }

    return true;
  } catch (error) {
    logError(`Enhanced monitor check failed: ${error.message}`);
    return false;
  }
}

// Test 6: Popularity Sorting
async function testPopularitySorting() {
  logStep(6, 'Test Popularity-Based Market Sorting');

  try {
    logInfo('Fetching random markets with popularity...');
    const popularMarkets = await getRandomMarkets(10, true);

    logInfo('Fetching random markets without popularity...');
    const randomMarkets = await getRandomMarkets(10, false);

    logSuccess(`Retrieved ${popularMarkets.length} popular markets`);
    logSuccess(`Retrieved ${randomMarkets.length} random markets`);

    // Check if markets have volume data
    const popularWithVolume = popularMarkets.filter(m => m.volume24hr !== null);
    const randomWithVolume = randomMarkets.filter(m => m.volume24hr !== null);

    logInfo(`  - Popular markets with volume data: ${popularWithVolume.length}/${popularMarkets.length}`);
    logInfo(`  - Random markets with volume data: ${randomWithVolume.length}/${randomMarkets.length}`);

    // Show top 3 popular markets
    if (popularWithVolume.length > 0) {
      logInfo('\nTop 3 popular markets:');
      popularWithVolume.slice(0, 3).forEach((m, i) => {
        log(`  ${i + 1}. "${m.title.substring(0, 50)}..."`);
        log(`     Volume 24h: $${m.volume24hr?.toLocaleString() || 'N/A'}`);
      });
    }

    return popularMarkets.length > 0 && randomMarkets.length > 0;
  } catch (error) {
    logError(`Popularity sorting test failed: ${error.message}`);
    return false;
  }
}

// Test 7: Market Images
async function testMarketImages() {
  logStep(7, 'Test Market Images');

  try {
    const marketsWithImages = await marketsPrisma.market.findMany({
      where: {
        status: 'open',
        imageUrl: { not: null },
      },
      take: 5,
      select: {
        id: true,
        title: true,
        imageUrl: true,
      },
    });

    if (marketsWithImages.length > 0) {
      logSuccess(`Found ${marketsWithImages.length} markets with images`);
      logInfo('\nSample markets with images:');
      marketsWithImages.forEach((m, i) => {
        log(`  ${i + 1}. "${m.title.substring(0, 50)}..."`);
        log(`     Image: ${m.imageUrl?.substring(0, 60)}...`);
      });
      return true;
    } else {
      logWarning('No markets with images found');
      logInfo('Run image update: node -e "import(\'./dist/services/market-ingestion.service.js\').then(m => m.updateMarketImagesFromEvents())"');
      return false;
    }
  } catch (error) {
    logError(`Market images test failed: ${error.message}`);
    return false;
  }
}

// Main test runner
async function runAllTests() {
  log('\n' + '='.repeat(60), 'cyan');
  log('POLYMARKET REWORK - LOCAL TEST SUITE', 'cyan');
  log('='.repeat(60) + '\n', 'cyan');

  const results = {
    schema: false,
    ingestion: false,
    images: false,
    data: false,
    monitor: false,
    popularity: false,
    imageData: false,
  };

  // Run tests sequentially
  results.schema = await testDatabaseSchema();
  await sleep(1000);

  if (results.schema) {
    results.ingestion = await testMarketIngestion();
    await sleep(1000);

    results.images = await testImageUpdate();
    await sleep(1000);

    results.data = await testDatabaseData();
    await sleep(1000);

    results.monitor = await testEnhancedMonitor();
    await sleep(1000);

    results.popularity = await testPopularitySorting();
    await sleep(1000);

    results.imageData = await testMarketImages();
  }

  // Summary
  log('\n' + '='.repeat(60), 'cyan');
  log('TEST SUMMARY', 'cyan');
  log('='.repeat(60), 'cyan');

  const tests = [
    ['Database Schema', results.schema],
    ['Market Ingestion', results.ingestion],
    ['Image Update', results.images],
    ['Database Data', results.data],
    ['Enhanced Monitor', results.monitor],
    ['Popularity Sorting', results.popularity],
    ['Market Images', results.imageData],
  ];

  tests.forEach(([name, passed]) => {
    if (passed) {
      logSuccess(`${name.padEnd(25)} PASSED`);
    } else {
      logError(`${name.padEnd(25)} FAILED`);
    }
  });

  const totalPassed = Object.values(results).filter(Boolean).length;
  const totalTests = Object.values(results).length;

  log('\n' + '='.repeat(60), 'cyan');
  if (totalPassed === totalTests) {
    logSuccess(`ALL TESTS PASSED! (${totalPassed}/${totalTests})`);
    log('\n✨ Ready to deploy to production!', 'green');
  } else {
    logWarning(`SOME TESTS FAILED (${totalPassed}/${totalTests} passed)`);
    log('\n⚠️  Fix failing tests before deploying', 'yellow');
  }
  log('='.repeat(60) + '\n', 'cyan');

  // Cleanup
  await marketsPrisma.$disconnect();

  process.exit(totalPassed === totalTests ? 0 : 1);
}

// Run tests
runAllTests().catch(error => {
  logError(`Test suite crashed: ${error.message}`);
  console.error(error);
  process.exit(1);
});
