-- ==============================================
-- FIX SUPABASE SECURITY ISSUES
-- Run this in Supabase SQL Editor
-- ==============================================

-- ==============================================
-- 1. ENABLE RLS ON ALL TABLES
-- ==============================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_market_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

-- ==============================================
-- 2. RLS POLICIES FOR USERS TABLE
-- ==============================================

-- Users can view their own profile
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
CREATE POLICY "Users can view own profile" ON public.users
  FOR SELECT TO authenticated
  USING (id = auth.uid());

-- Service role full access (for backend sync)
DROP POLICY IF EXISTS "Service role full access users" ON public.users;
CREATE POLICY "Service role full access users" ON public.users
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ==============================================
-- 3. RLS POLICIES FOR BETS TABLE
-- ==============================================

-- Users can view their own bets
DROP POLICY IF EXISTS "Users can view own bets" ON public.bets;
CREATE POLICY "Users can view own bets" ON public.bets
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Service role full access
DROP POLICY IF EXISTS "Service role full access bets" ON public.bets;
CREATE POLICY "Service role full access bets" ON public.bets
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ==============================================
-- 4. RLS POLICIES FOR PAYMENTS TABLE
-- ==============================================

-- Users can view their own payments
DROP POLICY IF EXISTS "Users can view own payments" ON public.payments;
CREATE POLICY "Users can view own payments" ON public.payments
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Service role full access
DROP POLICY IF EXISTS "Service role full access payments" ON public.payments;
CREATE POLICY "Service role full access payments" ON public.payments
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ==============================================
-- 5. RLS POLICIES FOR USER_MARKET_INTERACTIONS
-- ==============================================

-- Users can view their own interactions
DROP POLICY IF EXISTS "Users can view own interactions" ON public.user_market_interactions;
CREATE POLICY "Users can view own interactions" ON public.user_market_interactions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Service role full access
DROP POLICY IF EXISTS "Service role full access interactions" ON public.user_market_interactions;
CREATE POLICY "Service role full access interactions" ON public.user_market_interactions
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ==============================================
-- 6. RLS POLICIES FOR CREDIT_PACKAGES (public read)
-- ==============================================

-- Anyone can view credit packages (public pricing info)
DROP POLICY IF EXISTS "Anyone can view credit packages" ON public.credit_packages;
CREATE POLICY "Anyone can view credit packages" ON public.credit_packages
  FOR SELECT TO authenticated, anon
  USING (true);

-- Only service role can modify
DROP POLICY IF EXISTS "Service role full access credit_packages" ON public.credit_packages;
CREATE POLICY "Service role full access credit_packages" ON public.credit_packages
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ==============================================
-- 7. RLS POLICIES FOR SYNC_METADATA (internal only)
-- ==============================================

-- Only service role can access sync metadata
DROP POLICY IF EXISTS "Service role only sync_metadata" ON public.sync_metadata;
CREATE POLICY "Service role only sync_metadata" ON public.sync_metadata
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ==============================================
-- 8. RLS POLICIES FOR DAILY_REWARDS
-- ==============================================

-- Users can view their own rewards
DROP POLICY IF EXISTS "Users can view own rewards" ON public.daily_rewards;
CREATE POLICY "Users can view own rewards" ON public.daily_rewards
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Service role full access
DROP POLICY IF EXISTS "Service role full access daily_rewards" ON public.daily_rewards;
CREATE POLICY "Service role full access daily_rewards" ON public.daily_rewards
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ==============================================
-- 9. RLS POLICIES FOR OAUTH_ACCOUNTS
-- ==============================================

-- Users can view their own OAuth accounts
DROP POLICY IF EXISTS "Users can view own oauth" ON public.oauth_accounts;
CREATE POLICY "Users can view own oauth" ON public.oauth_accounts
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Service role full access
DROP POLICY IF EXISTS "Service role full access oauth" ON public.oauth_accounts;
CREATE POLICY "Service role full access oauth" ON public.oauth_accounts
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ==============================================
-- 10. RLS POLICIES FOR CREDIT_TRANSACTIONS
-- ==============================================

-- Users can view their own transactions
DROP POLICY IF EXISTS "Users can view own transactions" ON public.credit_transactions;
CREATE POLICY "Users can view own transactions" ON public.credit_transactions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Service role full access
DROP POLICY IF EXISTS "Service role full access transactions" ON public.credit_transactions;
CREATE POLICY "Service role full access transactions" ON public.credit_transactions
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ==============================================
-- 11. FIX SECURITY DEFINER VIEWS
-- Just change security setting, don't recreate
-- ==============================================

-- Fix daily_summary view security (keeps existing structure)
ALTER VIEW public.daily_summary SET (security_invoker = true);

-- Fix user_activity_summary view security (keeps existing structure)
ALTER VIEW public.user_activity_summary SET (security_invoker = true);

-- ==============================================
-- DONE - Verify with Supabase Linter
-- ==============================================
SELECT 'Security fixes applied successfully!' as status;
