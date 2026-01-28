import { z } from 'zod';

/**
 * Schema for buying stocks
 */
export const buyStockSchema = z.object({
  stockId: z.string().uuid(),
  shares: z.number().positive().min(0.00000001), // Minimum 0.00000001 shares
  leverage: z.number().min(1).max(10).default(1), // 1x to 10x leverage
});

export type BuyStockInput = z.infer<typeof buyStockSchema>;

/**
 * Schema for selling stocks
 */
export const sellStockSchema = z.object({
  stockId: z.string().uuid(),
  shares: z.number().positive().min(0.00000001), // Minimum 0.00000001 shares
});

export type SellStockInput = z.infer<typeof sellStockSchema>;

/**
 * Schema for creating a new stock (admin)
 */
export const createStockSchema = z.object({
  symbol: z.string().min(1).max(20).regex(/^[A-Z0-9_]+$/),
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  initialPrice: z.number().positive().default(1.00),
  totalSupply: z.number().positive().default(1000000),
  baseMultiplier: z.number().positive().default(1.00),
  maxLeverage: z.number().min(1).max(100).default(10),
});

export type CreateStockInput = z.infer<typeof createStockSchema>;

/**
 * Schema for updating stock price
 */
export const updateStockPriceSchema = z.object({
  stockId: z.string().uuid(),
  newPrice: z.number().positive(),
});

export type UpdateStockPriceInput = z.infer<typeof updateStockPriceSchema>;

