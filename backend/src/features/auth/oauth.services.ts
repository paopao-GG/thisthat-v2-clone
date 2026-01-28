import { usersPrisma as prisma } from '../../lib/database.js';
import { hashPassword } from './auth.services.js';
import crypto from 'node:crypto';
import { storeOAuthState, retrieveOAuthState, deleteOAuthState, cleanupExpiredStates } from '../../lib/oauth-state.service.js';

// JWT sign/verify interface compatible with @fastify/jwt
interface JwtInstance {
  sign: (payload: object, options?: { expiresIn?: string | number }) => string;
  verify: <T = unknown>(token: string) => T;
}

// Response types from X OAuth API
interface XTokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

interface XUserResponse {
  data: {
    id: string;
    username: string;
    name: string;
    profile_image_url?: string;
    public_metrics?: {
      followers_count: number;
      following_count: number;
      tweet_count: number;
      listed_count: number;
    };
  };
}

const X_AUTH_URL = 'https://twitter.com/i/oauth2/authorize';
const X_TOKEN_URL = 'https://api.twitter.com/2/oauth2/token';
const X_USER_INFO_URL = 'https://api.twitter.com/2/users/me';

// Timeout configurations
const TIMEOUT_OAUTH_CALLBACK = 8000; // 8 seconds (safe buffer before 10s browser timeout)
const TIMEOUT_TOKEN_EXCHANGE = 5000; // 5 seconds for token exchange
const TIMEOUT_USER_INFO = 5000; // 5 seconds for user info fetch
const TIMEOUT_DB_OPERATIONS = 6000; // 6 seconds for database operations

interface XUserInfo {
  id: string;
  username: string;
  name: string;
  profile_image_url?: string;
  followers_count?: number;
  following_count?: number;
}

/**
 * Retry helper for Twitter API calls with exponential backoff
 * Handles rate limiting (429), forbidden (403), and server errors (500-503)
 *
 * @param apiCall - The async function to retry
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @param initialDelayMs - Initial delay in milliseconds (default: 1000)
 * @returns The result of the API call
 * @throws The last error if all retries fail
 */
async function retryTwitterApiCall<T>(
  apiCall: () => Promise<T>,
  maxRetries: number = 3,
  initialDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await apiCall();
    } catch (error: any) {
      lastError = error;
      const statusCode = error?.status || error?.response?.status || (error?.message?.match(/\d{3}/)?.[0] ? parseInt(error.message.match(/\d{3}/)[0]) : null);

      console.error(`[TWITTER-API-RETRY] Attempt ${attempt + 1}/${maxRetries} failed:`, {
        status: statusCode,
        message: error?.message,
        timestamp: new Date().toISOString(),
      });

      // Don't retry on client errors except rate limit (429) and forbidden (403)
      if (statusCode && statusCode >= 400 && statusCode < 500 && statusCode !== 403 && statusCode !== 429) {
        console.error(`[TWITTER-API-RETRY] Non-retryable client error (${statusCode}), aborting`);
        throw error;
      }

      // If this was the last attempt, throw
      if (attempt === maxRetries - 1) {
        console.error(`[TWITTER-API-RETRY] Max retries (${maxRetries}) reached, giving up`);
        throw error;
      }

      // Exponential backoff: 1s, 2s, 4s
      const delayMs = initialDelayMs * Math.pow(2, attempt);
      console.log(`[TWITTER-API-RETRY] Retrying in ${delayMs}ms... (Attempt ${attempt + 2}/${maxRetries})`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError || new Error('Twitter API call failed after retries');
}

/**
 * Upgrade Twitter profile image URL from low-res to original high-res
 * Removes _normal suffix to get the original resolution image (400x400 vs 48x48)
 */
function upgradeTwitterImageUrl(url?: string): string {
  if (!url) return '';
  return url.replace(/_normal\.(jpg|jpeg|png|gif|webp)$/i, '.$1');
}

// OAuth state is now stored in Redis (see oauth-state.service.ts)
// No longer using in-memory Map to support multi-instance deployments and persist across restarts

/**
 * Get the appropriate redirect URI based on environment
 */
function getRedirectUri(): string {
  // Check if we have an explicit redirect URI from env
  if (process.env.X_REDIRECT_URI) {
    return process.env.X_REDIRECT_URI;
  }

  // Otherwise, construct from backend URL
  const port = process.env.PORT || '3001';
  const host = process.env.HOST || '0.0.0.0';

  // In development, use localhost
  if (process.env.NODE_ENV === 'development') {
    return `http://localhost:${port}/api/v1/auth/x/callback`;
  }

  // In production, construct from host
  return `http://${host}:${port}/api/v1/auth/x/callback`;
}

/**
 * Generate OAuth authorization URL for X
 * @param referralCode - Optional referral code to include in state for new user signup
 */
export async function getXAuthUrl(referralCode?: string): Promise<{ url: string; state: string; codeVerifier: string }> {
  const state = crypto.randomBytes(32).toString('base64url');
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  // Store state and codeVerifier in Redis (expires in 10 minutes)
  await storeOAuthState(state, codeVerifier, 10 * 60);

  // Clean up expired states from in-memory fallback
  cleanupExpiredStates();

  // Encode codeVerifier (and optional referral code) in state for fallback
  // Format: base64(state:codeVerifier:referralCode) - we'll decode it in callback if needed
  const statePayload = referralCode
    ? `${state}:${codeVerifier}:${referralCode.trim().toUpperCase()}`
    : `${state}:${codeVerifier}`;
  const stateWithVerifier = Buffer.from(statePayload).toString('base64url');

  // Validate required environment variables
  if (!process.env.X_CLIENT_ID) {
    throw new Error('X_CLIENT_ID environment variable is not set. Please configure OAuth credentials.');
  }

  // Get the appropriate redirect URI
  const redirectUri = getRedirectUri();

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.X_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: 'tweet.read users.read offline.access',
    state: stateWithVerifier, // Pass encoded state with verifier (and optional referral code)
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  const url = `${X_AUTH_URL}?${params.toString()}`;

  console.log('[OAuth] Generated auth URL with redirect_uri:', redirectUri, referralCode ? `and referral code: ${referralCode}` : '');

  return { url, state, codeVerifier };
}

/**
 * Get stored code verifier for a state
 */
export async function getCodeVerifier(state: string): Promise<string | null> {
  const stored = await retrieveOAuthState(state);
  if (!stored) {
    return null;
  }

  return stored.codeVerifier;
}

/**
 * Exchange authorization code for access token
 * Uses retry logic to handle rate limits and temporary errors
 */
async function exchangeCodeForToken(
  code: string,
  codeVerifier: string
): Promise<{ accessToken: string; refreshToken?: string }> {
  // Must use the SAME redirect_uri that was used in the authorization request
  const redirectUri = getRedirectUri();

  return await retryTwitterApiCall(async () => {
    const response = await fetch(X_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(
          `${process.env.X_CLIENT_ID}:${process.env.X_CLIENT_SECRET}`
        ).toString('base64')}`,
      },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      const err: any = new Error(`Token exchange failed: HTTP ${response.status} - ${error}`);
      err.status = response.status;
      throw err;
    }

    const data = await response.json() as XTokenResponse;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
    };
  }, 3, 1000); // 3 retries with 1s initial delay (exponential backoff: 1s, 2s, 4s)
}

/**
 * Get user info from X API
 * Uses retry logic to handle rate limits and upgrades profile image to high-res
 * Also fetches public_metrics for analytics (followers/following count)
 */
async function getXUserInfo(accessToken: string): Promise<XUserInfo> {
  return await retryTwitterApiCall(async () => {
    const response = await fetch(
      `${X_USER_INFO_URL}?user.fields=id,username,name,profile_image_url,public_metrics`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      const err: any = new Error(`Failed to get user info: HTTP ${response.status} - ${error}`);
      err.status = response.status;
      throw err;
    }

    const data = await response.json() as XUserResponse;

    // Upgrade profile image to high-res (removes _normal suffix)
    const highResImageUrl = upgradeTwitterImageUrl(data.data.profile_image_url);

    return {
      id: data.data.id,
      username: data.data.username,
      name: data.data.name,
      profile_image_url: highResImageUrl,
      followers_count: data.data.public_metrics?.followers_count,
      following_count: data.data.public_metrics?.following_count,
    };
  }, 3, 1000); // 3 retries with 1s initial delay
}

/**
 * Generate unique username from X username
 */
async function generateUniqueUsername(baseUsername: string): Promise<string> {
  // Clean username: lowercase, alphanumeric + underscore only
  let username = baseUsername.toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (username.length === 0) {
    username = 'user';
  }
  if (username.length > 45) {
    username = username.slice(0, 45);
  }

  let counter = 0;
  while (true) {
    const candidate = counter === 0 ? username : `${username}${counter}`;
    const exists = await prisma.user.findUnique({
      where: { username: candidate },
    });

    if (!exists) {
      return candidate;
    }

    counter++;
    if (counter > 1000) {
      // Fallback to UUID-based username
      return `x_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;
    }
  }
}

/**
 * Handle X OAuth callback - create or update user and generate JWT
 */
export async function handleXCallback(
  code: string,
  state: string,
  codeVerifierParam: string,
  jwt: JwtInstance
): Promise<{ user: any; tokens: { accessToken: string; refreshToken: string } }> {
  // Decode state (it contains state:codeVerifier:referralCode encoded)
  let actualState = state;
  let codeVerifier: string | null = null;
  let referralCode: string | null = null;

  try {
    // Try to decode the state (it might be encoded with codeVerifier and optional referralCode)
    const decoded = Buffer.from(state, 'base64url').toString('utf-8');
    if (decoded.includes(':')) {
      const parts = decoded.split(':');
      actualState = parts[0];
      codeVerifier = parts[1] || null;
      referralCode = parts[2] || null; // Optional referral code
      console.log('[OAuth] Decoded state, codeVerifier, and referralCode from state parameter', { referralCode });
    }
  } catch (err) {
    // If decoding fails, use state as-is
    console.log('[OAuth] Could not decode state, using as-is');
    actualState = state;
  }
  
  // Try to get code verifier from Redis-backed state store
  if (!codeVerifier) {
    codeVerifier = await getCodeVerifier(actualState);
    if (codeVerifier) {
      console.log('[OAuth] Retrieved codeVerifier from state store (Redis/in-memory)');
    }
  }
  
  // Fallback to query param if provided
  if (!codeVerifier && codeVerifierParam) {
    codeVerifier = codeVerifierParam;
    console.log('[OAuth] Using codeVerifier from query parameter');
  }
  
  if (!codeVerifier) {
    console.error('[OAuth] Code verifier not found. State:', state.substring(0, 20) + '...');
    throw new Error('Invalid or expired OAuth state - code verifier not found. State may have expired or server restarted.');
  }

  // Exchange code for token (with timeout protection)
  console.log('[OAuth] Exchanging code for token...');
  let accessToken: string;
  let xRefreshToken: string | null;
  try {
    const tokenResult = await Promise.race([
      exchangeCodeForToken(code, codeVerifier),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Token exchange timeout')), TIMEOUT_TOKEN_EXCHANGE)
      ),
    ]);
    accessToken = tokenResult.accessToken;
    xRefreshToken = tokenResult.refreshToken ?? null;
    console.log('[OAuth] Token exchange successful');
  } catch (error: any) {
    console.error('[OAuth] Token exchange failed:', error.message, error.stack);
    throw new Error(`Token exchange failed: ${error.message}`);
  }

  // Get user info from X (with timeout protection)
  console.log('[OAuth] Fetching user info from X API...');
  let xUserInfo: any;
  try {
    xUserInfo = await Promise.race([
      getXUserInfo(accessToken),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('User info fetch timeout')), TIMEOUT_USER_INFO)
      ),
    ]);
    console.log('[OAuth] User info received:', { id: xUserInfo.id, username: xUserInfo.username });
  } catch (error: any) {
    console.error('[OAuth] Failed to get user info:', error.message, error.stack);
    throw new Error(`Failed to get user info: ${error.message}`);
  }

  // Find or create user (with timeout protection)
  console.log('[OAuth] Looking up OAuth account in database...');
  let existingAccount;
  let user;

  try {
    // Wrap all database operations in timeout protection
    const dbResult = await Promise.race([
      (async () => {
        // Find existing account
        const account = await prisma.oAuthAccount.findUnique({
          where: {
            provider_providerAccountId: {
              provider: 'x',
              providerAccountId: xUserInfo.id,
            },
          },
          include: { user: true },
        });

        if (account) {
          console.log('[OAuth] Existing account found, updating...');
        } else {
          console.log('[OAuth] New user, creating account...');
        }

        return account;
      })(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Database operation timeout')), TIMEOUT_DB_OPERATIONS)
      ),
    ]);

    existingAccount = dbResult;

    // Update or create user with timeout protection
    user = await Promise.race([
      (async () => {
        if (existingAccount) {
          // Update existing OAuth account (including social metrics)
          await prisma.oAuthAccount.update({
            where: { id: existingAccount.id },
            data: {
              username: xUserInfo.username,
              accessToken,
              refreshToken: xRefreshToken || undefined,
              followersCount: xUserInfo.followers_count,
              followingCount: xUserInfo.following_count,
              updatedAt: new Date(),
            },
          });

          // Update user last login and check consecutive days
          const now = new Date();
          const lastLoginAt = existingAccount.user.lastLoginAt;

          let consecutiveDays = existingAccount.user.consecutiveDaysOnline;
          if (lastLoginAt) {
            const daysSinceLastLogin = Math.floor(
              (now.getTime() - lastLoginAt.getTime()) / (1000 * 60 * 60 * 24)
            );

            if (daysSinceLastLogin === 0) {
              consecutiveDays = existingAccount.user.consecutiveDaysOnline;
            } else if (daysSinceLastLogin === 1) {
              consecutiveDays = existingAccount.user.consecutiveDaysOnline + 1;
            } else {
              consecutiveDays = 1;
            }
          } else {
            consecutiveDays = 1;
          }

          const updatedUser = await prisma.user.update({
            where: { id: existingAccount.userId },
            data: {
              name: xUserInfo.name,
              profileImageUrl: xUserInfo.profile_image_url || null,
              lastLoginAt: now,
              consecutiveDaysOnline: consecutiveDays,
              updatedAt: now,
            },
          });

          return updatedUser;
        } else {
          // Create new user and OAuth account
          const username = await generateUniqueUsername(xUserInfo.username);
          const email = `${xUserInfo.id}@x.oauth`; // Placeholder email for OAuth users
          const newUserReferralCode = crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();

          // Check if referral code was provided and find the referring user
          let referringUserId: string | null = null;
          if (referralCode) {
            const referringUser = await prisma.user.findFirst({
              where: { referralCode: referralCode.trim().toUpperCase() },
              select: { id: true },
            });
            if (referringUser) {
              referringUserId = referringUser.id;
              console.log('[OAuth] Found referring user:', referringUserId);
            } else {
              console.log('[OAuth] Referral code not found:', referralCode);
            }
          }

          const REFERRAL_BONUS_CREDITS = 200;

          const newUser = await prisma.user.create({
            data: {
              username,
              email,
              name: xUserInfo.name,
              profileImageUrl: xUserInfo.profile_image_url || null,
              passwordHash: null, // OAuth users don't have passwords
              creditBalance: 1000,
              availableCredits: 1000,
              // Signup bonus goes to free credits
              freeCreditsBalance: 1000,
              purchasedCreditsBalance: 0,
              consecutiveDaysOnline: 1,
              lastLoginAt: new Date(),
              referralCode: newUserReferralCode,
              // Link to referring user if referral code was valid
              referredById: referringUserId,
              oauthAccounts: {
                create: {
                  provider: 'x',
                  providerAccountId: xUserInfo.id,
                  username: xUserInfo.username,
                  accessToken,
                  refreshToken: xRefreshToken || undefined,
                  followersCount: xUserInfo.followers_count,
                  followingCount: xUserInfo.following_count,
                },
              },
              creditTransactions: {
                create: {
                  amount: 1000,
                  transactionType: 'signup_bonus',
                  balanceAfter: 1000,
                },
              },
            },
          });

          // If user was referred, award bonus to the referrer
          if (referringUserId) {
            const updatedReferrer = await prisma.user.update({
              where: { id: referringUserId },
              data: {
                creditBalance: { increment: REFERRAL_BONUS_CREDITS },
                availableCredits: { increment: REFERRAL_BONUS_CREDITS },
                freeCreditsBalance: { increment: REFERRAL_BONUS_CREDITS },
                referralCount: { increment: 1 },
                referralCreditsEarned: { increment: REFERRAL_BONUS_CREDITS },
              },
            });

            // Create transaction record for referrer
            await prisma.creditTransaction.create({
              data: {
                userId: referringUserId,
                amount: REFERRAL_BONUS_CREDITS,
                transactionType: 'referral_bonus',
                balanceAfter: Number(updatedReferrer.availableCredits),
              },
            });

            console.log(`[OAuth] Awarded ${REFERRAL_BONUS_CREDITS} credits to referrer ${referringUserId}`);
          }

          return newUser;
        }
      })(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Database operation timeout')), TIMEOUT_DB_OPERATIONS)
      ),
    ]);

    // Clean up OAuth state from Redis and in-memory storage
    await deleteOAuthState(actualState);
    console.log('[OAuth] OAuth state cleaned up successfully');
  } catch (error: any) {
    console.error('[OAuth] Database operation failed:', error.message, error.code);
    if (error.code === 'P2002') {
      throw new Error('Database constraint violation. User might already exist.');
    } else if (error.message?.includes('does not exist') || error.message?.includes('relation') || error.message?.includes('table')) {
      throw new Error('Database migration not run. Please run: npx prisma migrate dev');
    }
    throw new Error(`Database error: ${error.message}`);
  }

  // Generate JWT tokens
  console.log('[OAuth] Generating JWT tokens...');
  const jwtAccessToken = jwt.sign(
    { userId: user.id, email: user.email },
    { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m' }
  );

  const jwtRefreshToken = jwt.sign(
    { userId: user.id, type: 'refresh' },
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );

  // Store refresh token
  console.log('[OAuth] Storing refresh token...');
  const refreshTokenHash = await hashPassword(jwtRefreshToken);
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: refreshTokenHash,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });
  
  console.log('[OAuth] OAuth callback completed successfully for user:', user.id);

  return {
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
      profileImageUrl: user.profileImageUrl,
      creditBalance: Number(user.creditBalance),
      availableCredits: Number(user.availableCredits),
      expendedCredits: Number(user.expendedCredits),
      // Separated credit balances
      freeCreditsBalance: Number(user.freeCreditsBalance ?? 0),
      purchasedCreditsBalance: Number(user.purchasedCreditsBalance ?? 0),
      consecutiveDaysOnline: user.consecutiveDaysOnline,
      referralCode: user.referralCode,
      referralCount: user.referralCount,
      referralCreditsEarned: Number(user.referralCreditsEarned),
      totalVolume: Number(user.totalVolume),
      overallPnL: Number(user.overallPnL),
      lastDailyRewardAt: user.lastDailyRewardAt,
      rankByPnL: user.rankByPnL,
      rankByVolume: user.rankByVolume,
    },
    tokens: {
      accessToken: jwtAccessToken,
      refreshToken: jwtRefreshToken,
    },
  };
}

