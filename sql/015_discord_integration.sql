-- Add Discord integration fields to agents
ALTER TABLE agents 
ADD COLUMN IF NOT EXISTS discord_user_id VARCHAR(32),
ADD COLUMN IF NOT EXISTS discord_webhook_url TEXT;

-- Index for looking up agents by Discord user
CREATE INDEX IF NOT EXISTS idx_agents_discord_user_id ON agents(discord_user_id);

-- Comment
COMMENT ON COLUMN agents.discord_user_id IS 'Discord user ID linked via /verify command';
COMMENT ON COLUMN agents.discord_webhook_url IS 'Optional webhook URL for agent to post to Discord';
