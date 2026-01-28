import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import { usersPrisma as prisma } from '../../lib/database.js';
import type { SignupInput, LoginInput } from './auth.models.js';

// JWT sign/verify interface compatible with @fastify/jwt
interface JwtInstance {
  sign: (payload: object, options?: { expiresIn?: string | number }) => string;
  verify: <T = unknown>(token: string) => T;
}

const SALT_ROUNDS = 12;
const STARTING_CREDITS = 1000;
const REFERRAL_BONUS_CREDITS = 200;
const REFERRAL_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const REFERRAL_CODE_LENGTH = 8;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  name: string | null;
  profileImageUrl?: string | null;
  creditBalance: number;
  availableCredits: number;
  expendedCredits: number;
  // Separated credit balances
  freeCreditsBalance: number;
  purchasedCreditsBalance: number;
  consecutiveDaysOnline: number;
  referralCode: string;
  referralCount: number;
  referralCreditsEarned: number;
  totalVolume: number;
  overallPnL: number;
  lastDailyRewardAt: Date | null;
  rankByPnL: number | null;
  rankByVolume: number | null;
  // Stats fields
  totalBets: number;
  winRate: number;
  dailyStreak: number;
  tokenAllocation: number;
  lockedTokens: number;
  biggestWin: number;
}

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

async function generateReferralCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    let code = '';
    for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) {
      const idx = crypto.randomInt(0, REFERRAL_CODE_ALPHABET.length);
      code += REFERRAL_CODE_ALPHABET[idx];
    }

    const existing = await prisma.user.findUnique({
      where: { referralCode: code },
      select: { id: true },
    });

    if (!existing) {
      return code;
    }
  }

  // Fallback to uuid if collisions keep happening
  return crypto.randomUUID().replace(/-/g, '').slice(0, REFERRAL_CODE_LENGTH).toUpperCase();
}

function mapUserToProfile(user: any, biggestWin: number = 0): UserProfile {
  const totalBets = user._count?.bets ?? 0;
  // TODO: Calculate actual win rate from resolved bets
  const wins = Math.floor(totalBets * 0.6); // Placeholder
  const winRate = totalBets > 0 ? Number(((wins / totalBets) * 100).toFixed(1)) : 0;

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    name: user.name,
    profileImageUrl: user.profileImageUrl ?? null,
    creditBalance: Number(user.creditBalance ?? 0),
    availableCredits: Number(user.availableCredits ?? 0),
    expendedCredits: Number(user.expendedCredits ?? 0),
    // Separated credit balances
    freeCreditsBalance: Number(user.freeCreditsBalance ?? 0),
    purchasedCreditsBalance: Number(user.purchasedCreditsBalance ?? 0),
    consecutiveDaysOnline: user.consecutiveDaysOnline ?? 1,
    referralCode: user.referralCode,
    referralCount: user.referralCount ?? 0,
    referralCreditsEarned: Number(user.referralCreditsEarned ?? 0),
    totalVolume: Number(user.totalVolume ?? 0),
    overallPnL: Number(user.overallPnL ?? 0),
    lastDailyRewardAt: user.lastDailyRewardAt ?? null,
    rankByPnL: user.rankByPnL ?? null,
    rankByVolume: user.rankByVolume ?? null,
    totalBets,
    winRate,
    dailyStreak: user.consecutiveDaysOnline ?? 1,
    tokenAllocation: Number(user.creditBalance ?? 0),
    lockedTokens: 0,
    biggestWin,
  };
}

/**
 * Register a new user
 */
export async function registerUser(
  input: SignupInput,
  jwt: JwtInstance
): Promise<{ user: UserProfile; tokens: AuthTokens }> {
  const normalizedReferralCode = input.referralCode?.trim().toUpperCase();
  let referringUser: { id: string } | null = null;

  if (normalizedReferralCode) {
    referringUser = await prisma.user.findUnique({
      where: { referralCode: normalizedReferralCode },
      select: { id: true },
    });

    if (!referringUser) {
      throw new Error('Invalid referral code');
    }
  }

  // Check if email already exists
  const existingEmail = await prisma.user.findUnique({
    where: { email: input.email },
  });

  if (existingEmail) {
    throw new Error('Email already registered');
  }

  // Check if username already exists
  const existingUsername = await prisma.user.findUnique({
    where: { username: input.username },
  });

  if (existingUsername) {
    throw new Error('Username already taken');
  }

  // Hash password
  const passwordHash = await hashPassword(input.password);
  const referralCode = await generateReferralCode();

  const { user } = await prisma.$transaction(async (tx) => {
    const createdUser = await tx.user.create({
      data: {
        username: input.username,
        email: input.email,
        name: input.name,
        passwordHash,
        creditBalance: STARTING_CREDITS,
        availableCredits: STARTING_CREDITS,
        expendedCredits: 0,
        // Signup bonus goes to free credits
        freeCreditsBalance: STARTING_CREDITS,
        purchasedCreditsBalance: 0,
        consecutiveDaysOnline: 1,
        lastLoginAt: new Date(),
        referralCode,
        referredById: referringUser?.id ?? null,
      },
    });

    await tx.creditTransaction.create({
      data: {
        userId: createdUser.id,
        amount: STARTING_CREDITS,
        transactionType: 'signup_bonus',
        balanceAfter: STARTING_CREDITS,
      },
    });

    if (referringUser) {
      const referrer = await tx.user.update({
        where: { id: referringUser.id },
        data: {
          creditBalance: {
            increment: REFERRAL_BONUS_CREDITS,
          },
          availableCredits: {
            increment: REFERRAL_BONUS_CREDITS,
          },
          // Referral bonus goes to free credits
          freeCreditsBalance: {
            increment: REFERRAL_BONUS_CREDITS,
          },
          referralCount: {
            increment: 1,
          },
          referralCreditsEarned: {
            increment: REFERRAL_BONUS_CREDITS,
          },
        },
      });

      await tx.creditTransaction.create({
        data: {
          userId: referringUser.id,
          amount: REFERRAL_BONUS_CREDITS,
          transactionType: 'referral_bonus',
          referenceId: createdUser.id,
          balanceAfter: Number(referrer.creditBalance),
        },
      });
    }

    return { user: createdUser };
  });

  // Generate JWT tokens
  const accessToken = jwt.sign(
    { userId: user.id, email: user.email },
    { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m' }
  );

  const refreshToken = jwt.sign(
    { userId: user.id, type: 'refresh' },
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );

  // Store refresh token in database
  const refreshTokenHash = await hashPassword(refreshToken);
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: refreshTokenHash,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    },
  });

  // New users have no wins yet
  return {
    user: mapUserToProfile(user, 0),
    tokens: {
      accessToken,
      refreshToken,
    },
  };
}

/**
 * Authenticate user login
 */
export async function authenticateUser(
  input: LoginInput,
  jwt: JwtInstance
): Promise<{ user: UserProfile; tokens: AuthTokens }> {
  // Find user by email
  const user = await prisma.user.findUnique({
    where: { email: input.email },
  });

  if (!user) {
    throw new Error('Invalid email or password');
  }

  // Check if user has a password (OAuth users don't have passwords)
  if (!user.passwordHash) {
    throw new Error('Invalid email or password');
  }

  // Verify password
  const isValidPassword = await verifyPassword(input.password, user.passwordHash);
  if (!isValidPassword) {
    throw new Error('Invalid email or password');
  }

  // Generate JWT tokens
  const accessToken = jwt.sign(
    { userId: user.id, email: user.email },
    { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m' }
  );

  const refreshToken = jwt.sign(
    { userId: user.id, type: 'refresh' },
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );

  // Store refresh token in database
  const refreshTokenHash = await hashPassword(refreshToken);
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: refreshTokenHash,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    },
  });

  // Update last login timestamp and check consecutive days
  const now = new Date();
  const lastLoginAt = user.lastLoginAt;
  
  let consecutiveDays = user.consecutiveDaysOnline;
  if (lastLoginAt) {
    const daysSinceLastLogin = Math.floor(
      (now.getTime() - lastLoginAt.getTime()) / (1000 * 60 * 60 * 24)
    );
    
    if (daysSinceLastLogin === 0) {
      // Same day login - maintain streak
      consecutiveDays = user.consecutiveDaysOnline;
    } else if (daysSinceLastLogin === 1) {
      // Next day - increment streak
      consecutiveDays = user.consecutiveDaysOnline + 1;
    } else {
      // Streak broken - reset to 1
      consecutiveDays = 1;
    }
  } else {
    // First login
    consecutiveDays = 1;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      updatedAt: now,
      lastLoginAt: now,
      consecutiveDaysOnline: consecutiveDays,
    },
  });

  return {
    user: mapUserToProfile(user),
    tokens: {
      accessToken,
      refreshToken,
    },
  };
}

/**
 * Get user profile by ID
 */
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      email: true,
      name: true,
      profileImageUrl: true,
      creditBalance: true,
      availableCredits: true,
      expendedCredits: true,
      // Separated credit balances
      freeCreditsBalance: true,
      purchasedCreditsBalance: true,
      consecutiveDaysOnline: true,
      referralCode: true,
      referralCount: true,
      referralCreditsEarned: true,
      totalVolume: true,
      overallPnL: true,
      lastDailyRewardAt: true,
      rankByPnL: true,
      rankByVolume: true,
      biggestWin: true,
      _count: {
        select: {
          bets: true,
        },
      },
    },
  });

  if (!user) {
    return null;
  }

  // biggestWin is now stored directly on the user record
  // It's updated whenever a bet is won or sold for profit
  return mapUserToProfile(user, Number(user.biggestWin ?? 0));
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(
  refreshToken: string,
  jwt: JwtInstance
): Promise<{ accessToken: string }> {
  // Find valid (non-expired) refresh tokens with their users
  const refreshTokens = await prisma.refreshToken.findMany({
    where: {
      expiresAt: { gt: new Date() },
    },
    include: {
      user: true,
    },
  });

  // Find matching token by comparing hashes
  let matchedToken: (typeof refreshTokens)[0] | null = null;
  for (const token of refreshTokens) {
    const isValid = await verifyPassword(refreshToken, token.tokenHash);
    if (isValid) {
      matchedToken = token;
      break;
    }
  }

  if (!matchedToken) {
    throw new Error('Invalid or expired refresh token');
  }

  // Generate new access token
  const accessToken = jwt.sign(
    { userId: matchedToken.user.id, email: matchedToken.user.email },
    { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m' }
  );

  return { accessToken };
}

/**
 * Logout user by invalidating refresh token
 */
export async function logoutUser(refreshToken: string): Promise<void> {
  // Find and delete refresh token
  const refreshTokens = await prisma.refreshToken.findMany({
    where: {
      expiresAt: { gt: new Date() },
    },
  });

  // Find matching token and delete it
  for (const token of refreshTokens) {
    const isValid = await verifyPassword(refreshToken, token.tokenHash);
    if (isValid) {
      await prisma.refreshToken.delete({
        where: { id: token.id },
      });
      return;
    }
  }

  // Token not found, but don't throw error (idempotent)
}

/**
 * PnL history data point
 */
export interface PnLDataPoint {
  timestamp: string;
  pnl: number;
  cumulativePnL: number;
}

/**
 * Get user's PnL history based on bet activity
 * Calculates cumulative PnL over time from resolved bets
 */
export async function getUserPnLHistory(
  userId: string,
  timeFilter: '1D' | '1W' | '1M' | 'ALL' = 'ALL'
): Promise<PnLDataPoint[]> {
  // Calculate the start date based on filter
  const now = new Date();
  let startDate: Date | null = null;

  switch (timeFilter) {
    case '1D':
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case '1W':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '1M':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case 'ALL':
    default:
      startDate = null;
      break;
  }

  // Get resolved bets (won, lost) with their timestamps
  const whereClause: any = {
    userId,
    status: { in: ['won', 'lost'] },
  };

  if (startDate) {
    whereClause.resolvedAt = { gte: startDate };
  }

  const resolvedBets = await prisma.bet.findMany({
    where: whereClause,
    select: {
      id: true,
      amount: true,
      actualPayout: true,
      status: true,
      resolvedAt: true,
      placedAt: true,
    },
    orderBy: {
      resolvedAt: 'asc',
    },
  });

  // If no resolved bets, return empty array
  if (resolvedBets.length === 0) {
    return [];
  }

  // Calculate cumulative PnL over time
  let cumulativePnL = 0;
  const pnlHistory: PnLDataPoint[] = [];

  for (const bet of resolvedBets) {
    const betAmount = Number(bet.amount);
    const payout = Number(bet.actualPayout ?? 0);
    const pnl = payout - betAmount; // Profit/loss for this bet

    cumulativePnL += pnl;

    pnlHistory.push({
      timestamp: (bet.resolvedAt ?? bet.placedAt).toISOString(),
      pnl: Number(pnl.toFixed(2)),
      cumulativePnL: Number(cumulativePnL.toFixed(2)),
    });
  }

  return pnlHistory;
}
