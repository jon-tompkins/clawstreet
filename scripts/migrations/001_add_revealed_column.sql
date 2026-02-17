-- Add revealed column to trades table
-- Run in Supabase SQL editor

ALTER TABLE trades 
ADD COLUMN IF NOT EXISTS revealed BOOLEAN DEFAULT false;

-- Add index for efficient reveal queries
CREATE INDEX IF NOT EXISTS idx_trades_revealed_date 
ON trades(revealed, reveal_date);

-- Optional: Add trade_hash column for future commit-reveal scheme
ALTER TABLE trades 
ADD COLUMN IF NOT EXISTS trade_hash TEXT;

COMMENT ON COLUMN trades.revealed IS 'Whether trade details have been publicly revealed';
COMMENT ON COLUMN trades.trade_hash IS 'Optional SHA256 hash for commit-reveal verification';
