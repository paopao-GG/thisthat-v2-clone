-- THISTHAT: Normalize all categories to lowercase
-- This fixes the "no markets available" bug for existing data
-- Run this once after deploying the category normalization fix

-- Update all markets to have lowercase categories
UPDATE markets
SET category = LOWER(TRIM(category))
WHERE category IS NOT NULL;

-- Check results
SELECT category, COUNT(*) as market_count
FROM markets
WHERE status = 'open'
GROUP BY category
ORDER BY market_count DESC;
