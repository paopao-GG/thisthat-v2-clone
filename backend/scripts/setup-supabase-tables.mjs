/**
 * Setup Supabase tables for analytics
 *
 * Run this SQL in your Supabase SQL Editor:
 * https://supabase.com/dashboard/project/qvvaxphihdemjixpxehg/sql
 */

const SQL = `
-- ==============================================
-- THISTHAT Analytics Tables for Supabase
-- ==============================================

-- UTM Events Table - Raw tracking data
CREATE TABLE IF NOT EXISTS utm_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  session_id VARCHAR(100) NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  utm_source VARCHAR(100),
  utm_medium VARCHAR(100),
  utm_campaign VARCHAR(255),
  utm_term VARCHAR(255),
  utm_content VARCHAR(255),
  referrer TEXT,
  user_agent TEXT,
  ip_address VARCHAR(45),
  device_type VARCHAR(20),
  country VARCHAR(100),
  city VARCHAR(100),
  page_url TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for utm_events
CREATE INDEX IF NOT EXISTS idx_utm_events_user_id ON utm_events(user_id);
CREATE INDEX IF NOT EXISTS idx_utm_events_session_id ON utm_events(session_id);
CREATE INDEX IF NOT EXISTS idx_utm_events_event_type ON utm_events(event_type);
CREATE INDEX IF NOT EXISTS idx_utm_events_created_at ON utm_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_utm_events_utm_source ON utm_events(utm_source);
CREATE INDEX IF NOT EXISTS idx_utm_events_utm_campaign ON utm_events(utm_campaign);

-- Analytics Metrics Table - Aggregated daily metrics (backup from PostgreSQL)
CREATE TABLE IF NOT EXISTS analytics_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_name VARCHAR(100) NOT NULL,
  metric_value DECIMAL(20, 4) NOT NULL,
  dimensions JSONB,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(metric_name, period_start, period_end)
);

-- Indexes for analytics_metrics
CREATE INDEX IF NOT EXISTS idx_analytics_metrics_name ON analytics_metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_analytics_metrics_period ON analytics_metrics(period_start);

-- ==============================================
-- Row Level Security (RLS) - ENABLED for defense in depth
-- ==============================================
ALTER TABLE utm_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_metrics ENABLE ROW LEVEL SECURITY;

-- Grant base permissions
GRANT ALL ON utm_events TO service_role;
GRANT ALL ON analytics_metrics TO service_role;
GRANT SELECT ON utm_events TO authenticated;
GRANT SELECT ON analytics_metrics TO authenticated;

-- ==============================================
-- RLS Policies
-- ==============================================

-- Service role bypasses RLS by default, but we add explicit policies for clarity

-- utm_events: Users can only read their own events
DROP POLICY IF EXISTS "Users can view own utm_events" ON utm_events;
CREATE POLICY "Users can view own utm_events" ON utm_events
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- utm_events: Service role can do everything (explicit for documentation)
DROP POLICY IF EXISTS "Service role full access utm_events" ON utm_events;
CREATE POLICY "Service role full access utm_events" ON utm_events
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- analytics_metrics: Authenticated users can read all metrics (aggregated data, not sensitive)
DROP POLICY IF EXISTS "Authenticated users can view metrics" ON analytics_metrics;
CREATE POLICY "Authenticated users can view metrics" ON analytics_metrics
  FOR SELECT TO authenticated
  USING (true);

-- analytics_metrics: Only service role can insert/update metrics
DROP POLICY IF EXISTS "Service role full access metrics" ON analytics_metrics;
CREATE POLICY "Service role full access metrics" ON analytics_metrics
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ==============================================
-- Done!
-- ==============================================
SELECT 'Supabase analytics tables created successfully!' as status;
`;

console.log('='.repeat(60));
console.log('SUPABASE ANALYTICS TABLE SETUP');
console.log('='.repeat(60));
console.log('');
console.log('Please run the following SQL in your Supabase SQL Editor:');
console.log('https://supabase.com/dashboard/project/qvvaxphihdemjixpxehg/sql');
console.log('');
console.log('-'.repeat(60));
console.log(SQL);
console.log('-'.repeat(60));
console.log('');
console.log('After running the SQL, your Supabase is ready for analytics!');
