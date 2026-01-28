import { PrismaClient } from '../node_modules/.prisma/client-users/index.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const usersPrisma = new PrismaClient();

async function seedCreditPackages() {
  console.log('🌱 Seeding credit packages...');

  // P4 - Credit Purchase Multiplier System
  // All purchased credits receive a 2x multiplier for a limited duration
  // Multiplier durations by package (in hours):
  // - Starter: 4 hours (~$1)
  // - Casual: 10 hours (~$5)
  // - Regular: 24 hours (1 day, ~$10)
  // - Active: 72 hours (3 days, ~$25)
  // - Power: 168 hours (1 week, ~$50)
  // - Whale: 720 hours (1 month, ~$100)

  const packages = [
    {
      id: 'test',
      name: 'Test Pack',
      credits: 10,
      priceUsd: 0.50,
      bonusPercentage: 0,
      multiplierHours: 1, // 1 hour for testing
      displayOrder: 0,
      isActive: true,
    },
    {
      id: 'starter',
      name: 'Starter',
      credits: 100,
      priceUsd: 1.99,
      bonusPercentage: 0,
      multiplierHours: 4, // 4 hours
      displayOrder: 1,
      isActive: true,
    },
    {
      id: 'casual',
      name: 'Casual',
      credits: 250,
      priceUsd: 4.99,
      bonusPercentage: 5,
      multiplierHours: 10, // 10 hours
      displayOrder: 2,
      isActive: true,
    },
    {
      id: 'regular',
      name: 'Regular',
      credits: 500,
      priceUsd: 9.99,
      bonusPercentage: 10,
      multiplierHours: 24, // 1 day
      displayOrder: 3,
      isActive: true,
    },
    {
      id: 'active',
      name: 'Active',
      credits: 1000,
      priceUsd: 19.99,
      bonusPercentage: 15,
      multiplierHours: 72, // 3 days
      displayOrder: 4,
      isActive: true,
    },
    {
      id: 'power',
      name: 'Power',
      credits: 2500,
      priceUsd: 49.99,
      bonusPercentage: 20,
      multiplierHours: 168, // 1 week
      displayOrder: 5,
      isActive: true,
    },
    {
      id: 'whale',
      name: 'Whale',
      credits: 5000,
      priceUsd: 99.99,
      bonusPercentage: 25,
      multiplierHours: 720, // 1 month (30 days)
      displayOrder: 6,
      isActive: true,
    },
  ];

  for (const pkg of packages) {
    await usersPrisma.creditPackage.upsert({
      where: { id: pkg.id },
      create: pkg,
      update: pkg,
    });
    console.log(`✅ Created/Updated package: ${pkg.name}`);
  }

  console.log('✅ Credit packages seeded successfully!');
}

seedCreditPackages()
  .catch((error) => {
    console.error('❌ Error seeding packages:', error);
    process.exit(1);
  })
  .finally(async () => {
    await usersPrisma.$disconnect();
  });
