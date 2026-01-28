/**
 * Test Decimal conversion issue
 */

import { usersPrisma } from '../dist/lib/database.js';

async function testDecimalConversion() {
  try {
    console.log('\n=== Testing Decimal Conversion ===\n');

    // Get a user
    const user = await usersPrisma.user.findFirst({
      where: {
        name: 'apollo'
      }
    });

    if (!user) {
      console.log('User not found');
      return;
    }

    console.log('User:', user.name);
    console.log('\n--- Raw Value ---');
    console.log('availableCredits (raw):', user.availableCredits);
    console.log('Type:', typeof user.availableCredits);
    console.log('Constructor:', user.availableCredits.constructor.name);

    console.log('\n--- Number Conversion ---');
    const asNumber = Number(user.availableCredits);
    console.log('Number(availableCredits):', asNumber);
    console.log('Type:', typeof asNumber);

    console.log('\n--- String Conversion ---');
    const asString = user.availableCredits.toString();
    console.log('toString():', asString);
    const numberFromString = Number(asString);
    console.log('Number(toString()):', numberFromString);

    console.log('\n--- Comparison Test ---');
    const testAmount = 10;
    console.log(`Test amount: ${testAmount}`);
    console.log(`asNumber < testAmount: ${asNumber < testAmount}`);
    console.log(`asNumber >= testAmount: ${asNumber >= testAmount}`);

    // Test if there's a precision issue
    console.log('\n--- Precision Test ---');
    console.log('asNumber === 1650:', asNumber === 1650);
    console.log('asNumber.toFixed(2):', asNumber.toFixed(2));

    // Test what happens with Decimal directly
    console.log('\n--- Direct Decimal Comparison ---');
    console.log('user.availableCredits < 10:', user.availableCredits < 10);
    console.log('user.availableCredits < testAmount:', user.availableCredits < testAmount);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await usersPrisma.$disconnect();
  }
}

testDecimalConversion();
