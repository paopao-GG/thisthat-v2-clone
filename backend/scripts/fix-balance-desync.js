/**
 * Fix desynchronized user balances
 *
 * Problem: availableCredits can get out of sync with freeCreditsBalance + purchasedCreditsBalance
 * Solution: Recalculate availableCredits and creditBalance from the source of truth wallets
 *
 * Usage: node scripts/fix-balance-desync.js [--dry-run]
 */

import { usersPrisma } from '../dist/lib/database.js';

const isDryRun = process.argv.includes('--dry-run');

async function fixBalanceDesync() {
  console.log('🔍 Scanning for users with desynchronized balances...\n');
  if (isDryRun) {
    console.log('⚠️  DRY RUN MODE - No changes will be made\n');
  }

  try {
    // Find all users and check for desync
    const users = await usersPrisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        creditBalance: true,
        availableCredits: true,
        freeCreditsBalance: true,
        purchasedCreditsBalance: true,
      },
    });

    console.log(`Found ${users.length} total users\n`);

    const desyncedUsers = [];

    for (const user of users) {
      const freeCredits = Number(user.freeCreditsBalance);
      const purchasedCredits = Number(user.purchasedCreditsBalance);
      const expectedTotal = freeCredits + purchasedCredits;
      const actualAvailable = Number(user.availableCredits);
      const actualCreditBalance = Number(user.creditBalance);

      // Check if either is desynced
      const availableDesync = Math.abs(actualAvailable - expectedTotal) > 0.01;
      const creditBalanceDesync = Math.abs(actualCreditBalance - expectedTotal) > 0.01;

      if (availableDesync || creditBalanceDesync) {
        desyncedUsers.push({
          ...user,
          freeCredits,
          purchasedCredits,
          expectedTotal,
          actualAvailable,
          actualCreditBalance,
          availableDesync,
          creditBalanceDesync,
        });
      }
    }

    if (desyncedUsers.length === 0) {
      console.log('✅ No desynchronized balances found! All users are in sync.');
      return;
    }

    console.log(`⚠️  Found ${desyncedUsers.length} users with desynchronized balances:\n`);
    console.log('─'.repeat(100));

    for (const user of desyncedUsers) {
      console.log(`User: ${user.username || user.email} (${user.id})`);
      console.log(`  Free Credits:      ${user.freeCredits.toFixed(2)}`);
      console.log(`  Purchased Credits: ${user.purchasedCredits.toFixed(2)}`);
      console.log(`  Expected Total:    ${user.expectedTotal.toFixed(2)}`);
      console.log(`  Actual Available:  ${user.actualAvailable.toFixed(2)} ${user.availableDesync ? '❌ WRONG' : '✓'}`);
      console.log(`  Actual Balance:    ${user.actualCreditBalance.toFixed(2)} ${user.creditBalanceDesync ? '❌ WRONG' : '✓'}`);
      console.log('─'.repeat(100));
    }

    if (isDryRun) {
      console.log('\n⚠️  DRY RUN - No changes made. Run without --dry-run to fix.');
      return;
    }

    console.log('\n🔧 Fixing desynchronized balances...\n');

    let fixed = 0;
    for (const user of desyncedUsers) {
      try {
        await usersPrisma.user.update({
          where: { id: user.id },
          data: {
            availableCredits: user.expectedTotal,
            creditBalance: user.expectedTotal,
          },
        });
        console.log(`✅ Fixed: ${user.username || user.email}`);
        fixed++;
      } catch (error) {
        console.error(`❌ Failed to fix ${user.username || user.email}:`, error.message);
      }
    }

    console.log(`\n✅ Fixed ${fixed}/${desyncedUsers.length} users`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await usersPrisma.$disconnect();
  }
}

fixBalanceDesync();
