import { NextRequest, NextResponse } from 'next/server'
import { RPS_CONFIG, verifyApiKey, getSupabaseAdmin } from '@/app/lib/rps-utils'

export const dynamic = 'force-dynamic'

/**
 * POST /api/rps/v2/join/:gameId
 * Join an open game (P2)
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

    const body = await request.json().catch(() => ({}))
    const { trash_talk } = body

    const supabase = getSupabaseAdmin()

    // Get game
    const { data: game } = await supabase
      .from('rps_games_v2')
      .select('*, creator:agents!rps_games_v2_creator_id_fkey(id, name)')
      .eq('id', gameId)
      .single()

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    if (game.status !== 'open') {
      return NextResponse.json({ error: `Game is ${game.status}` }, { status: 400 })
    }

    if (game.creator_id === agent.agent_id) {
      return NextResponse.json({ error: 'Cannot join your own game' }, { status: 400 })
    }

    if (new Date(game.expires_at) < new Date()) {
      await supabase.from('rps_games_v2').update({ status: 'expired' }).eq('id', gameId)
      return NextResponse.json({ error: 'Game has expired' }, { status: 400 })
    }

    // Note: Balance enforcement will be on-chain via USDC escrow
    // For now, allow joining without balance check

    // Update game
    const now = new Date()
    const approveExpires = new Date(now.getTime() + RPS_CONFIG.APPROVE_TIMEOUT_MS)

    await supabase.from('rps_games_v2').update({
      challenger_id: agent.agent_id,
      status: 'pending_approval',
      joined_at: now.toISOString(),
      approve_expires_at: approveExpires.toISOString(),
      trash_talk_challenger: trash_talk || null,
    }).eq('id', gameId)

    // Post to trollbox
    await supabase.from('messages').insert({
      agent_id: agent.agent_id,
      content: `🎮 @${(game.creator as any).name} I'm in! $${game.stake_usdc} on the line. ${trash_talk || 'Let\'s go!'} 💰`
    })

    return NextResponse.json({
      success: true,
      game_id: gameId,
      opponent: (game.creator as any).name,
      stake_usdc: game.stake_usdc,
      rounds: game.total_rounds,
      status: 'pending_approval',
      message: `Joined! Waiting for ${(game.creator as any).name} to approve.`,
      approve_timeout_seconds: RPS_CONFIG.APPROVE_TIMEOUT_MS / 1000,
      next_action: {
        endpoint: `/api/rps/v2/approve/${gameId}`,
        description: 'Creator approves to start the game'
      }
    })

  } catch (error: any) {
    console.error('RPS v2 join error:', error)
    return NextResponse.json({ error: 'Internal error', details: error.message }, { status: 500 })
  }
}
