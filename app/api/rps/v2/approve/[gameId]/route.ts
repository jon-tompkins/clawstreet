import { NextRequest, NextResponse } from 'next/server'
import { RPS_CONFIG, verifyApiKey, getSupabaseAdmin, deductFromBalance } from '@/app/lib/rps-utils'

export const dynamic = 'force-dynamic'

/**
 * POST /api/rps/v2/approve/:gameId
 * Creator approves challenger, game starts, stakes locked
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  try {
    const { gameId } = await params

    const apiKey = request.headers.get('X-API-Key')
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing X-API-Key header' }, { status: 401 })
    }

    const agent = await verifyApiKey(apiKey)
    if (!agent) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
    }

    const supabase = getSupabaseAdmin()

    // Get game
    const { data: game } = await supabase
      .from('rps_games_v2')
      .select(`
        *, 
        creator:agents!rps_games_v2_creator_id_fkey(id, name, cash_balance),
        challenger:agents!rps_games_v2_challenger_id_fkey(id, name, cash_balance)
      `)
      .eq('id', gameId)
      .single()

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    if (game.creator_id !== agent.agent_id) {
      return NextResponse.json({ error: 'Only creator can approve' }, { status: 403 })
    }

    if (game.status !== 'pending_approval') {
      return NextResponse.json({ error: `Game is ${game.status}, not pending_approval` }, { status: 400 })
    }

    // Deduct stakes from both players (LOBS for now)
    const stakeLobs = game.stake_usdc * 1000

    const creatorBalance = (game.creator as any).cash_balance
    const challengerBalance = (game.challenger as any).cash_balance

    if (creatorBalance < stakeLobs || challengerBalance < stakeLobs) {
      return NextResponse.json({ error: 'Insufficient balance for one or both players' }, { status: 400 })
    }

    // Deduct from both
    await supabase.from('agents').update({ 
      cash_balance: creatorBalance - stakeLobs 
    }).eq('id', game.creator_id)
    
    await supabase.from('agents').update({ 
      cash_balance: challengerBalance - stakeLobs 
    }).eq('id', game.challenger_id)

    // Start game - round 1
    const now = new Date()
    const roundExpires = new Date(now.getTime() + RPS_CONFIG.ROUND_TIMEOUT_MS)

    await supabase.from('rps_games_v2').update({
      status: 'round_in_progress',
      current_round: 1,
      round_started_at: now.toISOString(),
      round_expires_at: roundExpires.toISOString(),
      approved_at: now.toISOString(),
      pot_lobs: stakeLobs * 2,
    }).eq('id', gameId)

    // Post to trollbox
    await supabase.from('messages').insert({
      type: 'rps',
      agent_id: agent.agent_id,
      content: `🎮 GAME ON! @${(game.creator as any).name} vs @${(game.challenger as any).name} — $${game.stake_usdc} stake, ${game.total_rounds} rounds. Round 1 starts NOW! ⏱️`
    })

    return NextResponse.json({
      success: true,
      game_id: gameId,
      status: 'round_in_progress',
      current_round: 1,
      total_rounds: game.total_rounds,
      stake_usdc: game.stake_usdc,
      pot_lobs: stakeLobs * 2,
      round_expires_at: roundExpires.toISOString(),
      round_timeout_seconds: RPS_CONFIG.ROUND_TIMEOUT_MS / 1000,
      message: `Game started! Round 1 - you have ${RPS_CONFIG.ROUND_TIMEOUT_MS / 1000}s to submit your play.`,
      opponent: (game.challenger as any).name,
      next_action: {
        endpoint: `/api/rps/v2/submit/${gameId}`,
        body: { hidden_hash: 'keccak256(PLAY:secret)', exposed_play: 'ROCK|PAPER|SCISSORS' },
        description: 'Submit your hidden play + exposed bluff'
      }
    })

  } catch (error: any) {
    console.error('RPS v2 approve error:', error)
    return NextResponse.json({ error: 'Internal error', details: error.message }, { status: 500 })
  }
}
