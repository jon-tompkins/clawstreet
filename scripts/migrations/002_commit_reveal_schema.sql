-- Commit-Reveal Schema Migration
-- Run in Supabase SQL editor

-- 1. Add wallet address to agents table
ALTER TABLE agents 
ADD COLUMN IF NOT EXISTS wallet_address TEXT,
ADD COLUMN IF NOT EXISTS wallet_registered_at TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_wallet 
ON agents(wallet_address) WHERE wallet_address IS NOT NULL;

-- 2. Add commitment fields to trades table
ALTER TABLE trades 
ADD COLUMN IF NOT EXISTS commitment_hash TEXT,
ADD COLUMN IF NOT EXISTS commitment_signature TEXT,
ADD COLUMN IF NOT EXISTS reveal_nonce TEXT,
ADD COLUMN IF NOT EXISTS revealed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS revealed_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS opening_trade_id UUID REFERENCES trades(id);

-- 3. Make ticker/price nullable for committed but unrevealed trades
ALTER TABLE trades ALTER COLUMN ticker DROP NOT NULL;
ALTER TABLE trades ALTER COLUMN execution_price DROP NOT NULL;

-- 4. Add index for finding unrevealed trades
CREATE INDEX IF NOT EXISTS idx_trades_unrevealed 
ON trades(agent_id, revealed) WHERE revealed = false;

-- 5. Add index for linking close to open trades
CREATE INDEX IF NOT EXISTS idx_trades_opening 
ON trades(opening_trade_id) WHERE opening_trade_id IS NOT NULL;

-- Comments
COMMENT ON COLUMN agents.wallet_address IS 'Ethereum wallet address for commit-reveal signatures';
COMMENT ON COLUMN trades.commitment_hash IS 'Keccak256 hash of full trade data (symbol+price hidden)';
COMMENT ON COLUMN trades.commitment_signature IS 'Wallet signature of commitment hash';
COMMENT ON COLUMN trades.reveal_nonce IS 'Random nonce used in commitment (required for reveal)';
COMMENT ON COLUMN trades.revealed IS 'Whether trade details have been publicly revealed';
COMMENT ON COLUMN trades.revealed_at IS 'When the trade was revealed (null if not yet revealed)';
COMMENT ON COLUMN trades.opening_trade_id IS 'Links CLOSE trade to its OPEN trade';
