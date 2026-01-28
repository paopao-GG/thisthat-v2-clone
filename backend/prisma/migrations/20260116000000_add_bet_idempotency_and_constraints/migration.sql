-- PRE-MIGRATION FIX: Reset any negative balances to 0
-- Run this BEFORE the main migration if you find negative balances

-- Log users with negative balances (for audit trail)
SELECT
  id,
  email,
  free_credits_balance,
  purchased_credits_balance,
  credit_balance,
  available_credits
FROM users
WHERE free_credits_balance < 0
   OR purchased_credits_balance < 0
   OR credit_balance < 0
   OR available_credits < 0;

-- Fix negative balances (uncomment only if needed after review)
-- UPDATE users SET free_credits_balance = 0 WHERE free_credits_balance < 0;
-- UPDATE users SET purchased_credits_balance = 0 WHERE purchased_credits_balance < 0;
-- UPDATE users SET credit_balance = 0 WHERE credit_balance < 0;
-- UPDATE users SET available_credits = 0 WHERE available_credits < 0;
