/**
 * Create a test user with unlimited credits for testing
 */

import { usersPrisma } from '../dist/lib/database.js';

async function createTestUser() {
  try {
    const testEmail = 'test@thisthat.local';
    const testUsername = 'testuser';

    console.log('\n=== Creating Test User ===\n');

    // Check if user already exists
    let user = await usersPrisma.user.findUnique({
      where: { email: testEmail }
    });

    if (user) {
      console.log('Test user already exists. Updating credits...');

      // Update existing user with huge credits
      user = await usersPrisma.user.update({
        where: { email: testEmail },
        data: {
          creditBalance: 999999,
          availableCredits: 999999,
          expendedCredits: 0,
          totalVolume: 0,
          overallPnL: 0
        }
      });
    } else {
      console.log('Creating new test user...');

      // Create new test user
      user = await usersPrisma.user.create({
        data: {
          email: testEmail,
          username: testUsername,
          name: 'Test User',
          creditBalance: 999999,
          availableCredits: 999999,
          expendedCredits: 0,
          totalVolume: 0,
          overallPnL: 0
        }
      });
    }

    console.log('✅ Test user ready!');
    console.log('\nUser Details:');
    console.log('ID:', user.id);
    console.log('Email:', user.email);
    console.log('Username:', user.username);
    console.log('Credits:', user.availableCredits.toString());

    console.log('\n📝 To login as this test user:');
    console.log('1. Comment out OAuth login in your frontend');
    console.log('2. Or use this user ID directly in your testing');
    console.log('\n💡 User ID for testing:', user.id);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await usersPrisma.$disconnect();
  }
}

createTestUser();
