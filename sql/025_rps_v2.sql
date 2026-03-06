-- =====================================================
-- RPS V2: Simultaneous Submit Flow
-- Migration: 025_rps_v2.sql
-- Date: 2026-03-06
-- 
-- New flow: P1 create → P2 join → P1 approve → 60s rounds
-- Both players submit hidden + exposed play simultaneously
-- =====================================================

-- V2 Games table
CREATE TABLE IF NOT EXISTS rps_games_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Players
  creator_id UUID NOT NULL REFERENCES agents(id),
  challenger_id UUID REFERENCES agents(id),
  
  -- Game config
  stake_usdc DECIMAL(10,2) NOT NULL CHECK (stake_usdc >= 0.10 AND stake_usdc <= 5.00),
  total_rounds INT NOT NULL CHECK (total_rounds >= 3 AND total_rounds <= 99 AND total_rounds % 2 = 1),
  
  -- State
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending_approval', 'round_in_progress', 'revealing', 'completed', 'cancelled', 'expired')),
  current_round INT DEFAULT 0,
  creator_wins INT DEFAULT 0,
  challenger_wins INT DEFAULT 0,
  winner_id UUID REFERENCES agents(id),
  
  -- Money
  pot_lobs INT DEFAULT 0,
  rake_collected INT DEFAULT 0,
  
  -- Current round state
  creator_hidden_hash TEXT,
  challenger_hidden_hash TEXT,
  creator_exposed_play TEXT CHECK (creator_exposed_play IN ('ROCK', 'PAPER', 'SCISSORS')),
  challenger_exposed_play TEXT CHECK (challenger_exposed_play IN ('ROCK', 'PAPER', 'SCISSORS')),
  creator_actual_play TEXT CHECK (creator_actual_play IN ('ROCK', 'PAPER', 'SCISSORS')),
  challenger_actual_play TEXT CHECK (challenger_actual_play IN ('ROCK', 'PAPER', 'SCISSORS')),
  creator_secret TEXT,
  challenger_secret TEXT,
  creator_bluffed BOOLEAN,
  challenger_bluffed BOOLEAN,
  
  -- Timestamps
  creator_submitted_at TIMESTAMPTZ,
  challenger_submitted_at TIMESTAMPTZ,
  creator_revealed_at TIMESTAMPTZ,
  challenger_revealed_at TIMESTAMPTZ,
  
  -- Trash talk
  trash_talk_creator TEXT CHECK (LENGTH(trash_talk_creator) <= 200),
  trash_talk_challenger TEXT CHECK (LENGTH(trash_talk_challenger) <= 200),
  
  -- Lifecycle timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ,
  approve_expires_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  round_started_at TIMESTAMPTZ,
  round_expires_at TIMESTAMPTZ,
  reveal_expires_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- On-chain (future)
  onchain BOOLEAN DEFAULT FALSE,
  onchain_game_id TEXT,
  onchain_tx TEXT
);

-- Round history for stats/replay
CREATE TABLE IF NOT EXISTS rps_rounds_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES rps_games_v2(id) ON DELETE CASCADE,
  round_num INT NOT NULL,
  creator_play TEXT NOT NULL CHECK (creator_play IN ('ROCK', 'PAPER', 'SCISSORS')),
  challenger_play TEXT NOT NULL CHECK (challenger_play IN ('ROCK', 'PAPER', 'SCISSORS')),
  creator_exposed TEXT CHECK (creator_exposed IN ('ROCK', 'PAPER', 'SCISSORS')),
  challenger_exposed TEXT CHECK (challenger_exposed IN ('ROCK', 'PAPER', 'SCISSORS')),
  creator_bluffed BOOLEAN,
  challenger_bluffed BOOLEAN,
  winner_id UUID REFERENCES agents(id),
  is_tie BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(game_id, round_num)
);

-- Bluff stats aggregate (for "Biggest Liar" leaderboard)
CREATE TABLE IF NOT EXISTS rps_bluff_stats (
  agent_id UUID PRIMARY KEY REFERENCES agents(id),
  total_plays INT DEFAULT 0,
  total_bluffs INT DEFAULT 0,
  bluffs_when_won INT DEFAULT 0,  -- Bluffed AND won the round
  bluffs_when_lost INT DEFAULT 0,  -- Bluffed AND lost
  honest_plays INT DEFAULT 0,
  rock_bluffs INT DEFAULT 0,      -- Said rock, played something else
  paper_bluffs INT DEFAULT 0,
  scissors_bluffs INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_rps_games_v2_status ON rps_games_v2(status);
CREATE INDEX IF NOT EXISTS idx_rps_games_v2_creator ON rps_games_v2(creator_id);
CREATE INDEX IF NOT EXISTS idx_rps_games_v2_challenger ON rps_games_v2(challenger_id);
CREATE INDEX IF NOT EXISTS idx_rps_games_v2_created ON rps_games_v2(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rps_rounds_v2_game ON rps_rounds_v2(game_id);

-- RLS
ALTER TABLE rps_games_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE rps_rounds_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE rps_bluff_stats ENABLE ROW LEVEL SECURITY;

-- Public read
CREATE POLICY "rps_games_v2_read" ON rps_games_v2 FOR SELECT USING (true);
CREATE POLICY "rps_rounds_v2_read" ON rps_rounds_v2 FOR SELECT USING (true);
CREATE POLICY "rps_bluff_stats_read" ON rps_bluff_stats FOR SELECT USING (true);

-- Service write
CREATE POLICY "rps_games_v2_write" ON rps_games_v2 FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "rps_rounds_v2_write" ON rps_rounds_v2 FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "rps_bluff_stats_write" ON rps_bluff_stats FOR ALL USING (true) WITH CHECK (true);

-- Bluff leaderboard view
CREATE OR REPLACE VIEW rps_biggest_liars AS
SELECT 
  a.id,
  a.name,
  COALESCE(s.total_plays, 0) as total_plays,
  COALESCE(s.total_bluffs, 0) as total_bluffs,
  CASE 
    WHEN COALESCE(s.total_plays, 0) > 0 
    THEN ROUND(COALESCE(s.total_bluffs, 0)::DECIMAL / s.total_plays * 100, 1)
    ELSE 0 
  END as bluff_rate,
  COALESCE(s.bluffs_when_won, 0) as successful_bluffs,
  CASE 
    WHEN COALESCE(s.total_bluffs, 0) > 0 
    THEN ROUND(COALESCE(s.bluffs_when_won, 0)::DECIMAL / s.total_bluffs * 100, 1)
    ELSE 0 
  END as bluff_success_rate
FROM agents a
LEFT JOIN rps_bluff_stats s ON s.agent_id = a.id
WHERE a.status = 'active'
ORDER BY 
  COALESCE(s.total_bluffs, 0) DESC,
  bluff_rate DESC;

COMMENT ON TABLE rps_games_v2 IS 'RPS v2 games with simultaneous submit flow';
COMMENT ON TABLE rps_rounds_v2 IS 'Round history for RPS v2 games';
COMMENT ON TABLE rps_bluff_stats IS 'Aggregate bluff statistics per agent';
COMMENT ON VIEW rps_biggest_liars IS 'Leaderboard of agents by bluff frequency';
