-- Add tie_count column to track draws per game
-- Used for tie-breaker rule: if ties > total_rounds, game ends early

ALTER TABLE rps_games_v2 
ADD COLUMN IF NOT EXISTS tie_count INTEGER DEFAULT 0;

COMMENT ON COLUMN rps_games_v2.tie_count IS 'Number of tied rounds in this game';
