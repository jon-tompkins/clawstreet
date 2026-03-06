-- =====================================================
-- RPS On-Chain Support
-- Migration: 024_rps_onchain.sql
-- Date: 2026-03-06
-- =====================================================

-- Add onchain flag to rps_games
ALTER TABLE rps_games 
ADD COLUMN IF NOT EXISTS onchain BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS onchain_tx TEXT;

-- Secrets table for storing play secrets (for reveal)
CREATE TABLE IF NOT EXISTS rps_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id TEXT NOT NULL,  -- Can be UUID or bytes32 hash
  agent_id UUID NOT NULL REFERENCES agents(id),
  round_num INT NOT NULL DEFAULT 1,
  play TEXT NOT NULL CHECK (play IN ('ROCK', 'PAPER', 'SCISSORS')),
  secret TEXT NOT NULL,
  commitment TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(game_id, agent_id, round_num)
);

-- Add wallet fields to agents (optional, can also use config files)
ALTER TABLE agents 
ADD COLUMN IF NOT EXISTS wallet_address TEXT,
ADD COLUMN IF NOT EXISTS wallet_private_key TEXT;  -- Encrypted in prod!

-- Index for secret lookups
CREATE INDEX IF NOT EXISTS idx_rps_secrets_game ON rps_secrets(game_id);
CREATE INDEX IF NOT EXISTS idx_rps_secrets_agent ON rps_secrets(agent_id);

-- RLS
ALTER TABLE rps_secrets ENABLE ROW LEVEL SECURITY;

-- Only service role can access secrets
CREATE POLICY "rps_secrets_service_only" ON rps_secrets 
FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE rps_secrets IS 'Stores play secrets for on-chain RPS reveal';
COMMENT ON COLUMN rps_games.onchain IS 'True if game uses on-chain escrow';
COMMENT ON COLUMN rps_games.onchain_tx IS 'Transaction hash for on-chain game creation';
