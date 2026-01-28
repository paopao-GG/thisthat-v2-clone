import type { FastifyRequest, FastifyReply } from 'fastify';
import { updateUserSchema, userIdParamSchema } from './user.models.js';
import * as userService from './user.services.js';

/**
 * Update current user's profile
 */
export async function updateMeHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (request.user as any)?.userId;
    if (!userId) {
      return reply.status(401).send({
        success: false,
        error: 'Unauthorized',
      });
    }

    // Validate input
    const input = updateUserSchema.parse(request.body);

    // Update user profile
    const updatedUser = await userService.updateUserProfile(userId, input);

    return reply.send({
      success: true,
      user: updatedUser,
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return reply.status(400).send({
        success: false,
        error: 'Validation error',
        details: error.errors,
      });
    }

    if (error.message === 'Username already taken') {
      return reply.status(409).send({
        success: false,
        error: error.message,
      });
    }

    request.log.error({ error, stack: error.stack }, 'Update user error');
    return reply.status(500).send({
      success: false,
      error: 'Failed to update profile',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}

/**
 * Get user profile by ID
 */
export async function getUserByIdHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    // Validate params
    const params = userIdParamSchema.parse(request.params);
    const userId = params.userId;

    // Get user profile
    const user = await userService.getUserById(userId);

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
    if (error.name === 'ZodError') {
      return reply.status(400).send({
        success: false,
        error: 'Invalid user ID',
        details: error.errors,
      });
    }

    request.log.error({ error, stack: error.stack }, 'Get user error');
    return reply.status(500).send({
      success: false,
      error: 'Failed to get user profile',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}

