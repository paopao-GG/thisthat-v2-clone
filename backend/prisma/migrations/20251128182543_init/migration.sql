-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "username" VARCHAR(50) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "name" VARCHAR(100),
    "password_hash" VARCHAR(255),
    "referral_code" VARCHAR(36) NOT NULL,
    "referred_by_id" UUID,
    "referral_count" INTEGER NOT NULL DEFAULT 0,
    "referral_credits_earned" DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    "credit_balance" DECIMAL(18,2) NOT NULL DEFAULT 1000.00,
    "available_credits" DECIMAL(18,2) NOT NULL DEFAULT 1000.00,
    "expended_credits" DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    "total_volume" DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    "overall_pnl" DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    "rank_by_pnl" INTEGER,
    "rank_by_volume" INTEGER,
    "last_daily_reward_at" TIMESTAMP,
    "consecutive_days_online" INTEGER NOT NULL DEFAULT 1,
    "last_login_at" TIMESTAMP,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" VARCHAR(50) NOT NULL,
    "provider_account_id" VARCHAR(255) NOT NULL,
    "username" VARCHAR(100),
    "email" VARCHAR(255),
    "access_token" TEXT,
    "refresh_token" TEXT,
    "expires_at" TIMESTAMP,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL,

    CONSTRAINT "oauth_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "markets" (
    "id" UUID NOT NULL,
    "polymarket_id" VARCHAR(255),
    "title" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "this_option" VARCHAR(255) NOT NULL,
    "that_option" VARCHAR(255) NOT NULL,
    "this_odds" DECIMAL(5,4) NOT NULL,
    "that_odds" DECIMAL(5,4) NOT NULL,
    "liquidity" DECIMAL(18,2),
    "category" VARCHAR(100),
    "market_type" VARCHAR(50) NOT NULL DEFAULT 'polymarket',
    "status" VARCHAR(50) NOT NULL DEFAULT 'open',
    "resolution" VARCHAR(50),
    "expires_at" TIMESTAMP,
    "resolved_at" TIMESTAMP,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL,

    CONSTRAINT "markets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "market_id" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "side" VARCHAR(10) NOT NULL,
    "odds_at_bet" DECIMAL(5,4) NOT NULL,
    "potential_payout" DECIMAL(18,2) NOT NULL,
    "actual_payout" DECIMAL(18,2),
    "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
    "placed_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP,

    CONSTRAINT "bets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_transactions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "transaction_type" VARCHAR(50) NOT NULL,
    "reference_id" UUID,
    "balance_after" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_purchases" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "package_id" VARCHAR(50) NOT NULL,
    "credits_granted" DECIMAL(18,2) NOT NULL,
    "usd_amount" DECIMAL(18,2) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'completed',
    "provider" VARCHAR(50),
    "external_id" VARCHAR(100),
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_rewards" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "credits_awarded" DECIMAL(18,2) NOT NULL DEFAULT 100.00,
    "claimed_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMP NOT NULL,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stocks" (
    "id" UUID NOT NULL,
    "symbol" VARCHAR(20) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "current_price" DECIMAL(18,8) NOT NULL DEFAULT 1.00,
    "total_supply" DECIMAL(18,2) NOT NULL DEFAULT 1000000.00,
    "circulating_supply" DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    "market_cap" DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    "base_multiplier" DECIMAL(5,4) NOT NULL DEFAULT 1.00,
    "max_leverage" DECIMAL(5,2) NOT NULL DEFAULT 10.00,
    "status" VARCHAR(50) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL,

    CONSTRAINT "stocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_holdings" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "stock_id" UUID NOT NULL,
    "shares" DECIMAL(18,8) NOT NULL DEFAULT 0.00,
    "average_buy_price" DECIMAL(18,8) NOT NULL DEFAULT 0.00,
    "total_invested" DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    "leverage" DECIMAL(5,2) NOT NULL DEFAULT 1.00,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL,

    CONSTRAINT "stock_holdings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transactions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "stock_id" UUID NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "shares" DECIMAL(18,8) NOT NULL,
    "price_per_share" DECIMAL(18,8) NOT NULL,
    "total_amount" DECIMAL(18,2) NOT NULL,
    "leverage" DECIMAL(5,2) NOT NULL DEFAULT 1.00,
    "transaction_hash" VARCHAR(255) NOT NULL,
    "signed_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "balance_before" DECIMAL(18,2) NOT NULL,
    "balance_after" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_referral_code_key" ON "users"("referral_code");

-- CreateIndex
CREATE INDEX "users_username_idx" ON "users"("username");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_rank_by_pnl_idx" ON "users"("rank_by_pnl");

-- CreateIndex
CREATE INDEX "users_rank_by_volume_idx" ON "users"("rank_by_volume");

-- CreateIndex
CREATE INDEX "users_referral_code_idx" ON "users"("referral_code");

-- CreateIndex
CREATE INDEX "oauth_accounts_user_id_idx" ON "oauth_accounts"("user_id");

-- CreateIndex
CREATE INDEX "oauth_accounts_provider_idx" ON "oauth_accounts"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_accounts_provider_provider_account_id_key" ON "oauth_accounts"("provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "markets_polymarket_id_key" ON "markets"("polymarket_id");

-- CreateIndex
CREATE INDEX "markets_status_idx" ON "markets"("status");

-- CreateIndex
CREATE INDEX "markets_category_idx" ON "markets"("category");

-- CreateIndex
CREATE INDEX "markets_market_type_idx" ON "markets"("market_type");

-- CreateIndex
CREATE INDEX "markets_polymarket_id_idx" ON "markets"("polymarket_id");

-- CreateIndex
CREATE INDEX "bets_user_id_idx" ON "bets"("user_id");

-- CreateIndex
CREATE INDEX "bets_market_id_idx" ON "bets"("market_id");

-- CreateIndex
CREATE INDEX "bets_status_idx" ON "bets"("status");

-- CreateIndex
CREATE INDEX "bets_placed_at_idx" ON "bets"("placed_at" DESC);

-- CreateIndex
CREATE INDEX "credit_transactions_user_id_idx" ON "credit_transactions"("user_id");

-- CreateIndex
CREATE INDEX "credit_transactions_created_at_idx" ON "credit_transactions"("created_at" DESC);

-- CreateIndex
CREATE INDEX "credit_purchases_user_id_idx" ON "credit_purchases"("user_id");

-- CreateIndex
CREATE INDEX "daily_rewards_user_id_idx" ON "daily_rewards"("user_id");

-- CreateIndex
CREATE INDEX "daily_rewards_claimed_at_idx" ON "daily_rewards"("claimed_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_token_hash_idx" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "stocks_symbol_key" ON "stocks"("symbol");

-- CreateIndex
CREATE INDEX "stocks_symbol_idx" ON "stocks"("symbol");

-- CreateIndex
CREATE INDEX "stocks_status_idx" ON "stocks"("status");

-- CreateIndex
CREATE INDEX "stock_holdings_user_id_idx" ON "stock_holdings"("user_id");

-- CreateIndex
CREATE INDEX "stock_holdings_stock_id_idx" ON "stock_holdings"("stock_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_holdings_user_id_stock_id_key" ON "stock_holdings"("user_id", "stock_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_transactions_transaction_hash_key" ON "stock_transactions"("transaction_hash");

-- CreateIndex
CREATE INDEX "stock_transactions_user_id_idx" ON "stock_transactions"("user_id");

-- CreateIndex
CREATE INDEX "stock_transactions_stock_id_idx" ON "stock_transactions"("stock_id");

-- CreateIndex
CREATE INDEX "stock_transactions_transaction_hash_idx" ON "stock_transactions"("transaction_hash");

-- CreateIndex
CREATE INDEX "stock_transactions_created_at_idx" ON "stock_transactions"("created_at" DESC);

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_referred_by_id_fkey" FOREIGN KEY ("referred_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bets" ADD CONSTRAINT "bets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bets" ADD CONSTRAINT "bets_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_purchases" ADD CONSTRAINT "credit_purchases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_rewards" ADD CONSTRAINT "daily_rewards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_holdings" ADD CONSTRAINT "stock_holdings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_holdings" ADD CONSTRAINT "stock_holdings_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "stocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transactions" ADD CONSTRAINT "stock_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transactions" ADD CONSTRAINT "stock_transactions_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "stocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
