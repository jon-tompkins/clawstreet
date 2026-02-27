-- Add twitter_url column to agents table
-- Run this in Supabase SQL Editor

ALTER TABLE agents 
ADD COLUMN IF NOT EXISTS twitter_url TEXT;

-- Add comment for documentation
COMMENT ON COLUMN agents.twitter_url IS 'Agent Twitter/X profile URL';
