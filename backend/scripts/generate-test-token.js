/**
 * Generate Test JWT Token for Payment Testing
 *
 * This script generates a JWT token for a test user to test authenticated endpoints
 *
 * Usage:
 *   node scripts/generate-test-token.js <userId> <email>
 *
 * Example:
 *   node scripts/generate-test-token.js "123e4567-e89b-12d3-a456-426614174000" "test@example.com"
 */

import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Get command line arguments
const args = process.argv.slice(2);
const userId = args[0];
const email = args[1];

if (!userId || !email) {
  console.error('❌ Error: Missing required arguments');
  console.log('\nUsage:');
  console.log('  node scripts/generate-test-token.js <userId> <email>');
  console.log('\nExample:');
  console.log('  node scripts/generate-test-token.js "123e4567-e89b-12d3-a456-426614174000" "test@example.com"');
  process.exit(1);
}

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;

if (!JWT_ACCESS_SECRET) {
  console.error('❌ Error: JWT_ACCESS_SECRET not found in .env file');
  process.exit(1);
}

// Generate token (same logic as auth.services.ts)
const accessToken = jwt.sign(
  { userId, email },
  JWT_ACCESS_SECRET,
  { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '7d' }
);

console.log('\n✅ JWT Token Generated Successfully!\n');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
console.log('User ID:', userId);
console.log('Email:', email);
console.log('Expires In:', process.env.JWT_ACCESS_EXPIRES_IN || '7d');
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
console.log('Access Token:\n');
console.log(accessToken);
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
console.log('\n📋 Use this token in your curl commands:\n');
console.log(`curl -H "Authorization: Bearer ${accessToken}" http://localhost:3001/api/v1/payments/packages`);
console.log('\n');
