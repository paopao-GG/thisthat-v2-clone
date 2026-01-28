import { marketsPrisma } from '../dist/lib/database.js';

async function diagnose() {
  console.log('=== DIAGNOSING "ALL" CATEGORY FILTER ===\n');

  // Test OLD ordering (updatedAt DESC)
  console.log('1️⃣  OLD QUERY (updatedAt DESC):');
  const marketsOld = await marketsPrisma.market.findMany({
    where: { status: 'open' },
    take: 200,
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    select: { id: true, category: true, updatedAt: true, volume: true }
  });

  console.log('Total returned:', marketsOld.length);
  const oldCounts = {};
  marketsOld.forEach(m => {
    oldCounts[m.category] = (oldCounts[m.category] || 0) + 1;
  });
  console.log('Categories found:', Object.keys(oldCounts).length);
  Object.entries(oldCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).forEach(([cat, count]) => {
    console.log(`  ${cat}: ${count}`);
  });

  // Test NEW ordering (volume DESC)
  console.log('\n2️⃣  NEW QUERY (volume DESC) - "All" category fix:');
  const markets = await marketsPrisma.market.findMany({
    where: { status: 'open' },
    take: 200,
    orderBy: [{ volume: 'desc' }, { updatedAt: 'desc' }, { id: 'asc' }],
    select: { id: true, category: true, updatedAt: true, volume: true }
  });

  console.log('Total returned:', markets.length);

  const categoryCounts = {};
  markets.forEach(m => {
    categoryCounts[m.category] = (categoryCounts[m.category] || 0) + 1;
  });

  console.log('\nCategory distribution in first 200 results:');
  Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([cat, count]) => {
      console.log(`  ${cat}: ${count}`);
    });

  console.log('\n--- Analysis ---');
  console.log('Unique categories found:', Object.keys(categoryCounts).length);

  const allCategories = ['science', 'entertainment', 'sports', 'politics',
                         'business', 'general', 'crypto', 'economics',
                         'technology', 'international', 'elections'];
  const missingCategories = allCategories.filter(cat => !categoryCounts[cat]);

  if (missingCategories.length > 0) {
    console.log('\n❌ Categories MISSING from first 200 results:');
    console.log('  ', missingCategories.join(', '));
    console.log('\n🔍 ROOT CAUSE: Markets are ordered by updatedAt DESC');
    console.log('   This means recently updated markets dominate the results.');
    console.log('   If certain categories haven\'t been updated recently, they won\'t appear.');
  } else {
    console.log('\n✅ All categories present in first 200 results!');
  }

  // Check update times
  const oldestUpdate = markets[markets.length - 1]?.updatedAt;
  const newestUpdate = markets[0]?.updatedAt;
  console.log('\nUpdate time range:');
  console.log('  Newest:', newestUpdate);
  console.log('  Oldest:', oldestUpdate);

  await marketsPrisma.$disconnect();
}

diagnose().catch(console.error);
