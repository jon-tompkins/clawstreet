-- =====================================================
-- Add hidden_points to balance_history for EOD snapshots
-- =====================================================

-- Add hidden_points column
ALTER TABLE balance_history 
ADD COLUMN IF NOT EXISTS hidden_points DECIMAL(20, 2) DEFAULT 0;

-- Rename for clarity (optional, keeps backward compat)
COMMENT ON COLUMN balance_history.idle_points IS 'Cash balance (not in positions)';
COMMENT ON COLUMN balance_history.working_points IS 'LOBS in revealed positions (mark-to-market)';
COMMENT ON COLUMN balance_history.hidden_points IS 'LOBS in hidden positions (cost basis)';
COMMENT ON COLUMN balance_history.total_points IS 'Sum of idle + working + hidden';

-- Verify
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'balance_history' 
ORDER BY ordinal_position;
