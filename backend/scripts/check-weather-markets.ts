/**
 * Check weather markets
 */

import { marketsPrisma } from '../src/lib/database.js';

async function checkWeather() {
  try {
    const weather = await marketsPrisma.market.findMany({
      where: { category: 'weather', status: 'open' },
      select: { id: true, title: true, category: true, description: true },
    });

    console.log(`\n🌤️  Weather markets in database: ${weather.length}\n`);

    weather.forEach((m, i) => {
      console.log(`${i + 1}. ${m.title}`);
      if (m.description) {
        console.log(`   Description: ${m.description.substring(0, 100)}...`);
      }
      console.log('');
    });

    // Now let's check how Polymarket categorizes weather
    console.log('\n🔍 Testing weather keyword matching...\n');

    const testTitles = [
      "Will it rain in New York tomorrow?",
      "Hurricane season prediction",
      "Temperature forecast",
      "Climate change impact",
      "Will there be snow this Christmas?",
    ];

    testTitles.forEach(title => {
      const combined = title.toLowerCase();
      const isWeather = combined.match(/weather|climate|temperature|rain|snow|hurricane|tornado/);
      console.log(`"${title}"`);
      console.log(`  → ${isWeather ? '✅ Would be categorized as WEATHER' : '❌ Would NOT be weather'}\n`);
    });

    await marketsPrisma.$disconnect();
    process.exit(0);
  } catch (error: any) {
    console.error('Error:', error.message);
    await marketsPrisma.$disconnect();
    process.exit(1);
  }
}

checkWeather();
