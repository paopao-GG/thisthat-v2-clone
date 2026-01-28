import type { FastifyRequest, FastifyReply } from 'fastify';
import { signupSchema, loginSchema } from './auth.models.js';
import * as authService from './auth.services.js';
import { getXAuthUrl, handleXCallback } from './oauth.services.js';

/**
 * Handle user signup
 */
export async function signupHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    // Validate input
    const input = signupSchema.parse(request.body);

    // Register user
    const result = await authService.registerUser(input, request.server.jwt);

    return reply.status(201).send({
      success: true,
      user: result.user,
      accessToken: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken, // Include refresh token in response
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return reply.status(400).send({
        success: false,
        error: 'Validation error',
        details: error.errors,
      });
    }

    if (error.message === 'Email already registered' || error.message === 'Username already taken') {
      return reply.status(409).send({
        success: false,
        error: error.message,
      });
    }

    if (error.message === 'Invalid referral code') {
      return reply.status(400).send({
        success: false,
        error: error.message,
      });
    }

    request.log.error({ error, stack: error.stack }, 'Signup error');
    return reply.status(500).send({
      success: false,
      error: error.message || 'Failed to create account',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}

/**
 * Handle user login
 */
export async function loginHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    // Validate input
    const input = loginSchema.parse(request.body);

    // Authenticate user
    const result = await authService.authenticateUser(input, request.server.jwt);

    return reply.send({
      success: true,
      user: result.user,
      accessToken: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken, // Include refresh token in response
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return reply.status(400).send({
        success: false,
        error: 'Validation error',
        details: error.errors,
      });
    }

    if (error.message === 'Invalid email or password') {
      return reply.status(401).send({
        success: false,
        error: error.message,
      });
    }

    request.log.error(error);
    return reply.status(500).send({
      success: false,
      error: 'Failed to login',
    });
  }
}

/**
 * Get current user profile
 */
export async function getMeHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (request.user as any)?.userId;
    if (!userId) {
      return reply.status(401).send({
        success: false,
        error: 'Unauthorized',
      });
    }

    const user = await authService.getUserProfile(userId);
    if (!user) {
      return reply.status(404).send({
        success: false,
        error: 'User not found',
      });
    }

    return reply.send({
      success: true,
      user,
    });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      error: 'Failed to get user profile',
    });
  }
}

/**
 * Refresh access token
 */
export async function refreshHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { refreshToken } = request.body as { refreshToken?: string };
    
    if (!refreshToken) {
      return reply.status(400).send({
        success: false,
        error: 'Refresh token is required',
      });
    }

    const result = await authService.refreshAccessToken(refreshToken, request.server.jwt);

    return reply.send({
      success: true,
      accessToken: result.accessToken,
    });
  } catch (error: any) {
    if (error.message === 'Invalid or expired refresh token') {
      return reply.status(401).send({
        success: false,
        error: error.message,
      });
    }

    request.log.error({ error, stack: error.stack }, 'Refresh token error');
    return reply.status(500).send({
      success: false,
      error: 'Failed to refresh token',
    });
  }
}

/**
 * Logout user
 */
export async function logoutHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { refreshToken } = request.body as { refreshToken?: string };
    
    if (!refreshToken) {
      return reply.status(400).send({
        success: false,
        error: 'Refresh token is required',
      });
    }

    await authService.logoutUser(refreshToken);

    return reply.send({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error: any) {
    request.log.error({ error, stack: error.stack }, 'Logout error');
    return reply.status(500).send({
      success: false,
      error: 'Failed to logout',
    });
  }
}

/**
 * Initiate X OAuth flow
 */
export async function xAuthHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    // Extract referral code from query params if present
    const { ref } = request.query as { ref?: string };

    const { url } = await getXAuthUrl(ref);
    // State and codeVerifier are now encoded in the state parameter itself
    request.log.info({ referralCode: ref || 'none' }, 'Initiating X OAuth flow');
    reply.redirect(url);
  } catch (error: any) {
    request.log.error({ error: error.message, stack: error.stack }, 'Failed to initiate OAuth');

    // Use explicit FRONTEND_URL (iOS Safari strips referer headers)
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    // Redirect to frontend callback with error instead of showing backend error page
    const errorMessage = error.message || 'Failed to initiate OAuth';
    reply.redirect(`${frontendUrl}/auth/callback?error=oauth_failed&details=${encodeURIComponent(errorMessage)}`);
  }
}

/**
 * Handle X OAuth callback
 */
export async function xCallbackHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { code, state, code_verifier, error, error_description } = request.query as {
      code?: string;
      state?: string;
      code_verifier?: string;
      error?: string;
      error_description?: string;
    };

    request.log.info({
      code: !!code,
      state: !!state,
      code_verifier: !!code_verifier,
      error,
      error_description
    }, 'OAuth callback received');

    // Use explicit FRONTEND_URL (iOS Safari strips referer headers)
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    // Check for OAuth errors from X (user denied access, etc.)
    if (error) {
      request.log.error({ error, error_description }, 'OAuth error from provider');
      return reply.redirect(`${frontendUrl}/auth/callback?error=oauth_denied&details=${encodeURIComponent(error_description || error)}`);
    }

    if (!code) {
      request.log.error('Missing code parameter');
      return reply.redirect(
        `${frontendUrl}/auth/callback?error=missing_code&details=${encodeURIComponent(
          'Authorization code missing. Please try again.'
        )}`
      );
    }

    if (!state) {
      request.log.error('Missing state parameter');
      return reply.redirect(
        `${frontendUrl}/auth/callback?error=missing_state&details=${encodeURIComponent(
          'Invalid login request. Please try again.'
        )}`
      );
    }

    // Handle OAuth callback (code_verifier is encoded in state or retrieved from Redis)
    const result = await handleXCallback(code, state, code_verifier || '', request.server.jwt);

    // Set cookies for iOS Safari (immune to Intelligent Tracking Prevention)
    // Note: NOT HttpOnly so frontend JavaScript can read them for localStorage fallback
    const cookieOptions = {
      httpOnly: false, // Allow JavaScript access for iOS Safari compatibility
      secure: process.env.NODE_ENV === 'production', // HTTPS only in production
      sameSite: (process.env.NODE_ENV === 'production' ? 'none' : 'lax') as 'none' | 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
      domain: process.env.COOKIE_DOMAIN || undefined, // Use specific domain in production
    };

    reply.setCookie('accessToken', result.tokens.accessToken, cookieOptions);
    reply.setCookie('refreshToken', result.tokens.refreshToken, cookieOptions);
    reply.setCookie('userId', result.user.id, cookieOptions);

    // Also send tokens in URL as fallback for browsers that support localStorage
    const params = new URLSearchParams({
      accessToken: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken,
      userId: result.user.id,
    });

    request.log.info({ userId: result.user.id, frontendUrl }, 'OAuth callback successful, redirecting to frontend with cookies');
    reply.redirect(`${frontendUrl}/auth/callback?${params.toString()}`);
  } catch (error: any) {
    request.log.error({
      error: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code,
    }, 'OAuth callback error');

    // Use explicit FRONTEND_URL (iOS Safari strips referer headers)
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    let errorMessage = 'oauth_failed';
    let errorDetails = error.message || 'Unknown error';

    if (error.message?.includes('Invalid or expired')) {
      errorMessage = 'oauth_expired';
    } else if (error.message?.includes('Token exchange')) {
      errorMessage = 'token_exchange_failed';
    } else if (error.message?.includes('Failed to get user info')) {
      errorMessage = 'user_info_failed';
    } else if (error.message?.includes('code verifier not found')) {
      errorMessage = 'state_expired';
      errorDetails = 'OAuth state expired. Please try again.';
    } else if (error.code === 'P2002') {
      errorMessage = 'database_error';
      errorDetails = 'Database constraint violation. User might already exist.';
    } else if (error.message?.includes('Prisma')) {
      errorMessage = 'database_error';
      errorDetails = 'Database error. Make sure migrations are run.';
    }

    // Log full error for debugging
    console.error('Full OAuth error:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code,
    });

    reply.redirect(`${frontendUrl}/auth/callback?error=${errorMessage}&details=${encodeURIComponent(errorDetails)}`);
  }
}

/**
 * Get user's PnL history
 */
export async function getPnLHistoryHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (request.user as any)?.userId;
    if (!userId) {
      return reply.status(401).send({
        success: false,
        error: 'Unauthorized',
      });
    }

    const { timeFilter = 'ALL' } = request.query as { timeFilter?: '1D' | '1W' | '1M' | 'ALL' };

    // Validate timeFilter
    const validFilters = ['1D', '1W', '1M', 'ALL'];
    if (!validFilters.includes(timeFilter)) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid time filter. Valid values: 1D, 1W, 1M, ALL',
      });
    }

    const pnlHistory = await authService.getUserPnLHistory(userId, timeFilter);

    return reply.send({
      success: true,
      data: pnlHistory,
      timeFilter,
    });
  } catch (error: any) {
    request.log.error({ error, stack: error.stack }, 'Get PnL history error');
    return reply.status(500).send({
      success: false,
      error: 'Failed to get PnL history',
    });
  }
}