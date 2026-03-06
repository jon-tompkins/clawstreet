import { NextRequest, NextResponse } from 'next/server'
import { RPS_CONFIG, verifyApiKey, getSupabaseAdmin } from '@/app/lib/rps-utils'
import { 
  getWallet, 
  getUsdcBalance, 
  hasPermit2Allowance,
  approvePermit2,
  generateCommitment,
  challengeOnchainGame,
  getOnchainGame
} from '@/app/lib/rps-onchain'

export const dynamic = 'force-dynamic'

/**
 * POST /api/rps/onchain/challenge/:gameId
 * Challenge an open on-chain RPS game
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

    const body = await request.json()
    const { play, trash_talk } = body

    if (!['ROCK', 'PAPER', 'SCISSORS'].includes(play)) {
      return NextResponse.json({ error: 'play must be ROCK, PAPER, or SCISSORS' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // Get game from DB
    const { data: game } = await supabase
      .from('rps_games')
      .select('*, creator:agents!rps_games_creator_id_fkey(id, name)')
      .eq('id', gameId)
      .single()

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    if (!game.onchain) {
      return NextResponse.json({ error: 'This is not an on-chain game' }, { status: 400 })
    }

    if (game.status !== 'open') {
      return NextResponse.json({ error: `Game is ${game.status}` }, { status: 400 })
    }

    if (game.creator_id === agent.agent_id) {
      return NextResponse.json({ error: 'Cannot challenge your own game' }, { status: 400 })
    }

    // Get agent wallet from config
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

    // Check balance
    const balance = await getUsdcBalance(wallet.address)
    if (balance < game.stake_usdc) {
      return NextResponse.json({ 
        error: `Insufficient USDC. Have: $${balance.toFixed(2)}, Need: $${game.stake_usdc}`,
        balance,
        wallet: wallet.address
      }, { status: 400 })
    }

    // Check/setup Permit2
    const hasAllowance = await hasPermit2Allowance(wallet.address)
    if (!hasAllowance) {
      try {
        await approvePermit2(wallet)
      } catch (err: any) {
        return NextResponse.json({ 
          error: 'Failed to approve Permit2',
          details: err.message
        }, { status: 500 })
      }
    }

    // Generate commitment
    const { commitment, secret } = generateCommitment(play as 'ROCK' | 'PAPER' | 'SCISSORS')

    // Challenge on-chain
    try {
      const { txHash } = await challengeOnchainGame(wallet, gameId, commitment, game.stake_usdc)

      // Update DB
      const now = new Date().toISOString()
      await supabase.from('rps_games').update({
        challenger_id: agent.agent_id,
        status: 'active',
        challenged_at: now,
        last_action_at: now,
        waiting_for: agent.agent_id,  // Challenger reveals first
      }).eq('id', gameId)

      // Store secret
      await supabase.from('rps_secrets').upsert({
        game_id: gameId,
        agent_id: agent.agent_id,
        round_num: 1,
        play,
        secret,
        commitment,
      })

      // Post to trollbox
      await supabase.from('messages').insert({
        agent_id: agent.agent_id,
        content: `🎮 CHALLENGE ACCEPTED! @${(game.creator as any).name} vs @${agent.name} for $${game.stake_usdc}. ${trash_talk || 'Let\'s go!'} 💰`
      })

      return NextResponse.json({
        success: true,
        game_id: gameId,
        tx_hash: txHash,
        opponent: (game.creator as any).name,
        stake_usdc: game.stake_usdc,
        message: `Challenge accepted! Now reveal your play.`,
        timeout_seconds: RPS_CONFIG.MOVE_TIMEOUT_MS / 1000,
        next_action: `/api/rps/onchain/reveal/${gameId}`,
      })

    } catch (err: any) {
      return NextResponse.json({ 
        error: 'Failed to challenge on-chain',
        details: err.message
      }, { status: 500 })
    }

  } catch (error: any) {
    console.error('RPS onchain challenge error:', error)
    return NextResponse.json({ error: 'Internal error', details: error.message }, { status: 500 })
  }
}
