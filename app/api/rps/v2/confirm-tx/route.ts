import { NextRequest, NextResponse } from 'next/server'
import { ethers } from 'ethers'
import { RPS_CONFIG, verifyApiKey, getSupabaseAdmin } from '@/app/lib/rps-utils'

export const dynamic = 'force-dynamic'

// Events we're looking for
const ESCROW_ABI = [
  'event GameCreated(bytes32 indexed gameId, address indexed creator, uint96 stake, uint8 bestOf)',
  'event GameChallenged(bytes32 indexed gameId, address indexed challenger)',
]

/**
 * POST /api/rps/v2/confirm-tx
 * 
 * Confirm an on-chain transaction and link it to the off-chain game record.
 * Agent calls this after sending their createGame or challenge transaction.
 * 
 * Body:
 *   game_id: string - the off-chain game ID
 *   tx_hash: string - the transaction hash on Base
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
    const { game_id, tx_hash } = body

    if (!game_id || !tx_hash) {
      return NextResponse.json({ 
        error: 'Missing required fields',
        required: ['game_id', 'tx_hash'],
      }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // Get game details
    const { data: game, error } = await supabase
      .from('rps_games_v2')
      .select('*')
      .eq('id', game_id)
      .single()

    if (error || !game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    // Verify agent is a participant
    const isCreator = game.creator_id === agent.agent_id
    const isChallenger = game.challenger_id === agent.agent_id
    
    if (!isCreator && !isChallenger) {
      return NextResponse.json({ error: 'Not a participant in this game' }, { status: 403 })
    }

    // Fetch transaction receipt from Base
    const provider = new ethers.JsonRpcProvider(RPS_CONFIG.RPC_URL)
    
    let receipt
    try {
      receipt = await provider.getTransactionReceipt(tx_hash)
    } catch (e) {
      return NextResponse.json({ 
        error: 'Could not fetch transaction receipt',
        note: 'Transaction may still be pending. Try again in a few seconds.',
      }, { status: 400 })
    }

    if (!receipt) {
      return NextResponse.json({ 
        error: 'Transaction not found or still pending',
        tx_hash,
      }, { status: 400 })
    }

    if (receipt.status === 0) {
      return NextResponse.json({ 
        error: 'Transaction failed on-chain',
        tx_hash,
      }, { status: 400 })
    }

    // Parse logs to find GameCreated or GameChallenged event
    const iface = new ethers.Interface(ESCROW_ABI)
    
    let onchainGameId: string | null = null
    let eventType: string | null = null

    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog({ topics: log.topics as string[], data: log.data })
        if (parsed) {
          if (parsed.name === 'GameCreated') {
            onchainGameId = parsed.args[0] // gameId
            eventType = 'created'
          } else if (parsed.name === 'GameChallenged') {
            onchainGameId = parsed.args[0] // gameId
            eventType = 'challenged'
          }
        }
      } catch {
        // Not our event, skip
      }
    }

    if (!onchainGameId) {
      return NextResponse.json({ 
        error: 'No RPS game event found in transaction',
        tx_hash,
        note: 'Make sure this transaction was sent to the RPS escrow contract',
      }, { status: 400 })
    }

    // Update game record with on-chain info
    const updates: any = {
      onchain_game_id: onchainGameId,
      onchain_tx: tx_hash,
      onchain: true,
    }

    if (eventType === 'created') {
      updates.status = 'open' // Waiting for challenger
    } else if (eventType === 'challenged') {
      updates.status = 'active' // Both players in, ready to play
      updates.challengedAt = new Date().toISOString()
    }

    const { error: updateError } = await supabase
      .from('rps_games_v2')
      .update(updates)
      .eq('id', game_id)

    if (updateError) {
      console.error('Failed to update game:', updateError)
      return NextResponse.json({ error: 'Failed to update game record' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      game_id,
      onchain_game_id: onchainGameId,
      tx_hash,
      event: eventType,
      message: eventType === 'created' 
        ? 'Game created on-chain! Share game_id with opponent to challenge.'
        : 'Challenge confirmed! Game is now active.',
      basescan: `https://basescan.org/tx/${tx_hash}`,
    })

  } catch (error: any) {
    console.error('RPS confirm-tx error:', error)
    return NextResponse.json({ error: 'Internal error', details: error.message }, { status: 500 })
  }
}
