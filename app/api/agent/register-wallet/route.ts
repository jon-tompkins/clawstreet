import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'
import { ethers } from 'ethers'

export const dynamic = 'force-dynamic'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function verifyApiKey(apiKey: string) {
  const keyHash = createHash('sha256').update(apiKey).digest('hex')
  const supabase = getSupabase()
  
  const { data, error } = await supabase
    .from('agent_api_keys')
    .select('agent_id')
    .eq('key_hash', keyHash)
    .eq('revoked', false)
    .single()

  if (error || !data) return null
  return data
}

/**
 * POST /api/agent/register-wallet
 * 
 * Register an Ethereum wallet address for commit-reveal trading.
 * Requires proof of ownership via signature.
 * 
 * Body:
 * {
 *   "wallet_address": "0x...",
 *   "signature": "0x..." // Signature of message: "Register wallet {address} for Clawstreet agent {agent_id}"
 * }
 */
export async function POST(request: NextRequest) {
  const supabase = getSupabase()
  
  try {
    // Verify API key
    const apiKey = request.headers.get('X-API-Key')
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing X-API-Key header' }, { status: 401 })
    }
    
    const keyData = await verifyApiKey(apiKey)
    if (!keyData) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
    }
    
    // Get agent
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('id, name, wallet_address')
      .eq('id', keyData.agent_id)
      .single()
    
    if (agentError || !agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }
    
    // Parse request
    const body = await request.json()
    const { wallet_address, signature } = body
    
    if (!wallet_address || !signature) {
      return NextResponse.json({ 
        error: 'Missing wallet_address or signature' 
      }, { status: 400 })
    }
    
    // Validate address format
    if (!ethers.isAddress(wallet_address)) {
      return NextResponse.json({ 
        error: 'Invalid wallet address format' 
      }, { status: 400 })
    }
    
    // Normalize address (checksum)
    const normalizedAddress = ethers.getAddress(wallet_address)
    
    // Check if wallet already registered to another agent
    const { data: existingAgent } = await supabase
      .from('agents')
      .select('id, name')
      .eq('wallet_address', normalizedAddress)
      .neq('id', agent.id)
      .single()
    
    if (existingAgent) {
      return NextResponse.json({ 
        error: 'Wallet already registered to another agent' 
      }, { status: 400 })
    }
    
    // Verify signature proves ownership
    const message = `Register wallet ${normalizedAddress} for Clawstreet agent ${agent.id}`
    
    try {
      const recoveredAddress = ethers.verifyMessage(message, signature)
      
      if (recoveredAddress.toLowerCase() !== normalizedAddress.toLowerCase()) {
        return NextResponse.json({ 
          error: 'Signature does not match wallet address',
          expected_message: message
        }, { status: 400 })
      }
    } catch (e) {
      return NextResponse.json({ 
        error: 'Invalid signature format',
        expected_message: message
      }, { status: 400 })
    }
    
    // Register wallet
    const { error: updateError } = await supabase
      .from('agents')
      .update({ 
        wallet_address: normalizedAddress,
        wallet_registered_at: new Date().toISOString()
      })
      .eq('id', agent.id)
    
    if (updateError) {
      throw updateError
    }
    
    return NextResponse.json({
      success: true,
      agent_id: agent.id,
      agent_name: agent.name,
      wallet_address: normalizedAddress,
      message: 'Wallet registered successfully. You can now use commit-reveal trading.'
    })
    
  } catch (error: any) {
    console.error('Wallet registration error:', error)
    return NextResponse.json({ 
      error: 'Registration failed', 
      details: error.message 
    }, { status: 500 })
  }
}

/**
 * GET /api/agent/register-wallet
 * 
 * Check current wallet registration status
 */
export async function GET(request: NextRequest) {
  const supabase = getSupabase()
  
  try {
    const apiKey = request.headers.get('X-API-Key')
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing X-API-Key header' }, { status: 401 })
    }
    
    const keyData = await verifyApiKey(apiKey)
    if (!keyData) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
    }
    
    const { data: agent } = await supabase
      .from('agents')
      .select('id, name, wallet_address, wallet_registered_at')
      .eq('id', keyData.agent_id)
      .single()
    
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }
    
    return NextResponse.json({
      agent_id: agent.id,
      agent_name: agent.name,
      wallet_registered: !!agent.wallet_address,
      wallet_address: agent.wallet_address || null,
      registered_at: agent.wallet_registered_at || null
    })
    
  } catch (error: any) {
    return NextResponse.json({ 
      error: 'Failed to check status', 
      details: error.message 
    }, { status: 500 })
  }
}
