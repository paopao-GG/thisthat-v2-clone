import { safeRedisGet, safeRedisSetEx, safeRedisDel } from './redis.js';

/**
 * OAuth State structure
 */
export interface OAuthState {
  state: string;
  codeVerifier: string;
  expiresAt: Date;
}

/**
 * In-memory fallback storage for OAuth state (used when Redis is unavailable)
 */
const inMemoryStore = new Map<string, OAuthState>();

/**
 * Redis key prefix for OAuth state
 */
const OAUTH_STATE_PREFIX = 'oauth:state:';

/**
 * Default TTL for OAuth state (30 minutes)
 * Extended for iOS Safari which has slower OAuth redirects
 */
const OAUTH_STATE_TTL_SECONDS = 30 * 60;

/**
 * Store OAuth state with automatic expiration
 * Uses Redis if available, falls back to in-memory Map
 *
 * @param state - OAuth state identifier
 * @param codeVerifier - PKCE code verifier
 * @param ttlSeconds - Time to live in seconds (default: 600)
 */
export async function storeOAuthState(
  state: string,
  codeVerifier: string,
  ttlSeconds: number = OAUTH_STATE_TTL_SECONDS
): Promise<void> {
  const oauthState: OAuthState = {
    state,
    codeVerifier,
    expiresAt: new Date(Date.now() + ttlSeconds * 1000),
  };

  const key = `${OAUTH_STATE_PREFIX}${state}`;
  const value = JSON.stringify(oauthState);

  console.log(`[OAuth-State] Storing state: ${state.substring(0, 8)}... (TTL: ${ttlSeconds}s)`);

  try {
    // Try to store in Redis
    await safeRedisSetEx(key, ttlSeconds, value);
    console.log(`[OAuth-State] ✅ Stored in Redis: ${key}`);
  } catch (error) {
    console.warn(`[OAuth-State] ⚠️  Redis unavailable, using in-memory fallback`);
  }

  // Always store in memory as fallback
  inMemoryStore.set(state, oauthState);
}

/**
 * Retrieve OAuth state by state identifier
 * Tries Redis first, falls back to in-memory Map
 *
 * @param state - OAuth state identifier
 * @returns OAuthState or null if not found/expired
 */
export async function retrieveOAuthState(state: string): Promise<OAuthState | null> {
  const key = `${OAUTH_STATE_PREFIX}${state}`;

  console.log(`[OAuth-State] Retrieving state: ${state.substring(0, 8)}...`);

  try {
    // Try Redis first
    const redisValue = await safeRedisGet(key);
    if (redisValue) {
      const oauthState: OAuthState = JSON.parse(redisValue);

      // Check expiration (Redis TTL should handle this, but double-check)
      if (new Date(oauthState.expiresAt) < new Date()) {
        console.warn(`[OAuth-State] ⚠️  State expired in Redis: ${state.substring(0, 8)}...`);
        await deleteOAuthState(state); // Clean up
        return null;
      }

      console.log(`[OAuth-State] ✅ Retrieved from Redis: ${key}`);
      return oauthState;
    }
  } catch (error) {
    console.warn(`[OAuth-State] ⚠️  Redis error, trying in-memory fallback`);
  }

  // Fallback to in-memory storage
  const memoryValue = inMemoryStore.get(state);
  if (memoryValue) {
    // Check expiration
    if (memoryValue.expiresAt < new Date()) {
      console.warn(`[OAuth-State] ⚠️  State expired in memory: ${state.substring(0, 8)}...`);
      inMemoryStore.delete(state);
      return null;
    }

    console.log(`[OAuth-State] ✅ Retrieved from memory: ${state.substring(0, 8)}...`);
    return memoryValue;
  }

  console.warn(`[OAuth-State] ❌ State not found: ${state.substring(0, 8)}...`);
  return null;
}

/**
 * Delete OAuth state after successful use
 * Removes from both Redis and in-memory storage
 *
 * @param state - OAuth state identifier
 */
export async function deleteOAuthState(state: string): Promise<void> {
  const key = `${OAUTH_STATE_PREFIX}${state}`;

  console.log(`[OAuth-State] Deleting state: ${state.substring(0, 8)}...`);

  try {
    // Delete from Redis
    await safeRedisDel([key]);
    console.log(`[OAuth-State] ✅ Deleted from Redis: ${key}`);
  } catch (error) {
    console.warn(`[OAuth-State] ⚠️  Redis delete error (continuing)`);
  }

  // Delete from memory
  inMemoryStore.delete(state);
  console.log(`[OAuth-State] ✅ Deleted from memory: ${state.substring(0, 8)}...`);
}

/**
 * Clean up expired states from in-memory storage
 * (Redis handles its own expiration via TTL)
 */
export function cleanupExpiredStates(): void {
  const now = new Date();
  let cleanedCount = 0;

  for (const [state, oauthState] of inMemoryStore.entries()) {
    if (oauthState.expiresAt < now) {
      inMemoryStore.delete(state);
      cleanedCount++;
    }
  }

  if (cleanedCount > 0) {
    console.log(`[OAuth-State] 🧹 Cleaned up ${cleanedCount} expired states from memory`);
  }
}

/**
 * Get statistics about stored states (for debugging)
 */
export function getOAuthStateStats(): {
  inMemoryCount: number;
  oldestExpiration: Date | null;
} {
  const states = Array.from(inMemoryStore.values());
  const oldestExpiration = states.length > 0
    ? new Date(Math.min(...states.map(s => s.expiresAt.getTime())))
    : null;

  return {
    inMemoryCount: inMemoryStore.size,
    oldestExpiration,
  };
}
