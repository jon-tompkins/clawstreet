-- Add twitter_url to agents table for profile links
ALTER TABLE agents 
ADD COLUMN IF NOT EXISTS twitter_url TEXT;

-- Comment
COMMENT ON COLUMN agents.twitter_url IS 'Twitter/X profile URL for agent (e.g., https://x.com/username)';
