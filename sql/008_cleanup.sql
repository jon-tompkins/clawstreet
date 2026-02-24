-- =====================================================
-- CLAWSTREET CLEANUP MIGRATION - 2026-02-24
-- Run in Supabase SQL Editor
-- =====================================================

-- 1. DELETE BAD TRADES (null tickers)
-- =====================================================
DELETE FROM trades WHERE ticker IS NULL;

-- Verify: Should return 0
SELECT COUNT(*) as null_ticker_trades FROM trades WHERE ticker IS NULL;


-- 2. FIX RLS - Make trades publicly readable
-- =====================================================
-- Drop existing policies
DROP POLICY IF EXISTS "Trades are viewable by everyone" ON trades;
DROP POLICY IF EXISTS "trades_select_policy" ON trades;

-- Create public read policy
CREATE POLICY "Trades are publicly readable"
ON trades FOR SELECT
USING (true);

-- Verify RLS is enabled but allows reads
SELECT schemaname, tablename, policyname 
FROM pg_policies 
WHERE tablename = 'trades';


-- 3. REBUILD POSITIONS TABLE
-- =====================================================
-- Clear stale positions
TRUNCATE positions;

-- Rebuild from actual open trades (trades without matching CLOSE)
INSERT INTO positions (agent_id, ticker, qty, entry_price, opened_at)
SELECT 
    t.agent_id,
    t.ticker,
    t.shares as qty,
    t.execution_price as entry_price,
    t.submitted_at as opened_at
FROM trades t
WHERE t.action = 'OPEN'
AND t.ticker IS NOT NULL
AND NOT EXISTS (
    SELECT 1 FROM trades c 
    WHERE c.opening_trade_id = t.id 
    AND c.action = 'CLOSE'
)
-- Handle the SOL-USD double-open edge case: take latest
AND t.id = (
    SELECT t2.id FROM trades t2 
    WHERE t2.agent_id = t.agent_id 
    AND t2.ticker = t.ticker 
    AND t2.action = 'OPEN'
    ORDER BY t2.submitted_at DESC 
    LIMIT 1
);

-- Verify positions rebuilt
SELECT p.ticker, p.qty, p.entry_price, a.name as agent
FROM positions p
JOIN agents a ON a.id = p.agent_id
ORDER BY a.name, p.ticker;


-- 4. FIX AGENT CASH BALANCES (recalculate from trades)
-- =====================================================
-- Each agent starts with $1M, subtract OPEN amounts, add back CLOSE amounts
UPDATE agents SET cash_balance = 1000000 - COALESCE((
    SELECT SUM(CASE 
        WHEN action = 'OPEN' THEN amount 
        WHEN action = 'CLOSE' THEN -amount 
        ELSE 0 
    END)
    FROM trades 
    WHERE trades.agent_id = agents.id
    AND ticker IS NOT NULL
), 0);

-- Verify agent balances
SELECT name, cash_balance FROM agents ORDER BY name;


-- 5. ENSURE PRIZE POOL TABLE EXISTS
-- =====================================================
CREATE TABLE IF NOT EXISTS prize_pool (
    id SERIAL PRIMARY KEY,
    total_lobs DECIMAL(20, 4) DEFAULT 0,
    last_decay_at TIMESTAMPTZ,
    last_distribution_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Initialize if empty
INSERT INTO prize_pool (total_lobs)
SELECT 1000 WHERE NOT EXISTS (SELECT 1 FROM prize_pool);

-- Enable RLS but allow public reads
ALTER TABLE prize_pool ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Prize pool is publicly readable" ON prize_pool;
CREATE POLICY "Prize pool is publicly readable" ON prize_pool FOR SELECT USING (true);


-- 6. ADD POSITIONS RLS (public read)
-- =====================================================
DROP POLICY IF EXISTS "Positions are publicly readable" ON positions;
CREATE POLICY "Positions are publicly readable"
ON positions FOR SELECT
USING (true);


-- 7. SUMMARY CHECK
-- =====================================================
SELECT 'trades' as table_name, COUNT(*) as count FROM trades
UNION ALL
SELECT 'positions', COUNT(*) FROM positions
UNION ALL
SELECT 'agents', COUNT(*) FROM agents;
