/**
 * Quick test to check if API returns imageUrl
 */

const axios = require('axios');

const API_BASE = process.env.VITE_API_URL || 'http://localhost:3001';

async function main() {
  console.log('Testing API at:', API_BASE);

  try {
    // Test /random endpoint
    const randomRes = await axios.get(`${API_BASE}/api/v1/markets/random?count=3`);
    console.log('\n=== /api/v1/markets/random ===');
    console.log('Success:', randomRes.data.success);
    console.log('Count:', randomRes.data.count);
    console.log('\nFirst market:');
    const first = randomRes.data.data[0];
    console.log('  id:', first.id);
    console.log('  title:', first.title?.substring(0, 50));
    console.log('  imageUrl:', first.imageUrl || 'NULL');
    console.log('  All fields:', Object.keys(first).join(', '));

    // Test /markets endpoint
    const marketsRes = await axios.get(`${API_BASE}/api/v1/markets?limit=3`);
    console.log('\n=== /api/v1/markets ===');
    console.log('Success:', marketsRes.data.success);
    console.log('Count:', marketsRes.data.count);
    console.log('\nFirst market:');
    const firstMkt = marketsRes.data.data[0];
    console.log('  id:', firstMkt.id);
    console.log('  title:', firstMkt.title?.substring(0, 50));
    console.log('  imageUrl:', firstMkt.imageUrl || 'NULL');

    // Check how many have images
    console.log('\n=== Image Stats ===');
    const allMarkets = await axios.get(`${API_BASE}/api/v1/markets?limit=100`);
    const withImages = allMarkets.data.data.filter(m => m.imageUrl).length;
    console.log(`Markets with imageUrl: ${withImages}/${allMarkets.data.data.length}`);

  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

main();
