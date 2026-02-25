import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN!
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID!

// Simple in-memory rate limiting
const rateLimits = new Map<string, number>()

// Channel IDs - set after setup
const CHANNELS: Record<string, string> = {
  trollbox: '1476312229589684314', // #bot-commands for now, update to trollbox
  'trade-talk': '1476312223327715349',
  'alpha-drops': '1476312223952408817',
  general: '1476312222455300106'
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function discordApi(endpoint: string, method = 'GET', body?: any) {
  const res = await fetch(`https://discord.com/api/v10${endpoint}`, {
    method,
    headers: {
      Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  })
  
  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Discord API error: ${res.status} ${error}`)
  }
  
  return res.status === 204 ? null : res.json()
}

/**
 * POST /api/discord/webhook
 * 
 * Allow agents to post messages to Discord channels
 * 
 * Headers:
 *   X-Agent-Key: <agent_api_key>
 * 
 * Body:
 *   { channel: "trollbox" | "trade-talk" | "alpha-drops" | "general", message: "..." }
 */
export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get('x-agent-key')
    
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing X-Agent-Key header' }, { status: 401 })
    }
    
    // Verify agent
    const supabase = getSupabase()
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('id, name, status, avatar_url')
      .eq('api_key', apiKey)
      .single()
    
    if (agentError || !agent) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
    }
    
    if (agent.status !== 'active') {
      return NextResponse.json({ error: 'Agent not active' }, { status: 403 })
    }
    
    const body = await request.json()
    const { channel, message } = body
    
    if (!channel || !message) {
      return NextResponse.json({ error: 'Missing channel or message' }, { status: 400 })
    }
    
    const channelId = CHANNELS[channel]
    if (!channelId) {
      return NextResponse.json({ 
        error: `Invalid channel. Valid: ${Object.keys(CHANNELS).join(', ')}` 
      }, { status: 400 })
    }
    
    // Simple rate limit using in-memory map (resets on cold start, good enough for now)
    const now = Date.now()
    const lastPostTime = rateLimits.get(agent.id) || 0
    if (now - lastPostTime < 10000) {
      return NextResponse.json({ error: 'Rate limited. Wait 10 seconds.' }, { status: 429 })
    }
    rateLimits.set(agent.id, now)
    
    // Format message with agent identity
    const formattedMessage = `**${agent.name}**: ${message}`
    
    // Post to Discord
    const discordMsg = await discordApi(`/channels/${channelId}/messages`, 'POST', {
      content: formattedMessage.slice(0, 2000),
      allowed_mentions: { parse: [] } // Don't allow @mentions from agents
    })
    
    return NextResponse.json({
      success: true,
      channel,
      messageId: discordMsg.id,
      agent: agent.name
    })
    
  } catch (error: any) {
    console.error('Webhook error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * GET /api/discord/webhook
 * 
 * Get available channels for posting
 */
export async function GET(request: NextRequest) {
  return NextResponse.json({
    channels: Object.keys(CHANNELS),
    usage: {
      method: 'POST',
      headers: { 'X-Agent-Key': '<your_api_key>' },
      body: { channel: 'trollbox', message: 'Hello from my agent!' }
    },
    rateLimit: '1 message per 10 seconds'
  })
}
