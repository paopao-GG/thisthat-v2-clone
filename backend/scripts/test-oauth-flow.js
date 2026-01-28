// Quick OAuth flow test - Run with: node test-oauth-flow.js
import 'dotenv/config';

const X_CLIENT_ID = process.env.X_CLIENT_ID;
const X_REDIRECT_URI = process.env.X_REDIRECT_URI;

console.log('\n========================================');
console.log('OAUTH CONFIGURATION TEST');
console.log('========================================\n');

console.log('Environment Variables:');
console.log('  X_CLIENT_ID:', X_CLIENT_ID);
console.log('  X_REDIRECT_URI:', X_REDIRECT_URI);
console.log('  FRONTEND_URL:', process.env.FRONTEND_URL);

if (!X_CLIENT_ID) {
  console.error('\n❌ ERROR: X_CLIENT_ID is not set in .env file');
  process.exit(1);
}

if (!X_REDIRECT_URI) {
  console.error('\n❌ ERROR: X_REDIRECT_URI is not set in .env file');
  process.exit(1);
}

// Test authorization URL generation
console.log('\n----------------------------------------');
console.log('Testing Authorization URL Generation');
console.log('----------------------------------------\n');

import crypto from 'node:crypto';

const state = crypto.randomBytes(32).toString('base64url');
const codeVerifier = crypto.randomBytes(32).toString('base64url');
const codeChallenge = crypto
  .createHash('sha256')
  .update(codeVerifier)
  .digest('base64url');

const stateWithVerifier = Buffer.from(`${state}:${codeVerifier}`).toString('base64url');

const params = new URLSearchParams({
  response_type: 'code',
  client_id: X_CLIENT_ID,
  redirect_uri: X_REDIRECT_URI,
  scope: 'tweet.read users.read offline.access',
  state: stateWithVerifier,
  code_challenge: codeChallenge,
  code_challenge_method: 'S256',
});

const authUrl = `https://twitter.com/i/oauth2/authorize?${params.toString()}`;

console.log('Generated OAuth URL:');
console.log(authUrl);

console.log('\n----------------------------------------');
console.log('URL Parameters Breakdown:');
console.log('----------------------------------------\n');

console.log('  response_type:', params.get('response_type'));
console.log('  client_id:', params.get('client_id'));
console.log('  redirect_uri:', params.get('redirect_uri'));
console.log('  scope:', params.get('scope'));
console.log('  code_challenge_method:', params.get('code_challenge_method'));
console.log('  state (length):', stateWithVerifier.length, 'chars');
console.log('  code_challenge (length):', codeChallenge.length, 'chars');

console.log('\n----------------------------------------');
console.log('Twitter Developer Portal Check:');
console.log('----------------------------------------\n');

console.log('1. Go to: https://developer.twitter.com/en/portal/projects-and-apps');
console.log('2. Find your app and check "User authentication settings"');
console.log('3. Verify "Callback URI / Redirect URL" contains:');
console.log('   ', X_REDIRECT_URI);
console.log('\n4. If not, add this callback URL to your Twitter app settings');
console.log('\n5. Make sure "OAuth 2.0" is enabled (not just OAuth 1.0a)');

console.log('\n========================================');
console.log('Test how the auth endpoint works:');
console.log('========================================\n');
console.log('1. Start your backend: docker-compose up -d');
console.log('2. Visit: http://localhost/api/v1/auth/x');
console.log('3. Watch backend logs: docker-compose logs -f backend | grep OAuth');
console.log('4. Check what redirect_uri is logged\n');
