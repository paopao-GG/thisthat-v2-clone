/**
 * Test OAuth Configuration
 * This script checks if your OAuth environment variables are set correctly
 */

import 'dotenv/config';

console.log('=== OAuth Configuration Check ===\n');

const requiredVars = {
  'X_CLIENT_ID': process.env.X_CLIENT_ID,
  'X_CLIENT_SECRET': process.env.X_CLIENT_SECRET,
  'X_REDIRECT_URI': process.env.X_REDIRECT_URI,
  'FRONTEND_URL': process.env.FRONTEND_URL,
  'JWT_ACCESS_SECRET': process.env.JWT_ACCESS_SECRET,
  'JWT_REFRESH_SECRET': process.env.JWT_REFRESH_SECRET,
};

let hasErrors = false;

for (const [name, value] of Object.entries(requiredVars)) {
  if (!value || value.includes('your_') || value.includes('your-')) {
    console.log(`❌ ${name}: NOT SET or using placeholder value`);
    hasErrors = true;
  } else {
    // Show partial value for security
    const preview = value.length > 20
      ? `${value.substring(0, 10)}...${value.substring(value.length - 5)}`
      : `${value.substring(0, 5)}...`;
    console.log(`✅ ${name}: ${preview}`);
  }
}

console.log('\n=== OAuth URLs ===');
console.log('Backend callback URL:', process.env.X_REDIRECT_URI);
console.log('Frontend URL:', process.env.FRONTEND_URL);

console.log('\n=== Twitter App Settings Should Match ===');
console.log('In your Twitter Developer Portal, ensure:');
console.log('1. Callback URL / Redirect URI:', process.env.X_REDIRECT_URI);
console.log('2. App permissions include: Read, Users.read');
console.log('3. OAuth 2.0 is enabled');

if (hasErrors) {
  console.log('\n❌ ERRORS FOUND - Please update your .env file');
  console.log('Copy env.template to .env and fill in your Twitter app credentials');
} else {
  console.log('\n✅ All OAuth environment variables are set');
}

// Check for common mistakes
console.log('\n=== Common Issues ===');
if (process.env.X_REDIRECT_URI?.includes('localhost') && !process.env.X_REDIRECT_URI?.includes('127.0.0.1')) {
  console.log('⚠️  WARNING: Using "localhost" in redirect URI');
  console.log('   Consider using "127.0.0.1" instead for better compatibility');
}

if (process.env.X_REDIRECT_URI?.includes('127.0.0.1') && process.env.FRONTEND_URL?.includes('localhost')) {
  console.log('ℹ️  INFO: Backend uses 127.0.0.1 but frontend uses localhost');
  console.log('   This is OK, but ensure both work in your browser');
}
