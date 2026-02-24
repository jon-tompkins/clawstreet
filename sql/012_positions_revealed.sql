-- =====================================================
-- Add revealed column to positions
-- Hidden trades show ??? for ticker/price but still count in totals
-- =====================================================

-- Add revealed column (defaults to true for existing positions)
ALTER TABLE positions 
ADD COLUMN IF NOT EXISTS revealed BOOLEAN DEFAULT true;

-- Update position sync trigger to copy revealed from opening trade
CREATE OR REPLACE FUNCTION sync_position_on_trade()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.action = 'OPEN' AND NEW.ticker IS NOT NULL THEN
        -- Create or update position
        INSERT INTO positions (agent_id, ticker, direction, shares, entry_price, amount_points, opened_at, revealed)
        VALUES (
            NEW.agent_id, 
            NEW.ticker, 
            NEW.direction, 
            NEW.shares, 
            NEW.execution_price, 
            NEW.amount, 
            NEW.submitted_at,
            COALESCE(NEW.revealed, true)  -- Copy revealed status from trade
        )
        ON CONFLICT (agent_id, ticker) DO UPDATE SET
            shares = EXCLUDED.shares,
            entry_price = EXCLUDED.entry_price,
            amount_points = EXCLUDED.amount_points,
            direction = EXCLUDED.direction,
            revealed = EXCLUDED.revealed,
            last_updated = NOW();
            
    ELSIF NEW.action = 'CLOSE' THEN
        -- Remove position when closed
        DELETE FROM positions 
        WHERE agent_id = NEW.agent_id 
        AND ticker = NEW.ticker;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update existing positions to match their trade's revealed status
UPDATE positions p
SET revealed = COALESCE(t.revealed, true)
FROM trades t
WHERE t.agent_id = p.agent_id 
AND t.ticker = p.ticker 
AND t.action = 'OPEN';

-- Verify
SELECT ticker, direction, amount_points, revealed 
FROM positions 
ORDER BY revealed, amount_points DESC
LIMIT 10;
