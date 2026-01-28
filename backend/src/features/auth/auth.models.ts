import { z } from 'zod';

// Signup request schema
export const signupSchema = z.object({
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_]+$/, 'Username must be alphanumeric with underscores only'),
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1, 'Name is required').max(100, 'Name must be less than 100 characters'),
  referralCode: z
    .string()
    .min(4, 'Referral code must be at least 4 characters')
    .max(16, 'Referral code must be less than 16 characters')
    .regex(/^[a-zA-Z0-9]+$/, 'Referral code must be letters or digits')
    .optional(),
});

// Login request schema
export const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

// Type exports
export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
