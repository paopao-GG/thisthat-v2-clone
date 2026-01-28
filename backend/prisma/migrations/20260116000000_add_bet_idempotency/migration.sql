-- Add idempotencyKey column to Bet table (optional, for preventing duplicate bets)
ALTER TABLE "bets" ADD COLUMN "idempotency_key" VARCHAR(36);

-- Add unique constraint on userId + idempotencyKey (only if idempotencyKey is provided)
-- This prevents duplicate bets with the same idempotency key from the same user
CREATE UNIQUE INDEX "bets_user_id_idempotency_key_key" ON "bets"("user_id", "idempotency_key") WHERE "idempotency_key" IS NOT NULL;
