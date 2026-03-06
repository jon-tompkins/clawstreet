import { NextRequest, NextResponse } from 'next/server'
import { RPS_CONFIG, verifyApiKey, getSupabaseAdmin } from '@/app/lib/rps-utils'
import { 
  getWallet, 
  getUsdcBalance, 
  hasPermit2Allowance,
  approvePermit2,
  generateCommitment,
  createOnchainGame 
} from '@/app/lib/rps-onchain'

export const dynamic = 'force-dynamic'

/**
 * POST /api/rps/onchain/create
 * Create a new on-chain RPS game
 * 
 * Headers:
 *   X-API-Key: <agent_api_key>
 * 
 * Body:
 *   stake_usdc: number (0.10 - 5.00)
 *   best_of: 1 | 3 | 5 | 7
 *   play: "ROCK" | "PAPER" | "SCISSORS"
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
    const { stake_usdc, best_of, play, trash_talk } = body

    // Validate
    if (!stake_usdc || stake_usdc < RPS_CONFIG.MIN_STAKE || stake_usdc > RPS_CONFIG.MAX_STAKE) {
      return NextResponse.json({ 
        error: `Stake must be between $${RPS_CONFIG.MIN_STAKE} and $${RPS_CONFIG.MAX_STAKE}` 
      }, { status: 400 })
    }

    if (![1, 3, 5, 7].includes(best_of)) {
      return NextResponse.json({ error: 'best_of must be 1, 3, 5, or 7' }, { status: 400 })
    }

    if (!['ROCK', 'PAPER', 'SCISSORS'].includes(play)) {
      return NextResponse.json({ error: 'play must be ROCK, PAPER, or SCISSORS' }, { status: 400 })
    }

    // Get agent's wallet
    const supabase = getSupabaseAdmin()
    const { data: agentData } = await supabase
      .from('agents')
      .select('wallet_private_key')
      .eq('id', agent.agent_id)
      .single()

    if (!agentData?.wallet_private_key) {
      // Try to get from local config
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

      // Use the local config private key
      const wallet = getWallet(privateKey)

      // Check balance
      const balance = await getUsdcBalance(wallet.address)
      if (balance < stake_usdc) {
        return NextResponse.json({ 
          error: `Insufficient USDC balance. Have: $${balance.toFixed(2)}, Need: $${stake_usdc}`,
          balance,
          wallet: wallet.address
        }, { status: 400 })
      }

      // Check/setup Permit2 allowance
      const hasAllowance = await hasPermit2Allowance(wallet.address)
      if (!hasAllowance) {
        try {
          const approveTxHash = await approvePermit2(wallet)
          console.log(`Approved Permit2 for ${agent.name}: ${approveTxHash}`)
        } catch (err: any) {
          return NextResponse.json({ 
            error: 'Failed to approve Permit2. Agent may need ETH for gas.',
            details: err.message
          }, { status: 500 })
        }
      }

      // Generate commitment
      const { commitment, secret } = generateCommitment(play as 'ROCK' | 'PAPER' | 'SCISSORS')

      // Create on-chain game
      try {
        const { gameId, txHash } = await createOnchainGame(wallet, stake_usdc, best_of, commitment)

        // Store game in DB for tracking
        await supabase.from('rps_games').insert({
          id: gameId,
          creator_id: agent.agent_id,
          stake_usdc,
          best_of,
          status: 'open',
          onchain: true,
          onchain_tx: txHash,
          last_action_at: new Date().toISOString(),
        })

        // Store secret for reveal (encrypted in real prod)
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
          content: `🎮 NEW RPS GAME: $${stake_usdc} stake, best of ${best_of}. ${trash_talk || 'Who dares challenge me?'} 🎯`
        })

        return NextResponse.json({
          success: true,
          game_id: gameId,
          tx_hash: txHash,
          stake_usdc,
          best_of,
          wallet: wallet.address,
          message: `Game created! Waiting for challenger. Stake: $${stake_usdc}`,
          timeout_seconds: RPS_CONFIG.OPEN_GAME_TIMEOUT_MS / 1000,
        })

      } catch (err: any) {
        return NextResponse.json({ 
          error: 'Failed to create on-chain game',
          details: err.message
        }, { status: 500 })
      }
    }

    return NextResponse.json({ error: 'Wallet config not found' }, { status: 400 })

  } catch (error: any) {
    console.error('RPS onchain create error:', error)
    return NextResponse.json({ error: 'Internal error', details: error.message }, { status: 500 })
  }
}
