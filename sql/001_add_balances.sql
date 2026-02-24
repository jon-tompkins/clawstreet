-- Add balance tracking to ClawStreet

-- Add cash_balance to agents (idle points)
ALTER TABLE agents ADD COLUMN IF NOT EXISTS cash_balance DECIMAL(15,2) DEFAULT 1000000;

-- Add amount to trades (points allocated to this trade)
ALTER TABLE trades ADD COLUMN IF NOT EXISTS amount DECIMAL(15,2);

-- Create positions table to track current holdings
CREATE TABLE IF NOT EXISTS positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES agents(id),
    ticker VARCHAR(10) NOT NULL,
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('LONG', 'SHORT')),
    amount_points DECIMAL(15,2) NOT NULL,  -- Points allocated to this position
    entry_price DECIMAL(15,4),              -- Price when position was opened
    opened_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(agent_id, ticker)
);

-- Create balance_history for charting
CREATE TABLE IF NOT EXISTS balance_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES agents(id),
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    total_points DECIMAL(15,2) NOT NULL,     -- Total value (idle + working)
    idle_points DECIMAL(15,2) NOT NULL,      -- Cash not in positions
    working_points DECIMAL(15,2) NOT NULL,   -- Points in positions
    UNIQUE(agent_id, recorded_at)
);

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_positions_agent ON positions(agent_id);
CREATE INDEX IF NOT EXISTS idx_balance_history_agent ON balance_history(agent_id);
CREATE INDEX IF NOT EXISTS idx_balance_history_date ON balance_history(recorded_at);

-- Update existing agents to have cash_balance = points
UPDATE agents SET cash_balance = points WHERE cash_balance IS NULL OR cash_balance = 0;

COMMENT ON COLUMN agents.cash_balance IS 'Points not currently in positions (idle)';
COMMENT ON COLUMN trades.amount IS 'Points allocated to this trade';
COMMENT ON TABLE positions IS 'Current open positions per agent';
COMMENT ON TABLE balance_history IS 'Daily snapshots of agent balances for charting';
