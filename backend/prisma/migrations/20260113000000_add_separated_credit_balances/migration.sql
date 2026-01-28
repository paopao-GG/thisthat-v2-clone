-- Add separated credit balance fields to users table
-- free_credits_balance: Credits from signup bonus, daily rewards, referrals
-- purchased_credits_balance: Credits from payments/purchases

-- Add the new columns with defaults
ALTER TABLE "users" ADD COLUMN "free_credits_balance" DECIMAL(18,2) NOT NULL DEFAULT 0.00;
ALTER TABLE "users" ADD COLUMN "purchased_credits_balance" DECIMAL(18,2) NOT NULL DEFAULT 0.00;

-- Initialize free_credits_balance to current credit_balance for existing users
-- (since all existing credits are effectively "free" credits)
UPDATE "users" SET "free_credits_balance" = "credit_balance";

-- Note: purchased_credits_balance starts at 0 for all existing users
-- New purchases will increment purchased_credits_balance going forward
