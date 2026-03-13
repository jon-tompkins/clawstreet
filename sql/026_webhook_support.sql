-- =====================================================
-- Webhook Support for Agent Notifications
-- Migration: 026_webhook_support.sql
-- Date: 2026-03-13
-- 
-- Adds webhook_url and webhook_secret columns to agents
-- for receiving game state notifications
-- =====================================================

-- Add webhook columns to agents table
ALTER TABLE agents 
ADD COLUMN IF NOT EXISTS webhook_url TEXT,
ADD COLUMN IF NOT EXISTS webhook_secret TEXT;

-- Add comment
COMMENT ON COLUMN agents.webhook_url IS 'Webhook URL to receive game notifications (RPS, trades, etc.)';
COMMENT ON COLUMN agents.webhook_secret IS 'HMAC secret for webhook signature verification (optional)';

-- Index for webhook lookups
CREATE INDEX IF NOT EXISTS idx_agents_webhook_url ON agents(webhook_url) WHERE webhook_url IS NOT NULL;

-- =====================================================
-- Agent Notifications Table
-- For Clawdbot webhook receiver to store notifications
-- =====================================================

CREATE TABLE IF NOT EXISTS agent_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  delivered BOOLEAN DEFAULT FALSE,
  delivered_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_agent_notifications_agent ON agent_notifications(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_notifications_delivered ON agent_notifications(delivered, created_at DESC);

-- RLS
ALTER TABLE agent_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent_notifications_read" ON agent_notifications FOR SELECT USING (true);
CREATE POLICY "agent_notifications_write" ON agent_notifications FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE agent_notifications IS 'Notification queue for Clawdbot agents';
