import { getMarkets } from '../dist/features/markets/markets.services.js';

async function testCategoryFetching() {
  console.log('=== TESTING CATEGORY-SPECIFIC FETCHING (ALL MARKETS) ===\n');

  // Test 1: Sports category (should fetch all 2461 markets)
  console.log('1️⃣  Testing SPORTS category:');
  const sportsMarkets = await getMarkets({
    category: 'sports',
    status: 'open',
  });
  console.log(`   Fetched: ${sportsMarkets.length} markets`);
  console.log(`   Expected: ~2461 markets`);
  console.log(`   ${sportsMarkets.length >= 2400 ? '✅ PASS' : '❌ FAIL'}\n`);

  // Test 2: Elections category (should fetch all 1545 markets)
  console.log('2️⃣  Testing ELECTIONS category:');
  const electionsMarkets = await getMarkets({
    category: 'elections',
    status: 'open',
  });
  console.log(`   Fetched: ${electionsMarkets.length} markets`);
  console.log(`   Expected: ~1545 markets`);
  console.log(`   ${electionsMarkets.length >= 1500 ? '✅ PASS' : '❌ FAIL'}\n`);

  // Test 3: Crypto category (should fetch all ~89 markets)
  console.log('3️⃣  Testing CRYPTO category:');
  const cryptoMarkets = await getMarkets({
    category: 'crypto',
    status: 'open',
  });
  console.log(`   Fetched: ${cryptoMarkets.length} markets`);
  console.log(`   Expected: ~89 markets`);
  console.log(`   ${cryptoMarkets.length >= 80 ? '✅ PASS' : '❌ FAIL'}\n`);

  // Test 4: Science category (should fetch all 2 markets)
  console.log('4️⃣  Testing SCIENCE category:');
  const scienceMarkets = await getMarkets({
    category: 'science',
    status: 'open',
  });
  console.log(`   Fetched: ${scienceMarkets.length} markets`);
  console.log(`   Expected: ~2 markets`);
  console.log(`   ${scienceMarkets.length === 2 ? '✅ PASS' : '❌ FAIL'}\n`);

  console.log('=== SUMMARY ===');
  const allPassed =
    sportsMarkets.length >= 2400 &&
    electionsMarkets.length >= 1500 &&
    cryptoMarkets.length >= 80 &&
    scienceMarkets.length === 2;

  if (allPassed) {
    console.log('✅ ALL TESTS PASSED! Categories now fetch ALL markets.');
  } else {
    console.log('❌ SOME TESTS FAILED. Check logs above.');
  }

  process.exit(allPassed ? 0 : 1);
}

testCategoryFetching().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
