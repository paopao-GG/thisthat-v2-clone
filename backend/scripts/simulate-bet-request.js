/**
 * Simulate a bet request to debug the issue
 */

const API_URL = 'http://localhost:3001';

async function getBearerToken() {
  // This should be replaced with an actual token from your browser's localStorage/cookies
  // For now, we'll try to extract it from cookies
  console.log('⚠️  You need to provide a valid access token');
  console.log('Get it from your browser:');
  console.log('1. Open DevTools (F12)');
  console.log('2. Go to Application/Storage > Cookies');
  console.log('3. Copy the "accessToken" value');
  console.log('\nOr from localStorage:');
  console.log('localStorage.getItem("accessToken")');

  return null;
}

async function testBetPlacement() {
  try {
    console.log('\n=== Simulating Bet Request ===\n');

    // You need to replace this with your actual token
    const token = process.argv[2];

    if (!token) {
      await getBearerToken();
      console.log('\nUsage: node scripts/simulate-bet-request.js <YOUR_ACCESS_TOKEN>');
      return;
    }

    // Get user info first
    console.log('1. Fetching user info...');
    const userResponse = await fetch(`${API_URL}/api/v1/auth/me`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!userResponse.ok) {
      console.error('Failed to fetch user:', userResponse.status, await userResponse.text());
      return;
    }

    const userData = await userResponse.json();
    console.log('User:', userData.user?.name || userData.user?.email);
    console.log('Credits:', userData.user?.creditBalance);

    // Get a market
    console.log('\n2. Fetching markets...');
    const marketsResponse = await fetch(`${API_URL}/api/v1/markets?limit=1`);
    const marketsData = await marketsResponse.json();
    const market = marketsData.markets?.[0];

    if (!market) {
      console.error('No markets available');
      return;
    }

    console.log('Market:', market.title.substring(0, 60));
    console.log('Market ID:', market.id);

    // Place bet
    console.log('\n3. Placing bet...');
    const betBody = {
      marketId: market.id,
      side: 'this',
      amount: 10,
    };

    console.log('Request body:', JSON.stringify(betBody, null, 2));

    const betResponse = await fetch(`${API_URL}/api/v1/bets`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(betBody),
    });

    console.log('Response status:', betResponse.status);

    const betData = await betResponse.json();
    console.log('Response body:', JSON.stringify(betData, null, 2));

    if (!betResponse.ok) {
      console.error('\n❌ BET FAILED!');
      console.error('Error:', betData.error);
    } else {
      console.log('\n✅ BET SUCCESS!');
      console.log('New balance:', betData.newBalance);
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

testBetPlacement();
