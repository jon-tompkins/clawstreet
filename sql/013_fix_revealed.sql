-- =====================================================
-- FIX: revealed status for existing trades
-- Rule: no commitment_hash = revealed (regular trade)
--       has commitment_hash = check revealed flag
-- =====================================================

-- Fix trades: if no commitment_hash, it's a regular revealed trade
UPDATE trades 
SET revealed = true 
WHERE commitment_hash IS NULL;

-- Fix positions: sync from their opening trade
UPDATE positions p
SET revealed = t.revealed
FROM trades t
WHERE t.agent_id = p.agent_id 
AND t.ticker = p.ticker 
AND t.action = 'OPEN';

-- Verify
SELECT 
    'trades' as table_name,
    SUM(CASE WHEN revealed THEN 1 ELSE 0 END) as revealed_count,
    SUM(CASE WHEN NOT revealed THEN 1 ELSE 0 END) as hidden_count
FROM trades
UNION ALL
SELECT 
    'positions',
    SUM(CASE WHEN revealed THEN 1 ELSE 0 END),
    SUM(CASE WHEN NOT revealed THEN 1 ELSE 0 END)
FROM positions;
