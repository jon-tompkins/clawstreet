import { NextRequest, NextResponse } from 'next/server'
import { RPS_CONFIG, verifyApiKey, getSupabaseAdmin } from '@/app/lib/rps-utils'

export const dynamic = 'force-dynamic'

/**
 * GET /api/rps/v2/sign-data/:gameId
 * 
 * Returns everything an external agent needs to sign a Permit2 transfer locally.
 * Agent signs with their own private key, then submits signature to join/create endpoints.
 * 
 * Response:
 *   domain: EIP-712 domain for Permit2
 *   types: EIP-712 types for PermitTransferFrom
 *   values: The permit data to sign (includes nonce, deadline, amount)
 *   stake: The stake amount in USDC
 *   
 * Agent then calls: wallet.signTypedData(domain, types, values)
 */
export async function GET(
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

    // Get game details
    const { data: game, error } = await supabase
      .from('rps_games_v2')
      .select('*')
      .eq('id', gameId)
      .single()

    if (error || !game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    // Generate permit data for this agent to sign
    const stakeUsdc = game.stake_usdc
    const stakeWei = BigInt(Math.floor(stakeUsdc * 1e6)) // USDC has 6 decimals
    
    // Generate a unique nonce (timestamp + random)
    const timestamp = BigInt(Date.now())
    const random = BigInt(Math.floor(Math.random() * 1000000))
    const nonce = ((timestamp << 20n) | random).toString()
    
    // Deadline: 1 hour from now
    const deadline = Math.floor(Date.now() / 1000) + 3600

    // EIP-712 domain for Permit2
    const domain = {
      name: 'Permit2',
      chainId: RPS_CONFIG.CHAIN_ID,
      verifyingContract: RPS_CONFIG.PERMIT2_ADDRESS,
    }

    // EIP-712 types for SignatureTransfer
    const types = {
      PermitTransferFrom: [
        { name: 'permitted', type: 'TokenPermissions' },
        { name: 'spender', type: 'address' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
      TokenPermissions: [
        { name: 'token', type: 'address' },
        { name: 'amount', type: 'uint256' },
      ],
    }

    // The values to sign
    const values = {
      permitted: {
        token: RPS_CONFIG.USDC_ADDRESS,
        amount: stakeWei.toString(),
      },
      spender: RPS_CONFIG.ESCROW_ADDRESS,
      nonce: nonce,
      deadline: deadline,
    }

    // The permit struct to send to the contract (slightly different format)
    const permitForContract = {
      permitted: {
        token: RPS_CONFIG.USDC_ADDRESS,
        amount: stakeWei.toString(),
      },
      nonce: nonce,
      deadline: deadline,
    }

    return NextResponse.json({
      success: true,
      gameId: gameId,
      stake_usdc: stakeUsdc,
      stake_wei: stakeWei.toString(),
      
      // For signing (agent uses these with wallet.signTypedData)
      domain,
      types,
      values,
      
      // For submitting to join endpoint
      permit: permitForContract,
      
      // Metadata
      escrow_address: RPS_CONFIG.ESCROW_ADDRESS,
      usdc_address: RPS_CONFIG.USDC_ADDRESS,
      permit2_address: RPS_CONFIG.PERMIT2_ADDRESS,
      chain_id: RPS_CONFIG.CHAIN_ID,
      deadline_unix: deadline,
      deadline_iso: new Date(deadline * 1000).toISOString(),
      
      // Instructions
      instructions: {
        step1: 'Sign the permit using: signature = await wallet.signTypedData(domain, types, values)',
        step2: 'Submit to join: POST /api/rps/v2/join-onchain/{gameId} with { commitment, permit, signature }',
        note: 'Commitment = keccak256(abi.encodePacked(uint8(play), bytes32(secret))) where play: 1=ROCK, 2=PAPER, 3=SCISSORS',
      },
    })

  } catch (error: any) {
    console.error('RPS sign-data error:', error)
    return NextResponse.json({ error: 'Internal error', details: error.message }, { status: 500 })
  }
}
