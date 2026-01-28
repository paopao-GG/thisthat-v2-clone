/**
 * Debug script to test OAuth callback URL parsing
 * Run this to see what URL the callback would generate
 */

const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

// Simulated successful OAuth result
const result = {
  tokens: {
    accessToken: 'test_access_token_12345',
    refreshToken: 'test_refresh_token_67890'
  },
  user: {
    id: 'user_123'
  }
};

const params = new URLSearchParams({
  accessToken: result.tokens.accessToken,
  refreshToken: result.tokens.refreshToken,
  userId: result.user.id,
});

const redirectUrl = `${frontendUrl}/auth/callback?${params.toString()}`;

console.log('=== OAuth Callback Debug ===');
console.log('Frontend URL:', frontendUrl);
console.log('Full Redirect URL:', redirectUrl);
console.log('\nQuery Parameters:');
console.log('  accessToken:', params.get('accessToken'));
console.log('  refreshToken:', params.get('refreshToken'));
console.log('  userId:', params.get('userId'));
console.log('\nExpected frontend route: /auth/callback');
console.log('\nIf you see this URL in browser, tokens should be extracted correctly.');
