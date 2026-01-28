/**
 * Get Test User from Database
 *
 * This script retrieves an existing user from the database for testing
 * or suggests creating a new test user if none exist.
 */

import { PrismaClient } from '../node_modules/.prisma/client-users/index.js';
import dotenv from 'dotenv';

dotenv.config();

const usersPrisma = new PrismaClient();

async function getTestUser() {
  try {
    console.log('🔍 Looking for test users in database...\n');

    // Get first user from database
    const user = await usersPrisma.user.findFirst({
      select: {
        id: true,
        email: true,
        username: true,
        availableCredits: true,
        creditBalance: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!user) {
      console.log('❌ No users found in database.\n');
      console.log('📝 You need to create a test user first. Options:\n');
      console.log('1. Register via frontend: http://localhost:5173');
      console.log('2. Use the API directly:\n');
      console.log('   curl -X POST http://localhost:3001/api/v1/auth/signup \\');
      console.log('     -H "Content-Type: application/json" \\');
      console.log('     -d \'{"username": "testuser", "email": "test@example.com", "password": "Test123!", "name": "Test User"}\'');
      console.log('\n');
      process.exit(0);
    }

    console.log('✅ Found test user!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('User ID:', user.id);
    console.log('Email:', user.email);
    console.log('Username:', user.username);
    console.log('Available Credits:', user.availableCredits.toString());
    console.log('Total Balance:', user.creditBalance.toString());
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('\n📋 Next steps:\n');
    console.log('1. Generate JWT token for this user:\n');
    console.log(`   node scripts/generate-test-token.js "${user.id}" "${user.email}"`);
    console.log('\n2. Or use the full test suite:\n');
    console.log('   node scripts/test-payment-flow.js');
    console.log('\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await usersPrisma.$disconnect();
  }
}

getTestUser();
