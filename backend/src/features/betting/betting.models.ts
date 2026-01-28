import { z } from 'zod';

/**
 * Schema for placing a bet
 */
export const placeBetSchema = z.object({
  marketId: z.string().min(1), // Accept UUID or conditionId (polymarketId)
  side: z.enum(['this', 'that']),
  amount: z.number().positive().min(10).max(10000), // Min 10, max 10,000 credits
  idempotencyKey: z.string().uuid().optional(), // Optional key to prevent duplicate bets from rapid clicking
});

export type PlaceBetInput = z.infer<typeof placeBetSchema>;

/**
 * Schema for bet query parameters
 */
export const betQuerySchema = z.object({
  status: z.enum(['pending', 'won', 'lost', 'cancelled']).optional(),
  marketId: z.string().min(1).optional(), // Accept UUID or conditionId
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type BetQueryInput = z.infer<typeof betQuerySchema>;

/**
 * Schema for selling a position early
 */
export const sellPositionSchema = z.object({
  amount: z.number().positive().optional(), // Optional: sell partial amount, if not provided sells entire position
});

export type SellPositionInput = z.infer<typeof sellPositionSchema>;

