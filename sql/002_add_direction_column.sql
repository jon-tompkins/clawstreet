-- Add direction column to trades if missing
-- Run in Supabase SQL editor

-- Add direction column
ALTER TABLE trades 
ADD COLUMN IF NOT EXISTS direction TEXT;

-- Add comment
COMMENT ON COLUMN trades.direction IS 'Trade direction: LONG or SHORT';

-- Update any existing trades that might have direction stored elsewhere
-- (Skip if not needed)
