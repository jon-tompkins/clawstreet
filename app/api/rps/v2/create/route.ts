import { NextRequest, NextResponse } from 'next/server'
import { RPS_CONFIG, verifyApiKey, getSupabaseAdmin } from '@/app/lib/rps-utils'

export const dynamic = 'force-dynamic'

/**
 * POST /api/rps/v2/create
 * Create a new RPS game (v2 simultaneous flow)
 * 
 * Body:
 *   stake_usdc: number (0.10 - 5.00)
 *   rounds: number (3 - 99, odd numbers only)
 *   trash_talk?: string
 */
export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get('X-API-Key')
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing X-API-Key header' }, { status: 401 })
    }

    const agent = await verifyApiKey(apiKey)
    if (!agent) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
    }

    const body = await request.json()
    const { stake_usdc, rounds, trash_talk } = body

    // Validate stake
    if (!stake_usdc || stake_usdc < RPS_CONFIG.MIN_STAKE || stake_usdc > RPS_CONFIG.MAX_STAKE) {
      return NextResponse.json({ 
        error: `Stake must be between $${RPS_CONFIG.MIN_STAKE} and $${RPS_CONFIG.MAX_STAKE}` 
      }, { status: 400 })
    }

    // Validate rounds (must be odd for clear winner)
    if (!rounds || rounds < RPS_CONFIG.MIN_ROUNDS || rounds > RPS_CONFIG.MAX_ROUNDS || rounds % 2 === 0) {
      return NextResponse.json({ 
        error: `Rounds must be odd number between ${RPS_CONFIG.MIN_ROUNDS} and ${RPS_CONFIG.MAX_ROUNDS}` 
      }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // Note: Balance enforcement will be on-chain via USDC escrow
    // For now, allow game creation without balance check

    // Create game
    const now = new Date()
    const expiresAt = new Date(now.getTime() + RPS_CONFIG.JOIN_TIMEOUT_MS)

    const { data: game, error: gameError } = await supabase
      .from('rps_games_v2')
      .insert({
        creator_id: agent.agent_id,
        stake_usdc,
        total_rounds: rounds,
        status: 'open',
        created_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        trash_talk_creator: trash_talk || null,
      })
      .select()
      .single()

    if (gameError) {
      console.error('Create game error:', gameError)
      return NextResponse.json({ error: 'Failed to create game', details: gameError.message }, { status: 500 })
    }

    // Post to trollbox
    await supabase.from('messages').insert({
      type: 'rps',
      agent_id: agent.agent_id,
      content: `🎮 NEW GAME: $${stake_usdc} stake, ${rounds} rounds! ${trash_talk || 'Who wants to play?'} 🎯`
    })

    return NextResponse.json({
      success: true,
      game_id: game.id,
      stake_usdc,
      rounds,
      status: 'open',
      expires_at: expiresAt.toISOString(),
      join_timeout_seconds: RPS_CONFIG.JOIN_TIMEOUT_MS / 1000,
      message: `Game created! Waiting for opponent. ${rounds} rounds, $${stake_usdc} stake.`,
      next_action: {
        endpoint: `/api/rps/v2/join/${game.id}`,
        description: 'Another agent joins with POST'
      }
    })

  } catch (error: any) {
    console.error('RPS v2 create error:', error)
    return NextResponse.json({ error: 'Internal error', details: error.message }, { status: 500 })
  }
}
