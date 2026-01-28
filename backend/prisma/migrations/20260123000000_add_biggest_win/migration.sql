-- Add biggest_win column to users table
-- Tracks the largest single profit from a resolved or sold bet

ALTER TABLE "users" ADD COLUMN "biggest_win" DECIMAL(18,2) NOT NULL DEFAULT 0.00;

-- Create index for leaderboard queries
CREATE INDEX "users_biggest_win_idx" ON "users"("biggest_win" DESC);

-- Backfill existing users with their biggest win from bets history
-- This calculates: MAX(actual_payout - amount) for all closed bets with profit > 0
UPDATE "users" u
SET "biggest_win" = COALESCE(
  (
    SELECT MAX(b."actual_payout" - b."amount")
    FROM "bets" b
    WHERE b."user_id" = u."id"
      AND b."status" IN ('won', 'cancelled')
      AND b."actual_payout" IS NOT NULL
      AND b."actual_payout" > b."amount"
  ),
  0
);
