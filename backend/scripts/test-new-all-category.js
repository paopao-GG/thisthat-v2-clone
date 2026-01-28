/**
 * Test the NEW "All" category implementation (deterministic pagination)
 * Should return NO duplicates across consecutive requests
 */

import { marketsPrisma } from '../dist/lib/database.js';

async function testNewAllCategory() {
  try {
    console.log('\n=== TESTING NEW "ALL" CATEGORY IMPLEMENTATION ===\n');

    const limit = 20;
    const where = { status: 'open' };

    // First request (skip=0)
    console.log('REQUEST 1 (skip=0, limit=20):');
    const batch1 = await marketsPrisma.market.findMany({
      where,
      take: limit,
      skip: 0,
      orderBy: [
        { updatedAt: 'desc' },
        { id: 'asc' }
      ],
      select: {
        id: true,
        title: true,
        category: true,
        updatedAt: true
      },
    });

    console.log(`Fetched ${batch1.length} markets`);
    const batch1Ids = batch1.map(m => m.id);
    console.log('Market IDs:', batch1Ids.map(id => id.substring(0, 8)).join(', '));
    console.log('Categories:', batch1.map(m => m.category).join(', '));

    // Second request (skip=20)
    console.log('\n---\n');
    console.log('REQUEST 2 (skip=20, limit=20):');
    const batch2 = await marketsPrisma.market.findMany({
      where,
      take: limit,
      skip: 20,
      orderBy: [
        { updatedAt: 'desc' },
        { id: 'asc' }
      ],
      select: {
        id: true,
        title: true,
        category: true,
        updatedAt: true
      },
    });

    console.log(`Fetched ${batch2.length} markets`);
    const batch2Ids = batch2.map(m => m.id);
    console.log('Market IDs:', batch2Ids.map(id => id.substring(0, 8)).join(', '));
    console.log('Categories:', batch2.map(m => m.category).join(', '));

    // Check for duplicates
    const duplicates = batch1Ids.filter(id => batch2Ids.includes(id));

    console.log('\n=== RESULTS ===');
    console.log(`Request 1: ${batch1.length} markets`);
    console.log(`Request 2: ${batch2.length} markets`);
    console.log(`Duplicates: ${duplicates.length} markets`);

    if (duplicates.length > 0) {
      console.log('\n❌ FAILED: Found duplicate markets!');
      console.log('Duplicate IDs:', duplicates.map(id => id.substring(0, 8)).join(', '));
      process.exit(1);
    } else {
      console.log('\n✅ SUCCESS: No duplicates found!');
      console.log('The new deterministic pagination works correctly.');
    }

    // Verify markets are diverse (from different categories)
    const categories1 = new Set(batch1.map(m => m.category));
    const categories2 = new Set(batch2.map(m => m.category));

    console.log(`\nRequest 1 categories: ${Array.from(categories1).join(', ')}`);
    console.log(`Request 2 categories: ${Array.from(categories2).join(', ')}`);
    console.log(`\nTotal unique categories across both requests: ${new Set([...categories1, ...categories2]).size}`);

    await marketsPrisma.$disconnect();
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
    await marketsPrisma.$disconnect();
    process.exit(1);
  }
}

testNewAllCategory();
