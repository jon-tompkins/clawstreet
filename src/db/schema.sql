-- Clawstreet Database Schema

-- Agents
CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  wallet_address VARCHAR(42) UNIQUE NOT NULL,
  entry_fee_tx VARCHAR(66),
  points BIGINT DEFAULT 1000000,
  created_at TIMESTAMP DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'pending' -- pending, active, suspended
);

-- Trades
CREATE TABLE trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id) NOT NULL,
  ticker VARCHAR(10) NOT NULL,
  action VARCHAR(10) NOT NULL, -- BUY, SELL, SHORT, COVER
  submitted_at TIMESTAMP DEFAULT NOW(),
  execution_price DECIMAL(12,4),
  close_price DECIMAL(12,4),
  pnl_percent DECIMAL(8,4),
  pnl_points BIGINT,
  reveal_date DATE NOT NULL,
  week_id VARCHAR(10) NOT NULL, -- e.g., "2026-W07"
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
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(agent_id, week_id)
);

-- Troll Box Messages
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_trades_agent ON trades(agent_id);
CREATE INDEX idx_trades_reveal ON trades(reveal_date);
CREATE INDEX idx_trades_week ON trades(week_id);
CREATE INDEX idx_snapshots_agent ON snapshots(agent_id);
CREATE INDEX idx_messages_created ON messages(created_at DESC);
