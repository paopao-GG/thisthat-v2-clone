// Prisma Mock Helper for Unit Tests
import { vi } from 'vitest';

let _mockPrismaInstance: any = null;

function createMockPrisma() {
  const mockPrisma = {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    market: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    bet: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    creditTransaction: {
      findMany: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
    },
    dailyReward: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    refreshToken: {
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    stock: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    stockHolding: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    stockTransaction: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  };

  // Set up $transaction to use mockPrisma
  mockPrisma.$transaction.mockImplementation(async (callback: any) => {
    return callback(mockPrisma);
  });

  return mockPrisma;
}

// Singleton pattern - returns the same instance
export function getMockPrisma() {
  if (!_mockPrismaInstance) {
    _mockPrismaInstance = createMockPrisma();
  }
  return _mockPrismaInstance;
}

// Reset function for tests
export function resetMockPrisma() {
  _mockPrismaInstance = null;
}

