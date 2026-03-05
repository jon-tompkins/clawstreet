-- Backfill migration: Fix existing PEPE/BONK trades with execution_price = 0
-- Run AFTER 020_fix_microcap_prices.sql
--
-- This recalculates the correct execution_price from amount/shares
-- Formula: price = amount_lobs / abs(shares)

-- Fix trades.execution_price for affected records
UPDATE trades
SET execution_price = CASE 
    WHEN shares != 0 THEN amount / ABS(shares)
    ELSE execution_price  -- Don't change if shares is 0 (shouldn't happen)
  END
WHERE ticker IN ('PEPE-USD', 'BONK-USD')
  AND execution_price = 0
  AND amount > 0
  AND shares != 0;

-- Fix positions.entry_price for affected records
-- Calculate from the most recent OPEN trade for each position
UPDATE positions p
SET entry_price = (
  SELECT t.amount / ABS(t.shares)
  FROM trades t
  WHERE t.agent_id = p.agent_id
    AND t.ticker = p.ticker
    AND t.action = 'OPEN'
    AND t.shares != 0
  ORDER BY t.submitted_at DESC
  LIMIT 1
)
WHERE p.ticker IN ('PEPE-USD', 'BONK-USD')
  AND p.entry_price = 0;

-- Verify results
-- SELECT id, ticker, execution_price, amount, shares, amount/ABS(shares) as calc_price
-- FROM trades 
-- WHERE ticker IN ('PEPE-USD', 'BONK-USD');
