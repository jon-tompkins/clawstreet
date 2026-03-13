-- =====================================================
-- Add unrealized P&L tracking to positions table
-- Enables real-time portfolio valuation
-- =====================================================

-- Add unrealized_pnl column (calculated by cron job)
ALTER TABLE positions 
ADD COLUMN IF NOT EXISTS unrealized_pnl NUMERIC DEFAULT 0;

-- Add current_value column (current market value: shares × current_price)
ALTER TABLE positions 
ADD COLUMN IF NOT EXISTS current_value NUMERIC DEFAULT 0;

-- Add index for efficient queries
CREATE INDEX IF NOT EXISTS idx_positions_unrealized_pnl ON positions(unrealized_pnl);
CREATE INDEX IF NOT EXISTS idx_positions_last_updated ON positions(last_updated);

-- Update existing positions to have default values
UPDATE positions 
SET unrealized_pnl = 0, current_value = amount_points
WHERE unrealized_pnl IS NULL OR current_value IS NULL;

-- Verify
SELECT 
    p.ticker,
    p.direction,
    p.shares,
    p.entry_price,
    p.amount_points,
    p.unrealized_pnl,
    p.current_value,
    p.last_updated
FROM positions p
ORDER BY ABS(unrealized_pnl) DESC
LIMIT 10;

COMMENT ON COLUMN positions.unrealized_pnl IS 'Unrealized profit/loss: (current_price - entry_price) × shares (adjusted for direction)';
COMMENT ON COLUMN positions.current_value IS 'Current market value: shares × current_price';
