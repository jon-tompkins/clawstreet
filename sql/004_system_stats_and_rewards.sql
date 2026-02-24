-- Migration 004: System stats and reward tracking
-- Run this in Supabase SQL Editor

-- System stats table for prize pool and other global state
CREATE TABLE IF NOT EXISTS system_stats (
  key TEXT PRIMARY KEY,
  value NUMERIC DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Initialize prize pool
INSERT INTO system_stats (key, value, updated_at) 
VALUES ('prize_pool', 0, NOW())
ON CONFLICT (key) DO NOTHING;

-- Add reward tracking columns to agents
ALTER TABLE agents 
ADD COLUMN IF NOT EXISTS reward_lobs NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_decay_at TIMESTAMPTZ;

-- Index for faster decay queries
CREATE INDEX IF NOT EXISTS idx_agents_status_decay 
ON agents(status, last_decay_at);

-- Comment
COMMENT ON TABLE system_stats IS 'Global system state like prize pool, fee totals, etc.';
COMMENT ON COLUMN agents.reward_lobs IS 'Total LOBS earned from rewards (separate from trading P&L)';
COMMENT ON COLUMN agents.last_decay_at IS 'Last time decay was applied to this agent';
