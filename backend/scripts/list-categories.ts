/**
 * List all categories and market counts from PostgreSQL database
 */

import { marketsPrisma } from '../src/lib/database.js';
import dotenv from 'dotenv';

dotenv.config();

async function listCategories() {
  try {
    console.log('📊 Fetching categories and market counts from PostgreSQL...\n');

    // First, check if any markets have categories
    const sampleMarkets = await marketsPrisma.market.findMany({
      take: 5,
      select: {
        id: true,
        title: true,
        category: true,
        polymarketId: true,
      },
    });

    console.log('Sample markets (first 5):');
    sampleMarkets.forEach((m, i) => {
      console.log(`  ${i + 1}. ${m.title?.substring(0, 50)}...`);
      console.log(`     Category: ${m.category || '(null)'}`);
      console.log(`     Polymarket ID: ${m.polymarketId || '(null)'}`);
      console.log('');
    });

    // Get all categories with counts using Prisma groupBy
    const categories = await marketsPrisma.market.groupBy({
      by: ['category'],
      where: {
        category: { not: null },
      },
      _count: {
        category: true,
      },
      orderBy: {
        _count: {
          category: 'desc',
        },
      },
    });

    // Also get counts by status
    const [totalMarkets, openMarkets, closedMarkets, resolvedMarkets] = await Promise.all([
      marketsPrisma.market.count(),
      marketsPrisma.market.count({ where: { status: 'open' } }),
      marketsPrisma.market.count({ where: { status: 'closed' } }),
      marketsPrisma.market.count({ where: { status: 'resolved' } }),
    ]);

    console.log('═══════════════════════════════════════════════════════════');
    console.log('📈 MARKET STATISTICS');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`Total Markets:     ${totalMarkets.toLocaleString()}`);
    console.log(`Open Markets:      ${openMarkets.toLocaleString()}`);
    console.log(`Closed Markets:    ${closedMarkets.toLocaleString()}`);
    console.log(`Resolved Markets:  ${resolvedMarkets.toLocaleString()}`);
    console.log('');

    if (categories.length === 0) {
      console.log('⚠️  No categories found in database.');
      console.log('   Make sure markets have been ingested from Polymarket.');
      await marketsPrisma.$disconnect();
      return;
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log(`📂 CATEGORIES (${categories.length} total)`);
    console.log('═══════════════════════════════════════════════════════════\n');

    // Calculate total markets with categories
    const totalWithCategories = categories.reduce((sum, cat) => sum + cat._count.category, 0);
    const marketsWithoutCategory = totalMarkets - totalWithCategories;

    // Display categories
    categories.forEach((cat, index) => {
      const categoryName = cat.category || '(null)';
      const count = cat._count.category;
      const percentage = ((count / totalMarkets) * 100).toFixed(1);
      const bar = '█'.repeat(Math.floor((count / totalMarkets) * 50));
      
      console.log(
        `${(index + 1).toString().padStart(3)}. ${categoryName.padEnd(30)} ${count.toString().padStart(6)} markets (${percentage.padStart(5)}%) ${bar}`
      );
    });

    if (marketsWithoutCategory > 0) {
      const percentage = ((marketsWithoutCategory / totalMarkets) * 100).toFixed(1);
      console.log(`\n    Markets without category: ${marketsWithoutCategory.toLocaleString()} (${percentage}%)`);
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log(`Total markets with categories: ${totalWithCategories.toLocaleString()}`);
    console.log('═══════════════════════════════════════════════════════════\n');

    // Get detailed breakdown by status for each category
    console.log('📊 Category Breakdown by Status:\n');
    for (const cat of categories.slice(0, 10)) { // Show top 10 categories
      const categoryName = cat.category || '(null)';
      const [open, closed, resolved] = await Promise.all([
        marketsPrisma.market.count({ where: { category: categoryName, status: 'open' } }),
        marketsPrisma.market.count({ where: { category: categoryName, status: 'closed' } }),
        marketsPrisma.market.count({ where: { category: categoryName, status: 'resolved' } }),
      ]);

      console.log(`  ${categoryName}:`);
      console.log(`    Open:     ${open.toString().padStart(4)}`);
      console.log(`    Closed:   ${closed.toString().padStart(4)}`);
      console.log(`    Resolved: ${resolved.toString().padStart(4)}`);
      console.log('');
    }

  } catch (error: any) {
    console.error('❌ Error fetching categories:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await marketsPrisma.$disconnect();
  }
}

listCategories();

