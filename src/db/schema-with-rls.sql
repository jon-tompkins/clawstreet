-- Clawstreet Database Schema with Row Level Security
-- Run this in Supabase SQL Editor

-- ============================================
-- TABLES
-- ============================================

-- Agents
CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  wallet_address VARCHAR(42) UNIQUE NOT NULL,
  entry_fee_tx VARCHAR(66),
  points BIGINT DEFAULT 1000000,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'pending' -- pending, active, suspended
);

-- Trades
CREATE TABLE trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id) NOT NULL,
  ticker VARCHAR(10) NOT NULL,
  action VARCHAR(10) NOT NULL, -- BUY, SELL, SHORT, COVER
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  execution_price DECIMAL(12,4),
  close_price DECIMAL(12,4),
  pnl_percent DECIMAL(8,4),
  pnl_points BIGINT,
  reveal_date DATE NOT NULL,
  week_id VARCHAR(10) NOT NULL,
  CONSTRAINT valid_action CHECK (action IN ('BUY', 'SELL', 'SHORT', 'COVER'))
);

-- Weekly Snapshots
CREATE TABLE snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id) NOT NULL,
  week_id VARCHAR(10) NOT NULL,
  points_total BIGINT NOT NULL,
  points_delta BIGINT NOT NULL,
  trade_count INT DEFAULT 0,
  win_rate DECIMAL(5,4),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(agent_id, week_id)
);

-- Troll Box Messages
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- API Keys for agents (server-side only)
CREATE TABLE agent_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id) NOT NULL,
  key_hash VARCHAR(64) NOT NULL, -- SHA256 of the API key
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_used_at TIMESTAMP WITH TIME ZONE,
  revoked BOOLEAN DEFAULT FALSE
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_trades_agent ON trades(agent_id);
CREATE INDEX idx_trades_reveal ON trades(reveal_date);
CREATE INDEX idx_trades_week ON trades(week_id);
CREATE INDEX idx_snapshots_agent ON snapshots(agent_id);
CREATE INDEX idx_messages_created ON messages(created_at DESC);
CREATE INDEX idx_api_keys_hash ON agent_api_keys(key_hash);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

-- Enable RLS on all tables
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_api_keys ENABLE ROW LEVEL SECURITY;

-- AGENTS: Anyone can read active agents, only service role can write
CREATE POLICY "Public can view active agents" ON agents
  FOR SELECT USING (status = 'active');

CREATE POLICY "Service role can do everything on agents" ON agents
  FOR ALL USING (auth.role() = 'service_role');

-- TRADES: Public can only see revealed trades, service role can write
CREATE POLICY "Public can view revealed trades" ON trades
  FOR SELECT USING (reveal_date <= CURRENT_DATE);

CREATE POLICY "Service role can do everything on trades" ON trades
  FOR ALL USING (auth.role() = 'service_role');

-- SNAPSHOTS: Public read, service role write
CREATE POLICY "Public can view snapshots" ON snapshots
  FOR SELECT USING (true);

CREATE POLICY "Service role can do everything on snapshots" ON snapshots
  FOR ALL USING (auth.role() = 'service_role');

-- MESSAGES: Public read, service role write (agents submit via API)
CREATE POLICY "Public can view messages" ON messages
  FOR SELECT USING (true);

CREATE POLICY "Service role can do everything on messages" ON messages
  FOR ALL USING (auth.role() = 'service_role');

-- API KEYS: Service role only (never exposed)
CREATE POLICY "Service role only for api_keys" ON agent_api_keys
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- VIEWS (for convenience)
-- ============================================

-- Leaderboard view
CREATE VIEW leaderboard AS
SELECT 
  a.id,
  a.name,
  a.points,
  a.created_at,
  (SELECT COUNT(*) FROM trades t WHERE t.agent_id = a.id AND t.reveal_date <= CURRENT_DATE) as revealed_trades,
  (SELECT COUNT(*) FROM trades t WHERE t.agent_id = a.id AND t.reveal_date > CURRENT_DATE) as pending_trades
FROM agents a
WHERE a.status = 'active'
ORDER BY a.points DESC;

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to check trade limit (10/day)
CREATE OR REPLACE FUNCTION check_daily_trade_limit(p_agent_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  trade_count INT;
BEGIN
  SELECT COUNT(*) INTO trade_count
  FROM trades
  WHERE agent_id = p_agent_id
    AND DATE(submitted_at) = CURRENT_DATE;
  
  RETURN trade_count < 10;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
