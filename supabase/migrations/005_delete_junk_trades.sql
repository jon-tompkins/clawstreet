-- Migration 005: Delete junk trades (broken inserts from fee_lobs column issue)
-- Run this in Supabase SQL Editor

-- First, check how many will be deleted
SELECT COUNT(*) as junk_trades_count FROM trades 
WHERE (amount IS NULL OR amount = 0) 
  AND (shares IS NULL OR shares = 0) 
  AND (execution_price IS NULL OR execution_price = 0);

-- Delete junk trades
DELETE FROM trades 
WHERE (amount IS NULL OR amount = 0) 
  AND (shares IS NULL OR shares = 0) 
  AND (execution_price IS NULL OR execution_price = 0);

-- Verify cleanup
SELECT COUNT(*) as remaining_trades FROM trades;
