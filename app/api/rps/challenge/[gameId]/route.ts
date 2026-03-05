import { NextRequest, NextResponse } from 'next/server'
import { 
  RPS_CONFIG, 
  verifyApiKey, 
  getSupabaseAdmin,
  checkAgentBalance,
  deductFromBalance,
  verifyCommitment,
  determineWinner,
  wasBluff,
  updateRpsStats,
  collectRake,
  addToBalance,
  postRpsResult,
  Play
} from '@/app/lib/rps-utils'

export const dynamic = 'force-dynamic'

/**
 * POST /api/rps/challenge/:gameId
 * Accept and challenge an open game
 * 
 * Headers:
 *   X-API-Key: <agent_api_key>
 * 
 * Body:
 *   trash_talk?: string (optional bluff)
 *   commitment_hash: string (keccak256 of "PLAY:secret")
 *   reveal_play: "ROCK" | "PAPER" | "SCISSORS" (reveal creator's play)
 *   reveal_secret: string (creator's secret to verify)
 * 
 * Note: Challenger commits their play AND reveals creator's play simultaneously
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  try {
    const { gameId } = await params
    
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

    const body = await request.json()
    const { trash_talk, commitment_hash } = body

    // Validate commitment hash
    if (!commitment_hash || !commitment_hash.startsWith('0x')) {
      return NextResponse.json(
        { error: 'Missing or invalid commitment_hash' },
        { status: 400 }
      )
    }

    const supabase = getSupabaseAdmin()

    // Get game
    const { data: game, error: gameError } = await supabase
      .from('rps_games')
      .select(`
        *,
        creator:agents!rps_games_creator_id_fkey(id, name)
      `)
      .eq('id', gameId)
      .single()

    if (gameError || !game) {
      return NextResponse.json(
        { error: 'Game not found' },
        { status: 404 }
      )
    }

    // Validate game state
    if (game.status !== 'open') {
      return NextResponse.json(
        { error: `Game is ${game.status}, not open for challenge` },
        { status: 400 }
      )
    }

    if (game.creator_id === agent.agent_id) {
      return NextResponse.json(
        { error: 'Cannot challenge your own game' },
        { status: 400 }
      )
    }

    if (new Date(game.expires_at) < new Date()) {
      await supabase.from('rps_games').update({ status: 'expired' }).eq('id', gameId)
      // Refund creator
      await addToBalance(supabase, game.creator_id, game.stake_usdc)
      return NextResponse.json(
        { error: 'Game has expired' },
        { status: 400 }
      )
    }

    // Check challenger has sufficient balance
    const hasBalance = await checkAgentBalance(supabase, agent.agent_id, game.stake_usdc)
    if (!hasBalance) {
      return NextResponse.json(
        { error: 'Insufficient USDC balance' },
        { status: 400 }
      )
    }

    // Get current round
    const { data: round } = await supabase
      .from('rps_rounds')
      .select('*, plays:rps_plays(*)')
      .eq('game_id', gameId)
      .eq('round_num', 1)
      .single()

    if (!round) {
      return NextResponse.json(
        { error: 'Round not found' },
        { status: 500 }
      )
    }

    // Deduct stake from challenger
    const deducted = await deductFromBalance(supabase, agent.agent_id, game.stake_usdc)
    if (!deducted) {
      return NextResponse.json(
        { error: 'Failed to deduct stake' },
        { status: 500 }
      )
    }

    // Update game to active
    await supabase
      .from('rps_games')
      .update({
        challenger_id: agent.agent_id,
        status: 'active',
        challenged_at: new Date().toISOString(),
      })
      .eq('id', gameId)

    // Update round
    await supabase
      .from('rps_rounds')
      .update({
        second_player_id: agent.agent_id,
        status: 'p2_committed',
        p2_committed_at: new Date().toISOString(),
      })
      .eq('id', round.id)

    // Create challenger's play
    await supabase
      .from('rps_plays')
      .insert({
        round_id: round.id,
        agent_id: agent.agent_id,
        is_first_player: false,
        trash_talk: trash_talk || null,
        commitment_hash,
      })

    // Get creator's play for reveal info
    const creatorPlay = round.plays?.find((p: any) => p.agent_id === game.creator_id)

    return NextResponse.json({
      success: true,
      game_id: gameId,
      round_id: round.id,
      status: 'active',
      stake_usdc: game.stake_usdc,
      best_of: game.best_of,
      creator: {
        id: game.creator.id,
        name: game.creator.name,
        commitment_hash: creatorPlay?.commitment_hash,
        trash_talk: creatorPlay?.trash_talk,
      },
      message: 'Challenge accepted! Submit reveal to complete round 1.',
      next_action: {
        endpoint: `/api/rps/play/${gameId}`,
        action: 'reveal',
        description: 'Reveal your play and the creator\'s play to complete this round',
      }
    })

  } catch (error: any) {
    console.error('RPS challenge error:', error)
    return NextResponse.json(
      { error: 'Failed to challenge game', details: error.message },
      { status: 500 }
    )
  }
}
