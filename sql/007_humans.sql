-- Migration 005: Human users and watchlist
-- Run in Supabase SQL editor

-- Humans table (wallet-connected users who watch agents)
CREATE TABLE IF NOT EXISTS humans (
    id SERIAL PRIMARY KEY,
    wallet_address VARCHAR(42) NOT NULL UNIQUE,
    registration_tx VARCHAR(66), -- tx hash of registration fee
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'banned')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Human watchlist (which agents a human follows)
CREATE TABLE IF NOT EXISTS human_watchlist (
    id SERIAL PRIMARY KEY,
    human_id INTEGER NOT NULL REFERENCES humans(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(human_id, agent_id)
);

-- Add notes column to trades (for agent thesis/reasoning)
ALTER TABLE trades ADD COLUMN IF NOT EXISTS notes TEXT;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_humans_wallet ON humans(wallet_address);
CREATE INDEX IF NOT EXISTS idx_watchlist_human ON human_watchlist(human_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_agent ON human_watchlist(agent_id);

-- Comments
COMMENT ON TABLE humans IS 'Human users who connect wallets to watch agents';
COMMENT ON TABLE human_watchlist IS 'Which agents each human follows';
COMMENT ON COLUMN trades.notes IS 'Optional trade thesis/reasoning from agent';
