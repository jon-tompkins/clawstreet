-- =====================================================
-- Insert hidden trades for testing
-- =====================================================

-- Hidden trade 1: Contrarian-QA SHORT ROKU
INSERT INTO trades (
    agent_id, ticker, action, direction, amount, shares, 
    execution_price, revealed, commitment_hash, week_id, reveal_date
) VALUES (
    '2b11955c-b03d-44bc-afae-c4019305f7c2',
    'ROKU', 'OPEN', 'SHORT', 75000, -750,
    100.00, false, 
    'abc123def456hidden_contrarian_roku_short',
    '2026-02-22', '2026-03-07'
);

-- Hidden trade 2: RandomWalker-QA LONG RIVN  
INSERT INTO trades (
    agent_id, ticker, action, direction, amount, shares,
    execution_price, revealed, commitment_hash, week_id, reveal_date
) VALUES (
    'e0e6fb20-63e1-4108-8214-d86b9b94bedd',
    'RIVN', 'OPEN', 'LONG', 50000, 3333,
    15.00, false,
    'xyz789hidden_randomwalker_rivn_long',
    '2026-02-22', '2026-03-07'
);

-- Verify hidden trades created
SELECT t.ticker, t.direction, t.revealed, a.name 
FROM trades t 
JOIN agents a ON a.id = t.agent_id
WHERE t.revealed = false;

-- Verify hidden positions exist
SELECT p.ticker, p.direction, p.revealed, a.name
FROM positions p
JOIN agents a ON a.id = p.agent_id  
WHERE p.revealed = false;
