import { getMarkets } from '../dist/features/markets/markets.services.js';

async function testAllCategory() {
  console.log('=== TESTING "ALL" CATEGORY FIX ===\n');

  // Test without category (All)
  console.log('Fetching 200 markets for "All" category...');
  const markets = await getMarkets({
    status: 'open',
    limit: 200
  });

  console.log('Total markets returned:', markets.length);

  const categoryCounts = {};
  markets.forEach(m => {
    categoryCounts[m.category] = (categoryCounts[m.category] || 0) + 1;
  });

  console.log('\nCategory distribution:');
  Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([cat, count]) => {
      console.log(`  ${cat}: ${count} markets`);
    });

  console.log('\nTotal unique categories:', Object.keys(categoryCounts).length);

  const allCategories = ['science', 'entertainment', 'sports', 'politics', 'business', 'general', 'crypto', 'economics', 'technology', 'international', 'elections'];
  const presentCategories = Object.keys(categoryCounts);
  const missingCategories = allCategories.filter(cat => !presentCategories.includes(cat));

  if (missingCategories.length === 0) {
    console.log('\n✅ SUCCESS! All 11 categories are represented!');
  } else {
    console.log(`\n⚠️  Missing ${missingCategories.length} categories: ${missingCategories.join(', ')}`);
  }

  process.exit(0);
}

testAllCategory().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
