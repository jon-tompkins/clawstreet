import { NextRequest, NextResponse } from 'next/server'
import { ethers } from 'ethers'
import { RPS_CONFIG, verifyApiKey, getSupabaseAdmin } from '@/app/lib/rps-utils'

export const dynamic = 'force-dynamic'

// Minimal ABI for RPSEscrow
const ESCROW_ABI = [
  'function createGame(uint96 stake, uint8 bestOf, bytes32 commitment, tuple(tuple(address token, uint256 amount) permitted, uint256 nonce, uint256 deadline) permit, bytes signature) returns (bytes32 gameId)',
  'function challenge(bytes32 gameId, bytes32 commitment, tuple(tuple(address token, uint256 amount) permitted, uint256 nonce, uint256 deadline) permit, bytes signature)',
]

/**
 * POST /api/rps/v2/join-onchain/:gameId
 * 
 * Join an on-chain RPS game with a pre-signed Permit2 signature.
 * External agents sign locally and submit their signature here.
 * 
 * Body:
 *   commitment: bytes32 - keccak256(abi.encodePacked(uint8(play), bytes32(secret)))
 *   permit: { permitted: { token, amount }, nonce, deadline }
 *   signature: bytes - the Permit2 signature from wallet.signTypedData
 *   wallet_address: string - the agent's wallet address (for verification)
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
    const { commitment, permit, signature, wallet_address } = body

    // Validate required fields
    if (!commitment || !permit || !signature || !wallet_address) {
      return NextResponse.json({ 
        error: 'Missing required fields',
        required: ['commitment', 'permit', 'signature', 'wallet_address'],
      }, { status: 400 })
    }

    // Validate commitment format
    if (!commitment.startsWith('0x') || commitment.length !== 66) {
      return NextResponse.json({ error: 'Invalid commitment format (must be bytes32)' }, { status: 400 })
    }

    // Validate signature format
    if (!signature.startsWith('0x')) {
      return NextResponse.json({ error: 'Invalid signature format' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // Get game details
    const { data: game, error } = await supabase
      .from('rps_games_v2')
      .select(`
        *,
        creator:agents!rps_games_v2_creator_id_fkey(id, name, wallet_address),
        challenger:agents!rps_games_v2_challenger_id_fkey(id, name, wallet_address)
      `)
      .eq('id', gameId)
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

    // Connect to Base
    const provider = new ethers.JsonRpcProvider(RPS_CONFIG.RPC_URL)
    const escrow = new ethers.Contract(RPS_CONFIG.ESCROW_ADDRESS, ESCROW_ABI, provider)

    // Format permit for contract
    const permitStruct = {
      permitted: {
        token: permit.permitted.token,
        amount: BigInt(permit.permitted.amount),
      },
      nonce: BigInt(permit.nonce),
      deadline: BigInt(permit.deadline),
    }

    let txHash: string
    let onchainGameId: string | null = null

    try {
      if (isCreator && !game.onchain_game_id) {
        // Creator is creating the on-chain game
        // We need a signer to send the tx - use a relayer or require agent to send directly
        // For now, return the calldata for the agent to send themselves
        
        const calldata = escrow.interface.encodeFunctionData('createGame', [
          BigInt(Math.floor(game.stake_usdc * 1e6)), // stake
          game.total_rounds, // bestOf
          commitment,
          permitStruct,
          signature,
        ])

        return NextResponse.json({
          success: true,
          action: 'create_game',
          message: 'Transaction ready. Agent must send this to the escrow contract.',
          tx: {
            to: RPS_CONFIG.ESCROW_ADDRESS,
            data: calldata,
            chainId: RPS_CONFIG.CHAIN_ID,
          },
          note: 'Send this transaction from your wallet to create the on-chain game. Then call POST /api/rps/v2/confirm-onchain/{gameId} with the tx hash.',
        })

      } else if (isChallenger && game.onchain_game_id) {
        // Challenger is joining an existing on-chain game
        const calldata = escrow.interface.encodeFunctionData('challenge', [
          game.onchain_game_id,
          commitment,
          permitStruct,
          signature,
        ])

        return NextResponse.json({
          success: true,
          action: 'challenge',
          message: 'Transaction ready. Agent must send this to the escrow contract.',
          tx: {
            to: RPS_CONFIG.ESCROW_ADDRESS,
            data: calldata,
            chainId: RPS_CONFIG.CHAIN_ID,
          },
          onchain_game_id: game.onchain_game_id,
          note: 'Send this transaction from your wallet to join the on-chain game.',
        })

      } else {
        return NextResponse.json({ 
          error: 'Invalid game state for on-chain action',
          game_status: game.status,
          has_onchain_id: !!game.onchain_game_id,
          is_creator: isCreator,
        }, { status: 400 })
      }

    } catch (contractError: any) {
      console.error('Contract interaction error:', contractError)
      return NextResponse.json({ 
        error: 'Contract interaction failed',
        details: contractError.reason || contractError.message,
      }, { status: 500 })
    }

  } catch (error: any) {
    console.error('RPS join-onchain error:', error)
    return NextResponse.json({ error: 'Internal error', details: error.message }, { status: 500 })
  }
}
