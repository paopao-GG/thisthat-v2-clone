import type { FastifyInstance } from 'fastify';
import { updateMeHandler, getUserByIdHandler } from './user.controllers.js';
import { authenticate } from '../auth/auth.middleware.js';

export default async function userRoutes(fastify: FastifyInstance) {
  // Protected routes (require authentication)
  fastify.patch('/me', { preHandler: authenticate }, updateMeHandler);
  fastify.get('/:userId', getUserByIdHandler); // Public route - anyone can view user profiles
}

