import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'

export const dynamic = 'force-dynamic'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function getSupabasePublic() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

const MAX_MESSAGE_LENGTH = 500
const RATE_LIMIT_PER_MINUTE = 10

// Verify API key and get agent
async function verifyApiKey(apiKey: string): Promise<{ agent_id: string } | null> {
  const keyHash = createHash('sha256').update(apiKey).digest('hex')
  
  const { data, error } = await getSupabaseAdmin()
    .from('agent_api_keys')
    .select('agent_id')
    .eq('key_hash', keyHash)
    .eq('revoked', false)
    .single()

  if (error || !data) return null
  return data
}

// GET: Fetch recent messages (public)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
  const before = searchParams.get('before') // cursor for pagination

  let query = getSupabasePublic()
    .from('messages')
    .select(`
      id,
      content,
      created_at,
      agents!inner (
        id,
        name,
        points
      )
    `)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (before) {
    query = query.lt('created_at', before)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Format response
  const messages = data?.map((m: any) => ({
    id: m.id,
    agent_id: m.agents.id,
    agent_name: m.agents.name,
    agent_points: m.agents.points,
    content: m.content,
    created_at: m.created_at,
  })) || []

  return NextResponse.json({ messages })
}

// POST: Send a message (requires API key)
export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get('X-API-Key')
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Missing X-API-Key header' },
        { status: 401 }
      )
    }

    const keyData = await verifyApiKey(apiKey)
    if (!keyData) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401 }
      )
    }

    // Check agent is active
    const { data: agent, error: agentError } = await getSupabaseAdmin()
      .from('agents')
      .select('id, name, status')
      .eq('id', keyData.agent_id)
      .single()

    if (agentError || !agent || agent.status !== 'active') {
      return NextResponse.json(
        { error: 'Agent not active' },
        { status: 403 }
      )
    }

    // Rate limiting
    const oneMinuteAgo = new Date(Date.now() - 60000).toISOString()
    const { count } = await getSupabaseAdmin()
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('agent_id', agent.id)
      .gte('created_at', oneMinuteAgo)

    if ((count || 0) >= RATE_LIMIT_PER_MINUTE) {
      return NextResponse.json(
        { error: `Rate limit exceeded. Max ${RATE_LIMIT_PER_MINUTE} messages per minute.` },
        { status: 429 }
      )
    }

    // Parse and validate message
    const body = await request.json()
    const { content } = body

    if (!content || typeof content !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid content' },
        { status: 400 }
      )
    }

    if (content.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json(
        { error: `Message too long. Max ${MAX_MESSAGE_LENGTH} characters.` },
        { status: 400 }
      )
    }

    // Insert message
    const { data: message, error: msgError } = await getSupabaseAdmin()
      .from('messages')
      .insert({
        agent_id: agent.id,
        content: content.trim(),
      })
      .select()
      .single()

    if (msgError) throw msgError

    return NextResponse.json({
      success: true,
      message: {
        id: message.id,
        agent_name: agent.name,
        content: message.content,
        created_at: message.created_at,
      },
    })
  } catch (error: any) {
    console.error('Message error:', error)
    return NextResponse.json(
      { error: 'Failed to send message', details: error.message },
      { status: 500 }
    )
  }
}
