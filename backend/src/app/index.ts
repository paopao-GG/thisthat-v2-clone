import dotenv from 'dotenv';
// Load environment variables FIRST before any other imports
dotenv.config();

import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
// import rateLimit from '@fastify/rate-limit';
import authRoutes from '../features/auth/auth.routes.js';
import userRoutes from '../features/users/user.routes.js';
import economyRoutes from '../features/economy/economy.routes.js';
import bettingRoutes from '../features/betting/betting.routes.js';
import { startDailyCreditsJob, stopDailyCreditsJob } from '../jobs/daily-credits.job.js';
import { startMarketResolutionJob, stopMarketResolutionJob } from '../jobs/market-resolution.job.js';
import { startLeaderboardUpdateJob, stopLeaderboardUpdateJob } from '../jobs/leaderboard-update.job.js';
import { startCategoryPrefetchJob, stopCategoryPrefetchJob } from '../jobs/category-prefetch.job.js';
import { initializeLeaderboardCache } from '../jobs/leaderboard-init.job.js';
import { startLeaderboardSyncJob, stopLeaderboardSyncJob } from '../jobs/leaderboard-sync.job.js';
import leaderboardRoutes from '../features/leaderboard/leaderboard.routes.js';
import transactionRoutes from '../features/transactions/transactions.routes.js';
import redis from '../lib/redis.js';
import rateLimitRedis, { isRateLimitRedisAvailable } from '../lib/redis-rate-limit.js';
import referralRoutes from '../features/referrals/referral.routes.js';
import purchaseRoutes from '../features/purchases/purchases.routes.js';
import marketsRoutes from '../features/markets/markets.routes.js';
import monitoringRoutes from '../features/monitoring/monitoring.routes.js';
import { startMarketIngestionJob, stopMarketIngestionJob } from '../jobs/market-ingestion.job.js';
import { startAnalyticsAggregationJob, stopAnalyticsAggregationJob } from '../jobs/analytics-aggregation.job.js';
import {
  criticalProcessRateLimit,
  authRateLimit,
  standardRateLimit,
  externalApiRateLimit,
} from '../lib/rate-limit.config.js';

// Helper function to check if running in worker mode
const isWorkerMode = (): boolean => process.env.WORKER_MODE === 'true';

// Configure logger - use pino-pretty only in development
const isDevelopment = process.env.NODE_ENV !== 'production';

const fastify = Fastify({
  logger: isDevelopment
    ? {
        level: 'info',
        transport: {
          target: 'pino-pretty',
          options: {
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
          },
        },
      }
    : {
        level: 'info',
      },
});

// Extend FastifyRequest type to include rawBody
declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: string;
  }
}

// Custom JSON parser that preserves raw body for webhook signature verification
// This is critical for ICPAY webhooks which verify signatures against the exact raw body
fastify.addContentTypeParser(
  'application/json',
  { parseAs: 'string' },
  (req, body, done) => {
    try {
      // Store the raw body exactly as received (for webhook signature verification)
      req.rawBody = body as string;
      // Parse and return the JSON
      const json = JSON.parse(body as string);
      done(null, json);
    } catch (err) {
      done(err as Error, undefined);
    }
  }
);

// Register CORS plugin
await fastify.register(cors, {
  origin: [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://www.growgami.com',
    'https://thisthat.xyz',
    'https://www.thisthat.xyz',
    process.env.FRONTEND_URL || 'http://localhost:5173',
  ].filter(Boolean),
  credentials: true, // Required for cookies to work
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
});

// Register JWT plugin
await fastify.register(jwt, {
  secret: process.env.JWT_ACCESS_SECRET || 'your-secret-key-change-in-production',
});

// Register Cookie plugin for iOS Safari authentication
await fastify.register(cookie, {
  secret: process.env.COOKIE_SECRET || 'your-cookie-secret-change-in-production',
  parseOptions: {},
});

// Connect to Redis for rate limiting early (before registering rate limit plugins)
// This ensures distributed rate limiting works if Redis is available
let rateLimitRedisConnected = false;
try {
  if (rateLimitRedis.status !== 'ready' && rateLimitRedis.status !== 'connecting') {
    await rateLimitRedis.connect();
    rateLimitRedisConnected = true;
  } else if (rateLimitRedis.status === 'ready') {
    rateLimitRedisConnected = true;
  }
} catch (err) {
  // Silently fail - rate limiting will use in-memory storage
  // This is expected if Redis is not available
  rateLimitRedisConnected = false;
}

// await fastify.register(rateLimit, {
//   ...standardRateLimit,
//   redis: rateLimitRedisConnected && rateLimitRedis.status === 'ready' ? rateLimitRedis : undefined,
// });

// Basic health check route
fastify.get('/health', async (request, reply) => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// API routes
fastify.get('/api/hello', async (request, reply) => {
  return { message: 'Hello from TypeScript Fastify!' };
});

// Register Markets routes (PostgreSQL-based with live prices)
// Standard rate limit applies
await fastify.register(marketsRoutes, { prefix: '/api/v1/markets' });

// Register Auth routes
// Rate limiting is handled within auth.routes.ts (different limits for different endpoints)
await fastify.register(authRoutes, { prefix: '/api/v1/auth' });

// Register User routes
await fastify.register(userRoutes, { prefix: '/api/v1/users' });

// Register Economy routes with critical process rate limiting
await fastify.register(async (fastify) => {
  await fastify.register(economyRoutes);
}, { prefix: '/api/v1/economy' });

// Register Betting routes with critical process rate limiting
await fastify.register(async (fastify) => {
  await fastify.register(bettingRoutes);
}, { prefix: '/api/v1/bets' });

// Register Leaderboard routes
await fastify.register(leaderboardRoutes, { prefix: '/api/v1/leaderboard' });

// Register Transaction routes
await fastify.register(transactionRoutes, { prefix: '/api/v1/transactions' });

// Register Referral routes
await fastify.register(referralRoutes, { prefix: '/api/v1/referrals' });

// Register Purchase routes with critical process rate limiting
await fastify.register(async (fastify) => {
  await fastify.register(purchaseRoutes);
}, { prefix: '/api/v1/purchases' });

// Register Monitoring routes (internal/admin use)
await fastify.register(monitoringRoutes, { prefix: '/api/v1/monitoring' });

// Global error handling with structured errors
fastify.setErrorHandler(async (error, request, reply) => {
  const { createStructuredError } = await import('../lib/error-handler.js');
  const { sendErrorResponse } = await import('../lib/error-response.js');

  const structuredError = createStructuredError(error);

  fastify.log.error({
    error: structuredError,
    stack: error instanceof Error ? error.stack : undefined,
    url: request.url,
    method: request.method,
  });

  return sendErrorResponse(reply, error, 'An unexpected error occurred');
});

// Start server
const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3001;
    const host = process.env.HOST || '0.0.0.0';

    await fastify.listen({ port, host });
    console.log(`🚀 Server listening on http://${host}:${port}`);

    // Connect to Redis for caching (optional - system works without it)
    try {
      if (!redis.isOpen) {
        await redis.connect();
        fastify.log.info('✅ Redis (caching) connected successfully');
      }
      // Initialize leaderboard cache from DB after Redis connects
      await initializeLeaderboardCache();
    } catch (err) {
      fastify.log.warn({ err }, '⚠️  Redis (caching) not available (continuing without cache - leaderboards will work but be slower)');
    }

    // Log rate limiting Redis status (connection already attempted above)
    if (rateLimitRedis.status === 'ready') {
      fastify.log.info('✅ Redis (rate limiting) connected - distributed rate limiting enabled');
    } else {
      fastify.log.warn('⚠️  Redis (rate limiting) not available - using in-memory rate limiting (single instance only)');
    }

    // Start background jobs ONLY if this is a worker instance
    const isWorker = isWorkerMode();

    if (isWorker) {
      fastify.log.info('🔧 Running in WORKER mode - starting background jobs');
      startMarketIngestionJob();
      startCategoryPrefetchJob();
      startMarketResolutionJob();
      startLeaderboardUpdateJob();
      startLeaderboardSyncJob();
      startAnalyticsAggregationJob();
    } else {
      fastify.log.info('🌐 Running in API mode - background jobs disabled');
    }
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

// Graceful shutdown
const gracefulShutdown = async () => {
  try {
    fastify.log.info('🛑 Shutting down gracefully...');

    // Stop background jobs (only if running in worker mode)
    const isWorker = isWorkerMode();
    if (isWorker) {
      fastify.log.info('🛑 Stopping background jobs...');
      stopMarketIngestionJob();
      stopCategoryPrefetchJob();
      stopMarketResolutionJob();
      stopLeaderboardUpdateJob();
      stopLeaderboardSyncJob();
      stopAnalyticsAggregationJob();
    }
    
    // Close Redis connections
    try {
      if (redis.isOpen) {
        await redis.quit();
        fastify.log.info('✅ Redis (caching) connection closed');
      }
    } catch (err) {
      fastify.log.warn({ err }, 'Error closing Redis (caching) connection');
    }

    try {
      if (rateLimitRedis.status === 'ready') {
        await rateLimitRedis.quit();
        fastify.log.info('✅ Redis (rate limiting) connection closed');
      }
    } catch (err) {
      fastify.log.warn({ err }, 'Error closing Redis (rate limiting) connection');
    }
    
    await fastify.close();
    fastify.log.info('✅ Server and database connections closed');
    process.exit(0);
  } catch (err) {
    fastify.log.error({ err }, 'Error during shutdown');
    process.exit(1);
  }
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

start();