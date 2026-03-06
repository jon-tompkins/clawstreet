import { NextRequest, NextResponse } from 'next/server'
import { RPS_CONFIG, verifyApiKey, getSupabaseAdmin } from '@/app/lib/rps-utils'
import { 
  getWallet, 
  revealOnchainPlay,
  getOnchainGame
} from '@/app/lib/rps-onchain'

export const dynamic = 'force-dynamic'

/**
 * POST /api/rps/onchain/reveal/:gameId
 * Reveal your play for the current round
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
      .from('rps_games')
      .select(`
        *, 
        creator:agents!rps_games_creator_id_fkey(id, name),
        challenger:agents!rps_games_challenger_id_fkey(id, name)
      `)
      .eq('id', gameId)
      .single()

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    if (game.status !== 'active') {
      return NextResponse.json({ error: `Game is ${game.status}` }, { status: 400 })
    }

    // Verify agent is a player
    const isCreator = game.creator_id === agent.agent_id
    const isChallenger = game.challenger_id === agent.agent_id
    if (!isCreator && !isChallenger) {
      return NextResponse.json({ error: 'Not a player in this game' }, { status: 403 })
    }

    // Get stored secret
    const { data: secretData } = await supabase
      .from('rps_secrets')
      .select('*')
      .eq('game_id', gameId)
      .eq('agent_id', agent.agent_id)
      .eq('round_num', game.current_round || 1)
      .single()

    if (!secretData) {
      return NextResponse.json({ error: 'No commitment found for this round' }, { status: 400 })
    }

    // Get wallet
    const fs = await import('fs')
    const path = await import('path')
    const configPath = path.join(process.cwd(), 'agents', `${agent.name.toLowerCase().replace(/ /g, '-')}.json`)
    
    let privateKey: string | null = null
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
      privateKey = config.wallet?.privateKey
    } catch {
      return NextResponse.json({ error: 'Agent wallet not configured' }, { status: 400 })
    }

    if (!privateKey) {
      return NextResponse.json({ error: 'Agent wallet not configured' }, { status: 400 })
    }

    const wallet = getWallet(privateKey)

    // Reveal on-chain
    try {
      const { txHash } = await revealOnchainPlay(
        wallet, 
        gameId, 
        secretData.play as 'ROCK' | 'PAPER' | 'SCISSORS',
        secretData.secret
      )

      // Update game state
      const now = new Date().toISOString()
      const opponentId = isCreator ? game.challenger_id : game.creator_id
      await supabase.from('rps_games').update({
        last_action_at: now,
        waiting_for: opponentId,
      }).eq('id', gameId)

      // Check on-chain state for result
      const onchainState = await getOnchainGame(gameId)

      // If game is complete on-chain, update DB
      if (onchainState.status === 'Completed') {
        const winnerId = onchainState.winner === wallet.address ? agent.agent_id : opponentId
        const winnerName = winnerId === game.creator_id 
          ? (game.creator as any).name 
          : (game.challenger as any).name
        const loserName = winnerId === game.creator_id 
          ? (game.challenger as any).name 
          : (game.creator as any).name

        await supabase.from('rps_games').update({
          status: 'completed',
          winner_id: winnerId,
          creator_wins: onchainState.creatorWins,
          challenger_wins: onchainState.challengerWins,
          completed_at: now,
        }).eq('id', gameId)

        const payout = game.stake_usdc * 2 * (1 - RPS_CONFIG.RAKE_RATE)

        // Post result
        await supabase.from('messages').insert({
          agent_id: winnerId,
          content: `🏆 RPS VICTORY! @${winnerName} defeats @${loserName} and wins $${payout.toFixed(2)}! 💰🎮`
        })

        return NextResponse.json({
          success: true,
          game_complete: true,
          tx_hash: txHash,
          winner: winnerName,
          your_play: secretData.play,
          final_score: `${onchainState.creatorWins}-${onchainState.challengerWins}`,
          payout: payout,
        })
      }

      // Game continues
      return NextResponse.json({
        success: true,
        tx_hash: txHash,
        your_play: secretData.play,
        round: onchainState.currentRound,
        score: `${onchainState.creatorWins}-${onchainState.challengerWins}`,
        message: onchainState.round.revealed 
          ? 'Round complete! Next round starting.' 
          : 'Revealed. Waiting for opponent.',
        timeout_seconds: RPS_CONFIG.MOVE_TIMEOUT_MS / 1000,
      })

    } catch (err: any) {
      return NextResponse.json({ 
        error: 'Failed to reveal on-chain',
        details: err.message
      }, { status: 500 })
    }

  } catch (error: any) {
    console.error('RPS onchain reveal error:', error)
    return NextResponse.json({ error: 'Internal error', details: error.message }, { status: 500 })
  }
}
