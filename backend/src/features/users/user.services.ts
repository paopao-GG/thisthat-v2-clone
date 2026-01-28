import { usersPrisma as prisma } from '../../lib/database.js';
import type { UpdateUserInput } from './user.models.js';

export interface PublicUserProfile {
  id: string;
  username: string;
  name: string | null;
  creditBalance: number;
  totalVolume: number;
  overallPnL: number;
  rankByPnL: number | null;
  rankByVolume: number | null;
  createdAt: Date;
}

/**
 * Update current user's profile
 */
export async function updateUserProfile(
  userId: string,
  input: UpdateUserInput
): Promise<PublicUserProfile> {
  // If username is being updated, check if it's already taken
  if (input.username) {
    const existingUser = await prisma.user.findUnique({
      where: { username: input.username },
    });

    if (existingUser && existingUser.id !== userId) {
      throw new Error('Username already taken');
    }
  }

  // Update user
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.username !== undefined && { username: input.username }),
      updatedAt: new Date(),
    },
    select: {
      id: true,
      username: true,
      name: true,
      creditBalance: true,
      totalVolume: true,
      overallPnL: true,
      rankByPnL: true,
      rankByVolume: true,
      createdAt: true,
    },
  });

  return {
    id: updatedUser.id,
    username: updatedUser.username,
    name: updatedUser.name,
    creditBalance: Number(updatedUser.creditBalance),
    totalVolume: Number(updatedUser.totalVolume),
    overallPnL: Number(updatedUser.overallPnL),
    rankByPnL: updatedUser.rankByPnL,
    rankByVolume: updatedUser.rankByVolume,
    createdAt: updatedUser.createdAt,
  };
}

/**
 * Get user profile by ID (public profile)
 */
export async function getUserById(userId: string): Promise<PublicUserProfile | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      name: true,
      creditBalance: true,
      totalVolume: true,
      overallPnL: true,
      rankByPnL: true,
      rankByVolume: true,
      createdAt: true,
    },
  });

  if (!user) {
    return null;
  }

  return {
    id: user.id,
    username: user.username,
    name: user.name,
    creditBalance: Number(user.creditBalance),
    totalVolume: Number(user.totalVolume),
    overallPnL: Number(user.overallPnL),
    rankByPnL: user.rankByPnL,
    rankByVolume: user.rankByVolume,
    createdAt: user.createdAt,
  };
}

