-- P1: Add Polymarket Token IDs for CLOB API price fetching
-- AlterTable: Add token ID columns and related fields

-- Add image_url column if not exists
ALTER TABLE "markets" ADD COLUMN IF NOT EXISTS "image_url" TEXT;

-- Add token ID columns for CLOB API integration
ALTER TABLE "markets" ADD COLUMN IF NOT EXISTS "this_token_id" VARCHAR(100);
ALTER TABLE "markets" ADD COLUMN IF NOT EXISTS "that_token_id" VARCHAR(100);

-- Add AMM reserves if not exists (kept for backwards compatibility)
ALTER TABLE "markets" ADD COLUMN IF NOT EXISTS "yes_reserve" DECIMAL(20, 8) DEFAULT 1000.00;
ALTER TABLE "markets" ADD COLUMN IF NOT EXISTS "no_reserve" DECIMAL(20, 8) DEFAULT 1000.00;

-- Add last price update timestamp
ALTER TABLE "markets" ADD COLUMN IF NOT EXISTS "last_price_update" TIMESTAMP;

-- Add volume columns if not exists
ALTER TABLE "markets" ADD COLUMN IF NOT EXISTS "volume" DECIMAL(18, 2);
ALTER TABLE "markets" ADD COLUMN IF NOT EXISTS "volume_24hr" DECIMAL(18, 2);

-- Make this_odds and that_odds nullable (they might be null when live prices are used)
-- First drop the NOT NULL constraint if exists
DO $$
BEGIN
    ALTER TABLE "markets" ALTER COLUMN "this_odds" DROP NOT NULL;
EXCEPTION
    WHEN others THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "markets" ALTER COLUMN "that_odds" DROP NOT NULL;
EXCEPTION
    WHEN others THEN NULL;
END $$;

-- Create index for token ID lookups
CREATE INDEX IF NOT EXISTS "markets_this_token_id_idx" ON "markets"("this_token_id");
CREATE INDEX IF NOT EXISTS "markets_volume_24hr_idx" ON "markets"("volume_24hr");
