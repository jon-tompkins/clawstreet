-- Migration: Position sync via triggers
-- Ensures positions table always reflects trade state
-- Positions become a derived consequence of trades

-- First, ensure positions table has all required columns
ALTER TABLE positions ADD COLUMN IF NOT EXISTS shares DECIMAL(15,4) NOT NULL DEFAULT 0;
ALTER TABLE positions ADD COLUMN IF NOT EXISTS last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Drop existing trigger if any
DROP TRIGGER IF EXISTS sync_position_on_trade ON trades;
DROP FUNCTION IF EXISTS sync_position_from_trade();

-- Create the sync function
CREATE OR REPLACE FUNCTION sync_position_from_trade()
RETURNS TRIGGER AS $$
DECLARE
  existing_position RECORD;
  new_total_working NUMERIC;
BEGIN
  -- Only process revealed trades (for commit-reveal) or immediate trades
  -- Skip if ticker is null (committed but not revealed)
  IF NEW.ticker IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.action = 'OPEN' THEN
    -- Check if position already exists (shouldn't, but be safe)
    SELECT * INTO existing_position 
    FROM positions 
    WHERE agent_id = NEW.agent_id AND ticker = NEW.ticker;
    
    IF NOT FOUND THEN
      -- Create new position
      INSERT INTO positions (
        agent_id,
        ticker,
        direction,
        shares,
        entry_price,
        amount_points,
        last_updated
      ) VALUES (
        NEW.agent_id,
        NEW.ticker,
        NEW.direction,
        NEW.shares,
        NEW.execution_price,
        NEW.amount,
        NOW()
      );
    ELSE
      -- Position exists - update it (averaging in)
      UPDATE positions SET
        shares = existing_position.shares + NEW.shares,
        amount_points = existing_position.amount_points + NEW.amount,
        -- Weighted average entry price
        entry_price = (
          (existing_position.amount_points * existing_position.entry_price) + 
          (NEW.amount * NEW.execution_price)
        ) / (existing_position.amount_points + NEW.amount),
        last_updated = NOW()
      WHERE id = existing_position.id;
    END IF;
    
  ELSIF NEW.action = 'CLOSE' THEN
    -- Delete the position
    DELETE FROM positions 
    WHERE agent_id = NEW.agent_id AND ticker = NEW.ticker;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger that fires AFTER trade insert
-- Using AFTER so the trade is committed first
CREATE TRIGGER sync_position_on_trade
  AFTER INSERT ON trades
  FOR EACH ROW
  EXECUTE FUNCTION sync_position_from_trade();

-- Add index for faster position lookups during trigger
CREATE INDEX IF NOT EXISTS idx_positions_agent_ticker 
  ON positions(agent_id, ticker);

-- Verify: Add comment
COMMENT ON FUNCTION sync_position_from_trade() IS 
  'Automatically syncs positions table when trades are inserted. OPEN creates/updates position, CLOSE deletes it.';

COMMENT ON TRIGGER sync_position_on_trade ON trades IS
  'Ensures positions table stays in sync with trades - DB-level consistency guarantee.';
