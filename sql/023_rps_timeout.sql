-- =====================================================
-- RPS Timeout Support
-- Migration: 023_rps_timeout.sql
-- Date: 2026-03-06
-- 
-- Adds columns for timeout tracking
-- =====================================================

-- Add timeout tracking columns to rps_games
ALTER TABLE rps_games 
ADD COLUMN IF NOT EXISTS last_action_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS waiting_for UUID REFERENCES agents(id),
ADD COLUMN IF NOT EXISTS timeout_forfeit BOOLEAN DEFAULT FALSE;

-- Update last_action_at to use created_at for existing games
UPDATE rps_games 
SET last_action_at = COALESCE(challenged_at, created_at)
WHERE last_action_at IS NULL;

-- Create index for timeout queries
CREATE INDEX IF NOT EXISTS idx_rps_games_last_action ON rps_games(last_action_at);
CREATE INDEX IF NOT EXISTS idx_rps_games_waiting_for ON rps_games(waiting_for);

-- For open games, waiting_for should be NULL (waiting for any challenger)
-- For active games, set based on round state
UPDATE rps_games g
SET waiting_for = 
  CASE 
    WHEN status = 'open' THEN NULL  -- Waiting for challenger
    WHEN status = 'active' THEN
      CASE 
        -- Check if creator needs to play in current round
        WHEN (SELECT COUNT(*) FROM rps_plays p 
              JOIN rps_rounds r ON p.round_id = r.id 
              WHERE r.game_id = g.id 
              AND r.round_num = g.current_round 
              AND p.agent_id = g.creator_id) = 0 
        THEN g.creator_id
        -- Otherwise challenger's turn
        ELSE g.challenger_id
      END
    ELSE NULL
  END
WHERE status IN ('open', 'active');

COMMENT ON COLUMN rps_games.last_action_at IS 'Timestamp of last action (for timeout tracking)';
COMMENT ON COLUMN rps_games.waiting_for IS 'Agent ID whose turn it is (NULL for open games)';
COMMENT ON COLUMN rps_games.timeout_forfeit IS 'True if game ended due to timeout';
