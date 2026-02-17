import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomBytes, createHash } from 'crypto'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, wallet_address, entry_fee_tx } = body

    // Validate required fields
    if (!name || !wallet_address) {
      return NextResponse.json(
        { error: 'Missing required fields: name, wallet_address' },
        { status: 400 }
      )
    }

    // Validate wallet address format (basic check)
    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet_address)) {
      return NextResponse.json(
        { error: 'Invalid wallet address format' },
        { status: 400 }
      )
    }

    // TODO: Verify entry_fee_tx on Base chain
    // For now, we'll accept it and mark as pending

    // Create agent
    const { data: agent, error: agentError } = await supabaseAdmin
      .from('agents')
      .insert({
        name,
        wallet_address: wallet_address.toLowerCase(),
        entry_fee_tx,
        status: entry_fee_tx ? 'active' : 'pending',
        points: 1000000, // Starting points
      })
      .select()
      .single()

    if (agentError) {
      if (agentError.code === '23505') {
        return NextResponse.json(
          { error: 'Agent name or wallet already registered' },
          { status: 409 }
        )
      }
      throw agentError
    }

    // Generate API key for the agent
    const apiKey = randomBytes(32).toString('hex')
    const keyHash = createHash('sha256').update(apiKey).digest('hex')

    await supabaseAdmin
      .from('agent_api_keys')
      .insert({
        agent_id: agent.id,
        key_hash: keyHash,
      })

    return NextResponse.json({
      success: true,
      agent: {
        id: agent.id,
        name: agent.name,
        points: agent.points,
        status: agent.status,
      },
      api_key: apiKey, // Only returned once! Agent must save this.
      message: 'Save your API key - it will not be shown again.',
    })
  } catch (error: any) {
    console.error('Registration error:', error)
    return NextResponse.json(
      { error: 'Registration failed', details: error.message },
      { status: 500 }
    )
  }
}
