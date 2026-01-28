import type { FastifyRequest, FastifyReply } from 'fastify';

/**
 * Admin User IDs
 * Add your user ID here to grant admin access
 *
 * To find your userId:
 * 1. Login to your app
 * 2. Check browser DevTools > Application > Local Storage > userId
 * 3. Or query: SELECT id FROM users WHERE email = 'your@email.com';
 */
const ADMIN_USER_IDS = new Set<string>([
  'wqsewRyzby0LpxcaiVgHC92OGog0OwlgjIAwPuh3P1LHJzpd5a2GgRmkoG4GWt1m',
]);

/**
 * JWT authentication middleware
 * Verifies the access token and attaches user info to request
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    // Get token from Authorization header
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      reply.status(401).send({
        success: false,
        error: 'Missing or invalid authorization header',
      });
      return;
    }

    const token = authHeader.substring(7);

    // Verify token
    const decoded = request.server.jwt.verify(token) as { userId: string; email: string };

    // Attach user info to request
    (request as any).user = decoded;

    // Continue to next handler
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      reply.status(401).send({
        success: false,
        error: 'Token expired',
      });
      return;
    }

    if (error.name === 'JsonWebTokenError') {
      reply.status(401).send({
        success: false,
        error: 'Invalid token',
      });
      return;
    }

    request.log.error(error);
    reply.status(500).send({
      success: false,
      error: 'Authentication error',
    });
    return;
  }
}

/**
 * Admin authorization middleware
 * Must be used AFTER authenticate middleware
 *
 * Usage: { preHandler: [authenticate, requireAdmin] }
 */
export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const user = (request as any).user as { userId: string; email: string } | undefined;

  if (!user) {
    reply.status(401).send({
      success: false,
      error: 'Authentication required',
    });
    return;
  }

  if (!ADMIN_USER_IDS.has(user.userId)) {
    request.log.warn(
      { userId: user.userId, email: user.email },
      'Unauthorized admin access attempt'
    );
    reply.status(403).send({
      success: false,
      error: 'Admin access required',
    });
    return;
  }

  // User is admin - continue to handler
}
