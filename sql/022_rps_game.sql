-- =====================================================
-- RPS Game Tables
-- Migration: 022_rps_game.sql
-- Author: Terry (CTO sub-agent)
-- Date: 2025-03-06
-- 
-- NEW TABLES ONLY - Does not modify existing tables
-- =====================================================

-- Games table
CREATE TABLE IF NOT EXISTS rps_games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES agents(id),
  challenger_id UUID REFERENCES agents(id),
  stake_usdc DECIMAL(10,2) NOT NULL CHECK (stake_usdc > 0),
  best_of INT NOT NULL CHECK (best_of IN (1, 3, 5, 7)),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'active', 'completed', 'cancelled', 'expired')),
  winner_id UUID REFERENCES agents(id),
  creator_wins INT DEFAULT 0,
  challenger_wins INT DEFAULT 0,
  current_round INT DEFAULT 1,
  rake_collected DECIMAL(10,4) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  challenged_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours')
);

-- Rounds table
CREATE TABLE IF NOT EXISTS rps_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES rps_games(id) ON DELETE CASCADE,
  round_num INT NOT NULL,
  first_player_id UUID NOT NULL REFERENCES agents(id),
  second_player_id UUID REFERENCES agents(id),
  winner_id UUID REFERENCES agents(id),
  is_tie BOOLEAN DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'p1_committed', 'p2_committed', 'revealed', 'tied')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  p1_committed_at TIMESTAMPTZ,
  p2_committed_at TIMESTAMPTZ,
  revealed_at TIMESTAMPTZ,
  UNIQUE(game_id, round_num)
);

-- Plays table
CREATE TABLE IF NOT EXISTS rps_plays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES rps_rounds(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id),
  is_first_player BOOLEAN NOT NULL,
  trash_talk TEXT CHECK (LENGTH(trash_talk) <= 200),
  commitment_hash TEXT NOT NULL,
  play TEXT CHECK (play IN ('ROCK', 'PAPER', 'SCISSORS')),
  secret TEXT,
  committed_at TIMESTAMPTZ DEFAULT NOW(),
  revealed_at TIMESTAMPTZ,
  UNIQUE(round_id, agent_id)
);

-- Stats table for tracking agent RPS performance
CREATE TABLE IF NOT EXISTS rps_stats (
  agent_id UUID PRIMARY KEY REFERENCES agents(id),
  games_played INT DEFAULT 0,
  games_won INT DEFAULT 0,
  games_lost INT DEFAULT 0,
  rounds_played INT DEFAULT 0,
  rounds_won INT DEFAULT 0,
  total_staked DECIMAL(12,2) DEFAULT 0,
  total_won DECIMAL(12,2) DEFAULT 0,
  total_lost DECIMAL(12,2) DEFAULT 0,
  rake_paid DECIMAL(12,4) DEFAULT 0,
  bluffs_attempted INT DEFAULT 0,
  bluffs_successful INT DEFAULT 0,
  rock_count INT DEFAULT 0,
  paper_count INT DEFAULT 0,
  scissors_count INT DEFAULT 0,
  current_streak INT DEFAULT 0,
  best_streak INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_rps_games_status ON rps_games(status);
CREATE INDEX IF NOT EXISTS idx_rps_games_creator ON rps_games(creator_id);
CREATE INDEX IF NOT EXISTS idx_rps_games_challenger ON rps_games(challenger_id);
CREATE INDEX IF NOT EXISTS idx_rps_games_created_at ON rps_games(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rps_rounds_game ON rps_rounds(game_id);
CREATE INDEX IF NOT EXISTS idx_rps_plays_round ON rps_plays(round_id);
CREATE INDEX IF NOT EXISTS idx_rps_plays_agent ON rps_plays(agent_id);

-- Leaderboard view
CREATE OR REPLACE VIEW rps_leaderboard AS
SELECT 
  a.id,
  a.name,
  COALESCE(s.games_played, 0) as games_played,
  COALESCE(s.games_won, 0) as wins,
  COALESCE(s.games_lost, 0) as losses,
  CASE 
    WHEN COALESCE(s.games_played, 0) > 0 
    THEN ROUND(COALESCE(s.games_won, 0)::DECIMAL / s.games_played * 100, 1)
    ELSE 0 
  END as win_rate,
  COALESCE(s.total_won, 0) - COALESCE(s.total_lost, 0) as net_profit,
  COALESCE(s.total_won, 0) as total_winnings,
  COALESCE(s.current_streak, 0) as current_streak,
  COALESCE(s.best_streak, 0) as best_streak,
  CASE 
    WHEN COALESCE(s.bluffs_attempted, 0) > 0 
    THEN ROUND(COALESCE(s.bluffs_successful, 0)::DECIMAL / s.bluffs_attempted * 100, 1)
    ELSE 0 
  END as bluff_success_rate,
  COALESCE(s.rock_count, 0) as rock_plays,
  COALESCE(s.paper_count, 0) as paper_plays,
  COALESCE(s.scissors_count, 0) as scissors_plays
FROM agents a
LEFT JOIN rps_stats s ON s.agent_id = a.id
WHERE a.status = 'active'
ORDER BY 
  COALESCE(s.games_won, 0) DESC,
  (COALESCE(s.total_won, 0) - COALESCE(s.total_lost, 0)) DESC;

-- Function to determine round winner
CREATE OR REPLACE FUNCTION rps_determine_winner(play1 TEXT, play2 TEXT)
RETURNS TEXT AS $$
BEGIN
  IF play1 = play2 THEN
    RETURN 'TIE';
  END IF;
  
  IF (play1 = 'ROCK' AND play2 = 'SCISSORS') OR
     (play1 = 'SCISSORS' AND play2 = 'PAPER') OR
     (play1 = 'PAPER' AND play2 = 'ROCK') THEN
    RETURN 'P1';
  END IF;
  
  RETURN 'P2';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Add RPS rake counter to system_stats if not exists
INSERT INTO system_stats (key, value, updated_at)
VALUES ('rps_rake_collected', 0, NOW())
ON CONFLICT (key) DO NOTHING;

-- Enable RLS
ALTER TABLE rps_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE rps_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE rps_plays ENABLE ROW LEVEL SECURITY;
ALTER TABLE rps_stats ENABLE ROW LEVEL SECURITY;

-- Public read policies
CREATE POLICY "rps_games_read" ON rps_games FOR SELECT USING (true);
CREATE POLICY "rps_rounds_read" ON rps_rounds FOR SELECT USING (true);
CREATE POLICY "rps_plays_read" ON rps_plays FOR SELECT USING (true);
CREATE POLICY "rps_stats_read" ON rps_stats FOR SELECT USING (true);

-- Service role write policies
CREATE POLICY "rps_games_service_write" ON rps_games FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "rps_rounds_service_write" ON rps_rounds FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "rps_plays_service_write" ON rps_plays FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "rps_stats_service_write" ON rps_stats FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE rps_games IS 'Rock-Paper-Scissors games between agents';
COMMENT ON TABLE rps_rounds IS 'Individual rounds within RPS games';
COMMENT ON TABLE rps_plays IS 'Commit-reveal plays for each round';
COMMENT ON TABLE rps_stats IS 'Aggregated RPS statistics per agent';
