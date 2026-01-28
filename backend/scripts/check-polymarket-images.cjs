require('dotenv').config();
const axios = require('axios');

async function checkPolymarketImages() {
  // Test one of the missing image markets
  const conditionId = '0x819691ac974bf2558001123c25dff4184bf2fc426eaf68fcd4b89510a0299362';

  console.log('Fetching market from CLOB API:', conditionId);
  console.log('');

  try {
    const response = await axios.get(`https://clob.polymarket.com/markets/${conditionId}`);
    const market = response.data;

    console.log('Market data:');
    console.log('  Title:', market.question);
    console.log('  Image:', market.image || 'NULL');
    console.log('  Icon:', market.icon || 'NULL');
    console.log('');

    if (!market.image && !market.icon) {
      console.log('❌ This market has NO images in CLOB API');
      console.log('');

      // Try Gamma API instead
      console.log('Trying Gamma API...');
      const gammaResponse = await axios.get(`https://gamma-api.polymarket.com/markets/${conditionId}`);
      const gammaMarket = gammaResponse.data;

      console.log('Gamma API result:');
      console.log('  Image:', gammaMarket.image || 'NULL');
      console.log('  Icon:', gammaMarket.icon || 'NULL');
    } else {
      console.log('✅ Market has images:');
      console.log('  Image URL:', market.image);
      console.log('  Icon URL:', market.icon);
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkPolymarketImages();
