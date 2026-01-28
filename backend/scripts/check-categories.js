import { marketsPrisma, usersPrisma } from '../dist/lib/database.js';

async function checkCategories() {
  try {
    console.log('=== Checking Categories ===\n');

    // Get all categories with count
    const categories = await marketsPrisma.market.groupBy({
      by: ['category'],
      _count: { category: true }
    });

    console.log('Available categories in markets database:');
    categories.forEach(cat => {
      console.log(`  - ${cat.category}: ${cat._count.category} markets`);
    });

    // Pick first category and check bets
    if (categories.length > 0) {
      const testCategory = categories[0].category;
      console.log(`\n=== Testing category: "${testCategory}" ===\n`);

      // Get market IDs for this category
      const markets = await marketsPrisma.market.findMany({
        where: { category: testCategory },
        select: { id: true, question: true }
      });

      console.log(`Found ${markets.length} markets in "${testCategory}" category`);
      console.log('Sample markets:');
      markets.slice(0, 3).forEach(m => {
        console.log(`  - ${m.id}: ${m.question}`);
      });

      const marketIds = markets.map(m => m.id);

      // Check bets for these markets
      const bets = await usersPrisma.bet.findMany({
        where: {
          marketId: { in: marketIds }
        },
        select: {
          id: true,
          userId: true,
          marketId: true,
          amount: true,
          status: true
        },
        take: 10
      });

      console.log(`\nFound ${bets.length} bets for markets in "${testCategory}"`);

      if (bets.length > 0) {
        console.log('Sample bets:');
        bets.slice(0, 3).forEach(b => {
          console.log(`  - Bet ${b.id}: User ${b.userId}, Market ${b.marketId}, Amount ${b.amount}, Status ${b.status}`);
        });

        // Count unique users
        const uniqueUsers = new Set(bets.map(b => b.userId));
        console.log(`\nUnique users with bets in this category: ${uniqueUsers.size}`);
      } else {
        console.log('⚠️  No bets found for this category!');
      }
    }

    await marketsPrisma.$disconnect();
    await usersPrisma.$disconnect();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkCategories();
