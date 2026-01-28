/**
 * Give credits to a user
 * Usage: node scripts/give-credits.js <email-or-username> [amount]
 * Example: node scripts/give-credits.js apollo 999999
 */

import { usersPrisma } from '../dist/lib/database.js';

const identifier = process.argv[2];
const amount = process.argv[3] ? parseInt(process.argv[3]) : 999999;

if (!identifier) {
  console.log('Usage: node scripts/give-credits.js <email-or-username> [amount]');
  console.log('Example: node scripts/give-credits.js apollo 999999');
  process.exit(1);
}

async function giveCredits() {
  try {
    // Find user by email or username
    const user = await usersPrisma.user.findFirst({
      where: {
        OR: [
          { email: { contains: identifier, mode: 'insensitive' } },
          { username: { contains: identifier, mode: 'insensitive' } },
          { name: { contains: identifier, mode: 'insensitive' } }
        ]
      }
    });

    if (!user) {
      console.log(`❌ User not found: ${identifier}`);
      console.log('Try searching by email, username, or name');
      return;
    }

    const updated = await usersPrisma.user.update({
      where: { id: user.id },
      data: {
        creditBalance: amount,
        availableCredits: amount
      }
    });

    console.log(`✅ Credits updated!`);
    console.log(`User: ${updated.name || updated.username} (${updated.email})`);
    console.log(`New balance: ${updated.availableCredits.toString()} credits`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await usersPrisma.$disconnect();
  }
}

giveCredits();
