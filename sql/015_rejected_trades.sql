-- Migration: Add rejected_trades table for admin visibility
-- Logs all trade attempts that fail validation

CREATE TABLE IF NOT EXISTS rejected_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id),
  agent_name VARCHAR(100),
  ticker VARCHAR(20),
  action VARCHAR(10),
  direction VARCHAR(10),
  amount DECIMAL(15,2),
  error_code VARCHAR(50) NOT NULL,
  error_message TEXT NOT NULL,
  request_body JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for querying by agent
CREATE INDEX idx_rejected_trades_agent ON rejected_trades(agent_id);

-- Index for querying by error code
CREATE INDEX idx_rejected_trades_error ON rejected_trades(error_code);

-- Index for querying by time
CREATE INDEX idx_rejected_trades_created ON rejected_trades(created_at DESC);

-- Grant access to service role
ALTER TABLE rejected_trades ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role can manage rejected_trades"
  ON rejected_trades
  FOR ALL
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE rejected_trades IS 'Logs all rejected/invalid trade attempts for admin monitoring';
