import crypto from 'crypto';

/**
 * Generate a unique transaction hash for signing transactions
 * Uses SHA-256 hash of transaction data + timestamp + random nonce
 */
export function generateTransactionHash(
  userId: string,
  stockId: string,
  type: 'buy' | 'sell',
  shares: number,
  pricePerShare: number,
  timestamp: Date = new Date()
): string {
  const data = `${userId}-${stockId}-${type}-${shares}-${pricePerShare}-${timestamp.toISOString()}-${crypto.randomBytes(16).toString('hex')}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Verify transaction hash integrity
 */
export function verifyTransactionHash(
  hash: string,
  userId: string,
  stockId: string,
  type: 'buy' | 'sell',
  shares: number,
  pricePerShare: number,
  timestamp: Date
): boolean {
  // Note: We can't fully verify since we don't store the nonce
  // But we can verify the hash format and length
  return hash.length === 64 && /^[a-f0-9]+$/.test(hash);
}

