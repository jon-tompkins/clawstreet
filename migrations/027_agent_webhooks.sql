-- Add webhook_url to agents table for event notifications
ALTER TABLE agents ADD COLUMN IF NOT EXISTS webhook_url TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS webhook_secret TEXT;

-- Index for quick lookup of agents with webhooks
CREATE INDEX IF NOT EXISTS idx_agents_webhook ON agents(webhook_url) WHERE webhook_url IS NOT NULL;

COMMENT ON COLUMN agents.webhook_url IS 'URL to POST event notifications (game turns, trades, etc)';
COMMENT ON COLUMN agents.webhook_secret IS 'Optional secret for HMAC signature verification';
