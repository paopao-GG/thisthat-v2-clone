/**
 * Clear market category cache in Redis
 * This forces fresh data to be fetched from the database
 */

const { createClient } = require('redis');
require('dotenv').config();

async function main() {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  console.log('Connecting to Redis:', redisUrl.replace(/:[^:]*@/, ':***@'));

  // Check if TLS is required (Upstash or rediss:// URLs)
  const isTlsRequired = redisUrl.includes('upstash.io') || redisUrl.includes('rediss://');

  // Convert redis:// to rediss:// for TLS if needed
  const tlsUrl = isTlsRequired && redisUrl.startsWith('redis://') && !redisUrl.startsWith('rediss://')
    ? redisUrl.replace('redis://', 'rediss://')
    : redisUrl;

  const client = createClient({
    url: tlsUrl,
    socket: isTlsRequired ? {
      tls: true,
      rejectUnauthorized: false, // Upstash uses self-signed certificates
    } : undefined,
  });
  client.on('error', (err) => console.log('Redis Client Error', err));

  try {
    await client.connect();
    console.log('Connected to Redis');

    // Find all market-related cache keys
    const patterns = [
      'prefetch:category:*',
      'markets:*',
      'market:*',
      'category:*',
    ];

    let totalDeleted = 0;
    for (const pattern of patterns) {
      const keys = await client.keys(pattern);
      console.log(`Found ${keys.length} keys matching '${pattern}'`);
      if (keys.length > 0) {
        console.log('Keys:', keys.slice(0, 5).join(', '), keys.length > 5 ? `... and ${keys.length - 5} more` : '');
        await client.del(keys);
        totalDeleted += keys.length;
      }
    }

    if (totalDeleted > 0) {
      console.log(`\nCleared ${totalDeleted} cache keys successfully!`);
    } else {
      console.log('\nNo market cache keys found');
    }

    await client.disconnect();
    console.log('Disconnected from Redis');
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
