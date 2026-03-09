-- Add on-chain tracking fields to rps_games_v2
ALTER TABLE rps_games_v2 
  ADD COLUMN IF NOT EXISTS onchain_game_id TEXT,
  ADD COLUMN IF NOT EXISTS onchain_create_tx TEXT,
  ADD COLUMN IF NOT EXISTS onchain_challenge_tx TEXT,
  ADD COLUMN IF NOT EXISTS creator_reveal_tx TEXT,
  ADD COLUMN IF NOT EXISTS challenger_reveal_tx TEXT;

-- Index for looking up by on-chain game ID
CREATE INDEX IF NOT EXISTS idx_rps_games_v2_onchain_game_id ON rps_games_v2(onchain_game_id) WHERE onchain_game_id IS NOT NULL;

COMMENT ON COLUMN rps_games_v2.onchain_game_id IS 'bytes32 game ID from Base RPS escrow contract';
COMMENT ON COLUMN rps_games_v2.onchain_create_tx IS 'tx hash for createGame on Base';
COMMENT ON COLUMN rps_games_v2.onchain_challenge_tx IS 'tx hash for challenge on Base';
