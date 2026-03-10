import { NextRequest, NextResponse } from 'next/server'
import { 
  RPS_CONFIG, 
  verifyApiKey, 
  getSupabaseAdmin,
  isGameTimedOut,
  processTimeoutForfeit,
  addToBalance
} from '@/app/lib/rps-utils'

export const dynamic = 'force-dynamic'

/**
 * POST /api/rps/timeout/:gameId
 * Claim victory due to opponent timeout
 * 
 * Headers:
 *   X-API-Key: <agent_api_key>
 * 
 * The calling agent must be a participant and the opponent must have timed out.
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

    const supabase = getSupabaseAdmin()

    // Get game with player info
    const { data: game, error: gameError } = await supabase
      .from('rps_games')
      .select(`
        *,
        creator:agents!rps_games_creator_id_fkey(id, name),
        challenger:agents!rps_games_challenger_id_fkey(id, name)
      `)
      .eq('id', gameId)
      .single()

    if (gameError || !game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    // Verify agent is a participant
    const isCreator = game.creator_id === agent.agent_id
    const isChallenger = game.challenger_id === agent.agent_id

    if (!isCreator && !isChallenger) {
      return NextResponse.json(
        { error: 'You are not a participant in this game' },
        { status: 403 }
      )
    }

    // Check game status
    if (game.status === 'completed') {
      return NextResponse.json(
        { error: 'Game already completed' },
        { status: 400 }
      )
    }

    if (game.status === 'cancelled' || game.status === 'expired') {
      return NextResponse.json(
        { error: `Game is ${game.status}` },
        { status: 400 }
      )
    }

    // Check for timeout
    const timeoutCheck = isGameTimedOut(game)
    
    if (!timeoutCheck.timedOut) {
      const lastAction = new Date(game.last_action_at || game.created_at).getTime()
      const elapsed = Date.now() - lastAction
      const remaining = Math.ceil((RPS_CONFIG.MOVE_TIMEOUT_MS - elapsed) / 1000)
      
      return NextResponse.json({
        error: 'No timeout - opponent still has time',
        elapsed_seconds: Math.floor(elapsed / 1000),
        timeout_seconds: RPS_CONFIG.MOVE_TIMEOUT_MS / 1000,
        remaining_seconds: Math.max(0, remaining)
      }, { status: 400 })
    }

    // Handle open game timeout (no challenger) - refund creator
    if (game.status === 'open') {
      await addToBalance(supabase, game.creator_id, game.stake_usdc)
      
      await supabase
        .from('rps_games')
        .update({
          status: 'expired',
          completed_at: new Date().toISOString(),
          timeout_forfeit: true
        })
        .eq('id', game.id)

      return NextResponse.json({
        success: true,
        result: 'Game expired - no challenger. Stake refunded.',
        refund: game.stake_usdc
      })
    }

    // Verify the claiming agent is the winner (not the one who timed out)
    if (timeoutCheck.forfeiterId === agent.agent_id) {
      return NextResponse.json(
        { error: 'You are the one who timed out!' },
        { status: 400 }
      )
    }

    // Process timeout forfeit
    const winnerId = timeoutCheck.winnerId!
    const loserId = timeoutCheck.forfeiterId!
    const winnerName = winnerId === game.creator_id 
      ? (game.creator as any).name 
      : (game.challenger as any).name
    const loserName = loserId === game.creator_id 
      ? (game.creator as any).name 
      : (game.challenger as any).name

    const result = await processTimeoutForfeit(
      supabase, game, winnerId, winnerName, loserId, loserName
    )

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to process timeout' },
        { status: 500 }
      )
    }

    const totalPot = game.stake_usdc * 2
    const rake = totalPot * RPS_CONFIG.RAKE_RATE
    const payout = totalPot - rake

    return NextResponse.json({
      success: true,
      result: 'Opponent timed out! You win by forfeit.',
      winner: winnerName,
      loser: loserName,
      payout: payout,
      rake: rake
    })

  } catch (error) {
    console.error('RPS timeout error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
