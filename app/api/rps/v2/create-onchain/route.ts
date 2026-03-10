import { NextRequest, NextResponse } from 'next/server'
import { ethers } from 'ethers'
import { RPS_CONFIG, verifyApiKey, getSupabaseAdmin } from '@/app/lib/rps-utils'

export const dynamic = 'force-dynamic'

// Minimal ABI for RPSEscrow
const ESCROW_ABI = [
  'function createGame(uint96 stake, uint8 bestOf, bytes32 commitment, tuple(tuple(address token, uint256 amount) permitted, uint256 nonce, uint256 deadline) permit, bytes signature) returns (bytes32 gameId)',
]

/**
 * POST /api/rps/v2/create-onchain
 * 
 * Create a new on-chain RPS game with a pre-signed Permit2 signature.
 * 
 * Body:
 *   stake_usdc: number - stake amount (0.10 to 1000)
 *   best_of: number - 1, 3, 5, or 7
 *   commitment: bytes32 - keccak256(abi.encodePacked(uint8(play), bytes32(secret)))
 *   permit: { permitted: { token, amount }, nonce, deadline }
 *   signature: bytes - the Permit2 signature
 *   wallet_address: string - creator's wallet address
 * 
 * Returns transaction data for agent to send, or relays if relay=true
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
    const { stake_usdc, best_of, commitment, permit, signature, wallet_address } = body

    // Validate required fields
    if (!stake_usdc || !best_of || !commitment || !permit || !signature || !wallet_address) {
      return NextResponse.json({ 
        error: 'Missing required fields',
        required: ['stake_usdc', 'best_of', 'commitment', 'permit', 'signature', 'wallet_address'],
      }, { status: 400 })
    }

    // Validate stake
    if (stake_usdc < RPS_CONFIG.MIN_STAKE || stake_usdc > RPS_CONFIG.MAX_STAKE) {
      return NextResponse.json({ 
        error: `Stake must be between $${RPS_CONFIG.MIN_STAKE} and $${RPS_CONFIG.MAX_STAKE}`,
      }, { status: 400 })
    }

    // Validate best_of (DB constraint: 3, 5, or 7)
    if (![3, 5, 7].includes(best_of)) {
      return NextResponse.json({ error: 'best_of must be 3, 5, or 7' }, { status: 400 })
    }

    // Validate commitment format
    if (!commitment.startsWith('0x') || commitment.length !== 66) {
      return NextResponse.json({ error: 'Invalid commitment format (must be bytes32)' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // Create off-chain game record first
    // Note: creator_wallet/challenger_wallet columns pending migration
    // For now, wallet_address is validated at tx time via signature
    const { data: game, error: createError } = await supabase
      .from('rps_games_v2')
      .insert({
        creator_id: agent.agent_id,
        stake_usdc: stake_usdc,
        total_rounds: best_of,
        pot_lobs: stake_usdc * 1000 * 2, // Will be updated when challenger joins
        status: 'open',
        onchain: true, // Mark as on-chain game
      })
      .select()
      .single()

    if (createError || !game) {
      console.error('Failed to create game record:', createError)
      return NextResponse.json({ error: 'Failed to create game' }, { status: 500 })
    }

    // Store the creator's commitment
    await supabase.from('rps_secrets').upsert({
      game_id: game.id,
      agent_id: agent.agent_id,
      round_num: 1,
      commitment: commitment,
    })

    // Format permit for contract
    const permitStruct = {
      permitted: {
        token: permit.permitted.token,
        amount: BigInt(permit.permitted.amount),
      },
      nonce: BigInt(permit.nonce),
      deadline: BigInt(permit.deadline),
    }

    // Build transaction calldata
    const provider = new ethers.JsonRpcProvider(RPS_CONFIG.RPC_URL)
    const escrow = new ethers.Contract(RPS_CONFIG.ESCROW_ADDRESS, ESCROW_ABI, provider)

    const calldata = escrow.interface.encodeFunctionData('createGame', [
      BigInt(Math.floor(stake_usdc * 1e6)), // stake in USDC wei
      best_of,
      commitment,
      permitStruct,
      signature,
    ])

    return NextResponse.json({
      success: true,
      game_id: game.id,
      action: 'create_game',
      message: 'Game created. Send this transaction to complete on-chain escrow.',
      
      tx: {
        to: RPS_CONFIG.ESCROW_ADDRESS,
        data: calldata,
        chainId: RPS_CONFIG.CHAIN_ID,
        value: '0x0',
      },
      
      next_steps: [
        '1. Send the transaction above from your wallet',
        '2. Call POST /api/rps/v2/confirm-tx with { game_id, tx_hash } to link the on-chain game',
        '3. Share game_id with opponent so they can challenge',
      ],
      
      game: {
        id: game.id,
        stake_usdc,
        best_of,
        status: 'open',
        creator: agent.name,
      },
    })

  } catch (error: any) {
    console.error('RPS create-onchain error:', error)
    return NextResponse.json({ error: 'Internal error', details: error.message }, { status: 500 })
  }
}
