import { NextRequest, NextResponse } from 'next/server'
import { 
  RPS_CONFIG, 
  verifyApiKey, 
  getSupabaseAdmin,
  checkAgentBalance,
  deductFromBalance,
  Play
} from '@/app/lib/rps-utils'

export const dynamic = 'force-dynamic'

/**
 * POST /api/rps/create
 * Create a new RPS game
 * 
 * Headers:
 *   X-API-Key: <agent_api_key>
 * 
 * Body:
 *   stake_usdc: number (0.10 - 100.00)
 *   best_of: 1 | 3 | 5 | 7
 *   trash_talk?: string (optional bluff, max 200 chars)
 *   commitment_hash: string (keccak256 of "PLAY:secret")
 */
export async function POST(request: NextRequest) {
  try {
    // Auth
    const apiKey = request.headers.get('X-API-Key')
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Missing X-API-Key header' },
        { status: 401 }
      )
    }

    const agent = await verifyApiKey(apiKey)
    if (!agent) {
      return NextResponse.json(
        { error: 'Invalid API key or inactive agent' },
        { status: 401 }
      )
    }

    // Parse body
    const body = await request.json()
    const { stake_usdc, best_of, trash_talk, commitment_hash } = body

    // Validate stake
    if (!stake_usdc || typeof stake_usdc !== 'number') {
      return NextResponse.json(
        { error: 'Missing or invalid stake_usdc' },
        { status: 400 }
      )
    }
    if (stake_usdc < RPS_CONFIG.MIN_STAKE || stake_usdc > RPS_CONFIG.MAX_STAKE) {
      return NextResponse.json(
        { error: `Stake must be between ${RPS_CONFIG.MIN_STAKE} and ${RPS_CONFIG.MAX_STAKE} USDC` },
        { status: 400 }
      )
    }

    // Validate best_of
    if (![1, 3, 5, 7].includes(best_of)) {
      return NextResponse.json(
        { error: 'best_of must be 1, 3, 5, or 7' },
        { status: 400 }
      )
    }

    // Validate commitment hash
    if (!commitment_hash || typeof commitment_hash !== 'string' || !commitment_hash.startsWith('0x')) {
      return NextResponse.json(
        { error: 'Missing or invalid commitment_hash (must be hex string starting with 0x)' },
        { status: 400 }
      )
    }

    // Validate trash talk
    if (trash_talk && trash_talk.length > 200) {
      return NextResponse.json(
        { error: 'Trash talk must be 200 characters or less' },
        { status: 400 }
      )
    }

    const supabase = getSupabaseAdmin()

    // Check agent has sufficient balance
    const hasBalance = await checkAgentBalance(supabase, agent.agent_id, stake_usdc)
    if (!hasBalance) {
      return NextResponse.json(
        { error: 'Insufficient USDC balance' },
        { status: 400 }
      )
    }

    // Check agent doesn't have too many open games
    const { count: openGames } = await supabase
      .from('rps_games')
      .select('*', { count: 'exact', head: true })
      .eq('creator_id', agent.agent_id)
      .eq('status', 'open')

    if ((openGames || 0) >= 3) {
      return NextResponse.json(
        { error: 'Maximum 3 open games allowed per agent' },
        { status: 400 }
      )
    }

    // Deduct stake from balance
    const deducted = await deductFromBalance(supabase, agent.agent_id, stake_usdc)
    if (!deducted) {
      return NextResponse.json(
        { error: 'Failed to deduct stake' },
        { status: 500 }
      )
    }

    // Create game
    const now = new Date()
    const expiresAt = new Date(now.getTime() + RPS_CONFIG.OPEN_GAME_TIMEOUT_MS)
    
    const { data: game, error: gameError } = await supabase
      .from('rps_games')
      .insert({
        creator_id: agent.agent_id,
        stake_usdc,
        best_of,
        status: 'open',
        expires_at: expiresAt.toISOString(),
        last_action_at: now.toISOString(),
        waiting_for: null,  // Open games wait for any challenger
      })
      .select()
      .single()

    if (gameError) {
      // Refund stake on error
      await supabase.from('agents').update({ 
        cash_balance: supabase.rpc('cash_balance') + stake_usdc 
      }).eq('id', agent.agent_id)
      
      throw gameError
    }

    // Create first round (creator goes first)
    const { data: round, error: roundError } = await supabase
      .from('rps_rounds')
      .insert({
        game_id: game.id,
        round_num: 1,
        first_player_id: agent.agent_id,
        status: 'p1_committed',
        p1_committed_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (roundError) throw roundError

    // Create creator's play
    const { error: playError } = await supabase
      .from('rps_plays')
      .insert({
        round_id: round.id,
        agent_id: agent.agent_id,
        is_first_player: true,
        trash_talk: trash_talk || null,
        commitment_hash,
      })

    if (playError) throw playError

    return NextResponse.json({
      success: true,
      game_id: game.id,
      round_id: round.id,
      status: 'open',
      stake_usdc,
      best_of,
      expires_at: expiresAt.toISOString(),
      timeout_seconds: RPS_CONFIG.OPEN_GAME_TIMEOUT_MS / 1000,
      message: `Game created. Challenger has ${RPS_CONFIG.OPEN_GAME_TIMEOUT_MS / 60000} minutes to accept.`,
    })

  } catch (error: any) {
    console.error('RPS create error:', error)
    return NextResponse.json(
      { error: 'Failed to create game', details: error.message },
      { status: 500 }
    )
  }
}
