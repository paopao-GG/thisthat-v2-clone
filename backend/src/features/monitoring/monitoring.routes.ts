// backend/src/features/monitoring/monitoring.routes.ts
import { FastifyPluginAsync } from 'fastify';
import { getPolymarketRateLimitStatus } from '../../lib/polymarket-rate-limiter.js';
import { getCircuitBreakerStatus } from '../../services/polymarket-price.service.js';

const monitoringRoutes: FastifyPluginAsync = async (fastify) => {
  // Rate limit status endpoint (admin only)
  fastify.get('/polymarket-rate-limit', async (request, reply) => {
    try {
      const status = await getPolymarketRateLimitStatus();
      return {
        success: true,
        data: status,
      };
    } catch (error: any) {
      return reply.code(500).send({
        success: false,
        error: error.message,
      });
    }
  });

  // Circuit breaker status endpoint (admin only)
  fastify.get('/polymarket-circuit-breaker', async (request, reply) => {
    try {
      const status = await getCircuitBreakerStatus();
      return {
        success: true,
        data: status,
      };
    } catch (error: any) {
      return reply.code(500).send({
        success: false,
        error: error.message,
      });
    }
  });

  // Combined health check for external APIs
  fastify.get('/external-apis', async (request, reply) => {
    try {
      const [rateLimitStatus, circuitBreakerStatus] = await Promise.all([
        getPolymarketRateLimitStatus(),
        getCircuitBreakerStatus(),
      ]);

      return {
        success: true,
        data: {
          polymarket: {
            rateLimit: rateLimitStatus,
            circuitBreaker: circuitBreakerStatus,
            healthy: !circuitBreakerStatus.isOpen && rateLimitStatus.percentUsed < 80,
          },
        },
      };
    } catch (error: any) {
      return reply.code(500).send({
        success: false,
        error: error.message,
      });
    }
  });
};

export default monitoringRoutes;
