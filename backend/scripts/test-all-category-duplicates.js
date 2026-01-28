/**
 * Test if "All" category returns duplicate markets in consecutive requests
 * This could explain why "insufficient credits" only happens in "All" category
 */

import { marketsPrisma } from '../dist/lib/database.js';

async function testAllCategoryDuplicates() {
  try {
    console.log('\n=== TESTING "ALL" CATEGORY FOR DUPLICATES ===\n');

    const limit = 20;
    const where = { status: 'open' };

    // Simulate two consecutive "All" category requests
    console.log('Simulating two consecutive "All" category market fetch requests...\n');

    // First request
    const allCategories1 = await marketsPrisma.market.groupBy({
      by: ['category'],
      where: { status: 'open' },
      _count: { category: true },
    });

    const totalMarkets = allCategories1.reduce((sum, cat) => sum + (cat._count?.category || 0), 0);
    const categoryMarkets1 = await Promise.all(
      allCategories1.map(async ({ category, _count }) => {
        const categorySize = _count?.category || 0;

        let marketsToFetch;
        if (categorySize > 1000) {
          marketsToFetch = Math.max(3, Math.ceil(limit * 0.4 * (categorySize / totalMarkets)));
        } else if (categorySize > 100) {
          marketsToFetch = Math.max(2, Math.ceil(limit * 0.4 / allCategories1.length));
        } else {
          marketsToFetch = Math.max(1, Math.ceil(limit * 0.2 / allCategories1.length));
        }

        const randomOffset = Math.floor(Math.random() * Math.max(0, categorySize - marketsToFetch));

        return marketsPrisma.market.findMany({
          where: { ...where, category },
          take: marketsToFetch,
          skip: randomOffset,
          orderBy: [
            { updatedAt: 'desc' },
            { id: 'asc' }
          ],
          select: { id: true, title: true, category: true },
        });
      })
    );

    const allMarkets1 = categoryMarkets1.flat();
    const batch1 = allMarkets1
      .sort(() => Math.random() - 0.5)
      .slice(0, limit);

    console.log('REQUEST 1:');
    console.log(`Fetched ${batch1.length} markets`);
    const batch1Ids = batch1.map(m => m.id);
    console.log('Market IDs:', batch1Ids.map(id => id.substring(0, 8)).join(', '));

    // Second request (simulating next fetch)
    console.log('\n---\n');

    const allCategories2 = await marketsPrisma.market.groupBy({
      by: ['category'],
      where: { status: 'open' },
      _count: { category: true },
    });

    const categoryMarkets2 = await Promise.all(
      allCategories2.map(async ({ category, _count }) => {
        const categorySize = _count?.category || 0;

        let marketsToFetch;
        if (categorySize > 1000) {
          marketsToFetch = Math.max(3, Math.ceil(limit * 0.4 * (categorySize / totalMarkets)));
        } else if (categorySize > 100) {
          marketsToFetch = Math.max(2, Math.ceil(limit * 0.4 / allCategories2.length));
        } else {
          marketsToFetch = Math.max(1, Math.ceil(limit * 0.2 / allCategories2.length));
        }

        const randomOffset = Math.floor(Math.random() * Math.max(0, categorySize - marketsToFetch));

        return marketsPrisma.market.findMany({
          where: { ...where, category },
          take: marketsToFetch,
          skip: randomOffset,
          orderBy: [
            { updatedAt: 'desc' },
            { id: 'asc' }
          ],
          select: { id: true, title: true, category: true },
        });
      })
    );

    const allMarkets2 = categoryMarkets2.flat();
    const batch2 = allMarkets2
      .sort(() => Math.random() - 0.5)
      .slice(0, limit);

    console.log('REQUEST 2:');
    console.log(`Fetched ${batch2.length} markets`);
    const batch2Ids = batch2.map(m => m.id);
    console.log('Market IDs:', batch2Ids.map(id => id.substring(0, 8)).join(', '));

    // Check for duplicates between the two batches
    const duplicates = batch1Ids.filter(id => batch2Ids.includes(id));

    console.log('\n=== RESULTS ===');
    console.log(`Request 1: ${batch1.length} markets`);
    console.log(`Request 2: ${batch2.length} markets`);
    console.log(`Duplicates: ${duplicates.length} markets`);

    if (duplicates.length > 0) {
      console.log('\n⚠️  WARNING: Found duplicate markets between consecutive requests!');
      console.log('This could cause the "insufficient credits" error if user bets on the same market twice.');
      console.log('\nDuplicate market IDs:');
      duplicates.forEach(id => {
        const market = batch1.find(m => m.id === id);
        console.log(`  - ${id.substring(0, 8)}: ${market?.title.substring(0, 50)}...`);
      });
    } else {
      console.log('\n✅ No duplicates found between consecutive requests');
    }

    await marketsPrisma.$disconnect();
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
    await marketsPrisma.$disconnect();
    process.exit(1);
  }
}

testAllCategoryDuplicates();
