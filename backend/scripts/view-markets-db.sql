-- THISTHAT: Useful queries to view markets database
-- Connect with: psql postgresql://postgres:pao122002@localhost:5432/thisthat_markets

-- ==========================================
-- 1. View all tables in the database
-- ==========================================
\dt

-- ==========================================
-- 2. View markets table structure
-- ==========================================
\d markets

-- ==========================================
-- 3. Count markets by category
-- ==========================================
SELECT
    category,
    COUNT(*) as total_markets,
    COUNT(CASE WHEN status = 'open' THEN 1 END) as open_markets,
    COUNT(CASE WHEN status = 'closed' THEN 1 END) as closed_markets
FROM markets
GROUP BY category
ORDER BY total_markets DESC;

-- ==========================================
-- 4. View recent markets (last 20)
-- ==========================================
SELECT
    id,
    question,
    category,
    status,
    "updatedAt"
FROM markets
ORDER BY "updatedAt" DESC
LIMIT 20;

-- ==========================================
-- 5. View markets by specific category
-- ==========================================
-- Example: Replace 'sports' with any category
SELECT
    id,
    question,
    category,
    status,
    volume,
    "updatedAt"
FROM markets
WHERE category = 'sports'
ORDER BY "updatedAt" DESC
LIMIT 10;

-- ==========================================
-- 6. Count total markets by status
-- ==========================================
SELECT
    status,
    COUNT(*) as count
FROM markets
GROUP BY status;

-- ==========================================
-- 7. View all available categories
-- ==========================================
SELECT DISTINCT category
FROM markets
WHERE category IS NOT NULL
ORDER BY category;

-- ==========================================
-- 8. View top markets by volume
-- ==========================================
SELECT
    id,
    question,
    category,
    volume,
    "totalLiquidity" as liquidity
FROM markets
WHERE status = 'open'
ORDER BY volume DESC
LIMIT 20;

-- ==========================================
-- 9. Search markets by question text
-- ==========================================
-- Example: Search for markets containing "Trump"
SELECT
    id,
    question,
    category,
    status
FROM markets
WHERE question ILIKE '%Trump%'
LIMIT 20;

-- ==========================================
-- 10. Database statistics
-- ==========================================
SELECT
    COUNT(*) as total_markets,
    COUNT(DISTINCT category) as total_categories,
    COUNT(CASE WHEN status = 'open' THEN 1 END) as open_markets,
    MAX("updatedAt") as last_updated,
    MIN("createdAt") as oldest_market
FROM markets;
