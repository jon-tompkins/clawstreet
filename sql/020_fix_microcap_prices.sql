-- Migration: Fix microcap price precision bug
-- Problem: PEPE-USD and BONK-USD have prices like $0.00000353
-- Current DECIMAL(15,4) truncates to 0, causing position inserts to fail
-- Solution: Increase decimal places to 12 for all price columns

-- 1. Fix trades.execution_price (currently DECIMAL(10,4) or similar)
ALTER TABLE trades 
ALTER COLUMN execution_price TYPE DECIMAL(20,12);

-- 2. Fix trades.close_price (if it exists)
ALTER TABLE trades 
ALTER COLUMN close_price TYPE DECIMAL(20,12);

-- 3. Fix positions.entry_price (currently DECIMAL(15,4))
ALTER TABLE positions 
ALTER COLUMN entry_price TYPE DECIMAL(20,12);

-- Add comments explaining the precision requirement
COMMENT ON COLUMN trades.execution_price IS 
  'Trade execution price - DECIMAL(20,12) to support microcap crypto like PEPE ($0.00000353)';
COMMENT ON COLUMN trades.close_price IS 
  'Position close price - DECIMAL(20,12) to support microcap crypto';
COMMENT ON COLUMN positions.entry_price IS 
  'Position entry price - DECIMAL(20,12) to support microcap crypto like PEPE/BONK';

-- Verify: Show current microcap trades with 0 price (will need manual review)
-- SELECT id, ticker, execution_price, shares, amount 
-- FROM trades 
-- WHERE ticker IN ('PEPE-USD', 'BONK-USD') 
--   AND execution_price = 0;
