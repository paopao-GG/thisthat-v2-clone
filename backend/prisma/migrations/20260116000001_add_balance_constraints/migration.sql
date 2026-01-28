-- Add CHECK constraints to prevent negative balances (defense-in-depth)
-- Run this AFTER verifying no negative balances exist in production

ALTER TABLE "users" ADD CONSTRAINT "positive_free_credits" CHECK ("free_credits_balance" >= 0);
ALTER TABLE "users" ADD CONSTRAINT "positive_purchased_credits" CHECK ("purchased_credits_balance" >= 0);
ALTER TABLE "users" ADD CONSTRAINT "positive_credit_balance" CHECK ("credit_balance" >= 0);
ALTER TABLE "users" ADD CONSTRAINT "positive_available_credits" CHECK ("available_credits" >= 0);
