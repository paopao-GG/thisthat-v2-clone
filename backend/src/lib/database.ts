import { PrismaClient as MarketsPrismaClient } from '../../node_modules/.prisma/client-markets/index.js';
import { PrismaClient as UsersPrismaClient } from '../../node_modules/.prisma/client-users/index.js';

// Prisma Client singletons to prevent multiple instances
const globalForMarketsPrisma = globalThis as unknown as {
  marketsPrisma: MarketsPrismaClient | undefined;
};

const globalForUsersPrisma = globalThis as unknown as {
  usersPrisma: UsersPrismaClient | undefined;
};

// Markets database client (for Market model only)
export const marketsPrisma: MarketsPrismaClient =
  globalForMarketsPrisma.marketsPrisma ??
  new MarketsPrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

// Users database client (for User, Bet, CreditTransaction, etc.)
export const usersPrisma: UsersPrismaClient =
  globalForUsersPrisma.usersPrisma ??
  new UsersPrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForMarketsPrisma.marketsPrisma = marketsPrisma;
  globalForUsersPrisma.usersPrisma = usersPrisma;
}

// Legacy export for backward compatibility during migration
// This will be removed after all services are updated
export const prisma = usersPrisma as any;

