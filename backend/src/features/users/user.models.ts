import { z } from 'zod';

/**
 * Schema for updating user profile
 */
export const updateUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_]+$/).optional(),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

/**
 * Schema for user ID parameter
 */
export const userIdParamSchema = z.object({
  userId: z.string().uuid(),
});

export type UserIdParam = z.infer<typeof userIdParamSchema>;

