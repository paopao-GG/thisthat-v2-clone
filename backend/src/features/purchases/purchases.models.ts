import { z } from 'zod';

export const createPurchaseSchema = z.object({
  packageId: z.enum(['starter', 'boost', 'pro', 'whale']),
});

export type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>;

