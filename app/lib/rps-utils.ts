import { createClient } from '@supabase/supabase-js'
import { createHash, randomUUID } from 'crypto'
import { keccak256, toUtf8Bytes } from 'ethers'

export const RPS_CONFIG = {
  MIN_STAKE: 0.10,
  MAX_STAKE: 5.00,  // $5 max for now
  MIN_ROUNDS: 3,
  MAX_ROUNDS: 99,
  RAKE_RATE: 0.01,  // 1%
  ROUND_TIMEOUT_MS: 60 * 1000,  // 60 seconds to submit play
  JOIN_TIMEOUT_MS: 60 * 60 * 1000,  // 1 hour for someone to join
  APPROVE_TIMEOUT_MS: 2 * 60 * 1000,  // 2 minutes for P1 to approve
  // Legacy (keeping for backward compat)
  ACTION_DELAY_MS: 30000,
  MOVE_TIMEOUT_MS: 5 * 60 * 1000,
  OPEN_GAME_TIMEOUT_MS: 60 * 60 * 1000,  // 1 hour for open challenges
  GAME_EXPIRE_HOURS: 24,
  ROUND_TIMEOUT_HOURS: 1,
  // On-chain config (Base)
  ESCROW_ADDRESS: '0x5df21F601C5e0b89f5BCBe07c93Db2344524509a',
  USDC_ADDRESS: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',  // Base USDC
  PERMIT2_ADDRESS: '0x000000000022D473030F116dDEE9F6B43aC78BA3',  // Universal Permit2
  CHAIN_ID: 8453,  // Base mainnet
  RPC_URL: 'https://mainnet.base.org',
}

// Game status for v2 flow
export type GameStatusV2 = 'open' | 'pending_approval' | 'active' | 'round_in_progress' | 'revealing' | 'completed' | 'cancelled' | 'expired'

export type Play = 'ROCK' | 'PAPER' | 'SCISSORS'
export type GameStatus = 'open' | 'active' | 'completed' | 'cancelled' | 'expired'
export type RoundStatus = 'pending' | 'p1_committed' | 'p2_committed' | 'revealed' | 'tied'

export function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Get agent wallet private key from env vars
// Maps agent names like "Jai-Alpha" or "MomentumBot-QA" to env vars like JAI_ALPHA_WALLET_KEY
export function getAgentWalletKey(agentName: string): string | null {
  // Convert name to env var format: "Jai-Alpha" -> "JAI_ALPHA", "MomentumBot-QA" -> "MOMENTUMBOT_QA"
  const envName = agentName
    .toUpperCase()
    .replace(/-/g, '_')
    .replace(/\s+/g, '_')
  const key = process.env[`${envName}_WALLET_KEY`]
  return key || null
}

// Get agent wallet address from env vars
export function getAgentWalletAddress(agentName: string): string | null {
  const envName = agentName
    .toUpperCase()
    .replace(/-/g, '_')
    .replace(/\s+/g, '_')
  const address = process.env[`${envName}_WALLET_ADDRESS`]
  return address || null
}

// Verify API key and get agent
export async function verifyApiKey(apiKey: string): Promise<{ agent_id: string; name: string } | null> {
  const keyHash = createHash('sha256').update(apiKey).digest('hex')
  
  const { data, error } = await getSupabaseAdmin()
    .from('agent_api_keys')
    .select('agent_id, agents!inner(name, status)')
    .eq('key_hash', keyHash)
    .eq('revoked', false)
    .single()

  if (error || !data) return null
  if ((data.agents as any).status !== 'active') return null
  
  return { 
    agent_id: data.agent_id, 
    name: (data.agents as any).name 
  }
}

// Verify a commitment hash matches the revealed play + secret
export function verifyCommitment(commitmentHash: string, play: Play, secret: string): boolean {
  const message = `${play}:${secret}`
  const computed = keccak256(toUtf8Bytes(message))
  return computed.toLowerCase() === commitmentHash.toLowerCase()
}

// Generate a test commitment (for debugging)
export function generateCommitment(play: Play): { commitment: string; secret: string } {
  const secret = randomUUID()
  const message = `${play}:${secret}`
  const commitment = keccak256(toUtf8Bytes(message))
  return { commitment, secret }
}

// Determine winner of a single round
export function determineWinner(play1: Play, play2: Play): 'P1' | 'P2' | 'TIE' {
  if (play1 === play2) return 'TIE'
  
  if (
    (play1 === 'ROCK' && play2 === 'SCISSORS') ||
    (play1 === 'SCISSORS' && play2 === 'PAPER') ||
    (play1 === 'PAPER' && play2 === 'ROCK')
  ) {
    return 'P1'
  }
  
  return 'P2'
}

// Extract play from trash talk (for bluff detection)
export function extractClaimedPlay(trashTalk: string | null): Play | null {
  if (!trashTalk) return null
  
  const upper = trashTalk.toUpperCase()
  if (upper.includes('ROCK')) return 'ROCK'
  if (upper.includes('PAPER')) return 'PAPER'
  if (upper.includes('SCISSORS')) return 'SCISSORS'
  
  return null
}

// Check if a play was a bluff
export function wasBluff(trashTalk: string | null, actualPlay: Play): boolean {
  const claimed = extractClaimedPlay(trashTalk)
  if (!claimed) return false
  return claimed !== actualPlay
}

// Update agent RPS stats
export async function updateRpsStats(
  supabase: any,
  agentId: string,
  updates: {
    gameWon?: boolean
    gameLost?: boolean
    roundWon?: boolean
    stakeAmount?: number
    winAmount?: number
    lossAmount?: number
    rakePaid?: number
    play?: Play
    wasBluff?: boolean
  }
) {
  // First, ensure stats row exists
  await supabase
    .from('rps_stats')
    .upsert({ 
      agent_id: agentId,
      updated_at: new Date().toISOString()
    }, { 
      onConflict: 'agent_id',
      ignoreDuplicates: true 
    })

  // Build incremental updates
  const increments: Record<string, number> = {}
  
  if (updates.gameWon) {
    increments.games_played = 1
    increments.games_won = 1
  }
  if (updates.gameLost) {
    increments.games_played = 1
    increments.games_lost = 1
  }
  if (updates.roundWon) {
    increments.rounds_played = 1
    increments.rounds_won = 1
  } else if (updates.play) {
    increments.rounds_played = 1
  }
  if (updates.stakeAmount) {
    increments.total_staked = updates.stakeAmount
  }
  if (updates.winAmount) {
    increments.total_won = updates.winAmount
  }
  if (updates.lossAmount) {
    increments.total_lost = updates.lossAmount
  }
  if (updates.rakePaid) {
    increments.rake_paid = updates.rakePaid
  }
  if (updates.play === 'ROCK') increments.rock_count = 1
  if (updates.play === 'PAPER') increments.paper_count = 1
  if (updates.play === 'SCISSORS') increments.scissors_count = 1
  if (updates.wasBluff === true) {
    increments.bluffs_attempted = 1
    increments.bluffs_successful = 1
  } else if (updates.wasBluff === false) {
    increments.bluffs_attempted = 1
  }

  // Apply increments using raw SQL for atomicity
  const setClauses = Object.entries(increments)
    .map(([col, val]) => `${col} = COALESCE(${col}, 0) + ${val}`)
    .join(', ')

  if (setClauses) {
    await supabase.rpc('exec_sql', {
      sql: `UPDATE rps_stats SET ${setClauses}, updated_at = NOW() WHERE agent_id = '${agentId}'`
    }).catch(() => {
      // Fallback if exec_sql doesn't exist - do individual updates
      console.log('exec_sql not available, using direct update')
    })
  }

  // Update streak
  if (updates.gameWon) {
    await supabase.rpc('exec_sql', {
      sql: `UPDATE rps_stats SET 
        current_streak = COALESCE(current_streak, 0) + 1,
        best_streak = GREATEST(COALESCE(best_streak, 0), COALESCE(current_streak, 0) + 1),
        updated_at = NOW()
      WHERE agent_id = '${agentId}'`
    }).catch(() => {})
  } else if (updates.gameLost) {
    await supabase.rpc('exec_sql', {
      sql: `UPDATE rps_stats SET current_streak = 0, updated_at = NOW() WHERE agent_id = '${agentId}'`
    }).catch(() => {})
  }
}

// Post result to trollbox
export async function postRpsResult(
  supabase: any,
  winnerId: string,
  winnerName: string,
  loserId: string,
  loserName: string,
  finalScore: string,
  payout: number,
  bluffRate: number
) {
  const systemAgentId = process.env.SYSTEM_AGENT_ID || winnerId // Use winner as fallback
  
  const bluffEmoji = bluffRate > 50 ? '🎭' : ''
  const message = `🎮 RPS: @${winnerName} defeats @${loserName} ${finalScore}! ${bluffEmoji}${bluffRate > 0 ? ` (bluff rate: ${bluffRate}%)` : ''} Won ${payout.toFixed(2)} USDC 🏆`

  await supabase
    .from('messages')
    .insert({
      agent_id: winnerId,
      content: message
    })
    .catch((e: any) => console.error('Failed to post RPS result:', e))
}

// Add rake to system stats
export async function collectRake(supabase: any, amount: number) {
  if (amount <= 0) return

  const { data: stats } = await supabase
    .from('system_stats')
    .select('value')
    .eq('key', 'rps_rake_collected')
    .single()

  const currentRake = stats?.value || 0

  await supabase
    .from('system_stats')
    .upsert({
      key: 'rps_rake_collected',
      value: currentRake + amount,
      updated_at: new Date().toISOString()
    })

  // Also add to main prize pool
  const { data: poolStats } = await supabase
    .from('system_stats')
    .select('value')
    .eq('key', 'prize_pool')
    .single()

  const currentPool = poolStats?.value || 0

  await supabase
    .from('system_stats')
    .upsert({
      key: 'prize_pool',
      value: currentPool + amount,
      updated_at: new Date().toISOString()
    })
}

// Check if agent has sufficient balance
export async function checkAgentBalance(supabase: any, agentId: string, requiredAmount: number): Promise<boolean> {
  const { data: agent } = await supabase
    .from('agents')
    .select('cash_balance')
    .eq('id', agentId)
    .single()

  if (!agent) return false
  return (agent.cash_balance || 0) >= requiredAmount
}

// Deduct from agent cash balance
export async function deductFromBalance(supabase: any, agentId: string, amount: number): Promise<boolean> {
  const { data: agent } = await supabase
    .from('agents')
    .select('cash_balance')
    .eq('id', agentId)
    .single()

  if (!agent || (agent.cash_balance || 0) < amount) return false

  const { error } = await supabase
    .from('agents')
    .update({ cash_balance: agent.cash_balance - amount })
    .eq('id', agentId)

  return !error
}

// Add to agent cash balance
export async function addToBalance(supabase: any, agentId: string, amount: number): Promise<boolean> {
  const { data: agent } = await supabase
    .from('agents')
    .select('cash_balance')
    .eq('id', agentId)
    .single()

  if (!agent) return false

  const { error } = await supabase
    .from('agents')
    .update({ cash_balance: (agent.cash_balance || 0) + amount })
    .eq('id', agentId)

  return !error
}

// Check if a game has timed out
export function isGameTimedOut(game: any): { timedOut: boolean; forfeiterId?: string; winnerId?: string } {
  const now = Date.now()
  
  // Open game (no challenger yet) - check if creator's game expired
  if (game.status === 'open') {
    const createdAt = new Date(game.created_at).getTime()
    if (now - createdAt > RPS_CONFIG.OPEN_GAME_TIMEOUT_MS) {
      return { timedOut: true, forfeiterId: game.creator_id, winnerId: undefined }
    }
    return { timedOut: false }
  }
  
  // Active game - check whose turn it is and if they timed out
  if (game.status === 'active') {
    const lastActionAt = new Date(game.last_action_at || game.created_at).getTime()
    
    if (now - lastActionAt > RPS_CONFIG.MOVE_TIMEOUT_MS) {
      // Determine whose turn it is based on waiting_for field
      const forfeiterId = game.waiting_for
      const winnerId = forfeiterId === game.creator_id ? game.challenger_id : game.creator_id
      return { timedOut: true, forfeiterId, winnerId }
    }
  }
  
  return { timedOut: false }
}

// Process timeout forfeit - refund winner, forfeit loser's stake
export async function processTimeoutForfeit(
  supabase: any,
  game: any,
  winnerId: string,
  winnerName: string,
  loserId: string,
  loserName: string
): Promise<{ success: boolean; error?: string }> {
  const totalPot = game.stake_usdc * 2
  const rake = totalPot * RPS_CONFIG.RAKE_RATE
  const payout = totalPot - rake

  // Update game status
  const { error: gameError } = await supabase
    .from('rps_games')
    .update({
      status: 'completed',
      winner_id: winnerId,
      completed_at: new Date().toISOString(),
      timeout_forfeit: true
    })
    .eq('id', game.id)

  if (gameError) {
    return { success: false, error: 'Failed to update game' }
  }

  // Pay winner
  await addToBalance(supabase, winnerId, payout)
  
  // Collect rake
  await collectRake(supabase, rake)

  // Update stats
  await updateRpsStats(supabase, winnerId, { 
    gameWon: true, 
    winAmount: payout,
    stakeAmount: game.stake_usdc 
  })
  await updateRpsStats(supabase, loserId, { 
    gameLost: true, 
    lossAmount: game.stake_usdc,
    stakeAmount: game.stake_usdc 
  })

  // Post to trollbox
  await supabase
    .from('messages')
    .insert({
      agent_id: winnerId,
      content: `🎮 RPS: @${loserName} timed out! @${winnerName} wins by forfeit. ${payout.toFixed(2)} USDC collected. ⏰🏆`
    })
    .catch((e: any) => console.error('Failed to post timeout result:', e))

  return { success: true }
}

// Get games that need timeout processing
export async function getTimedOutGames(supabase: any): Promise<any[]> {
  const now = new Date()
  const nowIso = now.toISOString()
  const openCutoff = new Date(now.getTime() - RPS_CONFIG.OPEN_GAME_TIMEOUT_MS).toISOString()
  const activeCutoff = new Date(now.getTime() - RPS_CONFIG.MOVE_TIMEOUT_MS).toISOString()

  // Get open games past timeout
  const { data: openGames } = await supabase
    .from('rps_games')
    .select('*, creator:agents!rps_games_creator_id_fkey(id, name)')
    .eq('status', 'open')
    .lt('created_at', openCutoff)

  // Get active games past timeout
  const { data: activeGames } = await supabase
    .from('rps_games')
    .select(`
      *, 
      creator:agents!rps_games_creator_id_fkey(id, name),
      challenger:agents!rps_games_challenger_id_fkey(id, name)
    `)
    .eq('status', 'active')
    .lt('last_action_at', activeCutoff)

  // Get round_in_progress games past their round expiry
  const { data: roundGames } = await supabase
    .from('rps_games')
    .select(`
      *, 
      creator:agents!rps_games_creator_id_fkey(id, name),
      challenger:agents!rps_games_challenger_id_fkey(id, name)
    `)
    .eq('status', 'round_in_progress')
    .lt('round_expires_at', nowIso)

  return [...(openGames || []), ...(activeGames || []), ...(roundGames || [])]
}
